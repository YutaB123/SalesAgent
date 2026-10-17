import copy
import tempfile
import unittest
from pathlib import Path
from store import Store, Conflict, SNAPSHOT

class StoreTests(unittest.TestCase):
    def test_updates_are_persistent_audited_and_revision_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'plans.sqlite')
            self.assertEqual(store.initialize()['inserted'], len(SNAPSHOT['plans']))
            self.assertEqual(store.initialize()['inserted'], 0)
            plan = copy.deepcopy(store.catalog()['plans'][0])
            plan['name'] += ' reviewed'
            with self.assertRaises(ValueError):
                store.update(plan, 1, False)
            store.update(plan, 1, True)
            with self.assertRaises(Conflict):
                store.update(plan, 1, True)
            saved = Store(store.path).catalog()
            self.assertEqual(saved['revisions'][plan['id']], 2)
            self.assertEqual(len(saved['updates']), 1)
            self.assertEqual(next(p for p in saved['plans'] if p['id'] == plan['id'])['name'], plan['name'])
            plan['sourceUrl'] = 'https://example.com/unsupported'
            with self.assertRaises(ValueError):
                store.update(plan, 2, True)
            self.assertEqual(len(store.catalog()['updates']), 1)

if __name__ == '__main__':
    unittest.main()
