#!/usr/bin/env python3
"""Small guest bridge for the reviewed standalone G03-N12 local run."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

HARNESS = Path('/harness')
FIXTURE_OUTPUT = Path('/out/g03-defaults-native-fixture.json')
ADMISSION_OUTPUT = Path('/out/source-admission.json')
FIXTURE_INPUT = Path('/setup/g03-defaults-native-fixture.json')
ADMISSION_INPUT = Path('/setup/source-admission.json')
EXPECTED_OUTPUT = Path('/out/expected-run.json')
EXPECTED_INPUT = Path('/prepare/expected-run.json')
RESULT = Path('/out/n12-run-result.json')
RAW_CASE = Path('/out/raw-run-chain-report.json')
SOURCE_MANIFEST_SHA = 'b4638f49cb01602f932316d271f8575e862d769cbed202b4ac4d9a35230ea27d'
PROFILE = 'umf.g03-reviewed-harness-source-subset/2'
LIFECYCLE = HARNESS / 'tests/lifecycle'


def installed_identity(snapshot: dict) -> dict:
    """Compare stable installed bytes/runtime, keeping loaded-module observations separate."""
    return {'packages': snapshot.get('packages'), 'python': snapshot.get('python')}


def digest(path: Path, cap: int) -> tuple[str, int]:
    info = path.lstat()
    if path.is_symlink() or not path.is_file() or info.st_size > cap:
        raise RuntimeError(f'unsafe or oversized input: {path}')
    body = path.read_bytes()
    if len(body) != info.st_size or len(body) > cap:
        raise RuntimeError(f'input changed or exceeded cap: {path}')
    return hashlib.sha256(body).hexdigest(), len(body)


def durable_json(path: Path, value: object, cap: int = 2 * 1024 * 1024) -> None:
    raw = (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    if len(raw) > cap:
        raise RuntimeError(f'JSON output exceeds cap: {path.name}')
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def load_sources(fixture_path: Path):
    manifest_path = HARNESS / 'manifest.json'
    actual_manifest_sha, _ = digest(manifest_path, 16 * 1024)
    if actual_manifest_sha != SOURCE_MANIFEST_SHA:
        raise RuntimeError('reviewed harness subset manifest digest mismatch')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('profile') != PROFILE or manifest.get('status') != 'SOURCE_ACCEPTED_NOT_EXECUTED':
        raise RuntimeError('source subset profile/status differs')
    for row in manifest.get('files', []):
        rel = row.get('path')
        if not isinstance(rel, str) or rel.startswith('/') or '..' in Path(rel).parts:
            raise RuntimeError('source subset path is not relative and closed')
        actual_sha, actual_size = digest(HARNESS / rel, 2 * 1024 * 1024)
        if (actual_sha, actual_size) != (row.get('sha256'), row.get('sizeBytes')):
            raise RuntimeError(f'source subset bytes differ: {rel}')
    sys.path.insert(0, str(LIFECYCLE))
    runner_path = LIFECYCLE / 'g03-defaults-native.py'
    spec = importlib.util.spec_from_file_location('g03_defaults_native_runner', runner_path)
    if spec is None or spec.loader is None:
        raise RuntimeError('cannot load source-pinned G03 runner')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    fixture_sha, fixture_size = digest(fixture_path, 2 * 1024 * 1024)
    fixture = json.loads(fixture_path.read_text(encoding='utf-8'))
    if fixture.get('version') != 'umf.praxis.g03-defaults-native-fixture/1':
        raise RuntimeError('fixture profile differs')
    return manifest, actual_manifest_sha, runner, fixture, fixture_sha, fixture_size


def campaign_binding(runner, fixture, campaign_id: str):
    if str(UUID(campaign_id)) != campaign_id:
        raise RuntimeError('campaign id must be canonical UUID')
    rows = runner.campaign_case_bindings(campaign_id, fixture)
    expected_scenarios = {scenario for entry in runner.CAMPAIGN_ROSTER
                          for scenario in entry['scenarios'] if scenario != 'campaign-cleanup'}
    if (len(runner.CAMPAIGN_ROSTER) != 14 or set(rows) != expected_scenarios
            or len(rows) != 19 or 'ordinary' not in rows):
        raise RuntimeError('derived bindings do not match the fixed 14-case/19-scenario roster')
    return rows['ordinary']


def source_preflight(args) -> None:
    source_manifest, manifest_sha, runner, fixture, fixture_sha, fixture_size = load_sources(FIXTURE_OUTPUT)
    campaign_id = args.campaign_id
    binding = campaign_binding(runner, fixture, campaign_id)
    configuration = dict(fixture['configuration'])
    configuration.update(schema=binding['schema'], ownerRole=binding['roleNames'][0],
                         personRole=binding['roleNames'][1], batchRole=binding['roleNames'][2])
    logical_configuration = dict(configuration, schema=binding['logicalSchema'],
        ownerRole=binding['logicalRoleNames'][0], personRole=binding['logicalRoleNames'][1],
        batchRole=binding['logicalRoleNames'][2])
    from g03_ordinary_native import preflight_ordinary_source_admission
    admission = preflight_ordinary_source_admission(fixture, configuration, logical_configuration)
    expected = [
        ('native-only', 'weft.table-operation-module/0.1', 'admitted-all-ordinary-operations-and-query'),
        ('native-only', 'weft.table-operation-module/0.2', 'admitted-all-ordinary-operations-and-query'),
        ('logical-matching', 'weft.table-operation-module/0.1', 'expected-source-admission-refusal'),
        ('logical-matching', 'weft.table-operation-module/0.2', 'admitted-all-ordinary-operations-and-query'),
    ]
    actual = [(row.get('family'), row.get('profile'), row.get('disposition'))
              for row in admission.get('receipts', [])]
    native_config_sha = hashlib.sha256(runner.canonical(configuration)).hexdigest()
    logical_config_sha = hashlib.sha256(runner.canonical(logical_configuration)).hexdigest()
    expected_config_shas = {
        ('native-only', 'weft.table-operation-module/0.1'): native_config_sha,
        ('native-only', 'weft.table-operation-module/0.2'): native_config_sha,
        ('logical-matching', 'weft.table-operation-module/0.1'): logical_config_sha,
        ('logical-matching', 'weft.table-operation-module/0.2'): logical_config_sha,
    }
    actual_config_shas = {(row.get('family'), row.get('profile')): row.get('configurationSha256')
                          for row in admission.get('receipts', [])}
    if (admission.get('status') != 'PASS_SOURCE_ADMISSION_BEFORE_TARGET_RESOURCES'
            or admission.get('databaseLeases') != 0 or admission.get('businessEffects') != 0
            or actual != expected or len(admission.get('receipts', [])) != 4
            or actual_config_shas != expected_config_shas
            or binding.get('logicalConfigurationSha256') != logical_config_sha):
        raise RuntimeError('installed Weft source admission did not match the exact N12 profile matrix')
    record = {'profile': 'umf.g03-n12-installed-source-preflight/1',
        'status': admission['status'], 'sourceManifestSha256': manifest_sha,
        'fixtureSha256': fixture_sha, 'fixtureSizeBytes': fixture_size,
        'campaignId': campaign_id, 'resourceBinding': binding,
        'sourceAdmission': admission, 'targetConnections': 0, 'targetResourcesCreated': False,
        'installedCohort': runner.installed_cohort_snapshot()}
    durable_json(ADMISSION_OUTPUT, record)


def prepare_target(args) -> None:
    source_manifest, manifest_sha, runner, fixture, fixture_sha, fixture_size = load_sources(FIXTURE_INPUT)
    installed_current = runner.installed_cohort_snapshot()
    campaign_id = args.campaign_id
    admission = json.loads(ADMISSION_INPUT.read_text(encoding='utf-8'))
    if (admission.get('status') != 'PASS_SOURCE_ADMISSION_BEFORE_TARGET_RESOURCES'
            or admission.get('targetConnections') != 0
            or admission.get('targetResourcesCreated') is not False
            or admission.get('campaignId') != campaign_id
            or admission.get('sourceManifestSha256') != manifest_sha
            or admission.get('fixtureSha256') != fixture_sha
            or installed_identity(admission.get('installedCohort', {})) != installed_identity(installed_current)):
        raise RuntimeError('successful same-source admission receipt is required before target observation')
    import psycopg
    binding = campaign_binding(runner, fixture, campaign_id)
    configuration = dict(fixture['configuration'])
    configuration.update(schema=binding['schema'], ownerRole=binding['roleNames'][0],
                         personRole=binding['roleNames'][1], batchRole=binding['roleNames'][2])
    target_dsn = os.environ['N12_DSN']
    with psycopg.connect(target_dsn, autocommit=True, connect_timeout=5) as connection:
        connection.execute("SET statement_timeout='5s'")
        connection.execute("SET lock_timeout='5s'")
        connection.execute('SET default_transaction_read_only=on')
        target = runner.observe_campaign_target(connection)
        if 'PostgreSQL 18.6' not in target['serverVersion'] or target['observerSuperuser'] is not True:
            raise RuntimeError('fresh owned target is not exact privileged PostgreSQL 18.6')
        server_version_num = connection.execute(
            "SELECT pg_catalog.current_setting('server_version_num')").fetchone()[0]
        if server_version_num != '180006':
            raise RuntimeError('fresh owned target server_version_num differs from 180006')
        collision = connection.execute(
            'SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname=%s), '
            'EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=ANY(%s))',
            (binding['database'], binding['allOwnedRoleNames'])).fetchone()
        if collision != (False, False):
            raise RuntimeError('predeclared N12 resource identity is occupied before child')
    expected = {'profile': 'umf.g03-n12-expected-run/1', 'status': 'FROZEN_BEFORE_NATIVE_CHILD',
        'campaignId': campaign_id, 'sourceManifestSha256': manifest_sha,
        'fixtureSha256': fixture_sha, 'fixtureSizeBytes': fixture_size,
        'runnerSha256': hashlib.sha256((LIFECYCLE / 'g03-defaults-native.py').read_bytes()).hexdigest(),
        'helperSha256': hashlib.sha256((LIFECYCLE / 'g03_ordinary_native.py').read_bytes()).hexdigest(),
        'predicateSha256': hashlib.sha256((LIFECYCLE / 'g03_campaign_predicates.py').read_bytes()).hexdigest(),
        'configurationSha256': hashlib.sha256(runner.canonical(configuration)).hexdigest(),
        'resourceBinding': binding, 'targetBefore': target,
        'postgresImageId': os.environ['N12_POSTGRES_IMAGE_ID'],
        'postgresServerVersionNum': server_version_num,
        'resourceAbsenceBefore': {'databaseAbsent': True, 'allEightRolesAbsent': True},
        'installedCohort': installed_current,
        'n12Command': 'g03_defaults_native_runner.run_chain(scenario=ordinary, campaign_id=<frozen UUID>)'}
    durable_json(EXPECTED_OUTPUT, expected)


def execute(args) -> None:
    source_manifest, manifest_sha, runner, fixture, fixture_sha, fixture_size = load_sources(FIXTURE_INPUT)
    installed_before = runner.installed_cohort_snapshot()
    expected = json.loads(EXPECTED_INPUT.read_text(encoding='utf-8'))
    campaign_id = args.campaign_id
    if (expected.get('status') != 'FROZEN_BEFORE_NATIVE_CHILD'
            or expected.get('campaignId') != campaign_id
            or expected.get('sourceManifestSha256') != manifest_sha
            or expected.get('fixtureSha256') != fixture_sha
            or installed_identity(expected.get('installedCohort', {})) != installed_identity(installed_before)):
        raise RuntimeError('expected N12 pre-child manifest does not bind current sources and fixture')
    from g03_campaign_predicates import _scenario_predicate
    case = runner.run_chain(SimpleNamespace(dsn=os.environ['N12_DSN'], scenario='ordinary'),
                            fixture, 'ordinary', campaign_id)
    durable_json(RAW_CASE, case, 8 * 1024 * 1024)
    installed_after = runner.installed_cohort_snapshot()
    current_target = None
    absence = {'databaseAbsent': False, 'allEightRolesAbsent': False}
    import psycopg
    with psycopg.connect(os.environ['N12_DSN'], autocommit=True, connect_timeout=5) as connection:
        connection.execute("SET statement_timeout='5s'")
        connection.execute("SET lock_timeout='5s'")
        connection.execute('SET default_transaction_read_only=on')
        current_target = runner.observe_campaign_target(connection)
        checks = connection.execute(
            'SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname=%s), '
            'NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=ANY(%s))',
            (expected['resourceBinding']['database'], expected['resourceBinding']['allOwnedRoleNames'])).fetchone()
        absence = {'databaseAbsent': checks[0], 'allEightRolesAbsent': checks[1]}
    binding = expected['resourceBinding']
    actual_binding = {'database': case.get('database'), 'schema': case.get('schema'),
        'roleNames': case.get('roleNames'), 'configurationSha256': case.get('configurationSha256'),
        'logicalRoleNames': case.get('logicalRoleNames'), 'allOwnedRoleNames': case.get('allOwnedRoleNames')}
    ordinary = case.get('ordinaryN12', {})
    schemas = ordinary.get('schemasCovered', [])
    actual_binding.update(logicalSchema=schemas[1] if len(schemas) == 2 else None,
                          logicalConfigurationSha256=ordinary.get('logicalConfigurationSha256'))
    missing = _scenario_predicate('G03-N12', 'ordinary', case)
    if actual_binding != binding:
        missing.append('predeclared-resource-binding-match')
    if case.get('targetIdentity') != expected.get('targetBefore') or current_target != expected.get('targetBefore'):
        missing.append('exact-target-identity-preserved')
    if absence != {'databaseAbsent': True, 'allEightRolesAbsent': True}:
        missing.append('independent-post-cleanup-resource-absence')
    if installed_identity(installed_after) != installed_identity(expected.get('installedCohort', {})):
        missing.append('installed-cohort-identity-preserved')
    status = 'PASS_LOCAL_N12_STANDALONE' if not missing and case.get('status') == 'PASS' else 'FAIL_OR_UNKNOWN'
    result = {'profile': 'umf.g03-n12-standalone-result/1', 'status': status,
        'executionKind': 'local_linux_diagnostic', 'hostedQualificationClaim': False,
        'runnerCall': 'g03_defaults_native_runner.run_chain(scenario=ordinary, campaign_id=<frozen UUID>)',
        'expectedManifest': str(EXPECTED_INPUT), 'expectedManifestSha256': hashlib.sha256(EXPECTED_INPUT.read_bytes()).hexdigest(),
        'sourceAdmissionReceipt': str(ADMISSION_INPUT), 'sourceAdmissionReceiptSha256': hashlib.sha256(ADMISSION_INPUT.read_bytes()).hexdigest(),
        'sourceManifestSha256': manifest_sha, 'fixtureSha256': fixture_sha,
        'installedCohortBeforeChild': expected.get('installedCohort'),
        'installedCohortAfterChild': installed_after,
        'rawRunChainReportPath': str(RAW_CASE),
        'rawRunChainReportSha256': hashlib.sha256(RAW_CASE.read_bytes()).hexdigest(),
        'targetAfter': current_target, 'resourceAbsenceAfter': absence,
        'actualResourceBinding': actual_binding, 'missingRequirements': missing,
        'nativeQualificationClaim': False}
    durable_json(RESULT, result, 8 * 1024 * 1024)
    if status != 'PASS_LOCAL_N12_STANDALONE':
        raise SystemExit(2)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('preflight', 'prepare-target', 'execute'))
    parser.add_argument('--campaign-id', required=True)
    args = parser.parse_args()
    try:
        {'preflight': source_preflight, 'prepare-target': prepare_target, 'execute': execute}[args.mode](args)
    except Exception as error:
        failure = Path('/out') / f'{args.mode}-failure.json'
        if not RESULT.exists() and not failure.exists():
            durable_json(failure, {'profile': 'umf.g03-n12-guest-failure/1',
                'status': 'FAIL_OR_UNKNOWN', 'mode': args.mode,
                'errorType': type(error).__name__, 'error': str(error)[:512]})
        raise
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
