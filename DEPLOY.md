# Deploy the shared team demo

The merged app is a long-running Node server with a Python communications sidecar. Deploy the repository as a Docker web service (the included `render.yaml` is configured for Render); a static Vercel deployment cannot run these services together.

## Create the hosted service

1. Push this branch to GitHub and open `https://render.com/blueprint/new`.
2. Connect `YutaB123/SalesAgent`, select branch `main`, and apply the `render.yaml` Blueprint.
3. In the Blueprint prompt, set `SITE_USERNAME` and a strong team-only `SITE_PASSWORD`. Render generates `COMMUNICATIONS_SERVICE_TOKEN` for the private Node-to-Python connection.
4. In the service's Environment settings, paste freshly rotated keys for Anthropic, Deepgram, LiveKit, Photon and Supabase. Do not reuse credentials that were pasted into chat. Create a Deepgram API key with Member permissions or higher so the app can mint short-lived browser tokens.
5. Wait for the deploy to become Live, then share the service's HTTPS `onrender.com` URL and the team login with your teammates. The browser will ask for the username and password.

Render's free web services may sleep when idle. The first visit after an idle period can take a little longer to wake up. The current customer profiles, call summaries and follow-up actions are still stored in each browser's local storage; hosting the app does not yet synchronize that data between teammates. The plan catalog uses the configured Supabase connection when available.

## Secret handling

Keep `.env` out of Git. Use Render's Environment settings for secrets. If any provider key or database password has been pasted into chat or a public place, revoke it and create a replacement before deployment.
