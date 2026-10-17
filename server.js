// Tiny server: serves index.html and proxies card matching to Claude.
// Run:  set ANTHROPIC_API_KEY=sk-ant-...   then   node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

// optional .env file with ANTHROPIC_API_KEY=...
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const KEY = process.env.ANTHROPIC_API_KEY;
const DG_KEY = process.env.DEEPGRAM_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";   // fast model for live calls
const PORT = process.env.PORT || 3000;

const PLAN_SHEET = `Fictional demo plan "Pink Plus": $65/mo per line, unlimited data, 5-year price lock, free streaming add-on.
Plan is changed on one call, no store visit, no new SIM.
PROMOTION (fictional): existing customers who switch to Pink Plus THIS MONTH get a $150 bill credit, and up to $300 of their remaining phone balance is paid off as bill credit. The promotion ends at the end of this month. The only condition is switching this month; everything is in writing.
(All of this is fictional, for a hackathon demo.)`;

function systemPrompt(cards) {
  return `You are a live sales-coaching assistant. A new sales rep is on a phone call with an EXISTING customer, offering a new plan. The call is transcribed from one microphone, so lines have no speaker labels. You get the recent lines (already labeled by you earlier) and one new line.

Step 1: decide who said the new line.
- "rep": the salesperson. They greet, introduce T-Mobile, describe plans and prices, ask discovery questions, handle objections, propose next steps.
- "customer": the person being called. They answer, ask about their bill, push back, object, ask questions about the offer, agree or decline.
Use the conversation flow: a question from the rep is usually followed by the customer's answer, and vice versa. Short replies like "okay" or "yeah" usually come from whoever was just asked something.

Step 2: only if the speaker is the customer, decide whether the line contains an objection, a rejection, OR a question that matches one of these cards (cards marked [question] are for when the customer ASKS something):
${cards.map(c => `- ${c.id}: ${c.title} (${c.meaning})${c.kind === "question" ? " [question]" : ""} Default talking points: ${c.example ? JSON.stringify(c.example) : ""}`).join("\n")}

Rules:
- Never match a card for a rep line. Ignore greetings and small talk.
- If the customer clearly asks not to be contacted again, always choose "hard-no".
- Pick the single best card, or "none" only if the customer said nothing that needs a response (small talk, "okay", agreeing).
- ALWAYS HAVE AN ANSWER: if the customer asks any question and no card fits, choose card "answer" and write its agree/points/ask yourself. Answer ONLY from the plan sheet. If the plan sheet does not say, agree = "Good question.", points = say you will confirm and send it in writing, never guess a fact, price, policy or date.
- For [question] cards: "agree" is the DIRECT ANSWER to what they asked (answer first, no filler), "points" add the strongest relevant promotion or plan fact, "ask" moves the conversation forward.
- GOAL of the card: give the rep the talking points that move this customer toward yes in this call, fitted to what the customer JUST said and the conversation so far. Not random facts: every bullet must answer this customer's objection.
  Persuasion toolkit (use one or two per line, never all):
  1. Mirror: reuse the customer's own words or situation (whatever specific detail they just said).
  2. Bridge: connect their concern to the benefit with a short link ("that's exactly why", "so here's the good part"). Never announce a fact out of nowhere.
  3. Make it about their money in their terms: translate promo numbers ("that credit covers about two months of the plan").
  4. Real loss framing: the promotion genuinely ends this month, so "you'd be leaving $150 on the table" is fair. Mention the deadline at most once per call; check the recent lines and skip it if the rep already said it.
  5. Small yes first: end with an easy, specific next step, an either/or choice, or an assumptive step ("Want me to check your balance first, or switch the line first?", "I can do it now, takes five minutes, okay?").
  When money is the worry, lead with the promotion's actual dollars ($150 credit, up to $300 phone payoff) before the monthly price, and tie them to what the customer actually said on this call (never assume details they have not mentioned).
  6. Label the feeling before answering it ("sounds like the bill is what worries you").
  Use the toolkit to CHOOSE the bullets (mirror their words, tie to their money, real deadline once, easy next step). Stay honest and specific.
  Hard limits: never claim the customer's bill will drop or that they will save money (you don't know their bill); instead state the credit and price lock as facts and offer to check their numbers. Only true statements from the plan sheet, no invented customer numbers or "most customers" claims, no fake scarcity, no guilt, fear or shame, no pushing after a clear no. Persuade by being relevant and specific, never by pressure.

Plan sheet:
${PLAN_SHEET}

Reply with ONLY JSON, no other text:
{"speaker":"rep" or "customer","card":"<id or none>","agree":"<opening>","points":["<point>","<point>"],"ask":"<closing question>"}
Format of the card. The reader is a BRAND NEW salesperson in the middle of a call, so everything must be plain words they can say out loud, never coaching notes:
- "agree": ONE short sentence (max 10 words) the rep can say word for word to acknowledge the customer, e.g. "Good idea to compare."
- "points": 1 or 2 short, plain statements (max 10 words each) the rep can say to the customer, using the promotion and plan facts and only details the customer actually said. Never write advice to the rep such as "compare total cost" or "ask about their needs".
- "ask": ONE short question (max 10 words) addressed to the customer as "you", e.g. "What do you pay each month now?". Never refer to the customer as "their" or "they".
For hard-no use agree "Understood, I'll remove you now.", points ["Confirm they're removed","Thank them and end the call"], ask "".
If the card is "none" or the speaker is the rep, use empty strings and an empty array.`;
}

async function match(body) {
  const { text, history = [], cards = [], speaker: known } = body;
  const convo = history.slice(-10).map(t => `- ${t}`).join("\n") || "(start of call)";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      thinking: { type: "disabled" },   // no reasoning tokens: keeps replies fast and the JSON short
      system: systemPrompt(cards),
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
  const points = valid && Array.isArray(json.points) ? json.points.map(clean).filter(Boolean).slice(0, 3) : [];
  return { speaker, card: valid ? json.card : "none", agree: valid ? clean(json.agree) : "", points, ask: valid ? clean(json.ask) : "" };
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
  }
  if (req.method === "GET" && req.url === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ claude: !!KEY, model: MODEL, deepgram: !!DG_KEY }));
  }
  // Local demo only: hands the Deepgram key to the page on localhost so the browser can stream audio directly.
  if (req.method === "GET" && req.url === "/api/dg-key") {
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
  res.writeHead(404); res.end();
}).listen(PORT, () => {
  console.log(`Rejection Coach: http://localhost:${PORT}`);
  console.log(KEY ? `Claude matching ON (${MODEL})` : "ANTHROPIC_API_KEY not set: falling back to keyword matching");
});
