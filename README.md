# SalesAgent: Rejection Coach

**One app, one server.** `node server.js` serves the React dashboard at http://localhost:3000, the coaching API behind it, the phone-call module, and the post-call report. Everything the team built is wired together:

| Piece | Owner | Where | What it does in the merged app |
|---|---|---|---|
| Live coach and cards | Yuta | `server.js`, `cards.js`, `sales-agent-ui/src/services/liveCoach.ts` | Transcribes the call (Deepgram), picks a card (Claude), shows it in the **Ongoing conversation** screen |
| Dashboard UI | Jin | `sales-agent-ui/` | The app shell: home, new conversation, summary, customers, history |
| Phone calling | Zoe | `communications/` | **Call the customer by phone** panel: dials through Photon/LiveKit and gives separate rep and customer audio |
| Post-call report | Eva / Miao | `call_analysis.py`, `analysis_bridge.py` | The **Call summary** report with evidence quotes and scores, written by Claude |
| Database | Eva / Miao | `supabase/` | Schema and fictional demo data. **Not connected to the app yet** (see below). |

The original single-page live coach is still at http://localhost:3000/classic as a fallback.

A live coaching tool for brand new sales reps. It listens to a sales call, works out who is talking (rep or customer), and when the customer pushes back or asks a question it shows a short three-step card on screen: what to **say**, what to **explain**, and what to **ask**.

> **Hackathon demo.** The plan ("Pink Plus"), prices and promotion in this project are **fictional**. Nothing here is real T-Mobile information.

## How it works

- **Voice:** your microphone streams to [Deepgram](https://deepgram.com), which transcribes the call and labels the two voices (the first voice heard is the Rep).
- **Matching:** a keyword check shows a card instantly. [Claude](https://www.anthropic.com) then confirms who is speaking, picks the best card, and rewrites it using what the customer actually said and the plan sheet.
- **Cards:** 36 cards covering objections (not interested, too expensive, competitor is cheaper, and more), customer questions (price, discount, contract, and more), a catch-all for any other question, and a red hard-stop card for "don't call me again".
- **Chat view:** the conversation is on the left and the latest card is on the right.

## What you need

- [Node.js](https://nodejs.org) 18 or newer, and [pnpm](https://pnpm.io) (or `npx pnpm`) to build the UI
- [Python](https://www.python.org) 3.11 or newer (for the post-call report; no packages needed for that)
- Google Chrome or Microsoft Edge
- An [Anthropic API key](https://console.anthropic.com)
- A [Deepgram API key](https://console.deepgram.com) (free starter credit for new accounts)
- Optional, only for phone calling: Photon and LiveKit credentials (see [communications/README.md](communications/README.md))

## Run it

1. Copy `.env.example` to a new file called `.env` and add your keys, with no quotes or spaces:

   ```
   ANTHROPIC_API_KEY=your_anthropic_key
   DEEPGRAM_API_KEY=your_deepgram_key
   ```

2. Build the dashboard once (and again after changing anything in `sales-agent-ui/`):

   ```
   cd sales-agent-ui
   pnpm install
   pnpm build
   cd ..
   ```

3. Start the server from the repo root:

   ```
   node server.js
   ```

4. Open **http://localhost:3000** in Chrome or Edge. Go to **New Conversation**, put the phone call on **speaker** near your laptop, press **Start Listening**, and allow the microphone. Settings shows "Conversation capture: Connected" when both keys work.
5. Press **End Conversation** when the call is over. The **Call summary** page writes the report (about 10 to 15 seconds) and saves the call to the selected customer in this browser.

**Developing the UI?** Run `node server.js` in one terminal and `pnpm dev` inside `sales-agent-ui/` in another, then open http://localhost:5173. Vite forwards `/api` and `/communications` to the server.

**Phone calling (optional).** Fill in the Photon and LiveKit values in `.env`, then in a second terminal run `python communications/service.py` (first-time setup is in `communications/README.md`). In the app, open **Call the customer by phone** on the conversation screen: connect your microphone, enter a number, and call. A headset is recommended. When a call is dialled, the rep and the customer each get their own audio track, and each is transcribed separately, so rep and customer labels are exact instead of guessed from voices.

**Without any keys,** the app falls back to Jin's original demo: a fake transcript and fixed example suggestions.

## Try it without a call

- Type a line into the box at the bottom, such as `I'm still paying off my phone` or `how much is it?`, and press Enter.
- To test with two people, read `demo-script.pdf` (or `demo-script.html`) aloud: one plays the rep and one plays the customer.

## For teammates: using the agent from your own code

The agent is one HTTP endpoint. Give it a transcript, and it returns the coaching card for every customer line. You don't need to touch the cards or the prompt.

```
POST http://localhost:3000/api/analyze
Content-Type: application/json

{ "lines": [
    { "speaker": "rep",      "text": "Hi, this is Sam from T-Mobile." },
    { "speaker": "customer", "text": "Honestly I'm happy with my current plan." },
    { "text": "I'd have to ask my wife first." }
] }
```

`speaker` is `"rep"` or `"customer"`. Leave it out and Claude works it out from the conversation. The reply has one result per line, in order:

```
{ "results": [
  { "index": 0, "text": "Hi, this is Sam from T-Mobile.", "speaker": "rep", "card": "none", "agree": "", "points": [], "ask": "" },
  { "index": 1, "text": "Honestly I'm happy with my current plan.", "speaker": "customer",
    "card": "happy-current",
    "agree": "Glad it's working for you.",
    "points": ["Your price is locked for five years", "You get free streaming and a $150 credit"],
    "ask": "Is there anything you'd change?" }
] }
```

- `card` is a card `id` from `cards.js`, or `"none"` when no card is needed (rep lines, small talk).
- `agree`, `points`, `ask` are the card's three steps: say, then explain, then ask. Save them as-is.
- Lines are checked one after another so each one sees the lines before it, which costs roughly one second per customer line (a 5-line test took about 3 seconds). Lines marked `"rep"` are skipped and cost nothing.
- Errors come back as `{ "error": "..." }`.

For one line at a time during a live call, use `POST /api/match` with `{ "text", "speaker", "history" }`.

The cards live in `cards.js`. To change wording or add a card, edit that file and restart the server. No other code changes.

## Status and known gaps

| Area | State |
|---|---|
| Live microphone coaching in the React app | Tested end to end with a recorded two-voice call (headless browser): transcript, speaker labels, cards, report |
| Typed customer lines | Work the same way as spoken ones |
| Post-call report in **Call summary** | Tested. Claude writes it; Eva's validator rejects any report whose quotes do not match the call, and the bridge retries once |
| Phone calling (Photon / LiveKit) | Wired into the UI and the audio goes through the same transcriber, **but not tested here**: it needs real Photon and LiveKit credentials and a manual smoke test |
| Database (Supabase) | **Not connected to the app.** Customers and call history are saved in the browser (`localStorage`) by Jin's `customerRepository`. Writing calls to Supabase needs a server-side secret key and the adapter described in `supabase/CALL_ANALYSIS_MAPPING.md`. |
| Customer and product data | Fictional demo data |

More API routes added by the merge: `GET /api/cards` (the cards as JSON), `POST /api/post-call` (the report; body `{ "lines": [{ "speaker": "rep" | "customer", "text": "..." }] }`).

## If something is off

| Problem | Fix |
|---|---|
| Header says `Voice: browser` or `Matching: keywords` | A key is missing or empty in `.env`. Fix it and restart `node server.js`. |
| Rep and customer are swapped | Click **Swap Rep/Cust**, or click a single bubble to flip just that line. |
| Nothing transcribes | Check the microphone permission in the browser, and use Chrome or Edge. |
| Cards feel slow | Use a quiet room and speakerphone close to the mic. |

## Good to know

- **Which Claude model writes the cards.** Default is `claude-sonnet-5-5` (about 1.4 seconds per card, and it follows the card-writing rules well). For the fastest and cheapest option set `CLAUDE_MODEL=claude-haiku-5-5` in `.env`; it is quicker but sometimes volunteers a competitor's lower price or states things the plan sheet does not say.
- **Keys stay local.** `.env` is ignored by git. Never commit it.
- **Deepgram key reaches the browser.** For a local demo, `server.js` hands the Deepgram key to the page on `localhost`. Do not deploy this publicly as-is. Move the Deepgram connection to the server first.
- **Where the call goes.** Microphone audio is sent to Deepgram for transcription, and the transcript lines are sent to Anthropic to pick the card. Nothing is saved to disk by this app. Check your company's rules on recording and transcribing calls before using it with real customers.
- **Speaker labels are approximate.** The labels come from voice separation on one microphone, so they can be wrong on short lines.

## Files

| File | What it is |
|---|---|
| `cards.js` | All the coaching cards (edit this to change what reps see) |
| `index.html` | The original single-page live coach, kept at `/classic` |
| `server.js` | The one server: serves the React app, calls Claude, exposes `/api/*`, proxies phone calling |
| `sales-agent-ui/` | The React dashboard (Jin) with the live coach built into its conversation screen |
| `analysis_bridge.py` | Runs Eva's `call_analysis.py` with Claude for the post-call report |
| `communications/` | Photon / LiveKit phone calling (Zoe) |
| `supabase/` | Database schema and seed (Eva / Miao) |
| `demo-script.html` / `.pdf` | A demo call to read aloud |
| `.env.example` | Template for your API keys |

## Photon communications integration

The communications branch adds independent browser/phone audio and call lifecycle APIs. See [communications/README.md](communications/README.md) for setup, the website/STT/database handoff, and the standalone `/communications` test page. The original coaching and Deepgram implementation above remains unchanged.
