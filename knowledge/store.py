"""Server-only plan catalog storage. PostgreSQL in Supabase, SQLite for local development."""
from contextlib import contextmanager
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys
import uuid
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / '.env').read_text().splitlines() if (ROOT / '.env').exists() else []:
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('\"\''))
SNAPSHOT = json.loads(Path(__file__).with_name('carrier-plans.json').read_text())


class Conflict(ValueError):
    pass


def validate(record):
    if not isinstance(record, dict):
        raise ValueError('Plan must be an object')
    if record.get('carrier') not in ('T-Mobile', 'AT&T', 'Verizon'):
        raise ValueError('Unknown carrier')
    for key in ('id', 'name', 'sourceUrl', 'sourceSection', 'verifiedOn'):
        if not isinstance(record.get(key), str) or not record[key].strip() or len(record[key]) > 500:
            raise ValueError('Missing or invalid ' + key)
    host = urlsplit(record['sourceUrl']).hostname or ''
    domain = {'T-Mobile': 't-mobile.com', 'AT&T': 'att.com', 'Verizon': 'verizon.com'}[record['carrier']]
    if not record['sourceUrl'].startswith('https://') or not (host == domain or host.endswith('.' + domain)):
        raise ValueError('Source must be an official HTTPS page for this carrier')
    try:
        verified = date.fromisoformat(record['verifiedOn'])
    except ValueError:
        raise ValueError('Use a valid source verification date') from None
    if verified > date.today():
        raise ValueError('Verification date cannot be in the future')
    prices = record.get('baseMonthlyCentsByLines')
    if not isinstance(prices, dict) or any(not str(k).isdigit() or not 1 <= int(k) <= 12 or type(v) is not int or not 0 < v <= 1000000 for k, v in prices.items()):
        raise ValueError('Base prices must be positive cents for 1–12 lines')
    if prices and not record.get('priceBasis'):
        raise ValueError('State whether base prices include taxes, fees and discounts')
    for key in ('providerFeeCentsPerLine', 'connectionChargeCentsPerLine'):
        if key in record and (type(record[key]) is not int or not 0 <= record[key] <= 1000000):
            raise ValueError('Invalid fee')
    offer = record.get('advertisedOffer')
    if offer is not None:
        if not isinstance(offer, dict) or type(offer.get('lines')) is not int or not 1 <= offer['lines'] <= 12 or type(offer.get('perLineCents')) is not int or not 0 < offer['perLineCents'] <= 1000000 or not isinstance(offer.get('conditions'), str) or not offer['conditions'].strip():
            raise ValueError('An advertised offer needs line count, per-line price and eligibility terms')
    for key in ('features', 'aliases'):
        if key in record and (not isinstance(record[key], list) or len(record[key]) > 20 or any(not isinstance(x, str) or len(x) > 500 for x in record[key])):
            raise ValueError('Invalid ' + key)
    return record


class Store:
    def __init__(self, local_path=None):
        self.url = '' if local_path else os.environ.get('SUPABASE_DB_URL', '')
        self.path = Path(local_path or ROOT / 'database' / 'carrier_plans.sqlite')
        self.pg = bool(self.url)
        self.placeholder = '%s' if self.pg else '?'

    @contextmanager
    def connection(self):
        if self.pg:
            import psycopg
            from psycopg.rows import dict_row
            conn = psycopg.connect(self.url, sslmode='require', connect_timeout=10, row_factory=dict_row)
        else:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=10)
            conn.row_factory = sqlite3.Row
            conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def initialize(self):
        with self.connection() as conn:
            if self.pg:
                conn.execute((ROOT / 'supabase/migrations/20261017030000_carrier_plan_catalog.sql').read_text(), prepare=False)
            else:
                conn.executescript('''
                CREATE TABLE IF NOT EXISTS carrier_plan_catalog (
                    id TEXT PRIMARY KEY, record TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE IF NOT EXISTS carrier_plan_updates (
                    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES carrier_plan_catalog(id),
                    revision INTEGER NOT NULL, previous_record TEXT, record TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
                ''')
            inserted = 0
            for plan in SNAPSHOT['plans']:
                validate(plan)
                cursor = conn.execute('INSERT INTO carrier_plan_catalog (id, record) VALUES (' + self.placeholder + ',' + self.placeholder + ( '::jsonb' if self.pg else '') + ') ON CONFLICT (id) DO NOTHING', (plan['id'], json.dumps(plan)))
                inserted += cursor.rowcount
        return {'inserted': inserted, 'storage': 'supabase' if self.pg else 'sqlite'}

    def catalog(self):
        with self.connection() as conn:
            rows = conn.execute('SELECT id, record, revision, updated_at FROM carrier_plan_catalog ORDER BY id').fetchall()
            updates = conn.execute('SELECT id, plan_id, revision, updated_at FROM carrier_plan_updates ORDER BY updated_at DESC LIMIT 20').fetchall()
        return dict(schemaVersion=1, maxAgeDays=SNAPSHOT['maxAgeDays'], verifiedOn=SNAPSHOT['verifiedOn'],
            market=SNAPSHOT['market'], storage='supabase' if self.pg else 'sqlite',
            plans=[r['record'] if isinstance(r['record'], dict) else json.loads(r['record']) for r in rows],
            revisions={r['id']:r['revision'] for r in rows}, updates=[dict(r, updated_at=str(r['updated_at'])) for r in updates])

    def update(self, record, expected_revision, verified):
        validate(record)
        if verified is not True:
            raise ValueError('Confirm that you checked the official source before updating')
        if type(expected_revision) is not int or expected_revision < 1:
            raise ValueError('Expected revision is required')
        with self.connection() as conn:
            if not self.pg:
                conn.execute('BEGIN IMMEDIATE')
            q = self.placeholder
            row = conn.execute('SELECT record, revision FROM carrier_plan_catalog WHERE id=' + q + (' FOR UPDATE' if self.pg else ''), (record['id'],)).fetchone()
            if not row:
                raise ValueError('Plan not found')
            if row['revision'] != expected_revision:
                raise Conflict('Someone updated this plan. Reload before editing again.')
            previous = row['record'] if isinstance(row['record'], dict) else json.loads(row['record'])
            if previous['carrier'] != record['carrier']:
                raise ValueError('A plan cannot change carriers')
            revision = expected_revision + 1
            payload = json.dumps(record)
            now = datetime.now(timezone.utc).isoformat()
            conn.execute('UPDATE carrier_plan_catalog SET record=' + q + ('::jsonb' if self.pg else '') + ', revision=' + q + ', updated_at=' + q + ' WHERE id=' + q, (payload, revision, now, record['id']))
            cast = '::jsonb' if self.pg else ''
            conn.execute('INSERT INTO carrier_plan_updates (id, plan_id, revision, previous_record, record, updated_at) VALUES (' + ','.join([q,q,q,q+cast,q+cast,q]) + ')', (uuid.uuid4().hex, record['id'], revision, json.dumps(previous), payload, now))
        return {'id':record['id'], 'revision':revision, 'updated':True}


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else 'list'
    store = Store()
    if not store.pg and not store.path.exists():
        store.initialize()
    if command == 'init':
        return store.initialize()
    if command == 'import-snapshot':
        initialized = store.initialize()
        current = store.catalog()
        existing = {p['id']: p for p in current['plans']}
        updated = 0
        for plan in SNAPSHOT['plans']:
            if existing.get(plan['id']) != plan:
                store.update(plan, current['revisions'][plan['id']], True)
                updated += 1
        return dict(initialized, updated=updated, plans=len(store.catalog()['plans']))
    if command == 'list':
        return store.catalog()
    if command == 'update':
        data = json.load(sys.stdin)
        return store.update(data.get('record'), data.get('expectedRevision'), data.get('sourceVerified'))
    raise ValueError('Unknown operation')


if __name__ == '__main__':
    try:
        print(json.dumps(main(), default=str))
    except Conflict as exc:
        print(json.dumps({'error':str(exc), 'status':409}))
        sys.exit(1)
    except ValueError as exc:
        print(json.dumps({'error':str(exc), 'status':400}))
        sys.exit(1)
    except Exception:
        print(json.dumps({'error':'Plan database unavailable. Check the server-only database URL, dependencies and initialization.', 'status':503}))
        sys.exit(1)
