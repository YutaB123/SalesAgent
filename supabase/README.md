# Public Cloud Database (Supabase)

This is the primary shared database for the team and public demo. The SQLite
files under `database/` remain an offline fallback only.

## Access model

- Browser: Supabase URL + publishable key; read-only access to `is_demo = true` rows.
- Backend: URL + secret key; writes transcript and analysis results.
- Real customer rows: `is_demo = false` by default and invisible to public clients.
- Never put `SUPABASE_SECRET_KEY` in frontend code or Git.

## Deploy to a Supabase project

1. Use the existing `sales-customer-demo` project (`bfhwiovmljtbcqumarbh`) or
   create a separate staging project.
2. Copy `.env.example` to the frontend/backend environment. The browser-safe
   public demo URL and publishable key are already populated. Backend owners
   must obtain their own secret key from Supabase and keep it outside Git.
3. Authenticate and link the CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

4. Preview and deploy:

```bash
supabase db push --dry-run
supabase db push --include-seed
```

The seed is fictional and intended only for the public hackathon demo.

## Frontend reads

Member 3 should start with:

- `demo_customer_overview`: one row per customer
- `demo_strategy_cards`: the primary recommendation for each call
- `transcript_turns`: ordered call transcript
- `follow_up_actions`: seller/customer commitments

The ready-to-copy TypeScript calls are in `examples/supabase-client.ts`.
The exact normalization rules for the current Python analysis module are in
`supabase/CALL_ANALYSIS_MAPPING.md`.

## Backend writes

Member 4 should use the server-only secret key and publish one analysis atomically:

1. Start a database transaction and insert the next unused `(call_id, version)`
   as `pending`, with the same `is_demo` value as the call.
2. Insert `objections`, `seller_scores`, `strategies`, `follow_up_actions`, and
   `customer_messages` with deterministic IDs so a retry is idempotent.
3. Mark the run `completed` only after all children succeed, then commit. Roll
   back the whole transaction on any error; never reuse a published version.

The public card view exposes only the highest completed version for each call,
so a pending or failed retry cannot replace a good result.

Set `is_demo = true` only for fictional data that is safe to expose publicly.
The seed runs in one transaction and aborts if a reserved demo ID already
belongs to non-demo data.

## Public demo test

With the project URL and publishable key:

```bash
curl "$VITE_SUPABASE_URL/rest/v1/demo_strategy_cards?select=*" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```

Expected: three strategy cards with distinct price subtypes: `value_gap`,
`cash_flow`, and `procurement_tactic`.
