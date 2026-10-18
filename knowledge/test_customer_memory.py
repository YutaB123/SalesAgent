import tempfile
import unittest
from pathlib import Path
from store import Store
from customer_memory import initialize, normalize_phone, upsert, list_records

class CustomerMemoryTests(unittest.TestCase):
 def test_phone_identity_and_history_merge_across_devices(self):
  with tempfile.TemporaryDirectory() as tmp:
   store=Store(Path(tmp)/'crm.sqlite');initialize(store)
   first={'id':'device-a','name':'','contact':'(425) 555-0123','callHistory':[{'id':'one','date':'2026-10-17','summary':'Needs hotspot'}]}
   saved=upsert(store,first)['customer']
   self.assertEqual(saved['id'],'phone-14255550123')
   self.assertEqual(saved['name'],'+14255550123')
   upsert(store,{'id':'device-b','contact':'+1 425 555 0123','callHistory':[{'id':'two','date':'2026-10-18','summary':'Ready for quote'}]})
   found=list_records(store,phone='4255550123')['customers']
   self.assertEqual(len(found),1);self.assertEqual(len(found[0]['callHistory']),2)
   upsert(store,{'id':saved['id'],'contact':saved['contact'],'callHistory':[{'id':'one','date':'2026-10-17','summary':'','transcript':[{'text':'I need hotspot'}]}]})
   history=list_records(store,customer_id=saved['id'])['customers'][0]['callHistory']
   self.assertEqual(next(c for c in history if c['id']=='one')['summary'],'Needs hotspot')
 def test_bad_identity_is_rejected(self):
  for phone in ['abc','123','0000000000']:
   with self.assertRaises(ValueError):normalize_phone(phone)

class ContactPreferenceTests(unittest.TestCase):
 def test_stale_writes_cannot_clear_optout_and_archives_hide_from_list(self):
  with tempfile.TemporaryDirectory() as tmp:
   store=Store(Path(tmp)/'crm.sqlite');initialize(store)
   upsert(store,{'id':'a','contact':'+12025550199','doNotContact':True,'callHistory':[]})
   upsert(store,{'id':'a','contact':'+12025550199','doNotContact':False,'followUpDate':'2026-10-20','callHistory':[]})
   row=list_records(store,phone='+12025550199')['customers'][0]
   self.assertTrue(row['doNotContact']);self.assertEqual(row['followUpDate'],'')
   upsert(store,dict(row,archived=True))
   self.assertEqual(list_records(store)['customers'],[])
   self.assertEqual(len(list_records(store,phone='+12025550199')['customers']),1)
