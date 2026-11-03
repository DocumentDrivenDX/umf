"""Pure source/receipt controls; never import or execute UMF native code."""
import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('intake', ROOT/'tools/intake_inspector_retained_continuation.py')
intake = importlib.util.module_from_spec(spec); spec.loader.exec_module(intake)


class RetainedContinuationControls(unittest.TestCase):
    def original_run(self):
        run = dict(id=intake.RUN,head_sha=intake.SOURCE,run_attempt=1,event='workflow_dispatch',
                   workflow_id=406306589,status='completed',conclusion='failure')
        names = ['Build only the private owner wheel with the existing locked hook',
                 'Independent native outer-envelope boundary controls',
                 'Fresh normal candidate install and existing affected control checks',
                 'Dispose only this hosted component target and consumer']
        steps = [dict(name=n,conclusion='success') for n in names]
        steps += [dict(name='Independent private native adapter and outer-envelope controls',conclusion='failure')]
        steps += [dict(name=n,conclusion='skipped') for n in (
            'Measure cold retained construction and unchanged public 17-case calls at 1M',
            'Strict public retained-mode controls after measured cold fit')]
        return run,dict(jobs=[dict(id=intake.JOB,steps=steps)])

    def test_original_actual_failure_and_completed_gate_bindings(self):
        run,jobs = self.original_run(); intake.validate_run(run,jobs)
        for field,bad in [('id',1),('head_sha','0'*40),('run_attempt',2),('event','push'),
                          ('workflow_id',1),('status','in_progress'),('conclusion','success')]:
            changed = dict(run);changed[field]=bad
            with self.subTest(field=field),self.assertRaises(ValueError): intake.validate_run(changed,jobs)
        for index in range(len(jobs['jobs'][0]['steps'])):
            changed=copy.deepcopy(jobs); changed['jobs'][0]['steps'][index]['conclusion']='neutral'
            with self.subTest(step=index),self.assertRaises(ValueError): intake.validate_run(run,changed)
        changed=copy.deepcopy(jobs);changed['jobs'][0]['id']=1
        with self.assertRaises(ValueError): intake.validate_run(run,changed)

    def test_exact_approved_independent_correction_and_reused_bodies(self):
        original=subprocess.check_output(['git','show',intake.SOURCE+':'+intake.TEST],cwd=ROOT,text=True)
        corrected=(ROOT/intake.TEST).read_text()
        self.assertEqual(hashlib.sha256(corrected.encode()).hexdigest(),
                         'b4b39385da8b2ba0ba0376f369de9b5a7022a103cdb05d7e095a8031ae8fe3a6')
        self.assertEqual(len(intake.test_closure(original,corrected)),7)
        # Mutate every reused private body and the unchanged public class.
        tree=ast.parse(corrected)
        targets=[]
        for c in tree.body:
            if isinstance(c,ast.ClassDef) and c.name in ('PrivateNativeControlTests','PublicRetainedFeasibilityTests'):
                targets += [m for m in c.body if isinstance(m,ast.FunctionDef)
                            and m.name not in (intake.FAILED,intake.WARM,'_trace_observer','_retain_envelope_traces')]
        for method in targets:
            lines=corrected.splitlines(True)
            lines.insert(method.body[0].lineno-1,'        raise RuntimeError("guard mutation")\n')
            with self.subTest(method=method.name),self.assertRaises(ValueError):
                intake.test_closure(original,''.join(lines))
        altered=corrected.replace('control.observed_failure = dict(code=caught.exception.code, message=str(caught.exception),',
                                  'control.observed_failure = dict(code="forged", message=str(caught.exception),',1)
        with self.assertRaises(ValueError): intake.test_closure(original,altered)
        with self.assertRaises(ValueError): intake.test_closure(original,original)

    def test_tiny_retained_members_closed_digest_types_and_no_overwrite(self):
        raw=b'original material'
        members={'receipt.json':{'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}}
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);archive=root/'tiny.zip'
            with zipfile.ZipFile(archive,'w') as z:z.writestr('receipt.json',raw)
            intake.extract(archive,root/'valid',members)
            self.assertEqual((root/'valid/receipt.json').read_bytes(),raw)
            with self.assertRaises(ValueError): intake.extract(archive,root/'valid',members)
            for n,rows in [('roster',{}),('size',{'receipt.json':dict(size=1,sha256=members['receipt.json']['sha256'])}),
                           ('digest',{'receipt.json':dict(size=len(raw),sha256='0'*64)})]:
                with self.subTest(control=n),self.assertRaises(ValueError):intake.extract(archive,root/n,rows)
            for n,mode in [('../escape',0o100644),('link',0o120777),('fifo',0o010644)]:
                path=root/('bad'+str(mode)+'.zip')
                with zipfile.ZipFile(path,'w') as z:
                    info=zipfile.ZipInfo(n);info.external_attr=mode<<16;z.writestr(info,raw)
                with self.subTest(path=n),self.assertRaises(ValueError):
                    intake.extract(path,root/('dest'+str(mode)),{n:members['receipt.json']})

    def test_missing_only_selected_methods_and_original_probe_source(self):
        text=(ROOT/'.github/workflows/inspector-retained-continuation.yml').read_text()
        self.assertIn('pytest -q -s',text)
        self.assertEqual(text.count('::PrivateNativeControlTests::'),2)
        self.assertIn('::PrivateNativeControlTests::'+intake.FAILED,text)
        self.assertIn('::PrivateNativeControlTests::'+intake.WARM,text)
        self.assertIn('::PublicRetainedFeasibilityTests',text)
        self.assertIn('"$OWNER_CHECKOUT/tools/probe_inspector_retained_feasibility.py"',text)
        self.assertIn('--source-sha "$ORIGINAL_OWNER"',text)
        for forbidden in ('cargo test','rust-toolchain','python -m build','test_rust_codegen.py','-k '):
            self.assertNotIn(forbidden,text)
        self.assertIn("timeout-minutes: 60",text)
        self.assertIn("default: false",text)


if __name__=='__main__':unittest.main()
