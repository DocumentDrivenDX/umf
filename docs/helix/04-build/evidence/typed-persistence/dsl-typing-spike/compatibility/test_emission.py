"""Reproducibility and drift controls for the bounded spike emitter."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from emit_fixture import ROOT, emit_models, build_wheel

class EmissionTests(unittest.TestCase):
    def test_emitted_fixture_is_current_and_repeatable(self):
        fixture=json.loads((ROOT/'fixture.json').read_text())
        first=emit_models(fixture)
        self.assertEqual(first,emit_models(fixture))
        self.assertEqual(first,(ROOT/'generated/models.py').read_text())
        self.assertEqual(fixture,json.loads((ROOT/'fixture.json').read_text()))

    def test_wheel_bytes_repeat(self):
        with tempfile.TemporaryDirectory() as left, tempfile.TemporaryDirectory() as right:
            first=build_wheel(Path(left)).read_bytes()
            self.assertEqual(first,build_wheel(Path(right)).read_bytes())
            self.assertEqual(first,next((ROOT/'artifacts').glob('*.whl')).read_bytes())

    def test_unknown_carrier_refuses(self):
        fixture=deepcopy(json.loads((ROOT/'fixture.json').read_text()))
        fixture['models'][0]['fields'][0]['carrier']='unknown'
        with self.assertRaises(KeyError): emit_models(fixture)

if __name__=='__main__':
    unittest.main()
