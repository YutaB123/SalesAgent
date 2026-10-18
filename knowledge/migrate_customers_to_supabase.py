"""Back up both CRM stores, then merge local call history into the team CRM."""
import json,sqlite3,os
from pathlib import Path
from datetime import datetime,timezone
from store import Store,ROOT
from customer_memory import initialize,upsert

def stamp(value):
 d=value if isinstance(value,datetime) else datetime.fromisoformat(str(value).replace('Z','+00:00'))
 return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d
s=Store()
if not s.pg:raise ValueError('SUPABASE_DB_URL is required')
initialize(s)
source=Path(os.environ.get('DEMO_DATABASE_PATH') or ROOT/'database/demo.sqlite')
backups=ROOT/'database'/'backups';backups.mkdir(parents=True,exist_ok=True)
suffix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
local=sqlite3.connect('file:'+str(source.resolve())+'?mode=ro',uri=True);local.row_factory=sqlite3.Row
with sqlite3.connect(backups/f'customers-local-{suffix}.sqlite') as dest:local.backup(dest)
rows=local.execute('SELECT record,updated_at FROM sales_customer_memory').fetchall()
with s.connection() as conn:remote=conn.execute('SELECT id,record,updated_at FROM sales_customer_memory').fetchall()
backup=backups/f'customers-supabase-{suffix}.json'
fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(remote,f,default=str)
by_id={r['id']:r for r in remote};migrated=0
for row in rows:
 c=json.loads(row['record']);existing=by_id.get(c['id'])
 if existing:
  old=existing['record'];local_newer=stamp(row['updated_at'])>=stamp(existing['updated_at'])
  older,newer=(old,c) if local_newer else (c,old)
  history={x['id']:x for x in older.get('callHistory',[])}
  for call in newer.get('callHistory',[]):history[call['id']]={**history.get(call['id'],{}),**call}
  c={**older,**newer,'callHistory':list(history.values()),'criticalInformation':older.get('criticalInformation',[])+newer.get('criticalInformation',[]),'doNotContact':bool(c.get('doNotContact') or old.get('doNotContact'))}
 saved=upsert(s,c)['customer']
 assert {x['id'] for x in json.loads(row['record']).get('callHistory',[])}<={x['id'] for x in saved['callHistory']}
 migrated+=1
with s.connection() as conn:
 after=conn.execute('SELECT record FROM sales_customer_memory').fetchall()
print(json.dumps({'local_records_merged':migrated,'team_records_before':len(remote),'team_records_after':len(after),'team_call_records':sum(len(r['record'].get('callHistory',[])) for r in after),'backup_created':True}))
