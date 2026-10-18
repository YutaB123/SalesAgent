"""Team CRM adapter. Never falls back to an isolated local customer database."""
import json,sys
from store import Store
from customer_memory import initialize,list_records,upsert
store=Store()
if not store.pg:raise ValueError('Team customer storage requires SUPABASE_DB_URL')
# Schema is installed during migration; normal requests only read/write CRM rows.
payload=json.load(sys.stdin)
if sys.argv[1]=='customer-list':result=list_records(store,payload.get('phone'),payload.get('customerId'))
elif sys.argv[1]=='customer-save':result=upsert(store,payload['record'])
else:raise ValueError('Unknown customer command')
print(json.dumps(result))
