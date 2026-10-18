# T-Mobile Phone Sales Agent

A live call-coaching demo for helping customers choose phones sold by T-Mobile. The product catalog and coaching focus on handsets such as iPhone, Samsung Galaxy, Google Pixel, and Motorola models. **This app does not sell or compare wireless service plans, carriers, network coverage, or data allowances.**

The demo customer names and histories are fictional. Handset prices in the catalog are dated full-retail snapshots from official T-Mobile product pages; check current price, offers, eligibility, configuration, and availability before quoting.

## App features

- Start a conversation with browser microphone capture or place an outbound call through Photon and LiveKit.
- Transcribe speech with Deepgram and display handset-focused coaching from Anthropic Claude.
- Match a customer by phone number and review their phone recommendation, notes, follow-up actions, and call history.
- Generate a post-call report from the transcript.
- Draft follow-up messages and send only after explicit confirmation and provider setup.

## Requirements

- Node.js 18 or newer and pnpm
- Python 3.11 or newer for the communications sidecar and call-analysis bridge
- Chrome or Edge for browser audio
- Anthropic and Deepgram API keys
- Photon and LiveKit credentials for phone calling (optional)

## Run locally

1. Create `.env` from the template and add your provider credentials:

   ```sh
   cp .env.example .env
   ```

   Configure `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` at minimum. The browser requests a short-lived Deepgram token from the server; the long-lived key stays server-side.

2. Build the web UI:

   ```sh
   cd sales-agent-ui
   pnpm install --frozen-lockfile
   pnpm build
   cd ..
   ```

3. Start the server from the repository root and open [http://localhost:3000](http://localhost:3000):

   ```sh
   node server.js
   ```

For UI development, keep `node server.js` running, then run `pnpm dev` in `sales-agent-ui/` and open [http://localhost:5173](http://localhost:5173).

### Phone calling

Set up the Photon SIP and LiveKit values in `.env`, generate a `COMMUNICATIONS_SERVICE_TOKEN`, and start the sidecar in a separate terminal:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r communications/requirements.txt
.venv/bin/python communications/service.py
```

Run `node server.js` in another terminal. Both processes must use the same communications token. Full setup is in [communications/README.md](communications/README.md). Keep the browser connected and use a headset during calls.

## Handset catalog

The handset catalog is loaded from the `phones` array in `tmobile_sales_agent_mock_data.json`; it replaces the previous phone catalog in SQLite. The JSON labels its phone names and prices as fictional illustrative mock data, not live T-Mobile inventory or quotes. The app displays each mock retail price, sample 24-month payment, storage, OS, features, customer fit, and tradeoffs.

The coach must label dataset prices and payment examples as mock values and must not present them as current T-Mobile prices, offers, inventory, or financing terms. Direct customers to T-Mobile to verify current details.

## Data and persistence

The demo seeds fictional customers and stores handset catalog and customer records in the SQLite file set by `DEMO_DATABASE_PATH` (default: `database/demo.sqlite`). Existing demo plan placeholders are migrated to handset recommendations on startup; customer notes and call histories are preserved. No real CRM is imported.

For hosted persistence across redeploys, mount a persistent disk and set `DEMO_DATABASE_PATH` to a path on that disk. SQLite is intended for one server instance. See [knowledge/DEMO_WORKFLOW.md](knowledge/DEMO_WORKFLOW.md).

## API overview

- `GET /api/status` — provider configuration and handset catalog status.
- `GET /api/dg-token` — short-lived Deepgram token for browser transcription.
- `GET /api/cards` — handset coaching cards.
- `POST /api/match` — coach one transcript line.
- `POST /api/analyze` — analyze a complete transcript for live-coaching cards.
- `POST /api/post-call` — create a post-call report from speaker-labeled transcript lines.
- Customer, follow-up, and communications routes are handled under `knowledge/` and `communications/`.

Example:

```sh
curl http://localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"lines":[{"speaker":"customer","text":"I want a phone under $600 with a good camera."}]}'
```

## Deployment

Use the included Render Docker Blueprint in [render.yaml](render.yaml) and follow [DEPLOY.md](DEPLOY.md). The app needs a long-running Node server; phone calling also needs its Python sidecar. A static-only hosting service cannot run these backends together. Set provider secrets in the host's environment settings and use a persistent disk if demo records must survive redeploys.

## Troubleshooting

| Symptom | Check |
|---|---|
| No transcript | Allow microphone access, verify `DEEPGRAM_API_KEY`, and inspect browser/server logs. Phone calls also need the communications sidecar plus Photon and LiveKit settings. |
| Phone call will not connect | Check Photon outbound SIP credentials, LiveKit settings, shared service token, and sidecar logs. |
| Coaching request failed | Verify `ANTHROPIC_API_KEY` on the server and inspect its logs. |
| Post-call report says there is no transcript | End the conversation after transcript lines have appeared. |
| Demo records disappear after a redeploy | Use persistent storage and set `DEMO_DATABASE_PATH` to its mounted path. |

## Repository map

| Path | Contents |
|---|---|
| `sales-agent-ui/` | React app and Vite development server |
| `server.js` | UI hosting, coaching endpoints, customer and communications routing |
| `cards.js`, `prompt.js`, `catalogFacts.js` | Handset coaching cards, model instructions, and dated handset facts |
| `knowledge/demo_store.py` | Fictional customer seed and T-Mobile handset catalog |
| `communications/` | Photon/LiveKit calling service |
| `call_analysis.py`, `analysis_bridge.py` | Evidence-based post-call report |
| `render.yaml`, `DEPLOY.md` | Render deployment configuration and guide |
