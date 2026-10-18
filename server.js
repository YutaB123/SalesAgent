// Tiny server: serves index.html and proxies card matching to Claude.
// Run:  set ANTHROPIC_API_KEY=sk-ant-...   then   node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

// optional .env file with ANTHROPIC_API_KEY=...
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { CARDS } = require("./cards.js");
const { systemPrompt } = require("./prompt.js");
const { cardProblem } = require("./guard.js");
const catalogFacts = require("./catalogFacts.js");
const KEY = process.env.ANTHROPIC_API_KEY;
const DG_KEY = process.env.DEEPGRAM_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";   // ~1.4 s per card; follows the card-writing rules far better than haiku (~1.1 s). Set CLAUDE_MODEL=claude-haiku-5-5 for the fastest, lowest-cost option.
const PORT = process.env.PORT || 3000;

// Shared team access for the hosted demo. Local development stays friction-free.
function secureEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function requireTeamAccess(req, res) {
  const username = process.env.SITE_USERNAME;
  const password = process.env.SITE_PASSWORD;
  if (!username || !password) {
    if (process.env.NODE_ENV !== "production") return true;
    res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Team access is not configured on the server." }));
    return false;
  }

  const header = req.headers.authorization || "";
  const encoded = header.match(/^Basic ([A-Za-z0-9+/=]+)$/)?.[1];
  if (encoded && encoded.length <= 2048) {
    const credentials = Buffer.from(encoded, "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    if (separator >= 0 && secureEqual(credentials.slice(0, separator), username)
      && secureEqual(credentials.slice(separator + 1), password)) return true;
  }

  res.writeHead(401, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": 'Basic realm="Sales Agent Team", charset="UTF-8"',
  });
  res.end("Enter the shared Sales Agent team login to continue.");
  return false;
}

// The card list in the shape the prompt uses (the page sends the same thing).
function cardsForClaude() {
  return CARDS.map(c => ({ id: c.id, title: c.title, meaning: c.meaning, kind: c.kind, }));
}

async function match(body) {
  const { text, history = [], speaker: known, partial = false } = body;
  const cards = body.cards || cardsForClaude();
  const sheet = await catalogFacts.catalogSheet();   // the verified plan catalog, as short text
  const convo = history.slice(-10).map(t => `- ${t}`).join("\n") || "(start of call)";
  // rep lines never get a card, so they never need facts; for customer lines the plans database adds comparison facts when relevant
  const facts = known === "rep" ? "" : await catalogFacts.planFacts(text, history).catch(() => "");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      // no reasoning tokens: keeps replies fast and the JSON short. Haiku and the larger models name this setting differently.
      thinking: { type: /haiku/i.test(MODEL) ? "disabled" : "between_tools" },
      system: systemPrompt(cards, sheet),
      messages: [{ role: "user", content: `Recent call lines (oldest first):\n${convo}\n\nNew line to judge: "${text}"${partial ? " (PARTIAL: this line may be cut off mid-sentence)" : ""}${facts ? `\n\n${facts}` : ""}${known ? `\n(Known from the voice: this line was spoken by the ${known}.)` : ""}` }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const raw = data.content.map(b => b.text || "").join("");
  let json;
  try { json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); }
  catch { console.error("Unparseable model reply:", JSON.stringify(raw), "stop:", data.stop_reason); throw new Error("bad model reply"); }
  const speaker = known || (json.speaker === "rep" ? "rep" : "customer");
  if (speaker === "rep") return { speaker, card: "none", agree: "", points: [], ask: "" };
  const clean = t => String(t || "").trim();
  let card = cards.some(c => c.id === json.card) ? json.card : "none";
  // The rep must never be left without a card: a finished customer line always gets one. (Only a PARTIAL line may get none.)
  if (card === "none" && !partial) return { speaker, card: "shared", agree: "", points: [], ask: "", fallback: true };
  if (card === "none") return { speaker, card, agree: "", points: [], ask: "" };
  const out = { speaker, card, agree: clean(json.agree), points: Array.isArray(json.points) ? json.points.map(clean).filter(Boolean).slice(0, 3) : [], ask: clean(json.ask) };
  // Safety check: an invented number or a promise replaces the model's wording with the card's safe default wording (empty = use the default).
  const problem = cardProblem(out, [convo, text, sheet, facts].join(" "));
  if (problem) {
    console.warn(`card rejected (${out.card}): ${problem} :: ${JSON.stringify([out.agree, ...out.points])}`);
    return { speaker, card: out.card, agree: "", points: [], ask: "", guarded: problem };
  }
  return out;
}

const UI_DIR = path.join(__dirname, "sales-agent-ui", "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };
// Serves the built React app. Unknown non-API paths fall back to index.html so client-side routing works.
function serveUi(req, res) {
  if (!fs.existsSync(path.join(UI_DIR, "index.html"))) return false;
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = path.normalize(path.join(UI_DIR, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(UI_DIR)) { res.writeHead(403); res.end(); return true; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(UI_DIR, "index.html");
  // The page itself must always be re-checked so a rebuilt app shows up on a normal reload; built assets have hashed names, so they can be cached.
  const headers = { "content-type": TYPES[path.extname(file)] || "application/octet-stream" };
  if (path.extname(file) === ".html") headers["cache-control"] = "no-cache";
  res.writeHead(200, headers);
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
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (!requireTeamAccess(req, res)) return;
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
      const report = await runAnalysis({ lines, product_context: await catalogFacts.catalogSheet() });
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
    return res.end(JSON.stringify({ claude: !!KEY, model: MODEL, deepgram: !!DG_KEY, plans: await catalogFacts.status() }));
  }
  // Mint a 30-second Deepgram token for the browser's websocket handshake; never return the long-lived API key.
  if (req.method === "GET" && req.url === "/api/dg-token") {
    if (!DG_KEY) {
      res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ error: "Deepgram is not configured on the server." }));
    }
    try {
      const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: { authorization: `Token ${DG_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl_seconds: 30 }),
        signal: AbortSignal.timeout(10000),
      });
      const grant = await response.json().catch(() => ({}));
      if (!response.ok || !grant.access_token) {
        console.error(`Deepgram token grant failed (${response.status})`);
        res.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" });
        return res.end(JSON.stringify({ error: "Could not create a temporary transcription token. Check the Deepgram key permissions." }));
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ token: grant.access_token, expiresIn: grant.expires_in || 30 }));
    } catch {
      res.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ error: "Deepgram token service is unavailable." }));
    }
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
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Sales Agent: http://localhost:${PORT}   (classic live coach: /classic)`);
  console.log(fs.existsSync(path.join(UI_DIR, "index.html")) ? "React UI: serving sales-agent-ui/dist" : "React UI not built yet: run  cd sales-agent-ui && pnpm install && pnpm build");
  console.log(KEY ? `Claude matching ON (${MODEL})` : "ANTHROPIC_API_KEY not set: falling back to keyword matching");
});
