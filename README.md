# SalesAgent: Rejection Coach

A live coaching tool for brand new sales reps. It listens to a sales call, works out who is talking (rep or customer), and when the customer pushes back or asks a question it shows a short three-step card on screen: what to **say**, what to **explain**, and what to **ask**.

> **Hackathon demo.** The plan ("Pink Plus"), prices and promotion in this project are **fictional**. Nothing here is real T-Mobile information.

## How it works

- **Voice:** your microphone streams to [Deepgram](https://deepgram.com), which transcribes the call and labels the two voices (the first voice heard is the Rep).
- **Matching:** a keyword check shows a card instantly. [Claude](https://www.anthropic.com) then confirms who is speaking, picks the best card, and rewrites it using what the customer actually said and the plan sheet.
- **Cards:** 36 cards covering objections (not interested, too expensive, competitor is cheaper, and more), customer questions (price, discount, contract, and more), a catch-all for any other question, and a red hard-stop card for "don't call me again".
- **Chat view:** the conversation is on the left and the latest card is on the right.

## What you need

- [Node.js](https://nodejs.org) 18 or newer (no packages to install)
- Google Chrome or Microsoft Edge
- An [Anthropic API key](https://console.anthropic.com)
- A [Deepgram API key](https://console.deepgram.com) (free starter credit for new accounts)

## Run it

1. Copy `.env.example` to a new file called `.env` and add your keys, with no quotes or spaces:

   ```
   ANTHROPIC_API_KEY=your_anthropic_key
   DEEPGRAM_API_KEY=your_deepgram_key
   ```

2. Start the server from this folder:

   ```
   node server.js
   ```

3. Open **http://localhost:3000** in Chrome or Edge. The header should read `Voice: Deepgram · Matching: Claude`.
4. Put the phone call on **speaker** near your laptop, click the green mic, and allow microphone access.

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

## If something is off

| Problem | Fix |
|---|---|
| Header says `Voice: browser` or `Matching: keywords` | A key is missing or empty in `.env`. Fix it and restart `node server.js`. |
| Rep and customer are swapped | Click **Swap Rep/Cust**, or click a single bubble to flip just that line. |
| Nothing transcribes | Check the microphone permission in the browser, and use Chrome or Edge. |
| Cards feel slow | Use a quiet room and speakerphone close to the mic. |

## Good to know

- **Keys stay local.** `.env` is ignored by git. Never commit it.
- **Deepgram key reaches the browser.** For a local demo, `server.js` hands the Deepgram key to the page on `localhost`. Do not deploy this publicly as-is. Move the Deepgram connection to the server first.
- **Where the call goes.** Microphone audio is sent to Deepgram for transcription, and the transcript lines are sent to Anthropic to pick the card. Nothing is saved to disk by this app. Check your company's rules on recording and transcribing calls before using it with real customers.
- **Speaker labels are approximate.** The labels come from voice separation on one microphone, so they can be wrong on short lines.

## Files

| File | What it is |
|---|---|
| `cards.js` | All the coaching cards (edit this to change what reps see) |
| `index.html` | The live app (chat, card display, microphone and Deepgram code) |
| `server.js` | Small local server: serves the page, calls Claude, and exposes `/api/analyze` |
| `demo-script.html` / `.pdf` | A demo call to read aloud |
| `.env.example` | Template for your API keys |

## Photon communications integration

The communications branch adds independent browser/phone audio and call lifecycle APIs. See [communications/README.md](communications/README.md) for setup, the website/STT/database handoff, and the standalone `/communications` test page. The original coaching and Deepgram implementation above remains unchanged.
