# Customer workflow

Customer profiles, handset recommendations, call summaries, transcripts, and follow-up tasks are stored in the isolated SQLite database at `DEMO_DATABASE_PATH`. The browser keeps a local cache and an outbox; it retries queued changes when the server becomes available.

Customers are identified by normalized phone number. A request not to be contacted is retained and cannot be cleared by an older update. Archiving hides the record from the active list while preserving its history for lookup.

The sample data is fictional and does not connect to the production CRM or Supabase. For hosted persistence, use one app instance with a mounted persistent disk.
