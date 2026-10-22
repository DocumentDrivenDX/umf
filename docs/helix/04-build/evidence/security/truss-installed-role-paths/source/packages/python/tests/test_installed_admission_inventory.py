"""Private scoped correspondence rejects damaged native fixture packets."""
import json
from dataclasses import replace
from pathlib import Path
import unittest
from truss._installed_admission_inventory import Inventory, Section, QueryResult, RoutineDeclaration, reconcile_inventory

class InstalledInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root=Path(__file__).resolve().parents[3]
        receipt=json.loads((root/'docs/helix/04-build/evidence/design-audit/installed-role-paths-reviewed-native.json').read_text())
        def packet(label):
            row=next(i for i in receipt['inventories'] if i['id']==label)
            return Inventory(tuple(Section(s['name'],QueryResult(tuple(s['columns']),tuple(tuple(r) for r in s['rows']))) for s in row['sections']),4096,1048576,'inventory_ordinary')
        cls.packet=staticmethod(packet)
        cls.baseline=packet('original-native-comparison-baseline');cls.original=packet('original')
        import hashlib
        cls.declarations=tuple(RoutineDeclaration(r[4],hashlib.sha256(r[8].encode()).hexdigest(),r[3],r[5],r[13],r[11],r[6]) for r in next(s.result.rows for s in cls.baseline.sections if s.name=='routines'))
        cls.execute=tuple(d.name for d in cls.declarations if d.name.startswith('runtime_admit_'))
    def check(self,packet,expected=None):
        return reconcile_inventory(packet,self.declarations,ordinary_execute=self.execute,expected=expected or self.baseline)
    def test_correspondence(self):
        self.assertEqual(self.check(self.original).result,'scoped_match')
    def test_duplicate_section(self):
        damaged=replace(self.original,sections=(self.original.sections[0],)+self.original.sections[1:-1]+(self.original.sections[0],))
        self.assertEqual(self.check(damaged).result,'scoped_mismatch')
    def test_empty_sections(self):
        for name in ('context','routine-acl','relation-acl','column-acl','namespace-acl','roles','role-reachability'):
            damaged=replace(self.original,sections=tuple(replace(s,result=replace(s.result,rows=())) if s.name==name else s for s in self.original.sections))
            with self.subTest(name=name):self.assertEqual(self.check(damaged).result,'scoped_mismatch')
    def test_budgets_on_both_sides(self):
        for packet in (replace(self.original,maximum_rows=1),replace(self.original,maximum_text_units=1)):
            self.assertEqual(self.check(packet).reasons,('resource',))
            self.assertEqual(self.check(self.original,packet).reasons,('resource',))
    def test_column_grammar(self):
        damaged=replace(self.original,sections=tuple(replace(s,result=replace(s.result,columns=tuple(reversed(s.result.columns)))) if s.name=='routine-acl' else s for s in self.original.sections))
        self.assertEqual(self.check(damaged).reasons,('shape',))
    def test_identity_and_exact_scalar_mutations_on_both_sides(self):
        for name,column,value in (('routines','oid','4294967295'),('routines','owner_oid','4294967295'),('routines','language_oid',None),('roles','superuser',0),('context','database',None)):
            sections=[]
            for section in self.original.sections:
                if section.name==name:
                    rows=list(section.result.rows);row=list(rows[0]);row[section.result.columns.index(column)]=value;rows[0]=tuple(row)
                    section=replace(section,result=replace(section.result,rows=tuple(rows)))
                sections.append(section)
            damaged=replace(self.original,sections=tuple(sections))
            with self.subTest(name=name,column=column):
                self.assertEqual(self.check(damaged).result,'scoped_mismatch')
                self.assertEqual(self.check(self.original,damaged).result,'scoped_mismatch')
    def test_foreign_equality_is_never_called(self):
        class Trap:
            def __eq__(self,other):raise RuntimeError('Foreign equality ran')
        self.assertEqual(self.check(replace(self.original,production_cut=Trap())).reasons,('shape',))
        first=self.original.sections[0]
        damaged=replace(self.original,sections=(replace(first,result=replace(first.result,columns=(Trap(),)+first.result.columns[1:])),)+self.original.sections[1:])
        self.assertEqual(self.check(damaged).reasons,('shape',))

    def test_unsafe_matching_role_baseline_cannot_bless_authority(self):
        for label in ('direct-set-only','indirect-set-only','admin-only'):
            packet=self.packet(label)
            with self.subTest(label=label):
                result=self.check(packet,packet)
                self.assertEqual(result.result,'scoped_mismatch')
                self.assertIn('role_transition_privilege',result.reasons)
    def test_membership_without_set_inherit_or_admin_is_not_authority(self):
        packet=self.packet('membership-only')
        self.assertEqual(self.check(packet,packet).result,'scoped_match')
        self.assertIn('role-reachability_drift',self.check(packet).reasons)
    def test_role_reachability_is_required_not_legacy_empty(self):
        legacy=replace(self.original,sections=tuple(s for s in self.original.sections if s.name!='role-reachability'))
        self.assertEqual(self.check(legacy,legacy).reasons,('shape',))
    def test_role_reachability_exact_types_and_identity_on_both_sides(self):
        original=next(s for s in self.original.sections if s.name=='role-reachability')
        for variant in ('boolean-int','missing-self','duplicate-self','wrong-self-oid'):
            rows=list(original.result.rows)
            if variant=='boolean-int':
                row=list(rows[0]);row[4]=1;rows[0]=tuple(row)
            elif variant=='missing-self':rows=[]
            elif variant=='duplicate-self':rows.append(rows[0])
            else:
                row=list(rows[0]);row[0]='4294967295';rows[0]=tuple(row)
            replacement=replace(original,result=replace(original.result,rows=tuple(rows)))
            packet=replace(self.original,sections=tuple(replacement if s.name==original.name else s for s in self.original.sections))
            with self.subTest(variant=variant):
                self.assertEqual(self.check(packet).result,'scoped_mismatch')
                self.assertEqual(self.check(self.original,packet).result,'scoped_mismatch')
