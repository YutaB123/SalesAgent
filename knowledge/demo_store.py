"""Isolated fictional CRM. Never connects to the team's real Supabase database."""
import json, os, sqlite3, sys
from pathlib import Path
from store import Store
from customer_memory import initialize, list_records, upsert

path = Path(os.environ.get('DEMO_DATABASE_PATH', Path(__file__).resolve().parent.parent / 'database/demo.sqlite'))
store = Store(local_path=path)
initialize(store)
plans = [
 {'id':'demo-essential','name':'Demo Essential','monthly':35,'features':['Unlimited calls and texts','20 GB data']},
 {'id':'demo-plus','name':'Demo Plus','monthly':55,'features':['Unlimited calls and texts','Unlimited data','20 GB hotspot']},
 {'id':'demo-family','name':'Demo Family','monthly':95,'features':['Three lines','Shared unlimited data']},
]
with store.connection() as conn:
 conn.execute('CREATE TABLE IF NOT EXISTS demo_plans (id TEXT PRIMARY KEY, record TEXT NOT NULL)')
 for plan in plans:
  conn.execute('INSERT OR IGNORE INTO demo_plans VALUES (?,?)',(plan['id'],json.dumps(plan)))
 conn.execute('CREATE TABLE IF NOT EXISTS demo_seeded (version INTEGER PRIMARY KEY)')
 seeded=conn.execute('SELECT version FROM demo_seeded WHERE version=1').fetchone()
if not seeded:
 for i,(name,plan,stage,confidence,summary) in enumerate([
  ('Alex Chen','Demo Plus','Comparing','High','Needs hotspot data; wants to compare the monthly cost.'),
  ('Jordan Lee','Demo Family','Exploring','Medium','Considering three lines; decision timing is unclear.'),
  ('Taylor Morgan','Demo Essential','Exploring','Low','Budget mentioned; requirements still need confirmation.')
 ]):
  phone=f'+1202555010{i}'
  record=dict(id='phone-'+phone[1:],name=name,contact=phone,company='',role='',needs='',concerns='',productDiscussed=plan,recommendedPlan=plan,purchaseStage=stage,confidence=confidence,readiness=5,followUpDate='',notes='',lastContact='',summary=summary,callHistory=[],followUpTasks=[],followUpPending=False)
  with store.connection() as conn:
   conn.execute('INSERT OR IGNORE INTO sales_customer_memory (id,phone,record) VALUES (?,?,?)',(record['id'],phone,json.dumps(record)))
 with store.connection() as conn:
  conn.execute('INSERT OR IGNORE INTO demo_seeded VALUES (1)')
payload=json.load(sys.stdin) if not sys.stdin.isatty() else {}
command=sys.argv[1]
if command=='customer-list': result=list_records(store,payload.get('phone'),payload.get('customerId'))
elif command=='customer-save':
 record=payload['record']; record.pop('isSample',None); result=upsert(store,record)
elif command in ('followup-claim','followup-result'):
 with store.connection() as conn:
  conn.execute('CREATE TABLE IF NOT EXISTS followup_outbox (id TEXT PRIMARY KEY, record TEXT NOT NULL)')
  if command=='followup-claim':
   record={**payload,'status':'pending'}
   cursor=conn.execute('INSERT OR IGNORE INTO followup_outbox VALUES (?,?)',(payload['requestId'],json.dumps(record)))
   row=conn.execute('SELECT record FROM followup_outbox WHERE id=?',(payload['requestId'],)).fetchone()
   result={'created':cursor.rowcount==1,'record':json.loads(row['record'])}
  else:
   row=conn.execute('SELECT record FROM followup_outbox WHERE id=?',(payload['requestId'],)).fetchone()
   record={**json.loads(row['record']),**payload}
   conn.execute('UPDATE followup_outbox SET record=? WHERE id=?',(json.dumps(record),payload['requestId']))
   result={'record':record}
elif command=='plans':
 with store.connection() as conn: result={'plans':[json.loads(row['record']) for row in conn.execute('SELECT record FROM demo_plans')]}
else: raise ValueError('Unknown demo operation')
result['storage']='demo-sqlite'
print(json.dumps(result))
