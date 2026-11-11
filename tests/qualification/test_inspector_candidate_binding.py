"""Pure candidate input custody controls. All candidate pins are synthetic."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'inspector_candidate_probe', ROOT / 'tools/probe_inspector_installed_factory.py')
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class CandidateBindingControls(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.pins = {}
        self.model = PROBE.digest(b'synthetic model')
        self.compiler = PROBE.digest(b'synthetic compiler')
        binary = PROBE.digest(b'synthetic binary')
        self.workflow = self.put(PROBE.GEN1_WORKFLOW, b'synthetic selected workflow')
        self.metadata(PROBE.CANDIDATE_VERSION)
        history = 'tests/qualification/fixtures/inspector-retained-resources.json'
        self.put(history, b'synthetic historical bytes')
        historical_pin = patch.object(PROBE, 'PINS_SHA', self.pins[history])
        historical_pin.start()
        self.addCleanup(historical_pin.stop)
        self.resources = {
            name: self.put(path, ('synthetic ' + name).encode())
            for name, path in zip(PROBE.NAMES, PROBE.RAW_PATHS)
        }
        literal = self.put('crates/umf-core/src/canonical_codegen_literals.rs', b'synthetic literal')
        encoder = self.put('tools/generate_codegen_resource_literals.py', b'synthetic producer')
        output_path = self.resources['coreSchema']['path']
        output = self.output_row(self.resources['coreSchema'])
        manifest = self.put(PROBE.GEN1_MANIFEST, {
            'profile': 'umf.metamodel.outputs/1',
            'provenance': {'modelSha256': self.model, 'compilerSha256': self.compiler},
            'outputs': {output_path: output},
        })
        staged = {'path': 'compiler-evidence/umf-metamodel-cli', 'bytes': 16, 'sha256': binary}
        self.put(PROBE.GEN1_ATTESTATION, {
            'profile': 'umf.metamodel.compile/1', 'modelSha256': self.model,
            'compilerSha256': self.compiler, 'compilerArtifact': staged,
            'executable': {**staged, 'path': '/synthetic/runner/umf-metamodel-cli'},
            'sourceAttestation': {'sources': {'Cargo.toml': self.compiler}, 'binarySha256': binary},
            'portableOutputs': {output_path: output['sha256']},
        })
        self.put(PROBE.GEN1_OUTPUT_RECEIPT, {
            'profile': 'umf.gen1.g0-source-output/1',
            'outputs': {row['path']: self.output_row(row) for row in (manifest, literal)},
        })
        self.generation = {
            'sourceCommit': 'a' * 40, 'sourceTree': 'b' * 40, 'workflowPath': PROBE.GEN1_WORKFLOW,
            'workflowSHA256': self.workflow['sha256'], 'runId': '11', 'attempt': '1',
            'jobId': '12', 'artifactId': '13', 'artifactDigest': PROBE.digest(b'synthetic zip'),
            'compilerSHA256': self.compiler, 'compilerBinarySHA256': binary,
        }
        self.fixture = {
            'profile': PROBE.CANDIDATE_PROFILE, 'inputProfile': PROBE.INPUT, 'maximumWork': PROBE.LIMIT,
            'baseline': {
                'mainCommit': '97ac05f17bc159d67c8eab931d3e0d66c85ee8f0',
                'mainTree': 'ad128d5c2c910464befbee820739f6e97a5d64b7',
                'inheritedCoreDistributionVersion': '0.10.9', 'scope': 'synthetic base',
            },
            'historicalFixture': {
                'path': history, 'sha256': self.pins[history],
                'sourceS': 'e3f38ef6f05ae636d2837f9d69f8d6805222664b', 'scope': 'synthetic historical',
            },
            'resources': self.resources,
            'encodingOnlyProducer': self.source_row(encoder), 'literalData': self.source_row(literal),
            'bindingStatus': 'source-bound', 'candidateArtifactVersion': PROBE.CANDIDATE_VERSION,
            'generation': self.generation, 'candidateModelSHA256': self.model, 'acceptance': 'synthetic',
        }

    def put(self, name, value):
        data = value if isinstance(value, bytes) else json.dumps(value, sort_keys=True).encode()
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.pins[name] = PROBE.digest(data)
        return {'path': name, 'bytes': len(data), 'sha256': self.pins[name]}

    @staticmethod
    def output_row(row):
        return {key: row[key] for key in ('bytes', 'sha256')}

    @staticmethod
    def source_row(row):
        return {key: row[key] for key in ('path', 'sha256')}

    def metadata(self, version):
        self.put('python/pyproject.toml',
                 f'[project]\nname="umf-core"\nversion="{version}"\n'.encode())
        self.put('python/src/umf/__init__.py', f'__version__ = "{version}"\n'.encode())

    def selection(self, path, version):
        return {
            'sourceFiles': dict(self.pins), 'modelSHA256': self.model,
            'currentInputs': {'fixturePath': path, 'fixtureSHA256': self.pins[path], 'metadataVersion': version},
        }

    def candidate(self):
        for path, key in PROBE.GEN1_MEMBER_PINS:
            self.generation[key] = self.pins[path]
        self.put(PROBE.CANDIDATE_FIXTURE, self.fixture)
        selected = self.selection(PROBE.CANDIDATE_FIXTURE, PROBE.CANDIDATE_VERSION)
        admission = {'fixtureSHA256': self.pins[PROBE.CANDIDATE_FIXTURE], 'generation': dict(self.generation)}
        return selected, admission

    def test_pending_production_refuses_even_with_complete_fixture(self):
        selected, _ = self.candidate()
        self.assertIsNone(PROBE.CANDIDATE_ADMISSION)
        with self.assertRaisesRegex(ValueError, 'GEN1 admission pending'):
            PROBE.current_inputs(self.root, selected)

    def test_closed_candidate_binds_raw_receipt_and_exact_version(self):
        selected, admission = self.candidate()
        with patch.object(PROBE, 'CANDIDATE_ADMISSION', admission):
            _, identity = PROBE.current_inputs(self.root, selected)
            self.assertEqual(PROBE.input_metadata_version(identity), '0.10.11')
            self.assertEqual(identity['generation']['correspondenceReceiptSHA256'],
                             self.pins[PROBE.GEN1_OUTPUT_RECEIPT])
            with self.assertRaises(ValueError):
                PROBE.input_metadata_version({**identity, 'inheritedPrivateMetadataVersion': '0.10.9'})

    def test_reviewer_receipt_refused_after_fixture_and_admission_repin(self):
        receipt = json.loads((self.root / PROBE.GEN1_OUTPUT_RECEIPT).read_bytes())
        receipt['profile'] = 'independent-source-review'
        self.put(PROBE.GEN1_OUTPUT_RECEIPT, receipt)
        selected, admission = self.candidate()
        with patch.object(PROBE, 'CANDIDATE_ADMISSION', admission):
            with self.assertRaisesRegex(ValueError, 'Raw GEN1 output receipt required'):
                PROBE.current_inputs(self.root, selected)

    def test_manifest_cannot_substitute_for_raw_receipt_even_when_repinned(self):
        self.put(PROBE.GEN1_OUTPUT_RECEIPT, (self.root / PROBE.GEN1_MANIFEST).read_bytes())
        selected, admission = self.candidate()
        with patch.object(PROBE, 'CANDIDATE_ADMISSION', admission):
            with self.assertRaisesRegex(ValueError, 'roles must be distinct'):
                PROBE.current_inputs(self.root, selected)

    def test_raw_receipt_wrong_literal_correspondence_refuses_after_repin(self):
        raw = json.loads((self.root / PROBE.GEN1_OUTPUT_RECEIPT).read_bytes())
        raw['outputs'][self.fixture['literalData']['path']]['sha256'] = 'f' * 64
        self.put(PROBE.GEN1_OUTPUT_RECEIPT, raw)
        selected, admission = self.candidate()
        with patch.object(PROBE, 'CANDIDATE_ADMISSION', admission):
            with self.assertRaisesRegex(ValueError, 'Raw GEN1 output receipt source correspondence'):
                PROBE.current_inputs(self.root, selected)

    def test_fixture_repin_cannot_change_selected_workflow(self):
        selected, admission = self.candidate()
        self.put(PROBE.GEN1_WORKFLOW, b'different workflow')
        selected['sourceFiles'][PROBE.GEN1_WORKFLOW] = self.pins[PROBE.GEN1_WORKFLOW]
        with patch.object(PROBE, 'CANDIDATE_ADMISSION', admission):
            with self.assertRaisesRegex(ValueError, 'workflow source custody differs'):
                PROBE.current_inputs(self.root, selected)

    def test_producer_refuses_pending_candidate_before_strict_wheel_verifier(self):
        selected, _ = self.candidate()
        self.put(PROBE.CENSUS, {'installedFactory': selected})
        self.put('out/source-and-payload.json', {
            'source': self.generation['sourceCommit'], 'inputProfile': PROBE.INPUT,
        })
        self.put('out/wheels/synthetic.whl', b'unused synthetic wheel')
        spec = importlib.util.spec_from_file_location(
            'inspector_candidate_batch', ROOT / 'tools/qualify_inspector_construction_batch.py')
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        args = SimpleNamespace(root=self.root, out=self.root / 'out',
                               source=self.generation['sourceCommit'])
        with patch.object(batch, 'load', return_value=PROBE) as loader:
            with self.assertRaisesRegex(ValueError, 'GEN1 admission pending'):
                batch.producer(args)
        loader.assert_called_once_with(self.root / 'tools/probe_inspector_installed_factory.py',
                                       'factory_producer_bind')

    def test_inherited_identity_stays_separate(self):
        self.metadata('0.10.9')
        legacy = {key: value for key, value in self.fixture.items() if key not in
                  {'bindingStatus', 'candidateArtifactVersion', 'generation', 'candidateModelSHA256'}}
        legacy['profile'] = PROBE.CURRENT_PROFILE
        self.put(PROBE.CURRENT_FIXTURE, legacy)
        selected = self.selection(PROBE.CURRENT_FIXTURE, '0.10.9')
        _, identity = PROBE.current_inputs(self.root, selected)
        self.assertEqual(PROBE.input_metadata_version(identity), '0.10.9')
        self.assertNotIn('generation', identity)
        self.assertNotIn('candidateArtifactVersion', identity)
        self.metadata('0.10.11')
        with self.assertRaisesRegex(ValueError, 'Inherited fixture/version differs'):
            PROBE.current_inputs(self.root, self.selection(PROBE.CURRENT_FIXTURE, '0.10.11'))


if __name__ == '__main__':
    unittest.main()
