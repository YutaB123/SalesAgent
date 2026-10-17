# Carrier plan database

Open **Plan Database** in the sidebar. Select an existing plan, review its official source, edit the values and verification date, check the source confirmation and click **Update database**. Reload retrieves the latest revisions. Concurrent edits return a conflict rather than overwrite another person's work. Each successful update stores both the previous and new record.

The server uses Supabase PostgreSQL when `SUPABASE_DB_URL` is configured in the local `.env`; otherwise it uses ignored `database/carrier_plans.sqlite`. Never commit the connection string. Configure `PLAN_DATABASE_PYTHON` to the Python interpreter where `knowledge/requirements.txt` is installed.

Initialize the cloud tables and seed the official plans with that interpreter:

```sh
python -m pip install -r knowledge/requirements.txt
python knowledge/store.py init
```

The migration only adds `carrier_plan_catalog` and `carrier_plan_updates`. Initialization is idempotent and does not replace edited plans. Editing APIs are restricted to localhost in this demo; a deployed shared editor needs authenticated administrator authorization.

Prices are manually verified snapshots, not automatic scraping. Base account prices and conditional advertised offers are separate. Competitor advertised offers must not be treated as a customer's actual bill. The comparison API requires a comparable customer bill and fresh verified data before calculating a base-service difference. Live coaching and post-call analysis read the catalog from the configured database for each request. Coaching falls back to source-neutral guidance while the model writes a tailored response.

Official sources:
- https://www.t-mobile.com/cell-phone-plans
- https://www.att.com/plans/unlimited-data-plans/
- https://www.verizon.com/plans/unlimited/

Validation: `python -m unittest discover -s knowledge -p 'test_*.py'` and `pnpm build` inside `sales-agent-ui`.

After reviewing a changed bundled snapshot, run `python knowledge/store.py import-snapshot` to import new records and audit changed existing records. This explicit operation updates matching plan IDs; it is not run automatically on server startup. The October 17, 2026 snapshot covers 22 entries (17 T-Mobile variants, four AT&T plans and one Verizon plan). Coverage exclusions are recorded in the JSON snapshot.
