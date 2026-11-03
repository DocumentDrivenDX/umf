"""Pure source/routing controls. Synthetic receipts are not qualification."""
import copy
import base64
import io
import json
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent))
import publish_codegen_pypi_release as p
LIVE_ACTIONS_METADATA = p.actions_metadata
CORE_PUBLIC_FILES = {
    'umf_core-0.10.8-cp311-abi3-manylinux_2_34_x86_64.whl': '2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd',
    'umf_core-0.10.8.tar.gz': 'a' * 64,
}


class CodegenPublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.assets = Path(self.temp.name)
        self.actions = {}
        reader = patch.object(p, 'actions_metadata', side_effect=lambda a: self.actions[a['artifact_id']])
        reader.start(); self.addCleanup(reader.stop)

    def reference(self, name, value, assertions=None):
        raw = json.dumps(value).encode()
        (self.assets / name).write_bytes(raw)
        return {'file': name, 'sha256': p.digest(raw), 'assertions': assertions or {'/source_sha': p.SOURCE, '/status': 'passed'}}

    def native_public_proof(self):
        return {'profile': 'umf.fresh-public-core-correspondence/1', 'status': 'passed', 'sourceS': p.SOURCE,
            'wheelSHA256': '2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd',
            'nativeSHA256': '7716d79ae0c85ac92ba679d531c213811fe66501397b0ec0f78e8bad53c296da',
            'resourceManifestSHA256': '5eecd2e367ac58a38df0f4f32a8a7d9bef8020b8340dc4704583f7806d83d571',
            'inspectionCases': 17, 'inspectionCalls': 51, 'requestCustodyPreserved': True, 'canonicalResources': True,
            'engineVersion': 'umf-core-r2', 'codegenProtocol': 'umf-codegen-r3-seven-ops-nine-resources/1', 'semanticCore': '0.10.0'}

    def fixture(self):
        gate = {'source_sha': p.SOURCE, 'status': 'passed'}
        pins = json.dumps({'commit': p.SOURCE, 'sdk': p.VERSION, 'umf_core': p.VERSION}).encode()
        (self.assets / 'release-pins.json').write_bytes(pins)
        value = {'schema': 'umf.codegen-publication-admission/1', 'repository': p.REPOSITORY,
            'tag': p.TAG, 'source_sha': p.SOURCE, 'source_tree': p.TREE, 'distribution': p.DISTRIBUTION,
            'version': p.VERSION, 'files': dict(p.FILES), 'protocols': dict(p.PROTOCOLS), 'resources': dict(p.RESOURCE_PINS),
            'release_pins_sha256': p.digest(pins),
            'qualification': self.reference('qualification.json', {**gate, 'files': p.FILES, 'protocols': p.PROTOCOLS, 'resources': p.RESOURCE_PINS}),
            'gates': {n: self.reference(n + '.json', gate) for n in ('companion-installed', 'companion-sdist')},
            'publisher': {'repository': p.REPOSITORY, 'distribution': p.DISTRIBUTION, 'workflow': p.WORKFLOW, 'environment': 'pypi', 'proof': None},
            'core': {'publication': self.reference('core-publication.json', {**gate,
                'schema': 'pypi-publication-receipt.v1', 'distribution': 'umf-core', 'version': '0.10.8',
                'registry': 'pypi', 'tag': p.TAG, 'registry_bytes_verified': True, 'files': dict(CORE_PUBLIC_FILES)}),
                'consumer': self.reference('core-consumer.json', {'schema': 'pypi-consumer-receipt.v1',
                    'status': 'passed', 'index': 'https://pypi.org/simple', 'umf_core_version': '0.10.8',
                    'source_sha': p.SOURCE, 'nativeResourceInspection': self.native_public_proof()}, {'/status': 'passed'})}}
        for role, ref in value['core'].items(): self.attach_actions(ref, role, value['release_pins_sha256'])
        return value

    def job(self, role):
        return {'id': 20 if role == 'publication' else 21, 'run_id': 11, 'head_sha': 'd' * 40,
            'name': p.CORE_SCOPES[role][0], 'status': 'completed', 'conclusion': 'success',
            'started_at': '2026-11-03T12:00:00Z', 'completed_at': '2026-11-03T12:10:00Z'}

    def attach_actions(self, ref, role, pins_hash=None, source_changes=None):
        member = p.CORE_SCOPES[role][2]
        new_reference = 'actions' not in ref
        if new_reference:
            ref['actions'] = {'run_id': 11, 'run_attempt': 1, 'job_id': self.job(role)['id'],
                'controller_sha': 'd' * 40, 'workflow_sha256': p.digest(b'synthetic reviewed Core workflow'),
                'artifact_id': 30 if role == 'publication' else 31, 'artifact_name': p.CORE_SCOPES[role][1],
                'artifact_sha256': '0' * 64, 'member': member, 'members': {}}
        a = ref['actions']; contents = {member: (self.assets / ref['file']).read_bytes()}
        if role == 'publication':
            source = {'schema': 'pypi-release-source.v1', 'status': 'verified', 'repository': p.REPOSITORY,
                'source_sha': p.SOURCE, 'tag': p.TAG, 'distribution': 'umf-core', 'version': p.VERSION,
                'files': dict(CORE_PUBLIC_FILES), 'sums_sha256': '0' * 64, 'release_pins_sha256': pins_hash}
            old = self.assets / p.actions_zip_name(ref)
            if old.exists() and not new_reference:
                with zipfile.ZipFile(old) as archive: source = p.decode(archive.read('source-receipt.json'))
            source.update(source_changes or {})
            contents['source-receipt.json'] = json.dumps(source).encode()
        a['members'] = {n: p.digest(raw) for n, raw in contents.items()}
        ref['sha256'] = a['members'][member]
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            for name, raw in contents.items(): archive.writestr(name, raw)
        raw = buffer.getvalue(); a['artifact_sha256'] = p.digest(raw)
        (self.assets / p.actions_zip_name(ref)).write_bytes(raw)
        self.actions[a['artifact_id']] = {'run': {'id': 11, 'run_attempt': 1, 'head_sha': 'd' * 40,
            'head_branch': 'main', 'path': p.CORE_WORKFLOW, 'event': 'workflow_dispatch',
            'status': 'completed', 'conclusion': 'success', 'repository': {'full_name': p.REPOSITORY, 'id': 1382276802,
                'owner': {'id': 273466046}}, 'head_repository': {'id': 1382276802}},
            'job': self.job(role), 'jobs': {'total_count': 2, 'jobs': [self.job(r) for r in p.CORE_SCOPES]},
            'workflow': b'synthetic reviewed Core workflow',
            'artifact': {'id': a['artifact_id'], 'name': a['artifact_name'], 'expired': False,
                'digest': 'sha256:' + a['artifact_sha256'], 'created_at': '2026-11-03T12:05:00Z',
                'workflow_run': {'id': 11, 'head_sha': 'd' * 40, 'head_branch': 'main',
                    'repository_id': 1382276802, 'head_repository_id': 1382276802}}}

    def bind_sums(self, value, sums):
        raw = ''.join(sha + '  ' + name + '\n' for name, sha in sorted(sums.items())).encode()
        (self.assets / 'SHA256SUMS').write_bytes(raw)
        self.attach_actions(value['core']['publication'], 'publication', source_changes={
            'sums_sha256': p.digest(raw), 'release_pins_sha256': value['release_pins_sha256']})
        return raw

    def later_names(self, value):
        return {r['file'] for r in value['core'].values()} | {p.actions_zip_name(r) for r in value['core'].values()}

    def admit(self, value):
        raw = json.dumps(value).encode()
        return p.admission(raw, p.digest(raw), self.assets)

    def resign(self, ref, **changes):
        value = p.decode((self.assets / ref['file']).read_bytes())
        value.update(changes)
        raw = json.dumps(value).encode()
        (self.assets / ref['file']).write_bytes(raw)
        ref['sha256'] = p.digest(raw)
        if 'actions' in ref:
            role = 'publication' if ref['actions']['member'] == 'publication-receipt.json' else 'consumer'
            self.attach_actions(ref, role)

    def test_null_publisher_is_unverified_without_circular_gate(self):
        self.assertIsNone(self.admit(self.fixture())['publisher']['proof'])

    def test_closed_exact_codegen_source_and_coupled_tag(self):
        for field, wrong in (('distribution', 'umf-core'), ('version', '0.10.7'), ('source_sha', '0' * 40),
                ('source_tree', '0' * 40), ('tag', 'codegen-v0.10.8'), ('files', {}), ('protocols', {}), ('resources', {})):
            value = self.fixture(); value[field] = wrong
            with self.subTest(field=field), self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_companion_gates_cannot_be_missing_or_resigned_pending(self):
        for name in ('companion-installed', 'companion-sdist'):
            value = self.fixture(); del value['gates'][name]
            with self.assertRaises(p.AccessReleaseError): self.admit(value)
            value = self.fixture(); self.resign(value['gates'][name], status='pending')
            with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_source_and_typed_positive_assertions_must_agree(self):
        for changes in ({'source_sha': '0' * 40}, {'status': True}):
            value = self.fixture(); self.resign(value['gates']['companion-installed'], **changes)
            with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_qualification_binds_exact_archives_protocol_and_resources(self):
        for field in ('files', 'protocols', 'resources'):
            value = self.fixture(); self.resign(value['qualification'], **{field: {}})
            with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_core_public_and_normal_consumer_proof_is_required(self):
        for name, changes in (('publication', {'registry_bytes_verified': False}),
                ('publication', {'version': '0.10.7'}), ('consumer', {'index': 'file:///private'})):
            value = self.fixture(); self.resign(value['core'][name], **changes)
            with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_shallow_consumer_cannot_qualify_public_core(self):
        value = self.fixture(); ref = value['core']['consumer']
        old = p.decode((self.assets / ref['file']).read_bytes())
        old.pop('source_sha', None); old.pop('nativeResourceInspection', None)
        (self.assets / ref['file']).write_text(json.dumps(old))
        self.attach_actions(ref, 'consumer')
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def change_consumer(self, value, path, replacement=None, *, remove=False):
        ref = value['core']['consumer']; body = p.decode((self.assets / ref['file']).read_bytes())
        parts = path.lstrip('/').split('/'); parent = body
        for key in parts[:-1]: parent = parent[key]
        if remove: parent.pop(parts[-1])
        else: parent[parts[-1]] = replacement
        (self.assets / ref['file']).write_text(json.dumps(body))
        self.attach_actions(ref, 'consumer')

    def test_deep_consumer_mandatory_fields_cannot_be_missing(self):
        for path in p.CORE_CONSUMER_REQUIRED:
            value = self.fixture(); self.change_consumer(value, path, remove=True)
            with self.subTest(path=path), self.assertRaises(p.AccessReleaseError): self.admit(value)
        value = self.fixture(); self.change_consumer(value, '/nativeResourceInspection', remove=True)
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_deep_consumer_wrong_profile_source_hash_protocol_semantic_or_result_refuses(self):
        for path, expected in p.CORE_CONSUMER_REQUIRED.items():
            wrong = (False if type(expected) is bool else expected - 1 if type(expected) is int else
                'failed' if expected == 'passed' else 'f' * 64 if path.endswith('SHA256') else
                '0' * 40 if path.endswith(('sourceS', 'source_sha')) else 'wrong')
            value = self.fixture(); self.change_consumer(value, path, wrong)
            with self.subTest(path=path), self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_deep_consumer_count_and_success_flag_types_are_exact(self):
        cases = [(name, wrong) for name, count in (('inspectionCases', 17), ('inspectionCalls', 51))
            for wrong in (True, str(count), float(count), None)]
        cases += [(name, wrong) for name in ('requestCustodyPreserved', 'canonicalResources') for wrong in (1, 0, 'true', None)]
        for name, wrong in cases:
            value = self.fixture(); self.change_consumer(value, '/nativeResourceInspection/' + name, wrong)
            with self.subTest(field=name, type=type(wrong).__name__), self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_admission_assertions_cannot_waive_hard_deep_proof_contract(self):
        value = self.fixture()
        self.assertEqual(value['core']['consumer']['assertions'], {'/status': 'passed'})
        self.admit(value)  # The actual new deep fields, not extra admission assertions, satisfy the guard.
        self.change_consumer(value, '/nativeResourceInspection/canonicalResources', 1)
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_deep_witness_wheel_must_belong_to_actual_publication(self):
        value = self.fixture(); ref = value['core']['publication']
        body = p.decode((self.assets / ref['file']).read_bytes()); body['files'] = {'umf_core-0.10.8.tar.gz': 'a' * 64}
        (self.assets / ref['file']).write_text(json.dumps(body))
        self.attach_actions(ref, 'publication', source_changes={'files': body['files']})
        with self.assertRaisesRegex(p.AccessReleaseError, 'witness wheel is absent'): self.admit(value)

    def test_missing_original_actions_receipt_or_archive_refuses(self):
        for role in p.CORE_SCOPES:
            for kind in ('file', 'archive', 'provenance'):
                value = self.fixture(); ref = value['core'][role]
                if kind == 'file': (self.assets / ref['file']).unlink()
                if kind == 'archive': (self.assets / p.actions_zip_name(ref)).unlink()
                if kind == 'provenance': del ref['actions']
                with self.subTest(role=role, kind=kind), self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_substituted_receipt_cannot_replace_original_member(self):
        value = self.fixture(); ref = value['core']['publication']
        changed = (self.assets / ref['file']).read_bytes() + b'\n'
        (self.assets / ref['file']).write_bytes(changed)
        ref['sha256'] = p.digest(changed); ref['actions']['members']['publication-receipt.json'] = p.digest(changed)
        with patch.object(p.core, 'check_pypi') as public:
            with self.assertRaises(p.AccessReleaseError): p.check_core(value, self.assets)
            public.assert_not_called()

    def test_resigned_wrong_source_receipts_and_source_member_refuse(self):
        value = self.fixture(); self.resign(value['core']['publication'], source_sha='0' * 40)
        with self.assertRaises(p.AccessReleaseError): self.admit(value)
        value = self.fixture(); self.attach_actions(value['core']['publication'], 'publication', source_changes={'source_sha': '0' * 40})
        with self.assertRaisesRegex(p.AccessReleaseError, 'source/publication scope'): self.admit(value)
        value = self.fixture(); self.resign(value['core']['consumer'], source_sha='0' * 40)
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_original_job_attempt_workflow_and_artifact_metadata_must_agree(self):
        mutations = [
            ('run', 'id', 12), ('run', 'run_attempt', 2), ('run', 'head_sha', '0' * 40),
            ('run', 'head_branch', 'other'), ('run', 'path', '.github/workflows/other.yml'), ('run', 'event', 'push'),
            ('job', 'id', 999), ('job', 'run_id', 12), ('job', 'name', 'installed-consumer'), ('job', 'conclusion', 'failure'),
            ('jobs', 'jobs', []), ('jobs', 'total_count', 101),
            ('artifact', 'id', 999), ('artifact', 'name', 'other'), ('artifact', 'expired', True),
            ('artifact', 'digest', 'sha256:' + '0' * 64), ('artifact', 'created_at', '2026-11-03T13:00:00Z'),
        ]
        for section, key, wrong in mutations:
            value = self.fixture(); self.actions[30][section][key] = wrong
            with self.subTest(section=section, key=key), self.assertRaises(p.AccessReleaseError): self.admit(value)
        value = self.fixture(); self.actions[30]['workflow'] = b'unreviewed workflow'
        with self.assertRaises(p.AccessReleaseError): self.admit(value)
        value = self.fixture(); self.actions[30]['artifact']['workflow_run']['id'] = 12
        with self.assertRaises(p.AccessReleaseError): self.admit(value)
        value = self.fixture(); self.actions[30]['run']['repository']['owner']['id'] = 1
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_consumer_new_original_scope_and_same_publisher_attempt(self):
        value = self.fixture()
        consumer = p.core_actions_proof(self.assets, value['core']['consumer'], 'consumer')
        self.assertEqual(consumer['schema'], 'pypi-consumer-receipt.v1')
        self.assertEqual(consumer['source_sha'], p.SOURCE)
        self.assertEqual(consumer['nativeResourceInspection']['profile'], 'umf.fresh-public-core-correspondence/1')
        for field, wrong in (('run_id', 12), ('run_attempt', 2), ('controller_sha', '0' * 40)):
            value = self.fixture(); value['core']['consumer']['actions'][field] = wrong
            with self.subTest(field=field), self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_all_original_actions_members_have_pinned_hashes(self):
        value = self.fixture(); ref = value['core']['publication']
        ref['actions']['members']['source-receipt.json'] = '0' * 64
        with self.assertRaises(p.AccessReleaseError): self.admit(value)
        value = self.fixture(); ref = value['core']['consumer']
        raw = (self.assets / p.actions_zip_name(ref)).read_bytes() + b'substitution'
        (self.assets / p.actions_zip_name(ref)).write_bytes(raw)
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_live_reader_uses_original_attempt_and_pinned_controller_source(self):
        value = self.fixture(); a = value['core']['publication']['actions']; meta = self.actions[30]
        def read(command):
            route = command[-1]
            self.assertTrue(route.startswith('repos/DocumentDrivenDX/umf/'))
            if '/contents/' in route:
                self.assertTrue(route.endswith('?ref=' + a['controller_sha']))
                return json.dumps({'type': 'file', 'path': p.CORE_WORKFLOW, 'encoding': 'base64',
                    'content': base64.b64encode(meta['workflow']).decode()}).encode()
            if route.endswith('/attempts/1'): return json.dumps(meta['run']).encode()
            if route.endswith('/attempts/1/jobs?per_page=100'): return json.dumps(meta['jobs']).encode()
            if route.endswith('/jobs/20'): return json.dumps(meta['job']).encode()
            if route.endswith('/artifacts/30'): return json.dumps(meta['artifact']).encode()
            self.fail('unexpected/unpinned Actions route')
        with patch.object(p.subprocess, 'check_output', side_effect=read) as api:
            actual = LIVE_ACTIONS_METADATA(a)
        p.verify_actions_metadata(value['core']['publication'], 'publication', actual)
        self.assertEqual(api.call_count, 5)

    def test_fetch_keeps_original_archive_member_bytes_and_never_clobbers_release(self):
        value = self.fixture(); originals = {}
        for role, ref in value['core'].items():
            originals[ref['actions']['artifact_id']] = (self.assets / p.actions_zip_name(ref)).read_bytes()
            (self.assets / p.actions_zip_name(ref)).unlink(); (self.assets / ref['file']).unlink()
        (self.assets / 'SHA256SUMS').write_bytes(b'original immutable release checksums')
        before = {n: (self.assets / n).read_bytes() for n in ('release-pins.json', 'SHA256SUMS')}
        with patch.object(p.subprocess, 'check_output', side_effect=lambda cmd: originals[int(cmd[-1].split('/')[-2])]):
            p.fetch_core_proofs(value, self.assets)
        self.assertEqual(before, {n: (self.assets / n).read_bytes() for n in before})
        for role, ref in value['core'].items():
            self.assertEqual((self.assets / p.actions_zip_name(ref)).read_bytes(), originals[ref['actions']['artifact_id']])
            with zipfile.ZipFile(io.BytesIO(originals[ref['actions']['artifact_id']])) as archive:
                self.assertEqual((self.assets / ref['file']).read_bytes(), archive.read(ref['actions']['member']))

    def test_proof_bytes_and_admission_hash_cannot_change(self):
        value = self.fixture(); (self.assets / value['qualification']['file']).write_text('{}')
        with self.assertRaises(p.AccessReleaseError): self.admit(value)
        raw = json.dumps(self.fixture()).encode()
        with self.assertRaises(p.AccessReleaseError): p.admission(raw, '0' * 64, self.assets)

    def test_publisher_identity_cannot_select_access_or_other_workflow(self):
        for field in ('repository', 'distribution', 'workflow', 'environment'):
            value = self.fixture(); value['publisher'][field] = 'other'
            with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_exchange_observation_does_not_prove_project_authorization(self):
        value = self.fixture()
        value['publisher']['proof'] = self.reference('exchange.json', {'status': 'EXCHANGE_SUCCESS'}, {'/status': 'EXCHANGE_SUCCESS'})
        with self.assertRaises(p.AccessReleaseError): self.admit(value)

    def test_metadata_headers_authoritative_and_stale_readme_unchanged(self):
        raw = b'Name: umf-codegen\nVersion: 0.10.8\nRequires-Python: <3.15,>=3.11\nRequires-Dist: umf-core==0.10.8\n\nREADME still mentions 0.10.7\n'
        p.metadata(raw)
        for old, new in ((b'umf-core==0.10.8', b'umf-core>=0.10.8'), (b'Version: 0.10.8', b'Version: 0.10.7'),
                         (b'<3.15', b'<4'), (b'Name: umf-codegen', b'Name: umf-core')):
            with self.assertRaises(p.AccessReleaseError): p.metadata(raw.replace(old, new))
        with self.assertRaises(p.AccessReleaseError): p.metadata(raw.replace(b'\n\n', b'\nName: umf-codegen\n\n'))

    def member_fixture(self):
        release = b'synthetic frozen protocol authority'
        resource = b'synthetic canonical resource'
        manifest = json.dumps({'files': {'core.schema.json': p.digest(resource)}, 'profile': p.PROTOCOLS['resources']}).encode()
        root = 'umf_codegen-0.10.8.dist-info/'
        members = {'umf_codegen/_release.py': release, 'umf_codegen/_resources/manifest.json': manifest,
            'umf_codegen/_resources/core.schema.json': resource,
            root + 'METADATA': b'Name: umf-codegen\nVersion: 0.10.8\nRequires-Python: >=3.11,<3.15\nRequires-Dist: umf-core==0.10.8\n',
            root + 'WHEEL': b'Root-Is-Purelib: true\nTag: py3-none-any\n'}
        return members, {'manifest': p.digest(manifest), 'releaseAuthority': p.digest(release)}

    def test_pure_archive_resource_release_and_wheel_kind_controls(self):
        members, pins = self.member_fixture()
        with patch.object(p, 'RESOURCE_PINS', pins), patch.object(p, 'RESOURCE_NAMES', {'core.schema.json'}):
            p.archive_members(list(members), members.__getitem__, True)
            for name, raw in (('umf_codegen/_release.py', b'other protocol'),
                ('umf_codegen/_resources/core.schema.json', b'changed resource'),
                ('umf_codegen-0.10.8.dist-info/WHEEL', b'Root-Is-Purelib: false\nTag: cp311-cp311-linux_x86_64\n')):
                changed = {**members, name: raw}
                with self.subTest(name=name), self.assertRaises(p.AccessReleaseError):
                    p.archive_members(list(changed), changed.__getitem__, True)
            extra = {**members, 'umf_codegen/_resources/unreviewed.json': b'{}'}
            with self.assertRaises(p.AccessReleaseError): p.archive_members(list(extra), extra.__getitem__, True)

    def test_unsafe_duplicate_and_native_archive_names_refuse_before_read(self):
        for names in (['../x'], ['a', 'a'], ['/absolute'], ['x.pyd'], ['x\\y']):
            with self.assertRaises(p.AccessReleaseError):
                p.archive_members(names, lambda _: self.fail('unsafe archive must not be read'), True)

    def test_coupled_roster_keeps_nonselected_assets_without_core_archive_download(self):
        files = {n: p.digest(b'synthetic archive') for n in p.FILES}
        with patch.object(p, 'FILES', files), patch.object(p, 'archive_metadata'):
            value = self.fixture()
            for n in files: (self.assets / n).write_bytes(b'synthetic archive')
            sums = {f.name: p.digest(f.read_bytes()) for f in self.assets.iterdir() if f.name not in self.later_names(value)}
            sums['umf-sdk.tgz'] = 'c' * 64  # Public coupled asset; deliberately not downloaded.
            def verify(roster):
                data = self.bind_sums(value, roster)
                raw = json.dumps(value).encode()
                return p.verify_packet(self.assets, raw, p.digest(raw), p.digest(data), p.TAG, p.SOURCE)
            admitted, roster, needed = verify(sums)
            self.assertIsNone(admitted['publisher']['proof'])
            self.assertNotIn('umf-sdk.tgz', needed)
            self.assertIn('umf-sdk.tgz', roster)
            for name in ('companion-installed.json', 'umf_codegen-0.10.8.tar.gz'):
                changed = dict(sums); del changed[name]
                with self.assertRaises(p.AccessReleaseError): verify(changed)
            with self.assertRaises(p.AccessReleaseError): verify({**sums, 'umf_codegen-0.10.8-extra.whl': 'a' * 64})
            (self.assets / 'umf_codegen-0.10.8.tar.gz').write_bytes(b'changed retained bytes')
            with self.assertRaises(p.AccessReleaseError): verify(sums)

    def test_immutable_release_need_not_contain_later_core_actions_receipts(self):
        files = {n: p.digest(b'synthetic archive') for n in p.FILES}
        with patch.object(p, 'FILES', files), patch.object(p, 'archive_metadata'):
            value = self.fixture()
            for name in files: (self.assets / name).write_bytes(b'synthetic archive')
            later = self.later_names(value)
            sums = {f.name: p.digest(f.read_bytes()) for f in self.assets.iterdir() if f.name not in later}
            raw_sums = self.bind_sums(value, sums)
            raw = json.dumps(value).encode()
            _, roster, needed = p.verify_packet(self.assets, raw, p.digest(raw), p.digest(raw_sums), p.TAG, p.SOURCE)
            self.assertTrue(later.isdisjoint(roster))
            self.assertTrue(later <= set(needed))
            release = {'tag_name': p.TAG, 'draft': False, 'prerelease': False,
                'assets': [{'name': n, 'digest': 'sha256:' + h} for n, h in {**sums, 'SHA256SUMS': p.digest(raw_sums)}.items()]}
            p.verify_release(release, {'ref': 'refs/tags/' + p.TAG, 'object': {'type': 'commit', 'sha': p.SOURCE}}, None, sums, p.digest(raw_sums))

    def test_later_core_source_receipt_cannot_switch_immutable_release_hashes(self):
        files = {n: p.digest(b'synthetic archive') for n in p.FILES}
        with patch.object(p, 'FILES', files), patch.object(p, 'archive_metadata'):
            for field in ('sums_sha256', 'release_pins_sha256'):
                value = self.fixture()
                for name in files: (self.assets / name).write_bytes(b'synthetic archive')
                sums = {f.name: p.digest(f.read_bytes()) for f in self.assets.iterdir()
                    if f.name not in self.later_names(value) | {'SHA256SUMS'}}
                raw_sums = self.bind_sums(value, sums)
                self.attach_actions(value['core']['publication'], 'publication', source_changes={field: 'f' * 64})
                raw = json.dumps(value).encode()
                with self.subTest(field=field), self.assertRaisesRegex(p.AccessReleaseError, 'different immutable coupled release'):
                    p.verify_packet(self.assets, raw, p.digest(raw), p.digest(raw_sums), p.TAG, p.SOURCE)

    def test_resigned_coupled_release_pins_cannot_change_source_or_versions(self):
        for field, wrong in (('commit', '0' * 40), ('sdk', '0.10.7'), ('umf_core', '0.10.7'), ('umf_codegen', '0.10.7')):
            value = self.fixture()
            pins = {'commit': p.SOURCE, 'sdk': p.VERSION, 'umf_core': p.VERSION, field: wrong}
            raw_pins = json.dumps(pins).encode()
            (self.assets / 'release-pins.json').write_bytes(raw_pins)
            value['release_pins_sha256'] = p.digest(raw_pins)
            sums = {'release-pins.json': value['release_pins_sha256'], **p.FILES}
            raw_sums = ''.join(h + '  ' + n + '\n' for n, h in sorted(sums.items())).encode()
            (self.assets / 'SHA256SUMS').write_bytes(raw_sums)
            raw = json.dumps(value).encode()
            with self.subTest(field=field), self.assertRaisesRegex(p.AccessReleaseError, 'coupled source/SDK/Core pins differ'):
                p.verify_packet(self.assets, raw, p.digest(raw), p.digest(raw_sums), p.TAG, p.SOURCE)

    def test_existing_coupled_release_source_inventory_and_byte_digests(self):
        sums = {**p.FILES, 'umf-sdk.tgz': 'c' * 64}
        release = {'tag_name': p.TAG, 'draft': False, 'prerelease': False,
                   'assets': [{'name': n, 'digest': 'sha256:' + h} for n, h in {**sums, 'SHA256SUMS': 'b' * 64}.items()]}
        ref = {'ref': 'refs/tags/' + p.TAG, 'object': {'type': 'commit', 'sha': p.SOURCE}}
        p.verify_release(release, ref, None, sums, 'b' * 64)
        for change in ('source', 'tag', 'draft', 'partial', 'digest'):
            r, t = copy.deepcopy(release), copy.deepcopy(ref)
            if change == 'source': t['object']['sha'] = '0' * 40
            if change == 'tag': r['tag_name'] = 'codegen-v0.10.8'
            if change == 'draft': r['draft'] = True
            if change == 'partial': r['assets'].pop()
            if change == 'digest': r['assets'][0]['digest'] = 'sha256:' + '0' * 64
            with self.assertRaises((p.AccessReleaseError, p.core.ReleaseError)): p.verify_release(r, t, None, sums, 'b' * 64)

    def test_absent_public_core_refuses_package_upload_preflight(self):
        with patch.object(p.core, 'check_pypi', return_value='absent') as read:
            with self.assertRaises(p.AccessReleaseError): p.check_core(self.fixture(), self.assets)
        self.assertEqual(read.call_args.args[:2], ('umf-core', '0.10.8'))

    def test_existing_core_publisher_remains_closed_to_codegen(self):
        value = self.fixture()
        sums = (value['release_pins_sha256'] + '  release-pins.json\n').encode()
        (self.assets / 'SHA256SUMS').write_bytes(sums)
        release = {'tag_name': p.TAG, 'draft': False, 'prerelease': False, 'assets': [
            {'name': 'SHA256SUMS', 'digest': 'sha256:' + p.digest(sums)},
            {'name': 'release-pins.json', 'digest': 'sha256:' + value['release_pins_sha256']}]}
        with self.assertRaisesRegex(p.core.ReleaseError, 'restricted to the official umf-core'):
            p.core.prepare_release(repository=p.REPOSITORY, release=release,
                tag_ref={'ref': 'refs/tags/' + p.TAG, 'object': {'type': 'commit', 'sha': p.SOURCE}},
                tag_object=None, assets_dir=self.assets, output_dir=self.assets / 'unused-output',
                tag=p.TAG, source_sha=p.SOURCE, expected_sums_sha256=p.digest(sums),
                distribution=p.DISTRIBUTION, wheel_prefix='umf_codegen-', wheel_count=1, require_sdist=True)

    def test_real_public_reader_same_byte_reuse_partial_collision_and_download_mutation(self):
        data = {n: ('synthetic archive ' + n).encode() for n in p.FILES}
        hashes = {n: p.digest(raw) for n, raw in data.items()}
        rows = [{'filename': n, 'digests': {'sha256': sha}, 'url': 'https://files.pythonhosted.org/' + n} for n, sha in hashes.items()]
        version = {'info': {'name': p.DISTRIBUTION, 'version': p.VERSION}, 'urls': rows}
        with patch.object(p.core.urllib.request, 'urlopen', side_effect=[io.BytesIO(json.dumps(version).encode()), *[io.BytesIO(raw) for raw in data.values()]]):
            self.assertEqual(p.core.check_pypi(p.DISTRIBUTION, p.VERSION, hashes), 'matching')
        for mutation in ('partial', 'digest', 'download', 'host'):
            value = copy.deepcopy(version)
            if mutation == 'partial': value['urls'].pop()
            if mutation == 'digest': value['urls'][0]['digests']['sha256'] = '0' * 64
            if mutation == 'host': value['urls'][0]['url'] = 'https://other.invalid/archive'
            response = [io.BytesIO(json.dumps(value).encode())]
            if mutation == 'download': response.append(io.BytesIO(b'changed public archive'))
            with self.subTest(mutation=mutation), patch.object(p.core.urllib.request, 'urlopen', side_effect=response):
                with self.assertRaises(p.core.ReleaseError): p.core.check_pypi(p.DISTRIBUTION, p.VERSION, hashes)

    def test_no_release_creation_or_capability_or_upload_cli(self):
        for command in ('stage-github', 'capability-only', '--upload'):
            with patch.object(sys, 'argv', ['controller', command]), redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit): p.main()

    def test_verify_cli_does_not_contact_registry_or_create_release(self):
        value = self.fixture()
        argv = ['controller', 'verify', '--assets-dir', str(self.assets), '--expected-admission-sha256', 'a' * 64,
            '--expected-sums-sha256', 'b' * 64, '--tag', p.TAG, '--source-sha', p.SOURCE]
        with patch.object(sys, 'argv', argv), patch.object(p.subprocess, 'check_output', return_value=b'{}'), \
                patch.object(p, 'verify_packet', return_value=(value, {}, {})), patch.object(p, 'check_core') as public, \
                redirect_stdout(io.StringIO()) as output:
            self.assertEqual(p.main(), 0)
        public.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['publisherProof'], 'UNVERIFIED')


if __name__ == '__main__': unittest.main()
