"""Pure fake-native and controller controls; no UMF/native import or execution."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('combined_controller',ROOT/'tools/qualify_inspector_combined_budget.py')
C=importlib.util.module_from_spec(spec);spec.loader.exec_module(C)

class UmfCoreError(Exception):
    code='RESOURCE_LIMIT'
    path='/private/attribution'

class CombinedBudgetPureControls(unittest.TestCase):
    def run_pair(self,amounts=(2,0,7),other=None,cap=10,clock=lambda:0):
        slots,slot=C.protocol(ROOT);calls=[];resources=[]
        def resource():
            r=object();resources.append(r);return r
        def factory(label):
            def run(r,control):
                calls.append((label,r))
                for n in (amounts if label=='ordinary' or other is None else other):
                    error=control(n,'native-resource-compilation') if label=='ordinary' else control(n,'ctor.index-build','core')
                    if error:raise UmfCoreError(error[1])
                return object()
            return run
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'result.json'
            try:
                rc=C.observe({label:factory(label) for label in ('ordinary','attributed')},resource,slots,slot,out,
                  {'source':'pure-fixture','controllerSource':'pure-fixture'},clock=clock,cap=cap)
                return rc,json.loads(out.read_text()),calls,resources
            except BaseException as error:
                error.retained=json.loads(out.read_text());raise
    def test_two_complete_fresh_factories_have_reconciled_identical_amount_streams(self):
        rc,record,calls,resources=self.run_pair()
        self.assertEqual(rc,0);self.assertEqual(record['status'],'observed-complete-pair')
        self.assertIsNot(resources[0],resources[1]);self.assertEqual(len(calls),2)
        self.assertFalse(record['public1MFit']);self.assertFalse(record['publishable']);self.assertFalse(record['readyForEnrollment'])
        for row in record['lifetimes'].values():
            self.assertTrue(row['completedHandle']);self.assertEqual(row['total'],9);self.assertEqual(row['eventCount'],3)
            self.assertEqual(sum(r['work'] for r in row['slots']),9)
    def test_same_first_denied_prefix_is_partial_not_fit(self):
        _,record,_,_=self.run_pair(cap=2)
        self.assertEqual(record['status'],'observed-matching-partial-refusals')
        for row in record['lifetimes'].values():
            self.assertFalse(row['completedHandle']);self.assertEqual(row['firstDenial'],row['lastEvent'])
            self.assertEqual(row['firstDenial'],dict(amount=7,index=2,cumulative=9));self.assertEqual(row['afterDenial'],0)
    def test_amount_or_order_drift_fails_and_keeps_both_actual_lifetimes(self):
        for other in [(2,0,8),(0,2,7),(2,7)]:
            with self.subTest(other=other),self.assertRaises(ValueError) as failure:self.run_pair(other=other)
            self.assertEqual(set(failure.exception.retained['lifetimes']),{'ordinary','attributed'})
            self.assertEqual(failure.exception.retained['status'],'partial')
    def test_combined_deadline_failure_retains_partial_receipt(self):
        moments=iter([0,301,301])
        with self.assertRaises(ValueError) as error:self.run_pair(clock=lambda:next(moments))
        self.assertEqual(error.exception.retained['lifetimes'],{});self.assertFalse(error.exception.retained['amountSequenceEquivalent'])
    def test_unknown_roles_labels_and_conversion_index_are_refused(self):
        slots,slot=C.protocol(ROOT)
        self.assertEqual(len(slots),126)
        for phase,role in [('ctor.index-build','conversion'),('ctor.index-build','foreign'),('ctor.madeup','core'),('ctor.other','foreign')]:
            with self.subTest(phase=phase,role=role),self.assertRaises(ValueError):slot(phase,role)
        self.assertEqual(slots[slot('ctor.index-build','core')],('unassigned','index-build'))
        self.assertEqual(slots[slot('native-resource-compilation','core')],('unassigned','other'))
    def test_trace_never_callbacks_after_denial_or_accepts_bool_amounts(self):
        slots,slot=C.protocol(ROOT);trace=C.Trace(True,slots,slot,cap=0)
        self.assertIsNotNone(trace(0,'ctor.index-build','core'))
        with self.assertRaises(AssertionError):trace(1,'ctor.index-build','core')
        self.assertEqual(trace.after_denial,1)
        with self.assertRaises(ValueError):C.Trace(False,slots,slot)(True,'native-resource-conversion')
    def test_arbitrary_factory_exception_is_not_accepted_as_resource_limit(self):
        slots,slot=C.protocol(ROOT)
        def broken(*args):raise RuntimeError('fake crash')
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'partial.json'
            with self.assertRaises(ValueError):C.observe({'ordinary':broken},object,slots,slot,out,{},clock=lambda:0)
            row=json.loads(out.read_text());self.assertEqual(row['lifetimes']['ordinary']['terminal']['type'],'RuntimeError')
    def test_returning_handle_after_denial_fails(self):
        slots,slot=C.protocol(ROOT)
        def wrong(resource,control):control(1,'native-resource-compilation');return object()
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):C.observe({'ordinary':wrong},object,slots,slot,Path(temp)/'out.json',{},clock=lambda:0,cap=0)
    def test_controller_keeps_strict_cold_before_diagnostic_and_required_failure(self):
        s=(ROOT/'tools/run_inspector_attribution_lanes.py').read_text()
        self.assertLess(s.index("rc=command('public-probe'"),s.index("rc=command('diagnostic'"))
        self.assertIn("state['requiredQualificationPassed']=final_success(state)",s)
        self.assertIn("'publicProbePassed','publicControlsPassed','finalIdentityPassed'",s)
        self.assertIn("identity(args,'diagnostic-before')",s);self.assertIn("identity(args,'diagnostic-after')",s)
        self.assertNotIn('compare_prefix', (ROOT/'tools/qualify_inspector_combined_budget.py').read_text())

if __name__=='__main__':unittest.main()
