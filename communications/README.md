# Communications owner handoff

Branch: `codex/photon-communications`. This module owns Photon voice/SIP, browser call audio, call lifecycle and optional reviewed follow-up sending. It does **not** perform speech recognition, coaching, database writes, or redesign the existing app.

## Team boundaries

| Owner | Receives | Produces |
|---|---|---|
| Communications (Zoe) | customer number, user dial/hangup action | separate rep/customer audio tracks; `callId`; call lifecycle events |
| Transcription | each audio track + known role + active `callId` | interim/final transcript events with `speaker: rep/customer` |
| Website | communications browser SDK; transcript events; existing coaching response | dial controls, transcript bubbles, coaching cards |
| Database | call events + final transcripts + coaching results | persisted calls/transcripts; deduplicate using event IDs |

A sales rep is `rep` throughout the team interface, matching existing `/api/analyze` and `/api/match`. Customer is `customer`. Unlike microphone diarization, roles follow independent tracks.

## Start locally

Requires Node 18+ and Python 3.11+. The browser SDK is vendored at LiveKit 2.23.0 with its Apache-2.0 license.

```bash
# First-time setup only. Do not overwrite a teammate's existing .env.
cp .env.example .env
python3 -m venv .venv
.venv/bin/python -m pip install -r communications/requirements.txt
```

Fill `.env` with your existing LiveKit project and Photon **outbound** SIP credentials. Generate a local `COMMUNICATIONS_SERVICE_TOKEN`, for example with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`, and put it in `.env`. Both services read the same file. `PHOTON_PHONE_NUMBER` is a number owned by that Photon project; customer numbers are supplied at dial time. Use TLS endpoint `sip.photon.codes:5061`. No keys, passwords, `.env` files, recordings or customer transcripts belong in Git.

```bash
# Terminal 1: communications only. Does not load Whisper or Deepgram.
.venv/bin/python communications/service.py
# Terminal 2: existing team website, with its normal Anthropic/Deepgram configuration.
node server.js
```

Open **http://localhost:3000/communications** in Chrome. This is a small integration test page; the team's main UI at `/` remains unchanged. Connect microphone, allow Chrome/macOS access, enter the customer's full number, then call. Use a headset. `Enable call sound` handles blocked browser autoplay. Disconnecting seller audio ends the active phone participant; calls also have a 10-minute maximum.

Full SIP settings are passed explicitly to LiveKit on each outbound call. This is the connection mode that worked in the existing phone demo; it avoids relying on a separately saved outbound trunk. The service only observes the room and never captures a computer microphone itself.

The demo supports **one seller and one call at a time** in `LIVEKIT_ROOM`. Give this team checkout its own room to avoid connecting to another running demo. Existing inbound Photon routing will only work here if its LiveKit dispatch rule targets the same room. Per-user rooms, durable lifecycle recovery and production authentication are future work.

## Website teammate

Add these scripts to your page (they are already available through `server.js`):

```html
<script src="/communications/sdk.js"></script>
<script src="/communications/browser.js"></script>
```

```javascript
const comms = new SalesAgentCommunications();
comms.addEventListener('state', ({detail}) => updateCallUI(detail));
comms.addEventListener('callEvent', ({detail}) => onCallEvent(detail));
comms.addEventListener('playbackBlocked', () => showEnableSoundButton());
// Call from a button click. Let the user allow microphone access.
await comms.connect();
const {callId} = await comms.dial('+14255550123');
await comms.mute(true); // false to unmute
await comms.hangup();
await comms.disconnect();
```

Do not call all these sequentially on page load: bind each action to its own UI control. The `/communications` page shows a complete example. Dial returns `dialing`, not `answered`; use state/events for the actual result. The browser must remain connected for the salesperson to hear and speak. No automated AI voice agent is included.

## Transcription teammate: actual audio handoff

Choose **one** consumption method to avoid double billing/duplicate transcripts.

**Browser STT**: listen for native `MediaStreamTrack` objects. Do not use the existing speakerphone microphone capture at the same time.

```javascript
comms.addEventListener('audioTrack', ({detail}) => {
  const {role, track, participant} = detail;
  const stream = new MediaStream([track]);
  // Your STT code opens an independent stream for role='rep' or 'customer'.
  // The rep track becomes available before dialing; start/reset the actual
  // transcript session when callStarted/state supplies the callId.
  startYourTranscriber({stream, speaker: role, participant});
});
comms.addEventListener('callStarted', ({detail}) => setActiveCallId(detail.callId));
comms.addEventListener('audioTrackEnded', ({detail}) => stopYourTranscriber(detail.participant));
```

Do not stop the supplied track inside STT: that would stop the call audio. Stop only your own audio processing/streaming connection. Customer audio track events contain `callId`; rep audio is reused across calls, so attribute its transcript to the current active call.

**Server STT**: from your backend request `POST http://127.0.0.1:8787/transcriber-token` with `Authorization: Bearer <COMMUNICATIONS_SERVICE_TOKEN>` and JSON `{}`. Join the returned LiveKit URL/token. The token permits subscribing in one room, and cannot publish audio. Use `seller-browser` as `rep`, and `outbound-<callId>` as `customer`; ignore observer participants. Subscribe to each remote audio track and feed your own Deepgram/STT connection. This token endpoint is intentionally not exposed through the browser proxy.

Proposed final transcript contract (owned by transcription, not emitted by this service):

```json
{"eventId":"unique-transcript-id","callId":"<call-id>","speaker":"customer","text":"That sounds expensive.","final":true,"timestamp":1792267200.0}
```

With a final transcript, the current site's `addBubble(text, null, speaker)` already accepts known `rep/customer` roles. Its existing `/api/match` accepts `{text, speaker, history}`. Website/transcription owners should wire that final callback once, using an event ID to avoid duplicate bubbles/coaching.

## Database teammate

`GET /api/comms/events?after=0` from the local website, or direct `GET /events?after=0` from a backend with the service bearer token. Example:

```json
{"events":[{"id":1,"eventId":"<unique-id>","type":"call.dialing","timestamp":1792267200.0,"room":"salesagent-demo","callId":"<call-id>"}],"cursor":1,"gap":false}
```

Events: `call.dialing`, `call.answered`, `call.failed`, `call.ended`, `call.sip_status`, `participant.joined`, `seller.disconnected`, `service.ready`. Store `eventId` as a unique key; `id` is only a process-local polling cursor. Call records join on `callId`; transcript records are supplied by the STT teammate. Events do not contain customer numbers or transcript text. The initiating website can separately save approved customer metadata against the returned `callId`.

The last 500 events are in memory. `gap=true` means events expired; reload `/state`. Restarts reset the cursor and state. This is not a durable queue; database ownership includes durable event ingestion if required.

## Optional follow-up messages

SIP credentials do not authorize messages. Set `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `PHOTON_AGENT_USER_ID` and `PHOTON_MESSAGE_PLATFORM` separately. SMS requires channel eligibility; shared iMessage requires assignment and a fresh inbound iMessage before replying.

`comms.followup(recipient, text, requestId)` sends a **reviewed** message. Use a UUID request ID, keep it for an unchanged retry, and ask the operator to review the recipient and text first. API acceptance is not delivery confirmation. No automatic follow-up generation/sending is included.

## Changes for reviewers

Only one route-dispatch line was added to `server.js`; communications lives under its own folder. Existing microphone/STT/card code is untouched. This avoids merge conflicts with the website and transcription owners.

The original separate phone-demo verified actual Photon calls and independent synthetic speaker audio transcription. This team module has its own route/role/call lifecycle tests and smoke checks. Full browser-to-phone audio in this new checkout still needs a final manual smoke test after configuring local credentials.

## Git collaboration

Continue work on `codex/photon-communications`, commit only communications changes, push the branch, then open a PR to `main`. Have transcription and website teammates review the audio/event contract before merging. Each teammate should use their own branch and PR; do not share a working checkout or commit `.env`.
