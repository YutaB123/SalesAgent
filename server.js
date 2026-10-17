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

const { CARDS } = require("./cards.js");
const plans = require("./plans.js");
const KEY = process.env.ANTHROPIC_API_KEY;
const DG_KEY = process.env.DEEPGRAM_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";   // ~1.4 s per card; follows the card-writing rules far better than haiku (~1.1 s). Set CLAUDE_MODEL=claude-haiku-5-5 for the fastest, lowest-cost option.
const PORT = process.env.PORT || 3000;

const PLAN_SHEET = `Fictional demo plan "Pink Plus": $65/mo per line, unlimited data, 5-year price lock, free streaming add-on.
Plan is changed on one call, no store visit, no new SIM.
PROMOTION (fictional): existing customers who switch to Pink Plus THIS MONTH get a $150 bill credit, and up to $300 of their remaining phone balance is paid off as bill credit. The promotion ends at the end of this month. The only condition is switching this month; everything is in writing. No other discounts or price changes are available besides this promotion; the rep cannot lower the $65 price.
NOT covered by this sheet (the rep must say they will confirm these in writing, never guess): what happens after the five-year price lock, taxes and fees, hotspot and roaming terms, cancellation terms, coverage at a specific address, device prices.
(All of this is fictional, for a hackathon demo.)`;

function systemPrompt(cards) {
  return `You are a live sales-coaching assistant. A new sales rep is on a phone call with an EXISTING customer, offering a new plan. The call is transcribed from one microphone, so lines have no speaker labels. You get the recent lines (already labeled by you earlier) and one new line.

Step 1: decide who said the new line.
- "rep": the salesperson. They greet, introduce T-Mobile, describe plans and prices, ask discovery questions, handle objections, propose next steps.
- "customer": the person being called. They answer, ask about their bill, push back, object, ask questions about the offer, agree or decline.
Use the conversation flow: a question from the rep is usually followed by the customer's answer, and vice versa. Short replies like "okay" or "yeah" usually come from whoever was just asked something.

Step 2: only if the speaker is the customer, decide whether the line needs a coaching card. A card is needed when the customer pushes back, rejects, hesitates, OR asks a question. These card types are STRATEGIES. Pick the type that fits; the words on the card are written fresh from what the customer said (see Step 3).
${cards.map(c => `- ${c.id}: ${c.title}${c.kind === "question" ? " [question]" : ""}. ${c.meaning}`).join("\n")}

Choosing rules:
- Never pick a card for a rep line. Ignore greetings and small talk.
- If the customer clearly asks not to be contacted again, always choose "hard-no".
- Choose "none" when the customer is only ANSWERING the rep's question (how they use their phone, their name, what they pay), making small talk, saying "okay", or agreeing.
- ALWAYS HAVE AN ANSWER: if the customer asks any question and no type fits, choose "answer".

Step 3: WRITE THE CARD FROM THEIR WORDS. The reader is a brand new salesperson in the middle of a call, so everything is plain words they can say out loud. Never write coaching notes like "compare total cost".
- The card must be clearly about THIS customer and THIS sentence. If it could sit under any customer's objection of that type, it is wrong: rewrite it.
- "agree": ONE sentence (max 14 words) that picks up a specific thing they said: a number, a name, a competitor, a family member, a reason, or their own phrase. Not a stock phrase like "I understand, price matters."
- "points": exactly 2 statements (max 14 words each) that answer THEIR specific point using the plan sheet. When they give numbers (what they pay, a competitor's price, a balance owed, how many lines, a date), USE their numbers and do the simple arithmetic out loud: "$65 against your $90 is $25 less a month", "we cover up to $300 of the $400, so about $100 is left", "the $150 credit is more than two months of Pink Plus". Only do arithmetic on numbers the customer actually said and numbers in the plan sheet, say "about" when rounding, and ONLY when the result supports choosing us (our price is lower than theirs, the credit equals about two months of the plan, the payoff covers part of their balance). When THEIR number is lower than ours, never say the gap out loud: acknowledge the number neutrally, ask what it includes (taxes and fees, promo length, how many lines), and lead with what we offer: the five-year price lock, the $150 credit, the payoff, free streaming.
- "ask": ONE question (max 12 words) that follows from what they said: the missing fact you need, or the next small step. Address the customer as "you".
- For [question] cards: "agree" is the DIRECT ANSWER to what they asked (answer first, no filler), with the real number from the plan sheet.
- Use the history. Do not repeat a point the rep already made earlier in the call, and mention the "ends this month" deadline at most once per call.
- If the plan sheet does not cover what they asked, say you will confirm it and send it in writing. Never guess a fact, price, policy or date, and never describe what happens after the price lock ends, what taxes or fees apply, hotspot or roaming terms, or cancellation terms: those are NOT in the plan sheet.
- Every point must be a sentence the rep can say TO the customer. Never put advice for the rep on the card (nothing like "so the value has to be clear" or "keep it short").
- Always exactly 2 points.
- Persuade by being specific and relevant, never by pressure. No fake scarcity, no guilt or fear, no pushing after a clear no. Do not promise the customer's total bill will drop (you do not know their bill); compare only the numbers they gave you.

Style examples (the SHAPE to copy, never the words):
  Customer: "I'm paying ninety a month for one line right now."  ->  agree "Ninety for one line, got it."  points ["Pink Plus is $65 for that line, about $25 less", "Price locked five years, plus a $150 credit this month"]  ask "Is that ninety with taxes included?"
  Customer: "I still owe about four hundred on my phone."  ->  agree "Four hundred still owed, that's covered in part."  points ["We pay off up to $300 as bill credit", "That would leave about $100 for you"]  ask "Is that on one phone or two?"
  Customer: "My wife handles all the phone stuff."  ->  agree "Makes sense that she handles it."  points ["I'm happy to walk you both through it", "The $150 credit ends this month, so timing matters"]  ask "Is she free tonight or tomorrow?"
  Customer: "Verizon offered my sister three lines for 120 total."  ->  agree "Three lines for 120, that is worth comparing."  points ["Ours is locked for five years, plus a $150 credit to switch", "Unlimited data and free streaming come with it"]  ask "What does her 120 include with taxes and fees?"

COMPARING WITH OTHER CARRIERS. When the message contains "PLANS DATABASE FACTS", they are the ONLY source for anything about another carrier or plan:
- Never state a competitor price, perk, limit or term that is not in the facts. If the customer names a carrier or plan that is not listed, or a field says "unknown", say you will confirm it. Never invent one.
- Compare honestly, using the numbers for the customer's number of lines when they are given (the facts include the totals). Lead with where we are genuinely stronger according to the facts: how long our price is locked, what comes with the plan, an intro price that ends, data that slows down, their taxes and fees being extra, and our $150 credit and phone payoff.
- If their price is lower today, never hide that and never run the other carrier down. Acknowledge their number, bring in the specific facts that change the comparison (for example "their $120 is for the first 12 months, then it's $165"), and ask for what is still missing (how many lines, are taxes and fees included).
- If a row says OLD, say "as of <date>" and offer to re-check it. Never claim another carrier's coverage, service quality or reliability is worse: the database has no such facts.
- Our own unknown fields (taxes and fees, hotspot terms, what happens after our price lock) stay "I'll confirm in writing". Do not claim we include them.

Plan sheet:
${PLAN_SHEET}

Reply with ONLY JSON, no other text:
{"speaker":"rep" or "customer","card":"<id or none>","agree":"<sentence>","points":["<point>","<point>"],"ask":"<question>"}
For hard-no use agree "Understood, I'll remove you now.", points ["Confirm they're removed","Thank them and end the call"], ask "".
If the card is "none" or the speaker is the rep, use empty strings and an empty array.`;
}

// The card list in the shape the prompt uses (the page sends the same thing).
function cardsForClaude() {
  return CARDS.map(c => ({ id: c.id, title: c.title, meaning: c.meaning, kind: c.kind, }));
}

async function match(body) {
  const { text, history = [], speaker: known } = body;
  const cards = body.cards || cardsForClaude();
  const convo = history.slice(-10).map(t => `- ${t}`).join("\n") || "(start of call)";
  // rep lines never get a card, so they never need facts; for customer lines the plans database adds comparison facts when relevant
  const facts = known === "rep" ? "" : await plans.planFacts(text, history).catch(() => "");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      // no reasoning tokens: keeps replies fast and the JSON short. Haiku and the larger models name this setting differently.
      thinking: { type: /haiku/i.test(MODEL) ? "disabled" : "between_tools" },
      system: systemPrompt(cards),
      messages: [{ role: "user", content: `Recent call lines (oldest first):\n${convo}\n\nNew line to judge: "${text}"${facts ? `\n\n${facts}` : ""}${known ? `\n(Known from the voice: this line was spoken by the ${known}.)` : ""}` }],
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
  const points = valid && Array.isArray(json.points) ? json.points.map(clean).filter(Boolean).slice(0, 3) : [];
  return { speaker, card: valid ? json.card : "none", agree: valid ? clean(json.agree) : "", points, ask: valid ? clean(json.ask) : "" };
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
      const report = await runAnalysis({ lines, product_context: PLAN_SHEET });
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
  // The plans the agent compares against (and which source they came from).
  if (req.method === "GET" && req.url === "/api/plans") {
    const { rows, source, error } = await plans.getPlans();
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ source, error, plans: rows }));
  }
  if (req.method === "GET" && req.url === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ claude: !!KEY, model: MODEL, deepgram: !!DG_KEY, plans: await plans.status() }));
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
