# Knowledge and demo data

The active product knowledge is a handset catalog in `demo_store.py`. It is limited to phones listed on T-Mobile's official device pages; it does not provide wireless-plan, carrier, or network comparisons. Full-retail prices are dated references and must be checked on the linked page before use.

The backend uses a separate SQLite database at `DEMO_DATABASE_PATH` (default `database/demo.sqlite`) for the handset catalog and fictional customer demo records. Phone availability and promotions can change, so the app does not promise a dated price as a current offer.

See [DEMO_WORKFLOW.md](DEMO_WORKFLOW.md) for the data migration and persistence behavior. The older plan-catalog records are not used by the running app.
