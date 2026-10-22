"""Replay original native hidden operator implementation routes, not a resolver."""
import hashlib,json,unittest
from pathlib import Path
from truss._installed_admission_inventory import Inventory,Section,QueryResult,RoutineDeclaration,reconcile_inventory

class OperatorRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root=Path(__file__).resolve().parents[3]
        receipt=json.loads((root/'docs/helix/04-build/evidence/design-audit/installed-operator-final-native.json').read_text())
        cls.packets={v['id']:Inventory(tuple(Section(s['name'],QueryResult(tuple(s['columns']),tuple(tuple(row) for row in s['rows']))) for s in v['sections']),4096,1048576,'inventory_ordinary') for v in receipt['inventories']}
        cls.baseline=cls.packets['original-native-comparison-baseline']
        rows=next(s.result.rows for s in cls.baseline.sections if s.name=='routines')
        cls.declarations=tuple(RoutineDeclaration(row[4],hashlib.sha256(row[8].encode()).hexdigest(),row[3],row[5],row[13],row[11],row[6]) for row in rows)
        cls.execute=tuple(d.name for d in cls.declarations if d.name.startswith('runtime_admit_'))
    def test_hidden_operator_implementation_cannot_match_unsafe_baseline(self):
        packet=self.packets['hidden-operator-definer']
        rows=next(s.result.rows for s in packet.sections if s.name=='callable-definers')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0][2],'inventory_operator_body')
        self.assertEqual(rows[0][8:],(False,True))
        verdict=reconcile_inventory(packet,self.declarations,ordinary_execute=self.execute,expected=packet)
        self.assertIn('callable_definer_privilege',verdict.reasons)
        self.assertEqual(verdict.result,'scoped_mismatch')
    def test_operator_execution_revocation_and_removal_restore_baseline(self):
        for label in ('hidden-operator-execute-revoked','hidden-operator-removed'):
            with self.subTest(label=label):
                packet=self.packets[label]
                verdict=reconcile_inventory(packet,self.declarations,ordinary_execute=self.execute,expected=self.baseline)
                self.assertEqual(verdict.result,'scoped_match')
