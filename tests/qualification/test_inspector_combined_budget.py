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

class ConsolidatedFindingSourceControls(unittest.TestCase):
    @staticmethod
    def python_source_body(text):
        return text[text.index('    pub fn compile_python_source('):text.index('    /// Compile a strict Draft 2020-12 schema.')]
    @staticmethod
    def catalogue_precharge(text):
        scope=text[text.index('    fn compile_inner('):]
        loop=scope.index('        for (id, resource) in &compiled.resources.entries {')
        allocation=scope.index('            let mut root_path = id.units().to_vec();',loop)
        charge=scope.index('if eligible { ctx.charge_work(id.len().saturating_mul(3).saturating_add(1)',loop)
        if not loop<charge<allocation:raise ValueError('catalogue path allocation precedes admission')
    def test_generic_python_source_is_exact_original_not_construction_scope(self):
        import hashlib
        current=self.python_source_body((ROOT/'crates/umf-core/src/schema.rs').read_text())
        self.assertEqual(hashlib.sha256(current.encode()).hexdigest(),'5ddde1045927ec137b0ece625036c893cb4e6739c407a611bc9b8fbdf5e2c74d')
        self.assertNotIn('eligible',current)
        # Exact reproduced4833033c defect; original body hashes independently
        # checked during source preparation, no ancestor fetch needed in CI.
        loop='        for (id, resource) in &compiled.resources.entries {\n'
        regression=current.replace(loop,loop+'            if eligible { ctx.charge_work(id.len().saturating_mul(3).saturating_add(1),Utf16::default())?; }\n',1)
        self.assertEqual(hashlib.sha256(regression.encode()).hexdigest(),'3b4710cad3ce6af6abc71c103dbe8adec34bde8500fbd3afeb7e2b6060ed9a8b')
        self.assertNotEqual(hashlib.sha256(regression.encode()).hexdigest(),'5ddde1045927ec137b0ece625036c893cb4e6739c407a611bc9b8fbdf5e2c74d')
    def test_real_compile_inner_precharge_precedes_allocation_and_removed_admission_refuses(self):
        current=(ROOT/'crates/umf-core/src/schema.rs').read_text()
        self.catalogue_precharge(current)
        line='            if eligible { ctx.charge_work(id.len().saturating_mul(3).saturating_add(1),Utf16::default())?; }\n'
        self.assertEqual(current.count(line),1)
        with self.assertRaises(ValueError):self.catalogue_precharge(current.replace(line,'',1))

class DynamicScopePushProtocolSourceControls(unittest.TestCase):
    @staticmethod
    def audit(files,signature):
        import re
        if not re.search(r'fn\s+push\(&mut self,\s*entry:\s*Entry,\s*ctx:\s*&mut Context<\x27_>\)\s*->\s*Result<\(\),\s*EngineError>',signature):
            raise ValueError('Actual DynamicScope push signature changed')
        rows=[]
        for name,text in files.items():
            for match in re.finditer(r'\bdynamic_scope\s*\.push\s*\(',text):
                start=match.end();depth=0;parts=[];part=start;quote=False;escape=False;end=None
                for at in range(start,len(text)):
                    char=text[at]
                    if quote:
                        if escape:escape=False
                        elif char=='\\':escape=True
                        elif char=='"':quote=False
                        continue
                    if char=='"':quote=True;continue
                    if char in '([{':depth+=1
                    elif char in ')]}':
                        if char==')' and depth==0:
                            parts.append(text[part:at].strip());end=at+1;break
                        depth-=1
                    elif char==',' and depth==0:parts.append(text[part:at].strip());part=at+1
                if end is None:raise ValueError('Unterminated DynamicScope push')
                parts=[p for p in parts if p]
                test=(name.endswith('schema_construction_index.rs') and match.start()>text.index('mod semantic_tests {'))
                expected='&mutctx' if test else 'ctx'
                if len(parts)!=2 or re.sub(r'\s+','',parts[1])!=expected:raise ValueError('Missing/wrong same Context argument: '+name)
                tail=text[end:].lstrip()
                if not (tail.startswith('.unwrap()') if test else tail.startswith('?')):raise ValueError('Ignored/nonpropagated DynamicScope Result: '+name)
                rows.append({'path':name,'line':text.count('\n',0,match.start())+1,'test':test,'context':parts[1],'result':'unwrap in owner test' if test else 'propagated ?'})
        if len(rows)!=7 or sum(not r['test'] for r in rows)!=6:raise ValueError('DynamicScope push census changed')
        return rows
    def test_all_actual_scope_pushes_use_same_context_and_consume_result(self):
        files={str(p.relative_to(ROOT)):p.read_text() for p in (ROOT/'crates/umf-core/src').glob('*.rs') if 'dynamic_scope' in p.read_text()}
        signature=(ROOT/'crates/umf-core/src/schema_evaluation_scope.rs').read_text()
        self.assertEqual(len(self.audit(files,signature)),7)
        path='crates/umf-core/src/schema.rs';good='.push((name.clone(), anchor_path.clone(), *address), ctx)?;'
        self.assertEqual(files[path].count(good),1)
        for bad in ['.push((name.clone(), anchor_path.clone(), *address));',
                    '.push((name.clone(), anchor_path.clone(), *address), ctx);',
                    '.push((name.clone(), anchor_path.clone(), *address), different_ctx)?;']:
            with self.subTest(regression=bad):
                changed=dict(files);changed[path]=changed[path].replace(good,bad,1)
                with self.assertRaises(ValueError):self.audit(changed,signature)
        with self.assertRaises(ValueError):self.audit(files,signature.replace('fn push(&mut self, entry: Entry, ctx:', 'fn push(&mut self, entry: Entry, wrong:',1))

if __name__=='__main__':unittest.main()
