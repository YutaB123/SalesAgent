"""Private CRM memory using the same configured PostgreSQL connection as the plan catalog."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def normalize_phone(value):
    raw = str(value or '').strip()
    digits = re.sub(r'\D', '', raw)
    if digits.startswith('0'):
        raise ValueError('Enter a valid phone number with country code')
    if len(digits) == 10 and not raw.startswith('+'):
        digits = '1' + digits
    if not 8 <= len(digits) <= 15 or digits.startswith('0'):
        raise ValueError('Enter a valid phone number with country code')
    return '+' + digits


def initialize(store):
    with store.connection() as conn:
        if store.pg:
            conn.execute((Path(__file__).resolve().parent.parent / 'supabase/migrations/20261017040000_sales_customer_memory.sql').read_text(), prepare=False)
        else:
            conn.execute('CREATE TABLE IF NOT EXISTS sales_customer_memory (id TEXT PRIMARY KEY, phone TEXT UNIQUE, record TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    return {'storage': 'supabase' if store.pg else 'sqlite', 'initialized': True}


def list_records(store, phone=None, customer_id=None):
    q = store.placeholder
    query = 'SELECT record FROM sales_customer_memory'
    params = ()
    if phone:
        query += ' WHERE phone=' + q
        params = (normalize_phone(phone),)
    elif customer_id:
        query += ' WHERE id=' + q
        params = (customer_id,)
    if not phone and not customer_id:
        query += " WHERE COALESCE(record->>'archived', 'false') != 'true'" if store.pg else " WHERE COALESCE(json_extract(record, '$.archived'), 0) != 1"
    query += ' ORDER BY updated_at DESC LIMIT 1000'
    with store.connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return {'customers': [r['record'] if isinstance(r['record'], dict) else json.loads(r['record']) for r in rows], 'storage': 'supabase' if store.pg else 'sqlite'}


def upsert(store, record):
    if not isinstance(record, dict) or not isinstance(record.get('id'), str) or len(record['id']) > 150:
        raise ValueError('Customer ID is required')
    if record.get('isSample'):
        raise ValueError('Sample profiles are kept in browser storage only')
    if len(json.dumps(record)) > 600000:
        raise ValueError('Customer record too large')
    contact = record.get('contact', '')
    phone = normalize_phone(contact) if contact and re.fullmatch(r'[+\d\s().-]+', contact) else None
    if phone:
        record = dict(record, id='phone-' + phone[1:], contact=phone, name=record.get('name') or phone)
    record.setdefault('name', phone or 'Unnamed contact')
    calls = record.get('callHistory', [])
    if not isinstance(calls, list) or len(calls) > 200 or any(not isinstance(c, dict) or not isinstance(c.get('id'), str) for c in calls):
        raise ValueError('Invalid call history')
    q = store.placeholder
    now = datetime.now(timezone.utc).isoformat()
    with store.connection() as conn:
        if not store.pg:
            conn.execute('BEGIN IMMEDIATE')
        # Insert first so concurrent first-time writes serialize on the same phone identity.
        conn.execute('INSERT INTO sales_customer_memory(id,phone,record) VALUES (' + ','.join([q, q, q + ('::jsonb' if store.pg else '')]) + ') ON CONFLICT(id) DO NOTHING', (record['id'], phone, json.dumps(record)))
        row = conn.execute('SELECT record FROM sales_customer_memory WHERE id=' + q + (' FOR UPDATE' if store.pg else ''), (record['id'],)).fetchone()
        previous = row['record'] if isinstance(row['record'], dict) else json.loads(row['record'])
        history = {c['id']: c for c in previous.get('callHistory', [])}
        for call in calls:
            old = history.get(call['id'], {})
            history[call['id']] = {**old, **{k: v for k, v in call.items() if v not in ('', None, []) or k not in old}}
        evidence = {x.get('quote'): x for x in previous.get('criticalInformation', []) if isinstance(x, dict)}
        evidence.update({x.get('quote'): x for x in record.get('criticalInformation', []) if isinstance(x, dict)})
        merged = {**previous, **record, 'callHistory': sorted(history.values(), key=lambda c: c.get('date', ''), reverse=True)[:200], 'criticalInformation': list(evidence.values())[-12:]}
        if previous.get('doNotContact') or record.get('doNotContact'):
            merged['doNotContact'] = True
            merged['followUpDate'] = ''
            merged.pop('followUpRecommendation', None)
        conn.execute('UPDATE sales_customer_memory SET record=' + q + ('::jsonb' if store.pg else '') + ', revision=revision+1,updated_at=' + q + ' WHERE id=' + q, (json.dumps(merged), now, record['id']))
    return {'customer': merged, 'storage': 'supabase' if store.pg else 'sqlite'}
