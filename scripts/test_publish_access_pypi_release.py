"""Pure routing controls. Synthetic admissions are never qualification evidence."""
import copy
import base64
import io
import json
import subprocess
import socket
import ssl
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import publish_access_pypi_release as p


class AccessPublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.assets = Path(self.tmp.name)

    def reference(self, name, value, assertions=None):
        raw = json.dumps(value).encode()
        (self.assets / name).write_bytes(raw)
        return {'file': name, 'sha256': p.digest(raw), 'assertions': assertions or {
            '/source_sha': p.SOURCE, '/status': 'passed'}}

    def fixture(self):
        gate = {'source_sha': p.SOURCE, 'status': 'passed'}
        capability = {'repository': p.REPOSITORY, 'distribution': p.DISTRIBUTION,
                      'workflow': p.WORKFLOW, 'environment': 'pypi', 'status': 'passed'}
        return {
            'schema': 'umf.access-publication-admission/1', 'repository': p.REPOSITORY,
            'tag': p.TAG, 'source_sha': p.SOURCE, 'source_tree': p.TREE,
            'distribution': p.DISTRIBUTION, 'version': p.VERSION,
            'files': dict(p.FILES), 'resources': dict(p.RESOURCE_IDENTITIES),
            'qualification': self.reference('qualification.json', {
                **gate, 'files': p.FILES, 'resources': p.RESOURCE_IDENTITIES}),
            'gates': {n: self.reference(n + '.json', gate) for n in (
                'access-macos-installed', 'access-linux-installed', 'full-cohort')},
            'publisher': {**{k: v for k, v in capability.items() if k != 'status'},
                'proof': self.reference('capability.json', capability, {'/status': 'passed'})},
            'core': {
                'publication': self.reference('core-publication.json', {**gate,
                    'schema': 'pypi-publication-receipt.v1', 'distribution': 'umf-core',
                    'version': '0.10.8', 'registry': 'pypi', 'registry_bytes_verified': True,
                    'files': {'umf_core-0.10.8.tar.gz': 'a' * 64}}),
                'consumer': self.reference('core-consumer.json', {'schema': 'pypi-consumer-receipt.v1',
                    'status': 'passed', 'index': 'https://pypi.org/simple', 'umf_core_version': '0.10.8'},
                    {'/status': 'passed'})}}

    def admit(self, value):
        raw = json.dumps(value).encode()
        return p.admission(raw, p.digest(raw), self.assets)

    def resign(self, reference, **changes):
        value = p.decode((self.assets / reference['file']).read_bytes())
        value.update(changes)
        raw = json.dumps(value).encode()
        (self.assets / reference['file']).write_bytes(raw)
        reference['sha256'] = p.digest(raw)

    def test_closed_admission_positive_control(self):
        self.assertEqual(self.admit(self.fixture())['source_sha'], p.SOURCE)

    def test_null_publisher_proof_is_explicitly_unverified_not_a_gate(self):
        value = self.fixture()
        value['publisher']['proof'] = None
        self.assertIsNone(self.admit(value)['publisher']['proof'])

    def test_null_proof_keeps_linux_cohort_and_core_gates(self):
        for kind in ('access-linux-installed', 'full-cohort', 'publication'):
            value = self.fixture()
            value['publisher']['proof'] = None
            reference = value['core']['publication'] if kind == 'publication' else value['gates'][kind]
            self.resign(reference, status='pending')
            with self.subTest(kind=kind), self.assertRaisesRegex(p.AccessReleaseError, 'assertion differs'):
                self.admit(value)

    def test_component_only_cannot_omit_linux_or_cohort(self):
        for name in ('access-linux-installed', 'full-cohort'):
            with self.subTest(name=name):
                value = self.fixture()
                del value['gates'][name]
                with self.assertRaises(p.AccessReleaseError):
                    self.admit(value)

    def test_resigned_pending_linux_is_not_pass(self):
        value = self.fixture()
        self.resign(value['gates']['access-linux-installed'], status='pending')
        with self.assertRaisesRegex(p.AccessReleaseError, 'assertion differs'):
            self.admit(value)

    def test_resigned_wrong_source_and_typed_pass_refused(self):
        for changes in ({'source_sha': '0' * 40}, {'status': True}):
            value = self.fixture()
            self.resign(value['gates']['full-cohort'], **changes)
            with self.assertRaises(p.AccessReleaseError):
                self.admit(value)

    def test_unreviewed_identity_or_archive_cannot_be_admitted(self):
        for field, replacement in (('source_sha', '0' * 40), ('source_tree', '0' * 40),
                ('tag', 'python-v0.10.8'), ('version', '0.1.0.dev8'), ('files', {}), ('resources', {})):
            value = self.fixture()
            value[field] = replacement
            with self.subTest(field=field), self.assertRaises(p.AccessReleaseError):
                self.admit(value)

    def test_publisher_identity_must_match_dedicated_workflow(self):
        for field in ('workflow', 'distribution', 'environment', 'repository'):
            value = self.fixture()
            self.resign(value['publisher']['proof'], **{field: 'other'})
            with self.subTest(field=field), self.assertRaises(p.AccessReleaseError):
                self.admit(value)

    def test_core_public_and_consumer_proofs_are_required(self):
        for kind, changes in (('publication', {'registry_bytes_verified': False}),
                ('publication', {'version': '0.10.7'}), ('consumer', {'index': 'file:///local'})):
            value = self.fixture()
            self.resign(value['core'][kind], **changes)
            with self.subTest(kind=kind, changes=changes), self.assertRaises(p.AccessReleaseError):
                self.admit(value)

    def test_proof_bytes_and_reviewed_admission_hash(self):
        value = self.fixture()
        (self.assets / value['qualification']['file']).write_text('{}')
        with self.assertRaisesRegex(p.AccessReleaseError, 'asset bytes differ'):
            self.admit(value)
        raw = json.dumps(self.fixture()).encode()
        with self.assertRaisesRegex(p.AccessReleaseError, 'admission digest'):
            p.admission(raw, '0' * 64, self.assets)

    def test_duplicate_json_unsafe_files_and_pointer_indices(self):
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}'):
            with self.assertRaises(p.AccessReleaseError):
                p.decode(raw)
        for name in ('../receipt.json', '/receipt.json', 'a/b', '..'):
            with self.assertRaises(p.AccessReleaseError):
                p.safe_name(name)
        for pointer in ('/-1', '/01', '/~2'):
            with self.assertRaises(p.AccessReleaseError):
                p.pointer([True], pointer)

    def test_metadata_strict_pins_and_range(self):
        raw = ('Name: umf_access\nVersion: 0.1.0.dev10\nRequires-Python: <3.15,>=3.11\n' +
               ''.join('Requires-Dist: ' + r + '\n' for r in sorted(p.REQUIREMENTS))).encode()
        p.metadata(raw)
        for old, new in ((b'umf-core==0.10.8', b'umf-core>=0.10.8'),
                         (b'<3.15', b'<4'), (b'0.1.0.dev10', b'0.1.0.dev8')):
            with self.assertRaises(p.AccessReleaseError):
                p.metadata(raw.replace(old, new))
        with self.assertRaises(p.AccessReleaseError):
            p.metadata(raw + b'Name: umf_access\n')

    def test_unsafe_duplicate_and_native_members_refuse_before_read(self):
        for names in (['../x'], ['a', 'a'], ['x.so'], ['/absolute'], ['x\\y']):
            with self.assertRaises(p.AccessReleaseError):
                p._archive_members(names, lambda _: self.fail('must not read'), True)

    def release(self):
        expected = {**p.FILES, 'SHA256SUMS': 'b' * 64}
        return {'tag_name': p.TAG, 'draft': False, 'prerelease': True,
                'assets': [{'name': n, 'digest': 'sha256:' + h} for n, h in expected.items()]}, expected

    def test_release_exact_inventory_source_and_same_bytes(self):
        release, expected = self.release()
        ref = {'ref': 'refs/tags/' + p.TAG, 'object': {'type': 'commit', 'sha': p.SOURCE}}
        p.verify_release(release, ref, None, expected)
        for change in ('digest', 'partial', 'draft', 'source'):
            r, t = copy.deepcopy(release), copy.deepcopy(ref)
            if change == 'digest': r['assets'][0]['digest'] = 'sha256:' + '0' * 64
            if change == 'partial': r['assets'].pop()
            if change == 'draft': r['draft'] = True
            if change == 'source': t['object']['sha'] = '0' * 40
            with self.subTest(change=change), self.assertRaises((p.AccessReleaseError, p.core.ReleaseError)):
                p.verify_release(r, t, None, expected)

    def test_stage_same_bytes_reuses_without_mutation(self):
        release, expected = self.release()
        ref = {'ref': 'refs/tags/' + p.TAG, 'object': {'type': 'commit', 'sha': p.SOURCE}}
        response = subprocess.CompletedProcess([], 0, json.dumps(release), '')
        with patch.object(p.subprocess, 'run', return_value=response), patch.object(p, 'gh', return_value=json.dumps(ref)) as remote:
            self.assertEqual(p.stage_github(self.assets, p.FILES, 'b' * 64), 'existing_exact_bytes')
        self.assertTrue(all(call.args[0] == 'api' for call in remote.call_args_list))

    def test_stage_wrong_existing_tag_refuses_before_upload(self):
        absent = subprocess.CompletedProcess([], 1, '', 'HTTP 404')
        ref = subprocess.CompletedProcess([], 0, json.dumps({'ref': 'refs/tags/' + p.TAG,
                'object': {'type': 'commit', 'sha': '0' * 40}}), '')
        with patch.object(p.subprocess, 'run', side_effect=[absent, ref]), patch.object(p, 'gh') as remote:
            with self.assertRaises(p.AccessReleaseError):
                p.stage_github(self.assets, {}, 'b' * 64)
            remote.assert_not_called()

    def test_upload_default_off_even_with_valid_packet(self):
        argv = ['controller', 'stage-github', '--assets-dir', str(self.assets),
                '--expected-admission-sha256', 'a' * 64, '--expected-sums-sha256', 'b' * 64,
                '--tag', p.TAG, '--source-sha', p.SOURCE]
        with patch.object(sys, 'argv', argv), patch.object(p.subprocess, 'check_output', return_value=b'{}'), \
                patch.object(p, 'verify_packet', return_value={}), patch.object(p, 'stage_github') as upload, \
                patch.object(p, 'check_core') as core, redirect_stdout(io.StringIO()) as output:
            self.assertEqual(p.main(), 0)
        upload.assert_not_called()
        core.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['githubStage'], 'verification_only_upload_disabled')

    def test_no_public_core_means_no_access_upload(self):
        value = self.fixture()
        with patch.object(p.core, 'check_pypi', return_value='absent'):
            with self.assertRaisesRegex(p.AccessReleaseError, 'not public'):
                p.check_core(value, self.assets)

    def capability_context(self):
        return {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
            'GITHUB_REPOSITORY': p.REPOSITORY, 'GITHUB_REF': 'refs/heads/main',
            'GITHUB_WORKFLOW_REF': p.REPOSITORY + '/.github/workflows/' + p.WORKFLOW + '@refs/heads/main',
            'ACCESS_CAPABILITY_ENVIRONMENT': 'pypi', 'ACCESS_CAPABILITY_ONLY': 'true', 'ACCESS_PUBLISH': 'false',
            'ACTIONS_ID_TOKEN_REQUEST_URL': 'https://test.actions.githubusercontent.com/idtoken?api-version=2.0',
            'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'synthetic-request-secret'}

    def synthetic_jwt(self, *, omit=(), **changes):
        claims = {'repository': p.REPOSITORY, 'ref': 'refs/heads/main',
            'workflow_ref': self.capability_context()['GITHUB_WORKFLOW_REF'],
            'sub': 'repo:DocumentDrivenDX@273466046/umf@1382276802:environment:pypi',
            'repository_id': '1382276802', 'repository_owner_id': '273466046', 'aud': 'pypi', **changes}
        for key in omit:
            claims.pop(key)
        payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
        return 'synthetic-header.' + payload + '.synthetic-signature'

    def test_exact_frozen_immutable_identity_reaches_exchange_only(self):
        jwt = self.synthetic_jwt()
        transport = unittest.mock.Mock(side_effect=[p.CapabilityResponse(200, {'value': jwt}),
                                                    p.CapabilityResponse(200, {'token': 'pypi-synthetic-secret'})])
        result = p.capability_exchange(self.capability_context(), transport)
        self.assertEqual(result['status'], 'EXCHANGE_SUCCESS', result)
        self.assertEqual(result['accessProjectAuthorization'], 'UNVERIFIED')
        self.assertEqual(transport.call_count, 2)
        self.assertEqual(transport.call_args_list[1].args[0].full_url, 'https://pypi.org/_/oidc/mint-token')
        self.assertNotIn(jwt, json.dumps(result))

    def test_immutable_identity_mutations_refuse_before_pypi(self):
        sub = 'repo:DocumentDrivenDX@273466046/umf@1382276802:environment:pypi'
        cases = [
            ('wrong-repository-id', {'repository_id': '1382276803'}),
            ('wrong-owner-id', {'repository_owner_id': '273466047'}),
            ('numeric-repository-id', {'repository_id': 1382276802}),
            ('numeric-owner-id', {'repository_owner_id': 273466046}),
            ('null-repository-id', {'repository_id': None}),
            ('legacy-subject', {'sub': 'repo:DocumentDrivenDX/umf:environment:pypi'}),
            ('subject-prefix', {'sub': 'extra:' + sub}),
            ('subject-suffix', {'sub': sub + ':extra'}),
            ('owner-name-substitution', {'sub': sub.replace('DocumentDrivenDX@', 'OtherOwner@')}),
            ('repository-name-substitution', {'sub': sub.replace('/umf@', '/other@')}),
            ('subject-owner-id', {'sub': sub.replace('@273466046/', '@273466047/')}),
            ('subject-repository-id', {'sub': sub.replace('@1382276802:', '@1382276803:')}),
            ('repository-claim-substitution', {'repository': 'DocumentDrivenDX/other'}),
            ('owner-claim-substitution', {'repository': 'OtherOwner/umf'}),
            ('subject-environment', {'sub': sub.replace(':environment:pypi', ':environment:other')}),
            ('workflow-path', {'workflow_ref': p.REPOSITORY + '/.github/workflows/other.yml@refs/heads/main'}),
            ('workflow-branch', {'workflow_ref': self.capability_context()['GITHUB_WORKFLOW_REF'].replace('heads/main', 'heads/other')}),
            ('branch', {'ref': 'refs/heads/other'}),
            ('audience', {'aud': 'testpypi'}),
        ]
        cases += [('missing-' + key, {'omit': (key,)}) for key in (
            'repository_id', 'repository_owner_id', 'sub', 'repository', 'ref', 'workflow_ref', 'aud')]
        for name, changes in cases:
            jwt = self.synthetic_jwt(**changes)
            transport = unittest.mock.Mock(return_value=p.CapabilityResponse(200, {'value': jwt}))
            result = p.capability_exchange(self.capability_context(), transport)
            with self.subTest(name=name):
                self.assertEqual(result['status'], 'EXCHANGE_FAILED')
                self.assertEqual(result['operation'], 'github.claims.validate')
                self.assertEqual(result['reasonCode'], 'oidc_claim_mismatch')
                self.assertEqual(result['httpStatus'], 200)
                self.assertEqual(transport.call_count, 1, 'Mismatch must prevent PyPI contact')
                self.assertEqual(result['accessProjectAuthorization'], 'UNVERIFIED')
                self.assertNotIn(jwt, json.dumps(result))
                self.assertIn(result['diagnostics']['actualType'], ('str', 'int', 'NoneType'))

    def test_exchange_success_is_not_project_authorization_or_qualification(self):
        jwt, credential = self.synthetic_jwt(), 'pypi-synthetic-minted-secret'
        transport = unittest.mock.Mock(side_effect=[{'value': jwt}, {'token': credential}])
        result = p.capability_exchange(self.capability_context(), transport)
        self.assertEqual(result['status'], 'EXCHANGE_SUCCESS')
        self.assertEqual(result['accessProjectAuthorization'], 'UNVERIFIED')
        self.assertNotIn('qualification', result)
        rendered = json.dumps(result)
        for secret in (jwt, credential, 'synthetic-request-secret'):
            self.assertNotIn(secret, rendered)
        requests = [c.args[0] for c in transport.call_args_list]
        self.assertEqual(len(requests), 2)
        self.assertTrue(requests[0].full_url.endswith('&audience=pypi'))
        self.assertEqual(requests[1].full_url, 'https://pypi.org/_/oidc/mint-token')
        self.assertEqual(requests[1].method, 'POST')
        self.assertEqual(json.loads(requests[1].data), {'token': jwt})

    def test_capability_default_off_or_wrong_context_never_requests_token(self):
        for key, bad in (('ACCESS_CAPABILITY_ONLY', 'false'), ('ACCESS_PUBLISH', 'true'),
                ('GITHUB_REF', 'refs/heads/other'), ('GITHUB_REPOSITORY', 'other/repo'),
                ('GITHUB_WORKFLOW_REF', 'other.yml'), ('ACCESS_CAPABILITY_ENVIRONMENT', 'other'),
                ('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_ACTIONS', 'false')):
            transport = unittest.mock.Mock()
            result = p.capability_exchange({**self.capability_context(), key: bad}, transport)
            with self.subTest(key=key):
                self.assertEqual(result['status'], 'EXCHANGE_FAILED')
                transport.assert_not_called()

    def test_capability_refuses_credential_redirect_destinations(self):
        for url in ('http://test.actions.githubusercontent.com/token', 'https://evil.example/token',
                'https://test.actions.githubusercontent.com.evil.example/token',
                'https://user@test.actions.githubusercontent.com/token',
                'https://test.actions.githubusercontent.com/token?audience=other'):
            transport = unittest.mock.Mock()
            result = p.capability_exchange({**self.capability_context(), 'ACTIONS_ID_TOKEN_REQUEST_URL': url}, transport)
            with self.subTest(url=url):
                self.assertEqual(result['status'], 'EXCHANGE_FAILED')
                transport.assert_not_called()

    def test_claim_mismatch_refuses_before_pypi_exchange(self):
        for key, wrong in (('sub', 'repo:other/repo:environment:pypi'), ('workflow_ref', 'other.yml'),
                           ('ref', 'refs/heads/other'), ('aud', 'other')):
            transport = unittest.mock.Mock(return_value={'value': self.synthetic_jwt(**{key: wrong})})
            result = p.capability_exchange(self.capability_context(), transport)
            with self.subTest(key=key):
                self.assertEqual(result['status'], 'EXCHANGE_FAILED')
                self.assertEqual(transport.call_count, 1)

    def test_failed_exchange_retains_sanitized_service_reason_without_tokens(self):
        jwt = self.synthetic_jwt()
        details = {'errors': [{'code': 'invalid-publisher', 'description':
            'No matching publisher; token=' + jwt + ' synthetic-request-secret pypi-other-secret'}]}
        transport = unittest.mock.Mock(side_effect=[{'value': jwt}, p.CapabilityServiceFailure(403, details)])
        result = p.capability_exchange(self.capability_context(), transport)
        self.assertEqual((result['status'], result['stage'], result['httpStatus']),
                         ('EXCHANGE_FAILED', 'pypi-exchange', 403))
        rendered = json.dumps(result)
        self.assertIn('invalid-publisher', rendered)
        self.assertIn('No matching publisher', rendered)
        for secret in (jwt, 'synthetic-request-secret', 'pypi-other-secret'):
            self.assertNotIn(secret, rendered)

    def test_transport_exceptions_and_invalid_responses_do_not_leak(self):
        for responses in ([RuntimeError('synthetic-request-secret')],
                          [{'value': self.synthetic_jwt()}, {'token': None}]):
            result = p.capability_exchange(self.capability_context(), unittest.mock.Mock(side_effect=responses))
            self.assertEqual(result['status'], 'EXCHANGE_FAILED')
            self.assertNotIn('synthetic-request-secret', json.dumps(result))

    def test_dns_transport_failure_has_specific_nonsecret_diagnostic(self):
        transport = unittest.mock.Mock(side_effect=p.urllib.error.URLError(
            socket.gaierror(socket.EAI_NONAME, 'synthetic-request-secret')))
        result = p.capability_exchange(self.capability_context(), transport)
        self.assertEqual(result['reasonCode'], 'dns_resolution_failed')
        self.assertEqual(result['operation'], 'github.request')
        self.assertIsNone(result['httpStatus'])
        self.assertNotIn('synthetic-request-secret', json.dumps(result))

    def test_tls_and_timeout_failures_are_distinct_without_exception_text(self):
        for error, code in ((ssl.SSLCertVerificationError(1, 'synthetic-request-secret'), 'tls_certificate_verification_failed'),
                            (TimeoutError('synthetic-request-secret'), 'request_timeout')):
            result = p.capability_exchange(self.capability_context(), unittest.mock.Mock(
                side_effect=p.urllib.error.URLError(error)))
            with self.subTest(code=code):
                self.assertEqual(result['reasonCode'], code)
                self.assertNotIn('synthetic-request-secret', json.dumps(result))

    def test_claim_validation_identifies_field_and_response_http_status(self):
        transport = unittest.mock.Mock(return_value=p.CapabilityResponse(200, {'value': self.synthetic_jwt(aud='other')}))
        result = p.capability_exchange(self.capability_context(), transport)
        self.assertEqual(result['reasonCode'], 'oidc_claim_mismatch')
        self.assertEqual(result['operation'], 'github.claims.validate')
        self.assertEqual(result['diagnostics']['field'], 'aud')
        self.assertEqual(result['httpStatus'], 200)
        self.assertEqual(transport.call_count, 1)

    def test_invalid_service_json_retains_status_without_raw_response(self):
        opener = unittest.mock.MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 200
        response.read.return_value = b'raw-response-must-not-appear synthetic-request-secret'
        with patch.object(p.urllib.request, 'build_opener', return_value=opener):
            result = p.capability_exchange(self.capability_context())
        self.assertEqual(result['reasonCode'], 'service_json_invalid')
        self.assertEqual(result['httpStatus'], 200)
        self.assertNotIn('raw-response-must-not-appear', json.dumps(result))

    def test_http_body_read_timeout_retains_received_status(self):
        opener = unittest.mock.MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.status = 200
        response.read.side_effect = TimeoutError('synthetic-request-secret')
        with patch.object(p.urllib.request, 'build_opener', return_value=opener):
            result = p.capability_exchange(self.capability_context())
        self.assertEqual(result['reasonCode'], 'request_timeout')
        self.assertEqual(result['httpStatus'], 200)
        self.assertNotIn('synthetic-request-secret', json.dumps(result))

    def test_github_http_error_preserves_sanitized_message_and_status(self):
        body = json.dumps({'message': 'OIDC denied synthetic-request-secret token=pypi-other-secret'}).encode()
        opener = unittest.mock.Mock()
        opener.open.side_effect = p.urllib.error.HTTPError('https://test.actions.githubusercontent.com/idtoken', 403,
            'synthetic-request-secret', {}, io.BytesIO(body))
        with patch.object(p.urllib.request, 'build_opener', return_value=opener):
            result = p.capability_exchange(self.capability_context())
        self.assertEqual(result['reasonCode'], 'http_service_rejected')
        self.assertEqual(result['httpStatus'], 403)
        self.assertIn('OIDC denied', json.dumps(result))
        for secret in ('synthetic-request-secret', 'pypi-other-secret'):
            self.assertNotIn(secret, json.dumps(result))

    def test_failed_observation_file_contains_only_sanitized_diagnostic(self):
        path = self.assets / 'safe-observation.json'
        transport = unittest.mock.Mock(side_effect=p.urllib.error.URLError(TimeoutError('synthetic-request-secret')))
        with patch.object(sys, 'argv', ['controller', 'capability-only', '--observation', str(path)]), \
                patch.dict(p.os.environ, {**self.capability_context(),
                    'GITHUB_WORKFLOW_SHA': 'a' * 40, 'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}, clear=True), \
                patch.object(p, '_capability_request', transport), redirect_stdout(io.StringIO()):
            self.assertEqual(p.main(), 1)
        result = json.loads(path.read_text())
        self.assertEqual(result['reasonCode'], 'request_timeout')
        self.assertEqual(result['status'], 'EXCHANGE_FAILED')
        self.assertEqual(result['accessProjectAuthorization'], 'UNVERIFIED')
        self.assertEqual((result['workflowSHA'], result['runID'], result['runAttempt']), ('a' * 40, '123', '1'))
        self.assertNotIn('synthetic-request-secret', path.read_text())

    def test_exchange_observation_cannot_be_relabelled_as_scoped_proof(self):
        value = self.fixture()
        observation = p.capability_exchange(self.capability_context(), unittest.mock.Mock(
            side_effect=[{'value': self.synthetic_jwt()}, {'token': 'pypi-synthetic-secret'}]))
        value['publisher']['proof'] = self.reference('exchange.json', observation, {'/status': 'EXCHANGE_SUCCESS'})
        with self.assertRaises(p.AccessReleaseError):
            self.admit(value)

    def test_capability_cli_has_no_package_file_or_release_operations(self):
        transport = unittest.mock.Mock(side_effect=[{'value': self.synthetic_jwt()}, {'token': 'pypi-synthetic-secret'}])
        with patch.object(sys, 'argv', ['controller', 'capability-only']), \
                patch.dict(p.os.environ, self.capability_context(), clear=True), \
                patch.object(p, '_capability_request', transport), \
                patch.object(p, 'verify_packet') as verify, patch.object(p, 'stage_github') as upload, \
                patch.object(p.subprocess, 'check_output') as git, patch.object(Path, 'write_text') as write, \
                redirect_stdout(io.StringIO()) as output:
            self.assertEqual(p.main(), 0)
        for operation in (verify, upload, git, write):
            operation.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['status'], 'EXCHANGE_SUCCESS')
        self.assertNotIn('pypi-synthetic-secret', output.getvalue())

    def test_capability_cli_rejects_package_or_upload_arguments(self):
        for extra in (['--upload'], ['--assets-dir', str(self.assets)], ['--output-dir', str(self.assets)], ['--wait']):
            with patch.object(sys, 'argv', ['controller', 'capability-only', *extra]), \
                    patch.object(p, 'capability_exchange') as exchange:
                with self.assertRaises(p.AccessReleaseError):
                    p.main()
                exchange.assert_not_called()

    def test_package_cli_still_requires_immutable_inputs(self):
        with patch.object(sys, 'argv', ['controller', 'verify']), patch.object(p, 'capability_exchange') as exchange:
            with self.assertRaises(p.AccessReleaseError):
                p.main()
            exchange.assert_not_called()

    def test_checksum_roster_must_retain_all_actual_proofs(self):
        self.check_packet_roster(unverified=False)

    def test_null_proof_packet_needs_no_capability_asset_and_reports_unverified(self):
        self.check_packet_roster(unverified=True)

    def check_packet_roster(self, *, unverified):
        files = {name: p.digest(b'synthetic archive') for name in p.FILES}
        with patch.object(p, 'FILES', files), patch.object(p, 'archive_metadata'):
            value = self.fixture()
            if unverified:
                (self.assets / value['publisher']['proof']['file']).unlink()
                value['publisher']['proof'] = None
            for name in files:
                (self.assets / name).write_bytes(b'synthetic archive')
            q = value['qualification']
            pins = {'tag': p.TAG, 'commit': p.SOURCE, 'sourceTree': p.TREE,
                    'distribution': p.DISTRIBUTION, 'version': p.VERSION, 'files': files,
                    'requires': 'umf-core==0.10.8', 'resources': p.RESOURCE_IDENTITIES,
                    'qualification': {k: q[k] for k in ('file', 'sha256')}}
            (self.assets / 'release-pins.json').write_text(json.dumps(pins))
            roster = {f.name: p.digest(f.read_bytes()) for f in self.assets.iterdir()}
            raw = json.dumps(value).encode()
            def verify(sums):
                data = ''.join(h + '  ' + n + '\n' for n, h in sorted(sums.items())).encode()
                (self.assets / 'SHA256SUMS').write_bytes(data)
                return p.verify_packet(assets=self.assets, admission_raw=raw,
                    admission_sha256=p.digest(raw), sums_sha256=p.digest(data), tag=p.TAG, source_sha=p.SOURCE)
            receipt = verify(roster)
            self.assertEqual(receipt['files'], files)
            self.assertEqual(receipt['publisherProof'], 'UNVERIFIED' if unverified else 'provided_scoped_proof')
            missing = dict(roster)
            del missing[value['gates']['access-linux-installed']['file']]
            with self.assertRaisesRegex(p.AccessReleaseError, 'roster differs'):
                verify(missing)
            extra = {**roster, 'unreviewed.json': '0' * 64}
            with self.assertRaisesRegex(p.AccessReleaseError, 'roster differs'):
                verify(extra)

    def test_wheel_kind_and_original_runtime_source_are_checked(self):
        version, types = b'synthetic version source', b'synthetic runtime identity'
        root = 'umf_access-' + p.VERSION + '.dist-info/'
        raw = ('Name: umf_access\nVersion: 0.1.0.dev10\nRequires-Python: >=3.11,<3.15\n' +
               ''.join('Requires-Dist: ' + r + '\n' for r in p.REQUIREMENTS)).encode()
        members = {'umf_access/_version.py': version, 'umf_access/types.py': types,
                   root + 'METADATA': raw,
                   root + 'WHEEL': b'Root-Is-Purelib: true\nTag: py3-none-any\n'}
        with patch.object(p, 'VERSION_MEMBER_SHA', p.digest(version)), patch.object(p, 'TYPES_MEMBER_SHA', p.digest(types)):
            p._archive_members(list(members), members.__getitem__, True)
            for field, replacement in ((root + 'WHEEL', b'Root-Is-Purelib: false\nTag: cp311-cp311-linux_x86_64\n'),
                                       ('umf_access/types.py', b'unreviewed identity')):
                changed = {**members, field: replacement}
                with self.subTest(field=field), self.assertRaises(p.AccessReleaseError):
                    p._archive_members(list(changed), changed.__getitem__, True)


if __name__ == '__main__':
    unittest.main()
