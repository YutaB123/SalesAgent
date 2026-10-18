# T-Mobile phone demo

The app recommends handsets only. It does not recommend or compare wireless service plans, carrier networks, coverage, or data allowances. The handset catalog is loaded from the `phones` array in the root `tmobile_sales_agent_mock_data.json` and replaces the previous SQLite device catalog. The file explicitly labels model references and prices as fictional mock data, not live T-Mobile inventory or quotes. The UI shows the mock retail price, sample 24-month payment, storage, OS, features, fit, and tradeoffs. No T-Mobile catalog link is shown in the UI.

The app uses fictional sample customers and an isolated SQLite database at `DEMO_DATABASE_PATH`. It never copies real CRM data. On startup, existing fictional `Demo Essential`, `Demo Plus`, and `Demo Family` recommendations are migrated to handset recommendations; other customer edits and histories are retained. The old fictional plan table is dropped.

Mount a persistent disk and set `DEMO_DATABASE_PATH` to its absolute path to keep records across hosted restarts. SQLite is intended for a single server instance.

Home supports phone-number lookup, live transcripts, and handset-focused coaching. Phone calls require Photon and LiveKit; transcription requires Deepgram; coaching and post-call analysis require Anthropic.

Customer Information contains each customer's profile, notes, phone recommendation, follow-up tasks, and call history. Follow-up drafts can be reviewed and sent only after explicit user confirmation and provider configuration.

The report's purchase-stage confidence is an evidence heuristic, not a calibrated model confidence or purchase readiness.

Customer edits are sent through the repository outbox to `/api/customers`. Failed writes retry every five seconds and on reconnection. Hosted SQLite must use persistent storage to survive redeployments.
