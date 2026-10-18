# Sales Agent

Sales Agent is a sales-call coaching demo. The current app has two main pages: **Home** for starting a conversation and **Customer Information** for reviewing a customer's profile, notes, follow-ups, and call history.

> **Demo data:** The default workflow uses fictional demo customers and plans. Do not treat the demo catalog or generated coaching as a live carrier quote. Customer data is stored in the isolated demo SQLite database, not in a connected production CRM.

## What it does

- Start a conversation using browser microphone capture or place an outbound phone call through Photon and LiveKit.
- Transcribe speech with Deepgram and show live coaching suggestions generated with Anthropic Claude.
- Look up a demo customer by phone number and review profile details, notes, follow-up tasks, and call history.
- Generate a post-call report from the transcript. The report needs a successful transcript and an Anthropic API key.
- Draft and review follow-up messages. A follow-up is sent only after the user explicitly confirms it and the relevant provider is configured.

The legacy single-page coach is available at `/classic`. The communications integration also has a diagnostic page at `/communications`.

## Requirements

- Node.js 18 or newer
- pnpm (or `npx pnpm`)
- Python 3.11 or newer for the communications service and Python analysis bridge
- Chrome or Edge for browser audio
- An Anthropic API key for coaching and reports
- A Deepgram API key for transcription
- Photon and LiveKit credentials for outbound phone calls (optional)

## Run locally

1. Create a local environment file and add the keys you have:

   ```sh
   cp .env.example .env
   ```

   At minimum, configure `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` in `.env`. The Deepgram key needs permission to create short-lived browser tokens; see [communications/README.md](communications/README.md) for phone and audio setup.

2. Install and build the web UI:

   ```sh
   cd sales-agent-ui
   pnpm install --frozen-lockfile
   pnpm build
   cd ..
   ```

3. Start the app from the repository root:

   ```sh
   node server.js
   ```

4. Open [http://localhost:3000](http://localhost:3000).

For UI development with Vite, keep `node server.js` running and start a second terminal:

```sh
cd sales-agent-ui
pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173). Vite forwards API and communications requests to the local server.

### Enable phone calling

Phone calls need the Photon SIP and LiveKit settings in `.env`, plus the Python communications service. Install its dependencies once, then run the sidecar and Node app in separate terminals:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r communications/requirements.txt
.venv/bin/python communications/service.py
```

In another terminal, run `node server.js`. Configure a `COMMUNICATIONS_SERVICE_TOKEN` shared by the Node app and sidecar. See [communications/README.md](communications/README.md) for the full setup and troubleshooting guide. Use a headset and keep the browser connected during a call.

## Configuration

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude coaching and post-call reports |
| `CLAUDE_MODEL` | Optional model override; defaults to `claude-sonnet-5-5` |
| `DEEPGRAM_API_KEY` | Server-side key used to mint temporary browser transcription tokens |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit room and audio connection |
| `PHOTON_PHONE_NUMBER`, `PHOTON_SIP_ADDRESS`, `PHOTON_SIP_USERNAME`, `PHOTON_SIP_PASSWORD` | Outbound Photon SIP calling |
| `COMMUNICATIONS_SERVICE_TOKEN`, `COMMUNICATIONS_PORT` | Private Node-to-Python communications service connection |
| `DEMO_DATABASE_PATH` | SQLite file for demo customers, plans, calls, and follow-ups; defaults to `database/demo.sqlite` |
| `RESEND_API_KEY`, `FOLLOWUP_FROM_EMAIL` | Optional email follow-up provider settings |
| `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `PHOTON_AGENT_USER_ID`, `PHOTON_MESSAGE_PLATFORM` | Optional Photon messaging settings |

See [.env.example](.env.example) for the complete variable list. Keep `.env` and all provider secrets out of Git. The demo customer store is separate from `SUPABASE_DB_URL`; configuring Supabase does not redirect demo customer records into a production CRM.

## Demo data and persistence

The default application seeds fictional demo records from `knowledge/demo_store.py`. Customer edits and confirmations are sent to the Node backend and persisted in the SQLite file named by `DEMO_DATABASE_PATH`. The browser also keeps a local cache and retries queued edits if the backend is temporarily unavailable.

For hosted persistence across restarts, mount a persistent disk and set `DEMO_DATABASE_PATH` to a path on that disk. This SQLite demo is intended for one server instance. See [knowledge/DEMO_WORKFLOW.md](knowledge/DEMO_WORKFLOW.md) for workflow and data-handling details.

## API overview

- `GET /api/status` — reports whether Claude and Deepgram keys are configured and returns plan storage status.
- `GET /api/dg-token` — creates a short-lived Deepgram browser token; it does not expose the long-lived API key.
- `GET /api/cards` — returns the coaching card catalog.
- `POST /api/match` — coaches a single transcript line; accepts `{ "text", "speaker", "history" }`.
- `POST /api/analyze` — analyzes a transcript and returns coaching results for its lines.
- `POST /api/post-call` — creates a post-call report from `{ "lines": [{ "speaker", "text" }] }`.
- Customer, follow-up, and communications routes are handled by modules under `knowledge/` and `communications/`.

Example request to analyze a transcript:

```sh
curl http://localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"lines":[{"speaker":"rep","text":"Hi, how are you?"},{"speaker":"customer","text":"My current plan is too expensive."}]}'
```

## Deployment

This app needs a long-running Node server and a Python communications sidecar for phone calling. Use the included Render Docker Blueprint in [render.yaml](render.yaml) and follow [DEPLOY.md](DEPLOY.md). A static-only hosting setup cannot run the backend and calling service. Set provider secrets in the host's environment settings, and use persistent storage for the demo SQLite database if records must survive redeploys.

## Troubleshooting

| Symptom | Check |
|---|---|
| No transcript | Allow microphone access, verify `DEEPGRAM_API_KEY`, and check browser/server logs. Phone-call audio also requires the communications service and LiveKit/Photon configuration. |
| Phone call cannot connect | Confirm the Photon outbound SIP credentials, LiveKit settings, shared service token, and that the Python communications service is running. |
| Coaching request failed | Confirm `ANTHROPIC_API_KEY` is set on the server and check server logs for the Anthropic response. |
| Post-call report says no transcript | End a conversation after transcript lines have appeared. A report cannot be generated from an empty transcript. |
| Demo changes disappear after redeploy | Configure a persistent disk and point `DEMO_DATABASE_PATH` to it. |

## Repository map

| Path | Contents |
|---|---|
| `sales-agent-ui/` | React app and Vite development server |
| `server.js` | HTTP server, UI hosting, coaching APIs, and service routing |
| `communications/` | Photon/LiveKit calling and communications sidecar |
| `knowledge/` | Demo customer store, plan data, follow-up APIs, and workflow notes |
| `call_analysis.py`, `analysis_bridge.py` | Post-call report generation |
| `cards.js`, `prompt.js`, `guard.js` | Coaching cards, model instructions, and response safety checks |
| `render.yaml`, `DEPLOY.md` | Render deployment configuration and guide |
