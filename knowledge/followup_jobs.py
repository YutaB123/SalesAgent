"""Durable scheduled sends, claimed before contacting a provider."""
import json

def operate(store,command,payload):
 with store.connection() as conn:
  conn.execute('CREATE TABLE IF NOT EXISTS followup_jobs (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, status TEXT NOT NULL, run_at TEXT NOT NULL, record TEXT NOT NULL)')
  conn.execute('CREATE INDEX IF NOT EXISTS followup_jobs_due ON followup_jobs(status,run_at)')
  if command=='job-create':
   conn.execute('BEGIN IMMEDIATE')
   row=conn.execute("SELECT record FROM followup_jobs WHERE customer_id=? AND status IN ('scheduled','sending','accepted','unconfirmed') ORDER BY run_at DESC",(payload['customerId'],)).fetchall()
   same=[json.loads(r['record']) for r in row if json.loads(r['record']).get('callId')==payload['callId'] or json.loads(r['record']).get('status') in ('scheduled','sending','unconfirmed')]
   if same:
    r=same[0]
    if r['id']!=payload['id']:return {'conflict':True,'job':r}
    return {'job':r}
   r={**payload,'status':'scheduled'}
   conn.execute('INSERT INTO followup_jobs VALUES (?,?,?,?,?)',(r['id'],r['customerId'],r['status'],r['scheduledAt'],json.dumps(r)))
   return {'job':r}
  if command=='job-list':
   rows=conn.execute('SELECT record FROM followup_jobs WHERE customer_id=? ORDER BY run_at DESC LIMIT 30',(payload['customerId'],)).fetchall()
   return {'jobs':[json.loads(r['record']) for r in rows]}
  if command=='job-due':
   rows=conn.execute("SELECT record FROM followup_jobs WHERE status='scheduled' AND run_at<=? ORDER BY run_at LIMIT 20",(payload['now'],)).fetchall()
   return {'jobs':[json.loads(r['record']) for r in rows]}
  conn.execute('BEGIN IMMEDIATE')
  row=conn.execute('SELECT record FROM followup_jobs WHERE id=?',(payload['id'],)).fetchone()
  if not row:raise ValueError('Scheduled follow-up not found')
  r=json.loads(row['record'])
  expected=payload.get('expectedStatus')
  if expected and r['status']!=expected:return {'changed':False,'job':r}
  if payload.get('onlyDueAt') and r['scheduledAt']>payload['onlyDueAt']:return {'changed':False,'job':r}
  r={**r,**payload};r.pop('expectedStatus',None);r.pop('onlyDueAt',None)
  conn.execute('UPDATE followup_jobs SET status=?,run_at=?,record=? WHERE id=?',(r['status'],r['scheduledAt'],json.dumps(r),r['id']))
  return {'changed':True,'job':r}
