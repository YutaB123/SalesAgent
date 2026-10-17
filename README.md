# SalesAgent: Rejection Coach

**One app, one server.** `node server.js` serves the React dashboard at http://localhost:3000, the coaching API behind it, the phone-call module, and the post-call report. Everything the team built is wired together:

| Piece | Owner | Where | What it does in the merged app |
|---|---|---|---|
| Live coach and cards | Yuta | `server.js`, `cards.js`, `sales-agent-ui/src/services/liveCoach.ts` | Transcribes the call (Deepgram), picks a card (Claude), shows it in the **Ongoing conversation** screen |
| Dashboard UI | Jin | `sales-agent-ui/` | The app shell: home, new conversation, summary, customers, history |
| Phone calling | Zoe | `communications/` | **Call the customer by phone** panel: dials through Photon/LiveKit and gives separate rep and customer audio |
| Verified plan catalog and Plan Database page | Zoe | `knowledge/`, `catalogFacts.js` | Real, sourced T-Mobile, AT&T and Verizon plans. The agent compares with them, and the **Plan Database** page edits them |
| Post-call report | Eva / Miao | `call_analysis.py`, `analysis_bridge.py` | The **Call summary** report with evidence quotes and scores, written by Claude |
| Database (customers and calls) | Eva / Miao | `supabase/` | Schema and fictional demo customers. **Not connected to the app yet** (see below). |

The original single-page live coach is still at http://localhost:3000/classic as a fallback.

A live coaching tool for brand new sales reps. It listens to a sales call, works out who is talking (rep or customer), and when the customer pushes back or asks a question it shows a short three-step card on screen: what to **say**, what to **explain**, and what to **ask**.

> **Hackathon demo.** Plans, prices and features come from the verified catalog in `knowledge/` (copied by hand from the carriers' official pages; each record shows its source and the date it was checked). The customers, calls and demo script are fictional. Nothing here is a real offer: the agent never invents credits, discounts or promotions.

## How it works

- **Voice:** your microphone streams to [Deepgram](https://deepgram.com), which transcribes the call and labels the two voices (the first voice heard is the Rep).
- **Matching:** a keyword check shows a card instantly. [Claude](https://www.anthropic.com) then confirms who is speaking, picks the best card, and rewrites it using what the customer actually said and the plan sheet.
- **Cards:** 40 cards covering objections (not interested, too expensive, competitor is cheaper, and more), customer questions (price, discount, contract, and more), a catch-all for any other question, four "keep it going" cards (opening, they shared something, they're interested, not sure what they mean), and a red hard-stop card for "don't call me again". **Every finished customer line gets a card.** The rep is never left without help: a line that is just an answer, small talk or "okay" gets a keep-it-going card, and if Claude is slow or fails a neutral card is shown.
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
    "points": ["Experience More 2.0 includes Netflix Standard with ads", "Essentials 2.0 has unlimited data with 50GB premium data"],
    "ask": "Is there anything you'd change?" }
] }
```

- `card` is a card `id` from `cards.js`, or `"none"` when no card is needed (rep lines, small talk).
- `agree`, `points`, `ask` are the card's three steps: say, then explain, then ask. Save them as-is.
- Lines are checked one after another so each one sees the lines before it, which costs roughly one second per customer line (a 5-line test took about 3 seconds). Lines marked `"rep"` are skipped and cost nothing.
- Errors come back as `{ "error": "..." }`.

For one line at a time during a live call, use `POST /api/match` with `{ "text", "speaker", "history" }`.

The cards live in `cards.js`. To change wording or add a card, edit that file and restart the server. No other code changes.

## The plan catalog: how the agent knows plans and compares with other carriers

The agent writes cards from a **verified catalog** of real consumer plans (22 records: T-Mobile, AT&T and Verizon), not from memory. It never states a price, feature, fee or offer that is not in the catalog. Details and the editing rules are in [knowledge/README.md](knowledge/README.md).

- **What it sells:** T-Mobile plans from the catalog (Essentials, Experience More and Experience Beyond, plus the specialized plans, which need verified eligibility before anyone quotes them). There is no made-up plan and no made-up promotion.
- **Comparing:** `knowledge/comparison.js` does the arithmetic. It will not state a price difference until the customer has given a like-for-like bill (how many lines, the service-only charge, before taxes and fees). Until then the card asks for the missing detail. When T-Mobile is **higher**, the card says so as plainly as when it is lower, then points to real features. It never claims total-bill savings. Other carriers' prices are their *advertised offers*, never a customer's actual bill.
- **Old data:** records older than 14 days are flagged, and the card says "as of <date>" and offers to re-verify.
- **Where it lives:** Supabase PostgreSQL when `SUPABASE_DB_URL` is set in `.env`, otherwise a local SQLite file (`database/carrier_plans.sqlite`, ignored by git). If the database cannot be read, the bundled snapshot (`knowledge/carrier-plans.json`) is used so a card is never blocked. `GET /api/status` shows `plans.storage`.
- **Editing:** open **Plan Database** in the sidebar, pick a plan, check it against its official source, tick the confirmation and update. Each edit keeps the previous version, and two people cannot overwrite each other. The agent sees changes within about 15 seconds.
- **Set up the cloud tables once:** `python -m pip install -r knowledge/requirements.txt` then `python knowledge/store.py init` (see knowledge/README.md).
- **Honest limits:** prices are manual snapshots of the official pages, not live feeds, and exclude personalized offers, device deals and prepaid or business plans.

## Status and known gaps

| Area | State |
|---|---|
| Live microphone coaching in the React app | Tested end to end with a recorded two-voice call (headless browser): transcript, speaker labels, cards, report |
| Typed customer lines | Work the same way as spoken ones |
| Post-call report in **Call summary** | Tested. Claude writes it; Eva's validator rejects any report whose quotes do not match the call, and the bridge retries once |
| Phone calling (Photon / LiveKit) | Wired into the UI and the audio goes through the same transcriber, **but not tested here**: it needs real Photon and LiveKit credentials and a manual smoke test |
| Database (Supabase) | **Not connected to the app.** Customers and call history are saved in the browser (`localStorage`) by Jin's `customerRepository`. Writing calls to Supabase needs a server-side secret key and the adapter described in `supabase/CALL_ANALYSIS_MAPPING.md`. |
| Comparing with other carriers | Uses Zoe's verified catalog and her comparison code. Tested against the live model with a vague claim, a full bill, a discount ask, a veteran, a Mexico question and a made-up switching credit (see the tests in `knowledge/coaching.test.js`). The cloud (Supabase) copy of the catalog has not been created yet, so it runs on the local SQLite copy |
| Customers, calls, demo script | Fictional demo data |

More API routes added by the merge: `GET /api/cards` (the cards as JSON), `POST /api/post-call` (the report; body `{ "lines": [{ "speaker": "rep" | "customer", "text": "..." }] }`).

## Run all the tests

```
node --test guard.test.js knowledge/coaching.test.js          # card safety check, prompt rules, plan catalog and comparison
python -m unittest -q test_call_analysis.py                    # post-call report checks
python -m unittest discover -s knowledge -p "test_*.py"        # plan database code
cd communications && python -m unittest -q test_service.py     # phone service (needs: pip install -r communications/requirements.txt)
cd sales-agent-ui && npx pnpm@9 build                          # type-checks and builds the app
```

These tests cover the code. They do not call Claude, Deepgram or the phone network; try a typed line and a call by hand for that.

## If something is off

| Problem | Fix |
|---|---|
| Header says `Voice: browser` or `Matching: keywords` | A key is missing or empty in `.env`. Fix it and restart `node server.js`. |
| Rep and customer are swapped | Click **Swap Rep/Cust**, or click a single bubble to flip just that line. |
| Nothing transcribes | Check the microphone permission in the browser, and use Chrome or Edge. |
| Cards feel slow | Use a quiet room and speakerphone close to the mic. |
| A phone call ends by itself | Keep **one** browser tab open on the app (a second tab or a reload takes your seat in the phone room; the service waits 15 seconds for you to return, then hangs up) and do not reload during a call (the browser now asks first). To see what ended a call, open `http://localhost:8765/api/comms/events?after=0`: `call.sip_status` `hangup` means the phone side ended it, and `participant.left` shows the reason. Calls also stop at 10 minutes. |

## Good to know

- **Safety check on every card.** Before a card is shown, the server checks every number on it. A number over 12 must come from the customer's words, the verified plan catalog, or be plain arithmetic on those (a sum, a difference, a per-line multiple). Cards that use an invented price or discount, or that promise something ("guaranteed", "cheapest", "you'll save", "it only takes a minute"), are replaced by the card's built-in safe wording, and a warning is written to the server log (`card rejected ...`). This catches made-up figures; it cannot catch every bad idea, so keep the catalog and plans database accurate.
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
| `knowledge/` | The verified plan catalog, its database code, comparison logic, tests and the Plan Database page's API (Zoe) |
| `catalogFacts.js` | Gives the agent a compact copy of the catalog and the verified comparison for the customer's line |
| `prompt.js` | The instructions the model follows for every card |
| `guard.js` | The safety check every card passes: rejects invented numbers and promises |
| `demo-script.html` / `.pdf` | A demo call to read aloud |
| `.env.example` | Template for your API keys |

## Photon communications integration

The communications branch adds independent browser/phone audio and call lifecycle APIs. See [communications/README.md](communications/README.md) for setup, the website/STT/database handoff, and the standalone `/communications` test page. The original coaching and Deepgram implementation above remains unchanged.
