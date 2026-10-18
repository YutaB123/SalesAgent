# Two-page demo

The default application uses fictional plans and customers from `knowledge/demo_store.py`. Customer memory always uses the isolated `DEMO_DATABASE_PATH` SQLite file, regardless of SUPABASE_DB_URL. No real CRM is copied or changed. Existing browser caches are intentionally isolated with new demo cache keys. Prices live only in the backend demo_plans table; the UI has no price editor or price table.

Mount a persistent disk and set DEMO_DATABASE_PATH to its absolute path for hosted persistence across restarts/deployments. All instances must use the same database; this SQLite demo is intended for a single server instance. Existing production Supabase data is untouched.

Home contains phone lookup, customer name/recommended plan, live transcript and one-sentence script. Calling still requires Photon/LiveKit and transcription requires Deepgram. Analysis requires the Anthropic key. No fake AI report is generated if keys are missing.

Customer Information contains profile, editable summary/readiness/communication score, tasks and collapsed call history. Follow-up notifications appear only after successful analysis and remain pending until Email or Message is confirmed; confirmation never sends a message. The report's proposed channel drives the recommendation; email is the fallback if it provides no supported channel.

Stage confidence is an explicit evidence heuristic: High has at least two distinct cited turns for a non-null stage, Medium one, Low none. It is not a calibrated model confidence or purchase readiness.

Every edit and confirmation is saved through the same customer repository outbox and /api/customers POST. Failed writes retry every five seconds and on reconnection. The sidebar reports backend acknowledgement separately from local queuing. A refresh hydrates server records while preserving pending edits. Demo seed creation never overwrites edits.

Validation:

```sh
cd sales-agent-ui && npm ci && npm run build
cd ..
node --test tests/demo-repository.cjs tests/demo-persistence.cjs tests/demo-http.cjs
node --test guard.test.js
python -m unittest -q test_call_analysis.py
```

Live calling, microphone capture and live model analysis require credentials and a manual smoke test; they were not exercised by these offline checks.
