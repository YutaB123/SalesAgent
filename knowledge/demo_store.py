"""Isolated demo CRM and T-Mobile handset catalog."""
import json, os, sys
from pathlib import Path
from demo_db import DemoStore
from customer_memory import initialize, list_records, upsert

path = Path(os.environ.get('DEMO_DATABASE_PATH', Path(__file__).resolve().parent.parent / 'database/demo.sqlite'))
store = DemoStore(path)
initialize(store)

dataset_path = Path(__file__).resolve().parent.parent / 'tmobile_sales_agent_mock_data.json'
with dataset_path.open(encoding='utf-8') as source:
 mock_dataset = json.load(source)
phones = mock_dataset.get('phones')
if not isinstance(phones, list) or not phones:
 raise ValueError('tmobile_sales_agent_mock_data.json must contain a non-empty phones list')
devices = [
 {
  'id': phone['id'],
  'name': f"{phone['brand']} {phone['model']}",
  'brand': phone['brand'],
  'category': phone['category'],
  'fullPrice': phone['mock_retail_price'],
  'monthlyPayment24mo': phone['mock_monthly_payment_24mo'],
  'storageGb': phone['storage_gb'],
  'os': phone['os'],
  'fit': phone.get('best_for', []),
  'features': phone.get('features', []),
  'tradeoffs': phone.get('tradeoffs', []),
  'isMockData': True,
 }
 for phone in phones
]
with store.connection() as conn:
 conn.execute('CREATE TABLE IF NOT EXISTS demo_devices (id TEXT PRIMARY KEY, record TEXT NOT NULL)')
 # Replace the previous handset catalog completely while keeping customer records intact.
 conn.execute('DELETE FROM demo_devices')
 conn.executemany('INSERT INTO demo_devices VALUES (?,?)',[(device['id'],json.dumps(device)) for device in devices])
 # Remove the previous fictional network-plan catalog; demo_plans contains no customer data.
 conn.execute('DROP TABLE IF EXISTS demo_plans')
 conn.execute('CREATE TABLE IF NOT EXISTS demo_seeded (version INTEGER PRIMARY KEY)')
 seeded=conn.execute('SELECT version FROM demo_seeded WHERE version=2').fetchone()
if not seeded:
 # Replace only the prior demo placeholders. Other customer edits are retained.
 replacements={'Demo Plus':'Apple iPhone 17 Pro','Demo Family':'Samsung Galaxy S26 Ultra','Demo Essential':'Google Pixel 10a','Demo plan':'Google Pixel 10a'}
 old_summaries={
  'Needs hotspot data; wants to compare the monthly cost.':'Interested in camera and performance; wants to review the full device price.',
  'Considering three lines; decision timing is unclear.':'Considering a premium Android phone with a large display.',
  'Budget mentioned; requirements still need confirmation.':'Looking for an affordable phone for everyday use; preferences still need confirmation.',
 }
 with store.connection() as conn:
  rows=conn.execute('SELECT id,record FROM sales_customer_memory').fetchall()
  for row in rows:
   record=json.loads(row['record'])
   old_recommendation=record.get('recommendedPlan')
   old_product=record.get('productDiscussed')
   if old_recommendation in replacements or old_product in replacements:
    record['recommendedPlan']=replacements.get(old_recommendation,replacements.get(old_product,old_recommendation))
    record['productDiscussed']=replacements.get(old_product,record['recommendedPlan'])
    record['summary']=old_summaries.get(record.get('summary'),(record.get('summary') or '').replace('plan','phone').replace('Plan','Phone'))
    conn.execute('UPDATE sales_customer_memory SET record=? WHERE id=?',(json.dumps(record),row['id']))
  for i,(name,device,stage,confidence,summary) in enumerate([
   ('Alex Chen','Apple iPhone 17 Pro','Comparing','High','Interested in camera and performance; wants to review the full device price.'),
   ('Jordan Lee','Samsung Galaxy S26 Ultra','Exploring','Medium','Considering a premium Android phone with a large display.'),
   ('Taylor Morgan','Google Pixel 10a','Exploring','Low','Looking for an affordable phone for everyday use; preferences still need confirmation.')
  ]):
   phone=f'+1202555010{i}'
   record=dict(id='phone-'+phone[1:],name=name,contact=phone,company='',role='',needs='',concerns='',productDiscussed=device,recommendedPlan=device,purchaseStage=stage,confidence=confidence,readiness=5,followUpDate='',notes='',lastContact='',summary=summary,callHistory=[],followUpTasks=[],followUpPending=False)
   conn.execute('INSERT OR IGNORE INTO sales_customer_memory (id,phone,record) VALUES (?,?,?)',(record['id'],phone,json.dumps(record)))
  conn.execute('INSERT OR IGNORE INTO demo_seeded VALUES (2)')

payload=json.load(sys.stdin) if not sys.stdin.isatty() else {}
command=sys.argv[1]
if command.startswith('job-'):
 from followup_jobs import operate
 result=operate(store,command,payload)
elif command=='customer-list': result=list_records(store,payload.get('phone'),payload.get('customerId'))
elif command=='customer-save':
 record=payload['record']; record.pop('isSample',None); result=upsert(store,record)
elif command in ('followup-claim','followup-result'):
 with store.connection() as conn:
  conn.execute('CREATE TABLE IF NOT EXISTS followup_outbox (id TEXT PRIMARY KEY, record TEXT NOT NULL)')
  if command=='followup-claim':
   from datetime import datetime, timezone
   record={**payload,'status':'pending','createdAt':datetime.now(timezone.utc).isoformat()}
   cursor=conn.execute('INSERT OR IGNORE INTO followup_outbox VALUES (?,?)',(payload['requestId'],json.dumps(record)))
   row=conn.execute('SELECT record FROM followup_outbox WHERE id=?',(payload['requestId'],)).fetchone()
   result={'created':cursor.rowcount==1,'record':json.loads(row['record'])}
  else:
   row=conn.execute('SELECT record FROM followup_outbox WHERE id=?',(payload['requestId'],)).fetchone()
   record={**json.loads(row['record']),**payload}
   conn.execute('UPDATE followup_outbox SET record=? WHERE id=?',(json.dumps(record),payload['requestId']))
   result={'record':record}
elif command=='followup-history':
 with store.connection() as conn:
  exists=conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='followup_outbox'").fetchone()
  rows=conn.execute("SELECT record FROM followup_outbox WHERE json_extract(record,'$.customerId')=?",(payload['customerId'],)).fetchall() if exists else []
  result={'messages':[json.loads(row['record']) for row in rows]}
elif command=='devices':
 with store.connection() as conn: result={'devices':[json.loads(row['record']) for row in conn.execute('SELECT record FROM demo_devices ORDER BY id')]}
else: raise ValueError('Unknown demo operation')
result['storage']='demo-sqlite'
print(json.dumps(result))
