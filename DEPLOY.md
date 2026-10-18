# Deploy the shared team demo

The merged app is a long-running Node server with a Python communications sidecar. Deploy the repository as a Docker web service (the included `render.yaml` is configured for Render); a static Vercel deployment cannot run these services together.

## Create the hosted service

1. Push this branch to GitHub and open `https://render.com/blueprint/new`.
2. Connect `YutaB123/SalesAgent`, select branch `main`, and apply the `render.yaml` Blueprint.
3. Render generates `COMMUNICATIONS_SERVICE_TOKEN` for the private Node-to-Python connection. The demo site is public and does not prompt visitors for a team password.
4. In the service's Environment settings, paste freshly rotated keys for Anthropic, Deepgram, LiveKit, Photon and Supabase. Do not reuse credentials that were pasted into chat. Create a Deepgram API key with Member permissions or higher so the app can mint short-lived browser tokens.
5. Wait for the deploy to become Live, then share the service's HTTPS `onrender.com` URL with your teammates.

Render's free web services may sleep when idle. The first visit after an idle period can take a little longer to wake up. Customer profiles, call summaries, follow-up actions, and the handset catalog use the SQLite database at `DEMO_DATABASE_PATH`. Attach a persistent disk and set that variable to its mount path if records must survive restarts and redeploys. The demo is designed for one server instance.

## Secret handling

Keep `.env` out of Git. Use Render's Environment settings for secrets. If any provider key or database password has been pasted into chat or a public place, revoke it and create a replacement before deployment.
