"""Pure diagnostics-only observer controls; never import UMF native code."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('attribution_probe',ROOT/'tools/probe_inspector_retained_attribution.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class AttributionObserverControls(unittest.TestCase):
    def test_label_changes_cannot_change_amount_sequence_or_totals(self):
        a,b=module.Trace(),module.Trace()
        for amount in [0,1,7,0,123,0]:
            self.assertIsNone(a(amount,'native-inspector-and-result-encoding'))
            self.assertIsNone(b(amount,'native-core-copy'))
        self.assertEqual(a.summary()['amountSequenceSHA256'],b.summary()['amountSequenceSHA256'])
        self.assertEqual(a.total,b.total)
        self.assertEqual(sum(b.phases.values()),b.total)
        self.assertEqual(a.count,6)
        self.assertLessEqual(len(b.phases),len(module.PHASES))
    def test_event_cap_preserves_first_denial_and_never_resumes(self):
        original=module.EVENT_CAP;module.EVENT_CAP=2
        try:
            trace=module.Trace()
            trace(0,'native-request-decode');trace(5,'native-core-copy')
            self.assertEqual(trace(7,'native-inner-result-encoding')[0],'RESOURCE_LIMIT')
            self.assertEqual(trace.first_denial,dict(amount=7,phase='native-inner-result-encoding',cumulative=12,index=2))
            with self.assertRaises(AssertionError):trace(0,'native-result-envelope')
            self.assertEqual(trace.count,3);self.assertEqual(trace.total,12)
        finally:module.EVENT_CAP=original
    def test_closed_phase_and_amount_domains_refuse(self):
        for amount,phase in [(True,'native-core-copy'),(-1,'native-core-copy'),(2**32,'native-core-copy'),(1,'invented-phase')]:
            with self.subTest(amount=amount,phase=phase),self.assertRaises(ValueError):module.Trace()(amount,phase)

if __name__=='__main__':unittest.main()
