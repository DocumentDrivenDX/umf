import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
INTAKE = ROOT / 'tools/intake_inspector_c1_8m_diagnostic.py'
OBSERVER = ROOT / 'tools/probe_inspector_installed_constructor_observation.py'
FIXTURE = ROOT / 'tests/qualification/fixtures/inspector-c1-8m-diagnostic.json'


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RetainedC1EightMillionDiagnostic(unittest.TestCase):
    def test_fixture_binds_exact_run_wheel_and_diagnostic_only_bounds(self):
        intake = load(INTAKE, 'c1_8m_test_intake')
        pins = intake.fixture(ROOT)
        self.assertEqual(pins['parent']['id'], 43061858037)
        self.assertEqual(pins['runtimeSource'], '2f0fb762c6b0dc51acfe4893c445648d074abadc')
        self.assertEqual(pins['wheel']['sha256'], 'c2c12158856be405d9d79ba4221d4dd8f201ca1db53add03f0533a94a32b02c5')
        self.assertEqual(pins['bounds']['events'], 8_000_000)
        self.assertEqual(pins['bounds']['seconds'], 180)
        self.assertFalse(pins['producer'].get('buildRequested', False))
        materials = ROOT / 'tests/qualification/fixtures/c1-43061858037'
        intake.validate_parent(pins, json.loads((materials / 'run.json').read_text()),
            json.loads((materials / 'jobs.json').read_text()), json.loads((materials / 'artifacts.json').read_text()))

    def test_first_successful_host_callback_crossing_limit_has_prior_sum_and_phase(self):
        observer = load(OBSERVER, 'c1_8m_test_observer')
        self.assertEqual(observer.LIMIT, 1_000_000)
        bounds = {'tail': 4, 'events': 8_000_000, 'seconds': 180}
        phases = ['native-resource-compilation', 'unknown-metadata']
        recorder = observer.Recorder(bounds, phases, clock=lambda: 0.0, limit=1_000_000)
        first = recorder.begin('host', (999_900,), {})
        recorder.accepted(first)
        recorder.activeNativePhase = 'native-resource-compilation'
        crossing = recorder.begin('host', (200,), {})
        recorder.accepted(crossing)
        self.assertEqual(recorder.receipt()['firstHostOverLimit'], {
            'event': 2, 'amount': 200, 'priorAttemptedWork': 999_900,
            'phase': 'native-resource-compilation'})
        self.assertEqual(recorder.hostPhases['native-resource-compilation']['attemptedWork'], 200)
        self.assertEqual(recorder.hostPhases['native-resource-compilation']['acceptedWork'], 200)

    def test_refused_crossing_is_not_reported_as_accepted(self):
        observer = load(OBSERVER, 'c1_8m_test_observer_refusal')
        recorder = observer.Recorder({'tail': 2, 'events': 10, 'seconds': 180},
            ['unknown-metadata'], clock=lambda: 0.0, limit=10)
        row = recorder.begin('host', (11,), {})
        recorder.refused(row, RuntimeError('refused'))
        self.assertIsNone(recorder.receipt()['firstHostOverLimit'])

    def test_event_cap_stops_recording_with_fixed_tail(self):
        observer = load(OBSERVER, 'c1_8m_test_observer_cap')
        recorder = observer.Recorder({'tail': 1, 'events': 1, 'seconds': 180},
            ['unknown-metadata'], clock=lambda: 0.0)
        recorder.begin('host', (1,), {})
        self.assertIsNone(recorder.begin('host', (1,), {}))
        self.assertEqual(len(recorder.receipt()['tail']), 1)
        self.assertEqual(recorder.failure, 'observer-event-bound')

    def test_workflow_is_a_separate_nonbuilding_opt_in_route(self):
        workflow = (ROOT / '.github/workflows/inspector-attribution-continuation.yml').read_text()
        self.assertIn("github.ref == 'refs/heads/codex/c1-8m-retained-diagnostic'", workflow)
        self.assertIn("github.ref != 'refs/heads/codex/c1-8m-retained-diagnostic'", workflow)
        self.assertIn('default: false', workflow)
        self.assertIn('probe_inspector_c1_8m_diagnostic.py', workflow)
        self.assertNotIn('cargo build', workflow)
        self.assertIn('c1-8m-diagnostic', workflow)
        self.assertIn("refs/heads/codex/c1-01011-cost-observation", workflow)

    def test_probe_disables_cross_budget_comparison_and_keeps_historical_values(self):
        source = (ROOT / 'tools/probe_inspector_c1_8m_diagnostic.py').read_text()
        self.assertIn("'compareBaseline':False", source)
        self.assertIn("'historicalRun':pins['parent']['id']", source)
        self.assertNotIn('43052981583', source)
        self.assertIn('maximum_work=8000000', source)
        self.assertIn('intake_inspector_c1_8m_diagnostic.py', source)


if __name__ == '__main__':
    unittest.main()
