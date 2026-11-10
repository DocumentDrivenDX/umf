"""Pure admission/retention controls. No product/native import or execution."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('stage_budget',ROOT/'tools/inspector_stage_budget.py')
B=importlib.util.module_from_spec(spec);spec.loader.exec_module(B)
class OwnedPlanControllerControls(unittest.TestCase):
    def test_absolute_deadline_never_resets_across_stages(self):
        self.assertEqual(B.allowance(100,100,'compile')['minutes'],30)
        self.assertEqual(B.allowance(100,2800,'compile')['minutes'],5)
        self.assertEqual(B.allowance(100,3040,'lanes')['minutes'],1)
        with self.assertRaises(ValueError):B.allowance(100,3041,'lanes')
    def test_invalid_unknown_and_nonfinite_clock_refuse(self):
        for args in [(100,99,'compile'),(0,float('nan'),'lanes'),(0,float('inf'),'rust'),(-1,0,'producer'),(0,0,'foreign'),(True,1,'rust')]:
            with self.subTest(args=args),self.assertRaises(ValueError):B.allowance(*args)
    def test_refused_deadline_retains_actual_receipt_without_an_output_allowance(self):
        import json,os,sys,tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/'outputs'
            env={'GITHUB_ACTIONS':'true','INSPECTOR_JOB_MONOTONIC_START':'0','EXPECTED_SOURCE':'source-only-fixture','GITHUB_RUN_ID':'run','GITHUB_RUN_ATTEMPT':'1','BATCH_OUT':temp,'GITHUB_OUTPUT':str(output)}
            with patch.dict(os.environ,env),patch.object(sys,'argv',['pure-stage','--stage','compile']),patch.object(B.time,'monotonic',return_value=3001):
                with self.assertRaises(ValueError):B.main()
            record=json.loads((Path(temp)/'stage-budget-compile.json').read_text())
            self.assertEqual(record['status'],'refused');self.assertFalse(record['extraWorkGranted']);self.assertFalse(output.exists())
            with patch.dict(os.environ,env),patch.object(sys,'argv',['pure-stage','--stage','compile']),patch.object(B.time,'monotonic',return_value=0):
                with self.assertRaises(FileExistsError):B.main()
            self.assertEqual(json.loads((Path(temp)/'stage-budget-compile.json').read_text()),record)
    def test_work_deadline_does_not_expand_job_or_diagnostic_caps(self):
        self.assertEqual(B.WORK_SECONDS,3000)
        self.assertEqual(B.allowance(0,0,'lanes')['jobCapMinutes'],60)
        source=(ROOT/'tools/qualify_inspector_combined_budget.py').read_text()
        self.assertIn('EVENT_CAP=1_000_000',source);self.assertIn('DEADLINE_SECONDS=300',source)
    def test_wheel_retention_precedes_compilation_and_every_expensive_stage_has_bound(self):
        source=(ROOT/'.github/workflows/inspector-retained-attribution.yml').read_text()
        self.assertLess(source.index('name: Retain genuine wheel and source BEFORE target compilation'),source.index('name: Compile selected affected Rust targets'))
        self.assertIn('if-no-files-found: error',source)
        for stage in B.MAX_MINUTES:
            self.assertIn('id: budget-'+stage,source)
            self.assertIn('timeout-minutes: ${{ fromJSON(steps.budget-'+stage+'.outputs.minutes) }}',source)
        self.assertIn('INSPECTOR_JOB_MONOTONIC_START',source)
        self.assertIn('if: always()',source)
if __name__=='__main__':unittest.main()
