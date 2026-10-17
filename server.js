// Tiny server: serves index.html and proxies card matching to Claude.
// Run:  set ANTHROPIC_API_KEY=sk-ant-...   then   node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// optional .env file with ANTHROPIC_API_KEY=...
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { safeCards, systemPrompt } = require("./knowledge/coaching");
const CARDS = safeCards(require("./cards.js").CARDS);
const { operation: planOperation } = require("./knowledge/api");
const { planSheet } = require("./knowledge/comparison");
const KEY = process.env.ANTHROPIC_API_KEY;
const DG_KEY = process.env.DEEPGRAM_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";   // ~1.4 s per card; follows the card-writing rules far better than haiku (~1.1 s). Set CLAUDE_MODEL=claude-haiku-5-5 for the fastest, lowest-cost option.
const PORT = process.env.PORT || 3000;

// The card list in the shape the prompt uses (the page sends the same thing).
function cardsForClaude() {
  return CARDS.map(c => ({ id: c.id, title: c.title, meaning: c.meaning, kind: c.kind, }));
}

async function match(body) {
  const { text, history = [], speaker: known } = body;
  const cards = body.cards || cardsForClaude();
  const catalog = await planOperation("list");
  const convo = history.slice(-10).map(t => `- ${t}`).join("\n") || "(start of call)";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      // no reasoning tokens: keeps replies fast and the JSON short. Haiku and the larger models name this setting differently.
      thinking: { type: /haiku/i.test(MODEL) ? "disabled" : "between_tools" },
      system: systemPrompt(cards, catalog),
      messages: [{ role: "user", content: `Recent call lines (oldest first):\n${convo}\n\nNew line to judge: "${text}"${known ? `\n(Known from the voice: this line was spoken by the ${known}.)` : ""}` }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const raw = data.content.map(b => b.text || "").join("");
  let json;
  try { json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); }
  catch { console.error("Unparseable model reply:", JSON.stringify(raw), "stop:", data.stop_reason); throw new Error("bad model reply"); }
  const speaker = known || (json.speaker === "rep" ? "rep" : "customer");
  const valid = speaker === "customer" && cards.some(c => c.id === json.card);
  const clean = t => String(t || "").trim();
  const fallback = CARDS.find(c => c.id === json.card);
  const points = valid && Array.isArray(json.points) ? json.points.map(clean).filter(Boolean).slice(0, 3) : [];
  return { speaker, card: valid ? json.card : "none", agree: valid ? clean(json.agree) : "", points: valid && !points.length ? fallback?.points || [] : points, ask: valid ? clean(json.ask) : "" };
}

const UI_DIR = path.join(__dirname, "sales-agent-ui", "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };
const isLocal = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

// Serves the built React app. Unknown non-API paths fall back to index.html so client-side routing works.
function serveUi(req, res) {
  if (!fs.existsSync(path.join(UI_DIR, "index.html"))) return false;
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = path.normalize(path.join(UI_DIR, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(UI_DIR)) { res.writeHead(403); res.end(); return true; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIR, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
  return true;
}

// Runs analysis_bridge.py (Eva's call_analysis.py, powered by Claude). Tries python3, then python.
function runAnalysis(payload) {
  const tryRun = cmd => new Promise((resolve, reject) => {
    const child = spawn(cmd, [path.join(__dirname, "analysis_bridge.py")], { cwd: __dirname, env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("analysis timed out")); }, 90000);
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", e => { clearTimeout(timer); reject(Object.assign(e, { missing: e.code === "ENOENT" })); });
    child.on("close", () => {
      clearTimeout(timer);
      try { const j = JSON.parse(out); j.error ? reject(new Error(j.error)) : resolve(j); }
      catch { reject(new Error(err.trim().split("\n").pop() || "analysis failed")); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
  return tryRun(process.env.PYTHON || "python3").catch(e => e.missing ? tryRun("python") : Promise.reject(e));
}

http.createServer(async (req, res) => {
  if (await require("./knowledge/api.js").handle(req, res)) return;
  if (await require("./communications/proxy.js").handleCommunications(req, res)) return;
  // The original single-page live coach, kept as a fallback at /classic.
  if (req.method === "GET" && req.url === "/classic") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
  }
  // The card list as JSON, so the React app uses the same cards.js as the server.
  if (req.method === "GET" && req.url === "/api/cards") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ cards: CARDS }));
  }
  // Post-call report (Eva's call_analysis.py, run with Claude).
  //   POST /api/post-call  { "lines": [ { "speaker": "rep"|"customer", "text": "..." } ] }
  if (req.method === "POST" && req.url === "/api/post-call") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      if (!KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const { lines } = JSON.parse(raw);
      if (!Array.isArray(lines) || !lines.length) throw new Error("send {\"lines\": [{speaker, text}, ...]}");
      const report = await runAnalysis({ lines, product_context: planSheet(await planOperation("list")) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ report }));
    } catch (e) {
      console.error("post-call:", e.message);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (req.method === "GET" && req.url === "/cards.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "cards.js")));
  }
  // For teammates: send a whole transcript, get back the card for every customer line.
  //   POST /api/analyze  { "lines": [ { "speaker": "rep"|"customer"|undefined, "text": "..." } ] }
  if (req.method === "POST" && req.url === "/api/analyze") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      if (!KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const { lines } = JSON.parse(raw);
      if (!Array.isArray(lines)) throw new Error("send {\"lines\": [{speaker, text}, ...]}");
      const history = [], results = [];
      for (const [i, l] of lines.entries()) {
        const text = String(l.text || "").trim();
        const speaker = l.speaker === "rep" || l.speaker === "customer" ? l.speaker : undefined;
        let out = { speaker: speaker || "customer", card: "none", agree: "", points: [], ask: "" };
        if (text && speaker !== "rep") out = await match({ text, speaker, history });   // rep lines never need a card
        history.push((out.speaker === "rep" ? "Rep: " : "Customer: ") + text);
        results.push({ index: i, text, ...out });
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ results }));
    } catch (e) {
      console.error(e.message);
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (req.method === "GET" && req.url === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ claude: !!KEY, model: MODEL, deepgram: !!DG_KEY }));
  }
  // Local demo only: hands the Deepgram key to the page on localhost so the browser can stream audio directly.
  if (req.method === "GET" && req.url === "/api/dg-key") {
    if (!isLocal(req)) { res.writeHead(403); return res.end(); }
    res.writeHead(DG_KEY ? 200 : 404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ key: DG_KEY || null }));
  }
  if (req.method === "POST" && req.url === "/api/match") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      if (!KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const out = await match(JSON.parse(raw));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      console.error(e.message);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (req.method === "GET" && !req.url.startsWith("/api/") && serveUi(req, res)) return;
  if (req.method === "GET" && req.url === "/") {   // no React build yet: fall back to the classic page
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => {
  console.log(`Sales Agent: http://localhost:${PORT}   (classic live coach: /classic)`);
  console.log(fs.existsSync(path.join(UI_DIR, "index.html")) ? "React UI: serving sales-agent-ui/dist" : "React UI not built yet: run  cd sales-agent-ui && pnpm install && pnpm build");
  console.log(KEY ? `Claude matching ON (${MODEL})` : "ANTHROPIC_API_KEY not set: falling back to keyword matching");
});
