#!/usr/bin/env python3
"""Bounded local-only adapter for the held SDK 0.5.7 public-H proof.

This reads a separately prepared local input manifest and refuses any HELD
identity before invoking the producer source, Bun, or the Python consumer.
It never manufactures GitHub Actions run IDs or a hosted qualification result.
"""
from __future__ import annotations

import datetime
import gzip
import hashlib
import uuid
import importlib.util
import json
import math
import os
import pathlib
import platform
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request

PROFILE = 'umf.sdk-057-public-install-proof-local-inputs/1'
EVIDENCE_PROFILE = 'umf.sdk-057-public-install-proof-local/1'
REPOSITORY = 'DocumentDrivenDX/umf'
HOSTED_WORKFLOW_SHA256 = '32d4b1361c7c3911f8b7f8f58964ec87c5bf60527e27efb6da2fe4f3fc53ef91'
RUNTIME_IMAGE_DIGEST = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
SDK_BUILDER_IMAGE_DIGEST = 'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
EXPECTED_COMMANDS = [
    'toolchain-identity', 'verify-source-tag-and-tree',
    'acquire-and-verify-public-and-qualified-archives',
    'bun-install-locked-source-dependencies', 'sdk-public-install-consumer-smoke',
    'python-public-install-and-migration-smoke', 'verify-final-probe-fields',
]
LIMITS = {
    'aggregateSeconds': 1800, 'childSeconds': 180, 'termGraceSeconds': 10,
    'evidenceReserveSeconds': 60, 'aggregateLogBytes': 1048576,
    'metadataArtifactBytes': 16777216,
}
LOCAL_D5_PROFILE = 'LOCAL_EMULATED_3600'
LOCAL_D5_PROFILE_FIELDS = {
    'aggregateSeconds': 3600,
    'cases': 37,
    'childLimit': 180,
    'childRawLogReservationBytes': 786432,
    'childSeconds': 180,
    'evidenceBytes': 16777216,
    'evidenceReserveSeconds': 60,
    'executionKind': 'local_linux_diagnostic',
    'faultScenarios': 3,
    'hostedQualificationClaim': False,
    'killGraceSeconds': 10,
    'noDefaultChecks': 19,
    'oracleGroups': 16,
    'orderedCommands': 30,
    'outerRawLogReservationBytes': 262144,
    'payloadBytes': 2097152,
    'previousLocal1800Status': 'FAIL_OR_UNKNOWN; remains unqualified',
    'productApiBudgetChanged': False,
    'profile': LOCAL_D5_PROFILE,
    'rawLogBytes': 1048576,
    'selectedMetadataBytes': 16777216,
    'sourceWorkflowStepsUnchanged': True,
    'workSeconds': 3530,
}
D5_PROFILE_EVIDENCE_FIELDS = {
    'profileName', 'root', 'roots', 'profilePath', 'profileSha256',
    'operatorManifestPath', 'operatorManifestSha256',
    'outerCapturePath', 'outerCaptureSha256',
    'selectedEvidenceReceiptPath', 'selectedEvidenceReceiptSha256',
}
D5_OPERATOR_FILES = {
    'run-d5-docker.sh', 'capture_docker.py', 'close_selected_evidence.py',
    'prepare.py', 'adapt_local_identity.py', 'local-adapter-manifest.json',
    'prepared-route.json', 'resource-profile.json',
    'steps/initialize.sh', 'steps/replay.sh', 'steps/finalize.sh',
    'steps/initialize.local.sh', 'steps/replay.local.sh', 'steps/finalize.local.sh',
}
D5_ATTESTATION_FILES = {'README.md', 'DECISION.md', 'unified.diff', 'frozen-source-hashes.json'}
D5_SELECTED_OUTPUT_FILES = {
    'output/outer-capture.json', 'output/outer.stdout.log', 'output/outer.stderr.log',
}
D5_UPLOAD_ROOT_FILES = {
    'qualification-inputs.json', 'owner-artifacts.json', 'command-records.jsonl',
    'execution-complete.json', 'cohort.lock.json', 'mirror-manifest.json',
    'installed-versions.json', 'd5-receipt.json',
}
D5_REPORT_FILES = {
    'resource-baseline.json', 'resource-final.json', 'no-default.json',
    *{f'oracle-{name}.json' for name in (
        'date', 'integer', 'decimal', 'text', 'eq-null', 'ne-null', 'not-eq-value',
        'not-ne-null', 'coalesce-empty', 'enum', 'unique', 'foreign-key',
        'varchar-loss', 'bound-excess', 'empty-table', 'all-populated')},
    *{f'fault-{name}.json' for name in (
        'fenced-resume', 'backfill-commit-lost', 'existing-target-commit-lost')},
}
D5_REPLAY_FILES = {
    'archive.tar.gz', 'fixture.json.gz', 'g01/fixture.json.gz',
    'oracle-successor.py.gz', 'oracle-successor.patch', 'oracle-successor-custody.json',
    'no-default-metadata-successor.py.gz', 'no-default-metadata-successor.patch',
    'metadata-oracle-successor.py.gz', 'metadata-oracle-successor.patch',
    'metadata-successor-custody.json',
    'candidate-009/fault-fixture.json', 'candidate-009/fault-runner.py',
    'candidate-009/installed-text-oracle.py', 'candidate-009/no-default-fixture.json',
    'candidate-009/no-default-runner.py',
    'candidate-009/installed-text-oracle-d5-row-observation-successor.py',
    'candidate-009/installed-text-oracle-d5-weft55-metadata-successor.py',
    'candidate-009/no-default-runner-d5-weft55-metadata-successor.py',
}
SDK_HARNESS_FILES = (
    'inside-sdk-producer.py', 'capture-bounded-log.py',
    'run-local-sdk.sh', 'write-launch-failure.py',
)


def fail(message: str) -> None:
    raise ValueError(message)


def sha_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def sdk_harness_sha256(directory: pathlib.Path) -> str:
    """Match the producer's fixed `shasum -a 256 FILES | shasum -a 256` identity."""
    lines = []
    for name in SDK_HARNESS_FILES:
        path = directory / name
        if path.is_symlink() or not path.is_file():
            fail(f'SDK producer harness member is missing or unsafe: {name}')
        lines.append(f'{sha_file(path)}  {name}\n')
    return hashlib.sha256(''.join(lines).encode('ascii')).hexdigest()


def json_file(path: pathlib.Path, max_bytes: int = 16 * 1024 * 1024) -> dict:
    if path.is_symlink() or not path.is_file():
        fail(f'Expected regular non-symlink JSON file: {path.name}')
    size = path.stat().st_size
    if size > max_bytes:
        fail(f'JSON file exceeds its fixed metadata bound: {path.name}')
    value = json.loads(path.read_text(encoding='utf-8'))
    if type(value) is not dict:
        fail(f'JSON root is not an object: {path.name}')
    return value


def no_held(value, prefix='input') -> None:
    if value == 'HELD' or value is None:
        fail(f'{prefix} is still HELD or missing')
    if type(value) is dict:
        for key, child in value.items():
            no_held(child, f'{prefix}.{key}')
    elif type(value) is list:
        for index, child in enumerate(value):
            no_held(child, f'{prefix}[{index}]')


def abs_path(value: object, label: str) -> pathlib.Path:
    if not isinstance(value, str) or not value or '\x00' in value:
        fail(f'{label} path is missing or malformed')
    path = pathlib.Path(value)
    if not path.is_absolute():
        fail(f'{label} path must be absolute')
    return path


def beneath(root: pathlib.Path, relative: object, label: str) -> pathlib.Path:
    if not isinstance(relative, str) or not relative or '\\' in relative:
        fail(f'{label} relative path is malformed')
    pure = pathlib.PurePosixPath(relative)
    if pure.is_absolute() or '..' in pure.parts or '.' in pure.parts:
        fail(f'{label} relative path escapes its evidence root')
    candidate = root.joinpath(*pure.parts)
    resolved_root = root.resolve(strict=True)
    resolved = candidate.resolve(strict=True)
    if resolved != resolved_root and resolved_root not in resolved.parents:
        fail(f'{label} resolves outside its declared root')
    cursor = candidate
    while cursor != root:
        if cursor.is_symlink():
            fail(f'{label} traverses a symlink')
        cursor = cursor.parent
    if candidate.is_symlink():
        fail(f'{label} is a symlink')
    return resolved


def continuation_file(root: pathlib.Path, value: object, label: str) -> pathlib.Path:
    """Resolve a continuation receipt path, which records host-absolute refs, under its declared root."""
    if not isinstance(value, str) or not value or '\x00' in value:
        fail(f'{label} path is malformed')
    candidate = pathlib.Path(value)
    if not candidate.is_absolute():
        return beneath(root, value, label)
    resolved_root = root.resolve(strict=True)
    lexical = pathlib.Path(os.path.normpath(str(candidate)))
    if lexical == resolved_root or resolved_root not in lexical.parents:
        fail(f'{label} does not name a descendant of its declared continuation root')
    cursor = lexical
    while cursor != resolved_root:
        if cursor.is_symlink():
            fail(f'{label} traverses a symlink')
        cursor = cursor.parent
    resolved = candidate.resolve(strict=True)
    if resolved == resolved_root or resolved_root not in resolved.parents:
        fail(f'{label} resolves outside its declared continuation root')
    if not resolved.is_file():
        fail(f'{label} is not a regular file')
    return resolved


def require_digest(value: object, label: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r'[0-9a-f]{64}', value) is None:
        fail(f'{label} must be an exact lowercase SHA-256')
    return value


def require_sha(value: object, label: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r'[0-9a-f]{40}', value) is None:
        fail(f'{label} must be an exact lowercase commit SHA')
    return value


def require_git_object(value: object, label: str) -> str:
    if not isinstance(value, str) or re.fullmatch(r'[0-9a-f]{40}', value) is None:
        fail(f'{label} must be an exact lowercase SHA-1 Git object ID')
    return value


def referenced_json(root: pathlib.Path, relative: object, expected_sha: object, label: str) -> tuple[pathlib.Path, dict]:
    path = beneath(root, relative, label)
    digest = require_digest(expected_sha, f'{label} receipt SHA-256')
    if sha_file(path) != digest:
        fail(f'{label} bytes differ from their explicit input digest')
    return path, json_file(path)


def referenced_local_json(root: pathlib.Path, relative: object, expected_sha: object,
                          label: str, max_bytes: int = 16 * 1024 * 1024) -> tuple[pathlib.Path, dict]:
    """Stat a LOCAL_EMULATED_3600 input before hashing or reading its bytes."""
    path = beneath(root, relative, label)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > max_bytes:
        fail(f'{label} must be a bounded regular non-symlink JSON file')
    digest = require_digest(expected_sha, f'{label} receipt SHA-256')
    if sha_file(path) != digest:
        fail(f'{label} bytes differ from their explicit input digest')
    return path, json_file(path, max_bytes)


def validate_d5_profile_evidence(d5: dict, d5_root: pathlib.Path) -> dict | None:
    """Validate the separately reviewed local 3600-second D5 operator profile."""
    evidence = d5.get('resourceProfileEvidence')
    if evidence is None:
        return None
    if type(evidence) is not dict or set(evidence) != D5_PROFILE_EVIDENCE_FIELDS:
        fail('D5 resource-profile evidence has an unexpected field roster')
    if evidence.get('profileName') != LOCAL_D5_PROFILE:
        fail('D5 resource profile is not the exact LOCAL_EMULATED_3600 profile')
    declared_root = abs_path(evidence.get('root'), 'D5 resource-profile evidence root').resolve(strict=True)
    if declared_root != d5_root.resolve(strict=True):
        fail('D5 resource-profile evidence root differs from the selected D5 root')
    roots_value = evidence.get('roots')
    if type(roots_value) is not dict or set(roots_value) != {'output', 'operator', 'attestation', 'source'}:
        fail('D5 selected-evidence roots do not match the exact closed root roster')
    declared_roots = {}
    for name, value in roots_value.items():
        raw_root = abs_path(value, f'D5 {name} evidence root')
        cursor = raw_root
        while cursor != cursor.parent:
            if cursor.is_symlink():
                fail(f'D5 {name} evidence root traverses a symlink')
            cursor = cursor.parent
        root = raw_root.resolve(strict=True)
        if not root.is_dir():
            fail(f'D5 {name} evidence root must be a regular directory')
        declared_roots[name] = root
    if declared_roots['output'] != d5_root.resolve(strict=True):
        fail('D5 output root differs from the selected D5 root')
    profile_raw = abs_path(evidence.get('profilePath'), 'D5 resource profile')
    operator_raw = abs_path(evidence.get('operatorManifestPath'), 'D5 operator manifest')
    for label, path in (('D5 resource profile', profile_raw), ('D5 operator manifest', operator_raw)):
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 16 * 1024 * 1024:
            fail(f'{label} must be a bounded regular non-symlink file')
    if (profile_raw.name != 'resource-profile.json' or operator_raw.name != 'local-adapter-manifest.json'
            or profile_raw.parent.resolve(strict=True) != operator_raw.parent.resolve(strict=True)):
        fail('D5 profile and operator manifest are not the exact co-located source files')
    if declared_roots['operator'] != operator_raw.parent.resolve(strict=True):
        fail('D5 operator root does not match its pinned profile and manifest directory')
    if declared_roots['attestation'] != declared_roots['operator']:
        fail('D5 attestation root does not match the pinned operator source directory')
    profile_path, profile = profile_raw.resolve(strict=True), json_file(profile_raw, 16 * 1024 * 1024)
    operator_path, operator_manifest = operator_raw.resolve(strict=True), json_file(operator_raw, 16 * 1024 * 1024)
    if sha_file(profile_path) != require_digest(evidence.get('profileSha256'), 'D5 profile SHA-256'):
        fail('D5 resource profile bytes differ from their explicit input digest')
    if sha_file(operator_path) != require_digest(evidence.get('operatorManifestSha256'), 'D5 operator manifest SHA-256'):
        fail('D5 operator manifest bytes differ from their explicit input digest')
    if profile != LOCAL_D5_PROFILE_FIELDS:
        fail('D5 resource-profile values differ from the exact reviewed local profile')
    capture_path, outer_capture = referenced_local_json(
        declared_root, evidence.get('outerCapturePath'), evidence.get('outerCaptureSha256'),
        'D5 outer capture')
    selected_path, selected_receipt = referenced_local_json(
        declared_root, evidence.get('selectedEvidenceReceiptPath'),
        evidence.get('selectedEvidenceReceiptSha256'), 'D5 selected evidence receipt')
    return {
        'root': declared_root,
        'roots': declared_roots,
        'profilePath': profile_path,
        'profile': profile,
        'operatorManifestPath': operator_path,
        'operatorManifest': operator_manifest,
        'outerCapturePath': capture_path,
        'outerCapture': outer_capture,
        'selectedEvidenceReceiptPath': selected_path,
        'selectedEvidenceReceipt': selected_receipt,
    }


def validate_d5_replay_bindings(upload_root: pathlib.Path, owner: dict) -> dict:
    """Bind the selected replay copies to the retained archive and custody records."""
    archive_path = upload_root / 'replay/archive.tar.gz'
    archive_info = archive_path.lstat()
    if not stat.S_ISREG(archive_info.st_mode) or archive_info.st_size > 16 * 1024 * 1024:
        fail('D5 replay archive is not a bounded regular file')
    archive_sha = sha_file(archive_path)
    if archive_sha != owner.get('replayArchiveSha256'):
        fail('D5 replay archive differs from the retained owner identity')

    archive_paths = {
        'candidate-009/owner-artifacts.json': 'candidate-009/owner-artifacts.json',
        'candidate-009/fault-fixture.json': 'candidate-009/fault-fixture.json',
        'candidate-009/fault-runner.py': 'candidate-009/fault-runner.py',
        'candidate-009/installed-text-oracle.py': 'candidate-009/installed-text-oracle.py',
        'candidate-009/no-default-fixture.json': 'candidate-009/no-default-fixture.json',
        'candidate-009/no-default-runner.py': 'candidate-009/no-default-runner.py',
    }
    member_bytes = {}
    try:
        with tarfile.open(archive_path, 'r:gz') as archive:
            wanted = set(archive_paths.values())
            for member in archive.getmembers():
                if member.name not in wanted:
                    continue
                if not member.isfile() or member.name in member_bytes or member.size > 16 * 1024 * 1024:
                    fail('D5 replay archive has an unsafe or duplicate retained member')
                stream = archive.extractfile(member)
                if stream is None:
                    fail('D5 replay archive member has no data stream')
                data = stream.read(member.size + 1)
                if len(data) != member.size:
                    fail('D5 replay archive member size differs from its header')
                member_bytes[member.name] = data
    except (tarfile.TarError, OSError, EOFError) as exc:
        fail(f'D5 replay archive cannot be read as the retained archive: {type(exc).__name__}')
    if set(member_bytes) != set(archive_paths.values()):
        fail('D5 replay archive is missing one of the exact retained original members')
    metadata_custody = json_file(upload_root / 'replay/metadata-successor-custody.json', 128 * 1024)
    if metadata_custody.get('originalArchive', {}).get('sha256') != archive_sha:
        fail('D5 metadata custody does not bind the retained original archive')
    archive_owner_hashes = {
        'candidate-009/owner-artifacts.json': None,
        'candidate-009/fault-fixture.json': None,
        'candidate-009/fault-runner.py': owner.get('faultRunnerSha256'),
        'candidate-009/installed-text-oracle.py': owner.get('oracleSha256'),
        'candidate-009/no-default-fixture.json': None,
        'candidate-009/no-default-runner.py': owner.get('noDefaultOriginalRunnerSha256'),
    }
    original_fixture_hashes = metadata_custody.get('originalFixtureSha256')
    if type(original_fixture_hashes) is not dict:
        fail('D5 replay metadata custody lacks the exact retained fixture hashes')
    archive_owner_hashes['candidate-009/owner-artifacts.json'] = original_fixture_hashes.get('candidate-009/owner-artifacts.json')
    archive_owner_hashes['candidate-009/fault-fixture.json'] = original_fixture_hashes.get('candidate-009/fault-fixture.json')
    archive_owner_hashes['candidate-009/no-default-fixture.json'] = original_fixture_hashes.get('candidate-009/no-default-fixture.json')
    for relative, member_name in archive_paths.items():
        data = member_bytes[member_name]
        expected_sha = archive_owner_hashes[relative]
        if type(expected_sha) is not str or hashlib.sha256(data).hexdigest() != expected_sha:
            fail(f'D5 replay archive original differs from retained custody: {relative}')
        if relative != 'candidate-009/owner-artifacts.json' and (upload_root / 'replay' / relative).read_bytes() != data:
            fail(f'D5 selected original replay file differs from retained archive: {relative}')

    if (owner.get('fixtureSha256') != sha_file(upload_root / 'replay/fixture.json.gz')
            or (upload_root / 'replay/g01/fixture.json.gz').read_bytes()
                != (upload_root / 'replay/fixture.json.gz').read_bytes()):
        fail('D5 G01 fixture copy differs from the retained top-level gzip fixture')

    row_custody = json_file(upload_root / 'replay/oracle-successor-custody.json', 128 * 1024)
    if (row_custody.get('role') != 'D5 actual-row observation successor; original candidate-009 oracle/archive remain unchanged'
            or row_custody.get('status') != 'source-only-successor'
            or row_custody.get('originalArchiveSha256') != archive_sha
            or row_custody.get('originalOracleSha256') != owner.get('oracleSha256')
            or row_custody.get('fixtureSha256') != owner.get('fixtureSha256')
            or row_custody.get('successorSha256') != owner.get('oracleObservationParentSha256')
            or row_custody.get('successorGzipSha256') != owner.get('oracleObservationParentGzipSha256')
            or row_custody.get('successorPatchSha256') != owner.get('oracleObservationParentPatchSha256')):
        fail('D5 row-observation successor custody does not bind its exact original and successor identities')
    successor_custody = metadata_custody
    expected_successors = {
        'candidate-009/installed-text-oracle-d5-row-observation-successor.py': owner.get('oracleObservationParentSha256'),
        'candidate-009/installed-text-oracle-d5-weft55-metadata-successor.py': owner.get('oracleSuccessorSha256'),
        'candidate-009/no-default-runner-d5-weft55-metadata-successor.py': owner.get('noDefaultRunnerSha256'),
    }
    for relative, expected_sha in expected_successors.items():
        if (type(expected_sha) is not str
                or sha_file(upload_root / 'replay' / relative) != expected_sha):
            fail(f'D5 successor source differs from the pinned owner hash: {relative}')
    metadata_successor_record = successor_custody.get('successors', {}).get('rowObservationOracle', {})
    no_default_record = successor_custody.get('successors', {}).get('noDefault', {})
    if (metadata_custody.get('profile') != 'umf.d5-metadata-name-successor/1'
            or metadata_custody.get('status') != 'source-only-successor'
            or metadata_successor_record.get('parent', {}).get('sha256') != owner.get('oracleObservationParentSha256')
            or metadata_successor_record.get('sourceSha256') != owner.get('oracleSuccessorSha256')
            or metadata_successor_record.get('gzipSha256') != owner.get('oracleSuccessorGzipSha256')
            or metadata_successor_record.get('patchSha256') != owner.get('oracleSuccessorPatchSha256')
            or no_default_record.get('parent', {}).get('sha256') != owner.get('noDefaultOriginalRunnerSha256')
            or no_default_record.get('sourceSha256') != owner.get('noDefaultRunnerSha256')
            or no_default_record.get('gzipSha256') != owner.get('noDefaultRunnerGzipSha256')
            or no_default_record.get('patchSha256') != owner.get('noDefaultRunnerPatchSha256')):
        fail('D5 metadata successor custody does not bind the exact parent and successor source hashes')

    gzip_bindings = {
        'oracle-successor.py.gz': (owner.get('oracleObservationParentGzipSha256'), owner.get('oracleObservationParentSha256')),
        'metadata-oracle-successor.py.gz': (owner.get('oracleSuccessorGzipSha256'), owner.get('oracleSuccessorSha256')),
        'no-default-metadata-successor.py.gz': (owner.get('noDefaultRunnerGzipSha256'), owner.get('noDefaultRunnerSha256')),
    }
    patch_bindings = {
        'oracle-successor.patch': owner.get('oracleObservationParentPatchSha256'),
        'metadata-oracle-successor.patch': owner.get('oracleSuccessorPatchSha256'),
        'no-default-metadata-successor.patch': owner.get('noDefaultRunnerPatchSha256'),
    }
    for filename, (compressed_sha, source_sha) in gzip_bindings.items():
        compressed = upload_root / 'replay' / filename
        if sha_file(compressed) != compressed_sha:
            fail(f'D5 successor gzip differs from its owner custody hash: {filename}')
        try:
            with gzip.open(compressed, 'rb') as stream:
                decompressed = stream.read(16 * 1024 * 1024 + 1)
        except (OSError, EOFError) as exc:
            fail(f'D5 successor gzip cannot be read: {type(exc).__name__}')
        if len(decompressed) > 16 * 1024 * 1024 or hashlib.sha256(decompressed).hexdigest() != source_sha:
            fail(f'D5 successor gzip content differs from its exact source hash: {filename}')
    for filename, expected_sha in patch_bindings.items():
        if sha_file(upload_root / 'replay' / filename) != expected_sha:
            fail(f'D5 successor patch differs from its owner custody hash: {filename}')
    if (sha_file(upload_root / 'replay/oracle-successor-custody.json') != owner.get('oracleObservationParentCustodySha256')
            or sha_file(upload_root / 'replay/metadata-successor-custody.json') != owner.get('oracleSuccessorCustodySha256')):
        fail('D5 successor custody JSON differs from the owner custody hashes')
    return {'archiveSha256': archive_sha, 'originalMemberCount': len(member_bytes),
            'successorCount': len(expected_successors), 'gzipCount': len(gzip_bindings)}


def validate_d5_selected_evidence(packet: dict, d5: dict, d5_root: pathlib.Path,
                                  d5_receipt: dict, d5_inputs: dict,
                                  d5_context_path: pathlib.Path, d5_context: dict,
                                  profile_evidence: dict) -> dict:
    """Independently close the selected local D5 family and 3600-second profile."""
    profile_sha = d5['resourceProfileEvidence']['profileSha256']
    operator_sha = d5['resourceProfileEvidence']['operatorManifestSha256']
    operator_root = profile_evidence['operatorManifestPath'].parent.resolve(strict=True)
    manifest = profile_evidence['operatorManifest']
    operator_hashes = d5_context.get('operatorHashes')
    if (type(operator_hashes) is not dict or set(operator_hashes) != D5_OPERATOR_FILES
            or any(type(digest) is not str or re.fullmatch(r'[0-9a-f]{64}', digest) is None
                   for digest in operator_hashes.values())):
        fail('D5 operator hash map differs from its exact reviewed 14-file roster')
    if (operator_hashes.get('local-adapter-manifest.json') != operator_sha
            or operator_hashes.get('resource-profile.json') != profile_sha):
        fail('D5 operator hash map does not bind the physical profile and local-adapter manifest')
    if (d5_receipt.get('resourceProfile') != LOCAL_D5_PROFILE
            or d5_receipt.get('resourceProfileSha256') != profile_sha
            or d5_receipt.get('operatorHashes') != operator_hashes
            or d5_receipt.get('aggregateSeconds') != 3600
            or d5_inputs.get('resourceProfile') != LOCAL_D5_PROFILE
            or d5_inputs.get('resourceProfileSha256') != profile_sha
            or d5_inputs.get('operatorHashes') != operator_hashes
            or d5_inputs.get('bounds') != {
                'aggregateSeconds':3600,'workSeconds':3530,'evidenceReserveSeconds':60,
                'childSeconds':180,'killGraceSeconds':10,'logBytes':1048576,'evidenceBytes':16777216}
            or d5_context.get('resourceProfile') != LOCAL_D5_PROFILE
            or d5_context.get('resourceProfileSha256') != profile_sha
            or d5_context.get('operatorHashes') != operator_hashes
            or d5_context.get('aggregateSeconds') != 3600):
        fail('D5 child, inputs and outer context do not bind the exact 3600-second profile/operator source')
    manifest_fields = {
        'executionKind','hostedEvidenceClaim','sourceWorkflowSha256','adapterPurpose',
        'sourceSteps','stepCopies','boundsPreserved','candidateExecutionPerformed',
        'resourceProfile','nonTemporalBoundsPreserved','resourceProfileSha256',
    }
    source_step_names = {'initialize.sh','replay.sh','finalize.sh'}
    copied_step_names = {'initialize.local.sh','replay.local.sh','finalize.local.sh'}
    if (set(manifest) != manifest_fields or manifest.get('executionKind') != 'local_linux_diagnostic'
            or manifest.get('hostedEvidenceClaim') is not False
            or manifest.get('sourceWorkflowSha256') != d5['workflowSha256']
            or manifest.get('resourceProfile') != LOCAL_D5_PROFILE
            or manifest.get('resourceProfileSha256') != profile_sha
            or manifest.get('nonTemporalBoundsPreserved') is not True
            or manifest.get('candidateExecutionPerformed') is not False
            or set(manifest.get('sourceSteps', {})) != source_step_names
            or set(manifest.get('stepCopies', {})) != copied_step_names):
        fail('D5 local-adapter manifest does not bind the exact profile and six workflow-step identities')
    for step_name, manifest_key in [*((name, 'sourceSteps') for name in source_step_names),
                                    *((name, 'stepCopies') for name in copied_step_names)]:
        file_path = operator_root / 'steps' / step_name
        if manifest_key == 'sourceSteps':
            # Original workflow sources are retained in the repository root.
            file_path = operator_root / 'steps' / step_name
        file_path = file_path.resolve(strict=True)
        row = manifest[manifest_key][step_name]
        if (file_path.is_symlink() or not file_path.is_file() or type(row) is not dict
                or set(row) != {'bytes','sha256'} or row.get('bytes') != file_path.stat().st_size
                or row.get('sha256') != sha_file(file_path)):
            fail(f'D5 adapter manifest step custody differs: {step_name}')

    route_path = operator_root / 'prepared-route.json'
    route = json_file(route_path, 128 * 1024)
    source = route.get('source')
    if (type(source) is not dict or source.get('head') != packet['source']['producerCommit']
            or source.get('tree') != packet['source']['producerTree']
            or source.get('workflowSha256') != d5['workflowSha256']
            or source.get('workflowPath') != '.github/workflows/access-boundaries.yml'
            or source.get('workingTreeClean') is not True):
        fail('D5 route does not bind the exact current source P/tree and workflow')
    source_root = abs_path(source.get('path'), 'D5 source checkout').resolve(strict=True)
    if profile_evidence['roots']['source'] != source_root:
        fail('D5 source root does not match the source checkout in the frozen route')
    bounded_commands = route.get('boundedCommands')
    if type(bounded_commands) is not list or len(bounded_commands) != 30 or len(set(bounded_commands)) != 30:
        fail('D5 route does not name exactly 30 distinct bounded commands')
    expected_files = set(D5_SELECTED_OUTPUT_FILES)
    expected_files.update(f'operator/{name}' for name in D5_OPERATOR_FILES)
    expected_files.update(f'attestation/{name}' for name in D5_ATTESTATION_FILES)
    expected_files.add('source/.github/workflows/access-boundaries.yml')
    upload_root = beneath(profile_evidence['roots']['output'], 'd5-host/d5/upload', 'D5 bounded upload directory')
    if upload_root.is_symlink() or not upload_root.is_dir():
        fail('D5 bounded upload root is not a regular directory')
    upload_paths = []
    upload_directory_relatives = set()
    for current, directories, filenames in os.walk(upload_root, followlinks=False):
        current_path = pathlib.Path(current)
        if current_path.is_symlink() or any((current_path / name).is_symlink() for name in directories):
            fail('D5 bounded upload tree contains a symlink')
        for name in directories:
            upload_directory_relatives.add((current_path / name).relative_to(upload_root).as_posix())
        for name in filenames:
            candidate = current_path / name
            if candidate.is_symlink() or not candidate.is_file():
                fail('D5 bounded upload tree contains a non-regular file')
            upload_paths.append(candidate)
    if not upload_paths:
        fail('D5 bounded upload tree is empty')
    upload_relatives = {path.relative_to(upload_root).as_posix() for path in upload_paths}
    upload_root_files = {name for name in upload_relatives if '/' not in name}
    if (not D5_UPLOAD_ROOT_FILES <= upload_root_files
            or not {'logs', 'reports', 'replay'} <= upload_directory_relatives
            or upload_directory_relatives - {'logs', 'reports', 'replay', 'reports/plans', 'replay/candidate-009', 'replay/g01'}
            ):
        fail('D5 upload tree is missing required top-level files or has an unexpected directory layout')
    upload_logs = {rel[len('logs/'):] for rel in upload_relatives if rel.startswith('logs/')}
    if upload_logs != {f'{name}.log' for name in bounded_commands}:
        fail('D5 upload tree does not contain exactly the 30 bounded command logs')
    upload_reports = {rel[len('reports/'):] for rel in upload_relatives if rel.startswith('reports/')}
    direct_reports = {rel for rel in upload_reports if '/' not in rel}
    nested_reports = upload_reports - direct_reports
    if (direct_reports != D5_REPORT_FILES
            or any(re.fullmatch(r'plans/[0-9a-f]{64}\.json', rel) is None for rel in nested_reports)):
        fail('D5 upload report tree differs from the fixed 22-report plus bounded plans layout')
    upload_replay = {rel[len('replay/'):] for rel in upload_relatives if rel.startswith('replay/')}
    if upload_replay != D5_REPLAY_FILES:
        fail('D5 upload replay custody differs from the exact retained fixture/oracle roster')
    upload_bytes = 0
    for path in upload_paths:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode):
            fail('D5 upload tree contains a non-regular file')
        upload_bytes += info.st_size
    if upload_bytes > 16777216:
        fail('D5 upload tree exceeds the exact 16 MiB child-evidence cap')
    expected_files.update(
        'output/d5-host/d5/upload/' + path.relative_to(upload_root).as_posix()
        for path in upload_paths
    )
    evidence_final_receipt = beneath(profile_evidence['roots']['output'],
                                     'd5-host/d5/evidence/final-receipt.json',
                                     'D5 evidence final receipt')
    upload_receipt_path = upload_root / 'd5-receipt.json'
    if (evidence_final_receipt.is_symlink() or not evidence_final_receipt.is_file()
            or evidence_final_receipt.stat().st_size > 16777216):
        fail('D5 evidence final receipt is missing, unsafe or over its fixed metadata limit')
    if evidence_final_receipt.read_bytes() != upload_receipt_path.read_bytes():
        expected_files.add('output/d5-host/d5/evidence/final-receipt.json')
    declared_child_receipt = beneath(d5_root, d5.get('receiptPath'), 'D5 packet child receipt')
    if (declared_child_receipt.stat().st_size > 128 * 1024
            or upload_receipt_path.stat().st_size > 128 * 1024
            or declared_child_receipt.read_bytes() != upload_receipt_path.read_bytes()):
        fail('D5 upload receipt differs from the separately pinned child receipt')

    selected_path = profile_evidence['selectedEvidenceReceiptPath']
    selected_receipt = profile_evidence['selectedEvidenceReceipt']
    if selected_path.name != 'selected-evidence-receipt.json' or selected_path.parent.resolve(strict=True) != d5_root.resolve(strict=True):
        fail('Selected evidence receipt is not adjacent to the D5 output root')
    receipt_fields = {
        'schema','root','roots','profile','resourceProfileSha256','files','releasePayload',
        'missingOrMismatched','rawLogBytes','rawLogLimitBytes','contextBytes',
        'selectedMetadataBytes','selectedMetadataLimitBytes','uploadBytes','uploadLimitBytes','uploadWithinLimit',
        'contextExcludedFromFileHashRoster','receiptExcludedFromFileHashRoster',
    }
    if (set(selected_receipt) != receipt_fields
            or selected_receipt.get('schema') != 'umf.local-emulated-3600.selected-evidence/1'
            or selected_receipt.get('profile') != LOCAL_D5_PROFILE
            or selected_receipt.get('resourceProfileSha256') != profile_sha
            or selected_receipt.get('missingOrMismatched') != []
            or selected_receipt.get('contextExcludedFromFileHashRoster') is not True
            or selected_receipt.get('receiptExcludedFromFileHashRoster') is not True):
        fail('Selected evidence receipt does not prove the exact closed profile and self-hash exclusions')
    expected_roots = {name: str(path) for name, path in profile_evidence['roots'].items()}
    if (selected_receipt.get('root') != str(d5_root.resolve(strict=True))
            or selected_receipt.get('roots') != expected_roots
            or selected_receipt.get('uploadBytes') != upload_bytes
            or selected_receipt.get('uploadLimitBytes') != 16777216
            or selected_receipt.get('uploadWithinLimit') is not True):
        fail('Selected evidence root map or complete upload-tree accounting differs')
    files = selected_receipt.get('files')
    if type(files) is not list or any(type(row) is not dict or set(row) != {'path','physicalPath','bytes','sha256'} for row in files):
        fail('Selected evidence receipt file rows are malformed')
    paths = [row['path'] for row in files]
    if len(paths) != len(set(paths)) or set(paths) != expected_files or paths != sorted(paths):
        fail('Selected evidence file roster differs from the complete fixed source/operator/output inventory')
    resolved_files = {}
    for row in files:
        label = row['path']
        if not isinstance(label,str) or not isinstance(row['physicalPath'],str):
            fail('Selected evidence path identity is malformed')
        # physicalPath records where the operator captured the bytes. It is
        # historical context only; current reads are authorized by the closed
        # root map and the logical label below.
        abs_path(row['physicalPath'], f'D5 selected file historical path {label}')
        if label.startswith('output/'):
            expected = beneath(profile_evidence['roots']['output'], label[len('output/'):], f'D5 output file {label}')
        elif label.startswith('operator/'):
            expected = beneath(profile_evidence['roots']['operator'], label[len('operator/'):], f'D5 operator file {label}')
        elif label.startswith('attestation/'):
            expected = beneath(profile_evidence['roots']['attestation'], label[len('attestation/'):], f'D5 operator attestation {label}')
        elif label == 'source/.github/workflows/access-boundaries.yml':
            expected = beneath(profile_evidence['roots']['source'], '.github/workflows/access-boundaries.yml', 'D5 source workflow')
        else:
            fail(f'Unknown selected evidence path class: {label}')
        resolved = expected
        info = resolved.lstat()
        if not stat.S_ISREG(info.st_mode):
            fail(f'Selected evidence path is not a regular non-symlink file: {label}')
        size = info.st_size
        if type(row['bytes']) is not int or row['bytes'] != size:
            fail(f'Selected evidence physical byte count differs: {label}')
        require_digest(row['sha256'], f'{label} SHA-256')
        if label.startswith('operator/') and row['sha256'] != operator_hashes[label[len('operator/'):]]:
            fail(f'Selected operator file digest differs from the exact operator hash map: {label}')
        if (label == 'source/.github/workflows/access-boundaries.yml'
                and row['sha256'] != d5['workflowSha256']):
            fail('Selected source workflow digest differs from the D5 workflow identity')
        resolved_files[label] = resolved
    outer_capture = profile_evidence['outerCapture']
    if (set(outer_capture) != {'command','exitCode','durationMs','perStreamCapBytes','captureFailed','stdout','stderr'}
            or type(outer_capture.get('exitCode')) is not int or outer_capture['exitCode'] != 0
            or type(outer_capture.get('durationMs')) is not int or outer_capture['durationMs'] < 0
            or outer_capture.get('durationMs') > 3600000
            or outer_capture.get('perStreamCapBytes') != 131072 or outer_capture.get('captureFailed') is not False):
        fail('D5 outer launch capture is incomplete or unsuccessful')
    if d5_context.get('outerCapture') != outer_capture or d5_context.get('captureFailureCode') is not None or d5_context.get('clientExit') != 0:
        fail('D5 outer context does not bind a successful uncaptured client execution')
    cleanup = d5_context.get('cleanup')
    if (type(cleanup) is not dict or cleanup.get('verified') is not True
            or cleanup.get('daemonReachable') is not True
            or cleanup.get('clientAbsentAfterCleanup') is not True
            or cleanup.get('postgresAbsentAfterCleanup') is not True
            or cleanup.get('networkAbsentAfterCleanup') is not True):
        fail('D5 local context does not prove reachable-engine cleanup of all owned resources')
    log_total = 0
    for name in ('stdout','stderr'):
        ref = outer_capture.get(name)
        label = f'output/outer.{name}.log'
        if type(ref) is not dict or set(ref) != {'path','storedBytes','streamBytes','streamSha256','storedSha256','truncated'}:
            fail(f'D5 outer {name} capture reference is malformed')
        log_path = resolved_files[label]
        if (ref.get('truncated') is not False or type(ref.get('storedBytes')) is not int
                or ref['storedBytes'] > 131072 or ref['storedBytes'] != log_path.stat().st_size
                or ref.get('streamBytes') != ref['storedBytes']
                or ref.get('storedSha256') != next(row['sha256'] for row in files if row['path'] == label)
                or ref.get('streamSha256') != ref.get('storedSha256')
                or not isinstance(ref.get('path'), str) or not pathlib.Path(ref['path']).is_absolute()):
            fail(f'D5 outer {name} stream is truncated or differs from its retained physical log')
        log_total += ref['storedBytes']
    log_labels = [label for label in paths if label.startswith('output/d5-host/d5/upload/logs/')]
    if len(log_labels) != 30:
        fail('D5 selected evidence does not retain all 30 command logs')
    child_log_total = sum(resolved_files[label].stat().st_size for label in log_labels)
    log_total += child_log_total
    outer_log_total = sum(outer_capture[name]['storedBytes'] for name in ('stdout','stderr'))
    for name in bounded_commands:
        uploaded = resolved_files[f'output/d5-host/d5/upload/logs/{name}.log']
        original = beneath(profile_evidence['roots']['output'],
                           f'd5-host/d5/evidence/logs/{name}.log',
                           f'D5 original command log {name}')
        if uploaded.stat().st_size != original.stat().st_size:
            fail(f'D5 uploaded command log byte count differs from its original bounded log: {name}')
    if (child_log_total != d5_context.get('childRawLogBytes') or child_log_total > 786432
            or outer_log_total > 262144
            or log_total != selected_receipt.get('rawLogBytes') or log_total != d5_context.get('rawLogBytes')
            or selected_receipt.get('rawLogLimitBytes') != 1048576 or d5_context.get('rawLogLimitBytes') != 1048576
            or log_total > 1048576 or d5_context.get('rawLogBudgetWithinLimit') is not True):
        fail('D5 child and outer logs exceed or differ from the exact 1 MiB capture budget')

    command_file = resolved_files['output/d5-host/d5/upload/command-records.jsonl']
    if command_file.stat().st_size > 256 * 1024:
        fail('D5 command record file exceeds its fixed metadata bound')
    command_rows = [json.loads(line) for line in command_file.read_text(encoding='utf-8').splitlines() if line]
    if [row.get('name') for row in command_rows] != bounded_commands or len(command_rows) != 30:
        fail('D5 command records do not match the exact ordered 30-command roster')
    for row in command_rows:
        if (set(row) != {'name','stage','argv','rawExit','captureExit','monotonicDurationMs',
                         'limitSeconds','logBytes','logSha256','truncated','truncationMarker'}
                or row.get('stage') != row.get('name') or type(row.get('argv')) is not list
                or any(type(arg) is not str for arg in row['argv'])
                or row.get('rawExit') != 0 or row.get('captureExit') != 0
                or row.get('truncated') is not False or row.get('truncationMarker') is not None
                or type(row.get('monotonicDurationMs')) is not int or row['monotonicDurationMs'] < 0
                or row['monotonicDurationMs'] > 180000
                or type(row.get('limitSeconds')) is not int or not 1 <= row['limitSeconds'] <= 180):
            fail(f"D5 bounded command failed or exceeded its 180-second child cap: {row.get('name')}")
        command_log = resolved_files[f"output/d5-host/d5/upload/logs/{row['name']}.log"]
        indexed_digest = next(item['sha256'] for item in files
                              if item['path'] == f"output/d5-host/d5/upload/logs/{row['name']}.log")
        if (type(row.get('logBytes')) is not int or row['logBytes'] != command_log.stat().st_size
                or row.get('logSha256') != indexed_digest):
            fail(f"D5 command record log custody differs: {row.get('name')}")
    command_duration_total = sum(row['monotonicDurationMs'] for row in command_rows)
    complete_path = resolved_files['output/d5-host/d5/upload/execution-complete.json']
    if complete_path.stat().st_size > 32 * 1024:
        fail('D5 execution completion record exceeds its fixed metadata bound')
    complete = json_file(complete_path, 32 * 1024)
    if (type(complete.get('startedMonotonicMs')) is not int
            or type(complete.get('endedMonotonicMs')) is not int
            or type(complete.get('deadlineMonotonicMs')) is not int
            or type(complete.get('aggregateElapsedMs')) is not int
            or complete.get('status') != 'commands-complete' or complete.get('commandCount') != 30
            or complete.get('commandNames') != bounded_commands or complete.get('aggregateElapsedMs') > 3600000
            or complete.get('aggregateElapsedMs') > 3530000
            or complete.get('endedMonotonicMs') > complete.get('deadlineMonotonicMs') - 60000
            or complete.get('endedMonotonicMs') < complete.get('startedMonotonicMs')
            or command_duration_total > complete.get('aggregateElapsedMs')
            or complete.get('deadlineMonotonicMs') - complete.get('startedMonotonicMs') != 3600000):
        fail('D5 execution completion exceeded the profile deadline/work clamp or did not cover all commands')

    payload = selected_receipt.get('releasePayload')
    expected_payload_names = {
        packet['release']['assets']['access']['filename'],
        packet['release']['assets']['codegen']['filename'],
        'release-payload-receipt.json',
    }
    if (type(payload) is not dict or set(payload) != {'bytes','limitBytes','files','status'}
            or payload.get('limitBytes') != 2097152 or payload.get('status') != 'within-limit'
            or type(payload.get('files')) is not list or len(payload['files']) != 3):
        fail('D5 release payload evidence is not the exact three-file bounded family')
    payload_names = set(); payload_bytes = 0
    for row in payload['files']:
        if type(row) is not dict or set(row) != {'path','physicalPath','bytes','sha256'}:
            fail('D5 release payload physical file row is malformed')
        label = row['path']
        prefix = 'output/d5-host/d5/release-payload/'
        if not isinstance(label,str) or not label.startswith(prefix):
            fail('D5 release payload path is outside its exact output directory')
        name = label[len(prefix):]
        if name in payload_names or '/' in name or name not in expected_payload_names:
            fail('D5 release payload filename is unsafe, extra or duplicated')
        payload_names.add(name)
        abs_path(row['physicalPath'], f'D5 release payload historical path {name}')
        expected = beneath(profile_evidence['roots']['output'], label[len('output/'):], f'D5 release payload {name}')
        payload_info = expected.lstat()
        if not stat.S_ISREG(payload_info.st_mode):
            fail(f'D5 release payload {name} is not a regular non-symlink file')
        if type(row.get('bytes')) is not int or row['bytes'] != payload_info.st_size:
            fail(f'D5 release payload {name} byte count differs from selected physical custody')
        require_digest(row['sha256'], f'D5 release payload {name} SHA-256')
        payload_bytes += row['bytes']
    if payload_names != expected_payload_names or payload_bytes != payload.get('bytes') or payload_bytes > 2097152:
        fail('D5 release payload is missing, changed or above its exact 2 MiB cap')
    payload_path = resolved_files.get('output/d5-host/d5/release-payload/release-payload-receipt.json')
    if payload_path is None:
        payload_path = d5_root / 'd5-host/d5/release-payload/release-payload-receipt.json'
    if (payload_path.stat().st_size > 128 * 1024
            or d5_context.get('releasePayloadBytes') != payload_bytes
            or d5_context.get('releasePayloadLimitBytes') != 2097152
            or d5_context.get('releasePayloadWithinLimit') is not True
            or d5_context.get('selectedEvidenceReceiptPath') != selected_path.name
            or d5_context.get('selectedEvidenceReceiptSha256') != sha_file(selected_path)
            or d5_context.get('selectedEvidenceReceiptBytes') != selected_path.stat().st_size
            or d5_context.get('selectedEvidenceMissingOrMismatched') != []
            or d5_context.get('outerQualificationStatus') != 'LOCAL_DIAGNOSTIC_PASS_LOCAL_EMULATED_3600'):
        fail('D5 final context does not bind the successful selected-evidence and payload receipts')
    file_bytes = sum(row['bytes'] for row in files)
    selected_total = file_bytes + payload_bytes + selected_path.stat().st_size + d5_context_path.stat().st_size
    if (selected_receipt.get('contextBytes') != d5_context_path.stat().st_size
            or selected_receipt.get('selectedMetadataBytes') != selected_total
            or selected_receipt.get('selectedMetadataLimitBytes') != 16777216
            or selected_total != d5_context.get('selectedMetadataBytes')
            or d5_context.get('selectedMetadataLimitBytes') != 16777216
            or d5_context.get('selectedMetadataWithinLimit') is not True
            or selected_total > 16777216):
        fail('D5 selected metadata size differs from the context/receipt fixed point or 16 MiB cap')
    # Read and hash the selected files only after the aggregate metadata and
    # release-payload sizes have passed their original limits.
    payload_receipt = json_file(payload_path, 128 * 1024)
    if sha_file(payload_path) != d5['releasePayloadReceiptSha256']:
        fail('D5 release-payload receipt differs from its declared hash')
    for row in files:
        indexed_path = resolved_files[row['path']]
        if sha_file(indexed_path) != row['sha256']:
            fail(f"Selected evidence physical digest differs: {row['path']}")
        if row['path'].startswith('output/d5-host/d5/upload/logs/'):
            name = row['path'].rsplit('/', 1)[1]
            original = beneath(profile_evidence['roots']['output'],
                               f'd5-host/d5/evidence/logs/{name}',
                               f'D5 original command log {name}')
            if sha_file(original) != row['sha256']:
                fail(f'D5 uploaded command log digest differs from original bounded log: {name}')
    for row in payload['files']:
        label = row['path']
        physical = beneath(d5_root, label[len('output/'):], f'D5 release payload {label}')
        if sha_file(physical) != row['sha256']:
            fail(f'D5 release payload physical digest differs: {label}')
    owner = json_file(upload_root / 'owner-artifacts.json', 16 * 1024 * 1024)
    replay_custody = validate_d5_replay_bindings(upload_root, owner)
    return {
        'profileName': LOCAL_D5_PROFILE,
        'profileSha256': profile_sha,
        'operatorManifestSha256': operator_sha,
        'operatorHashes': operator_hashes,
        'selectedEvidenceReceiptPath': str(selected_path),
        'selectedEvidenceReceiptSha256': sha_file(selected_path),
        'selectedEvidenceReceiptBytes': selected_path.stat().st_size,
        'selectedMetadataBytes': selected_total,
        'rawLogBytes': log_total,
        'childRawLogBytes': child_log_total,
        'outerRawLogBytes': outer_log_total,
        'releasePayloadBytes': payload_bytes,
        'aggregateSeconds': 3600,
        'workSeconds': 3530,
        'aggregateElapsedMs': complete['aggregateElapsedMs'],
        'childSeconds': 180,
        'cases': 37,
        'oracleGroups': 16,
        'noDefaultChecks': 19,
        'faultScenarios': 3,
        'commandCount': 30,
        'cleanupVerified': True,
        'replayCustody': replay_custody,
        'cleanup': cleanup,
        'capture': {
            'path': str(profile_evidence['outerCapturePath']),
            'sha256': sha_file(profile_evidence['outerCapturePath']),
            'exitCode': outer_capture['exitCode'],
            'durationMs': outer_capture['durationMs'],
            'captureFailed': outer_capture['captureFailed'],
        },
    }


def validate_local_evidence_execution_id(key: str, row: dict) -> None:
    """Accept only the exact local ID namespace emitted by each retained producer."""
    execution_id = row.get('executionId')
    attempt = row.get('attempt')
    if type(attempt) is not int or attempt < 1:
        fail(f'{key} local attempt is missing or invalid')
    if key == 'd5':
        if not re.fullmatch(r'local-[a-f0-9-]{16,64}', str(execution_id)):
            fail('d5 evidence must carry its original local execution identity')
        return
    patterns = {
        'sdkProducer': r'local-sdk-([0-9]{8}T[0-9]{6}Z)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-attempt([1-9][0-9]*)',
        'aggregate': r'umf-local-full18-([0-9]{8}T[0-9]{6}Z)-([1-9][0-9]*)-attempt([1-9][0-9]*)',
        'unionContinuation': r'umf-local-full18-union-continuation-([0-9]{8}T[0-9]{6}Z)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-attempt([1-9][0-9]*)',
    }
    pattern = patterns.get(key)
    match = re.fullmatch(pattern, execution_id) if type(execution_id) is str and pattern else None
    if match is None:
        fail(f'{key} evidence execution ID is outside its exact local producer namespace')
    timestamp = match.group(1)
    try:
        parsed = datetime.datetime.strptime(timestamp, '%Y%m%dT%H%M%SZ')
    except ValueError:
        fail(f'{key} evidence execution ID has an invalid UTC timestamp')
    if parsed.strftime('%Y%m%dT%H%M%SZ') != timestamp:
        fail(f'{key} evidence execution ID timestamp is not canonical UTC')
    if key in {'sdkProducer','unionContinuation'} and str(uuid.UUID(match.group(2))) != match.group(2):
        fail(f'{key} evidence execution ID UUID is not canonical lowercase text')
    if int(match.group(3)) != attempt:
        fail(f'{key} evidence execution ID attempt suffix differs from its receipt')


def validate_inputs(packet: dict, adapter_path: pathlib.Path) -> dict:
    if packet.get('profile') != PROFILE or packet.get('status') != 'READY':
        fail('Local proof inputs are HELD; no proof command will start')
    if set(packet) != {'profile','status','executionKind','repository','execution','source','release','evidence','fixedQualification','limits'}:
        fail('Local input manifest does not match the closed profile')
    no_held(packet)
    if packet.get('executionKind') != 'local_linux_diagnostic':
        fail('Execution kind must remain explicitly local_linux_diagnostic')
    if packet.get('repository') != REPOSITORY:
        fail('Unexpected source repository')
    execution = packet.get('execution')
    if type(execution) is not dict:
        fail('Local execution identity is missing')
    if not re.fullmatch(r'local-[a-f0-9-]{16,64}', str(execution.get('executionId', ''))):
        fail('Local execution ID must be a fresh local identifier, never a hosted run ID')
    if type(execution.get('attempt')) is not int or execution['attempt'] < 1:
        fail('Local attempt must be a positive integer')
    if re.fullmatch(r'sha256:[0-9a-f]{64}', str(execution.get('runtimeImageDigest',''))) is None:
        fail('Runtime image digest is malformed')
    if set(execution) != {'executionId','attempt','localAdapterSha256','hostedWorkflowSha256','runtimeImageDigest','runtimeEngine','runtimeHost','runtimeGuest','emulatedGuest'}:
        fail('Local execution identity has an unexpected field roster')
    if execution.get('runtimeEngine') != 'OrbStack':
        fail('Local runtime engine must identify the observed OrbStack engine')
    host = execution.get('runtimeHost'); guest = execution.get('runtimeGuest')
    if type(host) is not dict or host != {'os':'Darwin','architecture':'aarch64'}:
        fail('Local host identity must state the observed Darwin aarch64 OrbStack host')
    if type(guest) is not dict or guest != {'os':'Linux','distribution':'Ubuntu','version':'24.04.5','architecture':'x86_64'}:
        fail('Local guest identity must state the observed Ubuntu 24.04.5 amd64 runtime')
    if execution.get('emulatedGuest') is not True:
        fail('Actual Linux guest emulation status must be explicit')
    require_digest(execution.get('localAdapterSha256'),'local adapter source digest')
    require_digest(execution.get('hostedWorkflowSha256'),'preserved hosted workflow digest')
    if execution['hostedWorkflowSha256'] != HOSTED_WORKFLOW_SHA256 or sha_file(adapter_path.resolve(strict=True)) != execution['localAdapterSha256']:
        fail('Local adapter or preserved hosted workflow bytes differ from the exact frozen identities')
    if execution['runtimeImageDigest'] != RUNTIME_IMAGE_DIGEST:
        fail('Local Ubuntu runtime image differs from the exact recorded image')
    if os.environ.get('LOCAL_RUNTIME_IMAGE_DIGEST') != RUNTIME_IMAGE_DIGEST:
        fail('Container launcher did not provide the exact inspected runtime image digest')
    packet_limits = packet.get('limits')
    if type(packet_limits) is not dict or set(packet_limits) != set(LIMITS) | {'publicPackageFamilyBytes'} or any(packet_limits.get(key) != value for key, value in LIMITS.items()):
        fail('Original public-H bounds changed')
    fixed = packet.get('fixedQualification')
    fixed_fields = {'accessVersion','codegenVersion','coreDistributionVersion','coreLinuxNativeMember',
                    'coreLinuxNativeSha256','coreLinuxWheelFilename','coreLinuxWheelSha256','coreLinuxWheelSizeBytes',
                    'coreSemanticVersion','pythonCell','pythonWheelCount','sdkConformanceCases','sdkVersion',
                    'weftDistribution','weftLinuxWheelFilename','weftLinuxWheelSizeBytes','weftProducerCommit',
                    'weftReleaseTag','weftVersion','weftWheelDistribution','weftWheelSha256','weftWireProfile'}
    if type(fixed) is not dict or set(fixed) != fixed_fields or fixed.get('sdkVersion') != '0.5.7' or fixed.get('sdkConformanceCases') != 139 or fixed.get('pythonCell') != 'linux-x86_64-py311' or fixed.get('pythonWheelCount') != 18:
        fail('Fixed SDK/Python qualification scope is incomplete')
    if fixed.get('accessVersion') != '0.1.0.dev8' or fixed.get('codegenVersion') != '0.1.0a5':
        fail('Access or Codegen release identity differs from the fixed SDK cohort')
    if (fixed.get('coreDistributionVersion') != '0.10.3' or fixed.get('coreSemanticVersion') != '0.10.0'
            or fixed.get('coreLinuxNativeMember') != 'umf/_rust_core.abi3.so'
            or fixed.get('coreLinuxNativeSha256') != 'c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57'
            or fixed.get('coreLinuxWheelFilename') != 'umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl'
            or fixed.get('coreLinuxWheelSha256') != 'cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75'
            or fixed.get('coreLinuxWheelSizeBytes') != 3612043):
        fail('Core dependency differs from immutable 0.10.3/0.10.0 Linux qualification')
    if (fixed.get('weftDistribution') != 'umf-weft' or fixed.get('weftVersion') != '0.4.55'
            or fixed.get('weftProducerCommit') != 'ea0fef0209aaf8e08ef165b6afe00b408873354f'
            or fixed.get('weftReleaseTag') != 'v0.4.55'
            or fixed.get('weftWheelDistribution') != 'umf-weft'
            or fixed.get('weftLinuxWheelFilename') != 'umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl'
            or fixed.get('weftLinuxWheelSizeBytes') != 14347375
            or fixed.get('weftWheelSha256') != 'b34ca17fa37412afa7b8e8bd86aac8ee67a3c895a9b253221e1d582b39073a85'
            or fixed.get('weftWireProfile') != 'weft-sql/0.2.0'):
        fail('Core or Weft release/semantic identity differs from the held proof contract')
    source = packet.get('source')
    release = packet.get('release')
    evidence = packet.get('evidence')
    if type(source) is not dict or set(source) != {'producerRoot','producerCommit','producerTree'} or type(release) is not dict or type(evidence) is not dict:
        fail('Source, public release, or local evidence roster is missing')
    require_sha(source.get('producerCommit'), 'producer P')
    require_git_object(source.get('producerTree'), 'producer tree')
    require_sha(release.get('releaseCommitM'), 'release M')
    if type(release.get('releaseId')) is not int or release['releaseId'] <= 0:
        fail('Public release ID must be the actual positive API identity')
    if not isinstance(release.get('publishedAt'),str) or not release['publishedAt']:
        fail('Public release timestamp is missing')
    if not isinstance(release.get('tag'), str) or not re.fullmatch(r'[^/\\\s]{1,128}', release['tag']):
        fail('Public release tag is malformed')
    assets = release.get('assets')
    if type(assets) is not dict or set(assets) != {'sdk', 'access', 'codegen'}:
        fail('Public asset roster must be exactly SDK, Access and Codegen')
    if set(release) != {'tag','releaseCommitM','releaseId','publishedAt','assets'}:
        fail('Public release identity has an unexpected field roster')
    for key, row in assets.items():
        if type(row) is not dict or set(row) != {'filename', 'sizeBytes', 'sha256'}:
            fail(f'Public asset identity is incomplete: {key}')
        name = row['filename']
        if not isinstance(name, str) or pathlib.PurePosixPath(name).name != name or '/' in name or '\\' in name:
            fail(f'Unsafe public asset filename: {key}')
        if type(row['sizeBytes']) is not int or row['sizeBytes'] <= 0:
            fail(f'Public asset byte length is invalid: {key}')
        require_digest(row['sha256'], f'{key} public asset digest')
    if len({row['filename'] for row in assets.values()}) != 3:
        fail('The three public assets must use distinct filenames')
    if packet.get('limits', {}).get('publicPackageFamilyBytes') != sum(row['sizeBytes'] for row in assets.values()):
        fail('Public package family cap must equal exact three-asset sizes')
    for key in ('sdkProducer', 'd5', 'aggregate', 'unionContinuation'):
        row = evidence.get(key)
        if type(row) is not dict:
            fail(f'Local evidence identity is missing: {key}')
        validate_local_evidence_execution_id(key, row)
        require_sha(row.get('sourceCommit'), f'{key} source commit')
    if any(evidence[key]['sourceCommit'] != source['producerCommit'] for key in ('sdkProducer', 'd5', 'aggregate', 'unionContinuation')):
        fail('SDK, D5, aggregate and full18 continuation evidence do not share exact current producer P')
    if type(evidence['d5'].get('attempt')) is not int or evidence['d5']['attempt'] < 1:
        fail('D5 local attempt is missing or invalid')
    if type(evidence['aggregate'].get('attempt')) is not int or evidence['aggregate']['attempt'] < 1:
        fail('Aggregate local attempt is missing or invalid')
    if set(evidence) != {'sdkProducer','d5','aggregate','unionContinuation'}:
        fail('Local evidence identity has an unexpected field roster')
    expected_evidence_fields = {
        'sdkProducer': {'executionId','attempt','sourceCommit','sourceTree','harnessSha256',
                        'harnessPath',
                        'root','receiptPath','receiptSha256','archivePath','archiveSha256',
                        'archiveSizeBytes','manifestPath','manifestSha256','manifestSizeBytes'},
        'd5': {'executionId','attempt','sourceCommit','sourceTree','root','receiptPath',
               'receiptSha256','qualificationInputsPath','qualificationInputsSha256',
               'runContextPath','runContextSha256','ownerManifestPath','ownerManifestSha256',
               'workflowSha256','cohortLockPath','mirrorManifestPath',
               'releasePayloadRoot','releasePayloadReceiptPath','releasePayloadReceiptSha256'},
        'aggregate': {'executionId','attempt','sourceCommit','sourceTree','harnessSha256','harnessPath',
                      'root','assemblyReceiptPath','assemblyReceiptSha256',
                      'proofReceiptPath','proofReceiptSha256','indexPath','generatorCorpusPath'},
        'unionContinuation': {'executionId','attempt','sourceCommit','sourceTree','root','receiptPath',
                              'receiptSha256','harnessRoot','harnessSha256','bootstrapWheelPath',
                              'bootstrapWheelSha256','bootstrapMetadataPath','bootstrapMetadataSha256'},
    }
    for key, expected in expected_evidence_fields.items():
        accepted = [expected]
        if key == 'aggregate':
            accepted.append((expected - {'proofReceiptPath','proofReceiptSha256'}) | {'verificationMode'})
        if key == 'd5':
            accepted.append(expected | {'resourceProfileEvidence'})
        if type(evidence[key]) is not dict or not any(set(evidence[key]) == roster for roster in accepted):
            fail(f'{key} local evidence identity has an unexpected field roster')
    aggregate_mode = evidence['aggregate'].get('verificationMode')
    if aggregate_mode not in (None, 'assembly-plus-bounded-continuation003'):
        fail('Aggregate verification mode is not one of the two exact reviewed evidence modes')
    if aggregate_mode == 'assembly-plus-bounded-continuation003' and (
            evidence['unionContinuation'].get('executionId') == evidence['aggregate'].get('executionId')):
        fail('Bounded continuation mode requires its own distinct continuation execution identity')
    if len({evidence[key]['executionId'] for key in ('sdkProducer','d5','aggregate','unionContinuation')}) != 4:
        fail('SDK producer, D5, aggregate and full18 continuation must be distinct local execution identities')
    for key in ('sdkProducer','d5','aggregate','unionContinuation'):
        if type(evidence[key].get('attempt')) is not int or evidence[key]['attempt'] < 1:
            fail(f'{key} local attempt is missing or invalid')
        require_git_object(evidence[key].get('sourceTree'), f'{key} source tree')
    d5 = evidence['d5']
    for field in ('root','receiptPath','receiptSha256','qualificationInputsPath','qualificationInputsSha256',
                  'runContextPath','runContextSha256','ownerManifestPath','ownerManifestSha256',
                  'workflowSha256','cohortLockPath','mirrorManifestPath','releasePayloadRoot',
                  'releasePayloadReceiptPath','releasePayloadReceiptSha256'):
        if not isinstance(d5.get(field),str) or not d5[field]: fail(f'D5 local evidence path is missing: {field}')
    d5_root = abs_path(d5['root'], 'D5 evidence root').resolve(strict=True)
    d5_profile_evidence = validate_d5_profile_evidence(d5, d5_root)
    if d5_profile_evidence is None:
        # The original local-H route remains the 1,800-second profile. Refuse a
        # 3,600-second receipt if its separate physical profile attestation is absent.
        for name, value in (('D5 input', d5.get('qualificationInputsPath')),
                            ('D5 context', d5.get('runContextPath'))):
            path = beneath(d5_root, value, name)
            record = json_file(path)
            bounds = record.get('bounds')
            if (record.get('resourceProfile') == LOCAL_D5_PROFILE
                    or record.get('aggregateSeconds') == 3600
                    or (type(bounds) is dict and bounds.get('aggregateSeconds') == 3600)):
                fail('D5 3600-second evidence requires its separately hash-bound resource-profile attestation')
    aggregate = evidence['aggregate']
    aggregate_required_fields = ('root','assemblyReceiptPath','assemblyReceiptSha256',
                                 'indexPath','generatorCorpusPath','harnessSha256','harnessPath')
    if aggregate_mode is None:
        aggregate_required_fields += ('proofReceiptPath','proofReceiptSha256')
    for field in aggregate_required_fields:
        if not isinstance(aggregate.get(field),str) or not aggregate[field]: fail(f'Aggregate local evidence path is missing: {field}')
    if aggregate_mode == 'assembly-plus-bounded-continuation003' and aggregate.get('verificationMode') != aggregate_mode:
        fail('Aggregate verification mode is missing or inconsistent')
    continuation = evidence['unionContinuation']
    for field in ('root','receiptPath','receiptSha256','harnessRoot','harnessSha256',
                  'bootstrapWheelPath','bootstrapWheelSha256','bootstrapMetadataPath','bootstrapMetadataSha256'):
        if not isinstance(continuation.get(field),str) or not continuation[field]:
            fail(f'Full18 continuation evidence path is missing: {field}')
    sdk = evidence['sdkProducer']
    for field in ('root','harnessPath','receiptPath','receiptSha256','archivePath','archiveSha256',
                  'manifestPath','manifestSha256','harnessSha256'):
        if not isinstance(sdk.get(field),str) or not sdk[field]: fail(f'SDK producer evidence path is missing: {field}')
    for key in ('sdkProducer','d5','aggregate','unionContinuation'):
        receipt_sha = evidence[key].get('receiptSha256') if key != 'aggregate' else (
            evidence[key].get('assemblyReceiptSha256') if aggregate_mode == 'assembly-plus-bounded-continuation003'
            else evidence[key].get('proofReceiptSha256'))
        require_digest(receipt_sha, f'{key} receipt SHA-256')
        require_git_object(evidence[key].get('sourceCommit'), f'{key} source commit')
        if evidence[key]['sourceCommit'] != source['producerCommit'] or evidence[key]['sourceTree'] != source['producerTree']:
            fail(f'{key} receipt input identity differs from the exact producer P/tree')
    for key, field in (('sdkProducer','harnessSha256'),('aggregate','harnessSha256')):
        require_digest(evidence[key].get(field), f'{key} harness SHA-256')
    for key, fields in {
        'sdkProducer': ('receiptSha256','archiveSha256','manifestSha256'),
        'd5': ('receiptSha256','qualificationInputsSha256','runContextSha256','ownerManifestSha256','releasePayloadReceiptSha256'),
        'aggregate': ('assemblyReceiptSha256',),
        'unionContinuation': ('receiptSha256','harnessSha256','bootstrapWheelSha256','bootstrapMetadataSha256'),
    }.items():
        for field in fields:
            require_digest(evidence[key].get(field), f'{key} {field}')
    if aggregate_mode is None:
        require_digest(evidence['aggregate'].get('proofReceiptSha256'), 'aggregate proofReceiptSha256')
    return packet


def capped_child(name: str, argv: list[str], cwd: pathlib.Path, env: dict[str, str], log: pathlib.Path,
                 maximum: int, deadline_ns: int, reserve_ns: int, total_log_before: int) -> dict:
    hard_end_ns = deadline_ns - reserve_ns
    command_end_ns = hard_end_ns - LIMITS['termGraceSeconds'] * 1_000_000_000
    remaining = (command_end_ns - time.monotonic_ns()) // 1_000_000_000
    if remaining <= 0:
        fail('Original aggregate deadline reserve reached before a proof command')
    limit = min(maximum, int(remaining))
    cap = max(0, LIMITS['aggregateLogBytes'] - total_log_before)
    start = time.monotonic_ns()
    proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, start_new_session=True, bufsize=0)
    assert proc.stdout is not None
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    saved = 0
    truncated = False
    marker = b'\n[LOG TRUNCATED: aggregate capture reached the fixed 1 MiB cap]\n'
    content_cap = max(0, cap-len(marker))
    timed_out = False
    with log.open('xb') as stream:
        term_sent = False
        kill_deadline = 0
        while True:
            now = time.monotonic_ns()
            expired = now - start >= limit * 1_000_000_000 or now >= command_end_ns
            if expired and not term_sent:
                timed_out = True
                term_sent = True
                kill_deadline = now + LIMITS['termGraceSeconds'] * 1_000_000_000
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            if term_sent and now >= kill_deadline:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            events = selector.select(timeout=0.05)
            for key, _ in events:
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                available = max(0, content_cap - saved)
                piece = chunk[:available]
                if piece:
                    stream.write(piece)
                    saved += len(piece)
                if len(piece) < len(chunk):
                    truncated = True
            if proc.poll() is not None and not selector.get_map():
                break
        raw_exit = proc.wait()
        selector.close()
        if truncated and cap:
            stream.write(marker[:cap])
    end = time.monotonic_ns()
    body_size = log.stat().st_size
    return {
        'name': name, 'stage': name, 'argv': argv, 'rawExit': raw_exit, 'captureExit': 75 if truncated else 0,
        'monotonicStartNs': start, 'monotonicEndNs': end,
        'monotonicDurationNs': end - start, 'appliedLimitSeconds': limit,
        'termGraceSeconds': LIMITS['termGraceSeconds'], 'logBytes': body_size,
        'logSha256': sha_file(log), 'truncated': truncated,
        'truncationMarker': 'aggregate-log-cap' if truncated else None,
        'timedOut': timed_out,
    }


def source_git(packet: dict, work: pathlib.Path) -> tuple[pathlib.Path, str]:
    source = packet['source']
    release = packet['release']
    root_input = abs_path(source['producerRoot'], 'producer checkout')
    if root_input.is_symlink():
        fail('Producer checkout path must not be a symlink')
    root = root_input.resolve(strict=True)
    if not root.is_dir():
        fail('Producer checkout must be an existing real directory')
    head = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], check=True, text=True, capture_output=True).stdout.strip()
    tree = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD^{tree}'], check=True, text=True, capture_output=True).stdout.strip()
    status = subprocess.run(['git', '-C', str(root), 'status', '--porcelain'], check=True, text=True, capture_output=True).stdout
    if head != source['producerCommit'] or tree != source['producerTree'] or status:
        fail('Producer checkout is not the exact clean P/tree')
    origin = subprocess.run(['git', '-C', str(root), 'remote', 'get-url', 'origin'], check=True, text=True, capture_output=True).stdout.strip()
    parsed_origin = urllib.parse.urlsplit(origin)
    if origin.startswith('git@github.com:'):
        origin_path = origin.removeprefix('git@github.com:')
    elif parsed_origin.scheme == 'https' and parsed_origin.hostname == 'github.com' and not parsed_origin.username and not parsed_origin.password:
        origin_path = parsed_origin.path.lstrip('/')
    else:
        fail('Producer checkout origin is not the unauthenticated public GitHub repository')
    if origin_path.removesuffix('.git') != REPOSITORY:
        fail('Producer checkout origin is not the expected public repository')
    m = release['releaseCommitM']
    subprocess.run(['git', '-C', str(root), 'cat-file', '-e', f'{m}^{{commit}}'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['git', '-C', str(root), 'merge-base', '--is-ancestor', head, m], check=True)
    tagged = subprocess.run(['git', '-C', str(root), 'rev-parse', f"refs/tags/{release['tag']}^{{commit}}"], check=True, text=True, capture_output=True).stdout.strip()
    if tagged != m:
        fail('Public release tag in producer object database does not resolve to exact M')
    remote = subprocess.run(['git','ls-remote',f'https://github.com/{REPOSITORY}.git',
                             f'refs/tags/{release["tag"]}',f'refs/tags/{release["tag"]}^{{}}'],
                            check=True,text=True,capture_output=True,timeout=30)
    remote_refs={}
    for line in remote.stdout.splitlines():
        fields=line.split('\t')
        if len(fields)!=2 or re.fullmatch(r'[0-9a-f]{40}',fields[0]) is None:
            fail('Public Git tag response is malformed')
        remote_refs[fields[1]]=fields[0]
    direct=f'refs/tags/{release["tag"]}'; peeled=direct+'^{}'
    if set(remote_refs)-{direct,peeled} or direct not in remote_refs:
        fail('Public Git tag response is incomplete or ambiguous')
    remote_commit=remote_refs.get(peeled,remote_refs[direct])
    if remote_commit!=m:
        fail('Current public Git tag does not resolve to immutable release M')
    target = work / 'producer'
    target.mkdir(mode=0o700)
    archive = subprocess.Popen(['git', '-C', str(root), 'archive', '--format=tar', head], stdout=subprocess.PIPE)
    assert archive.stdout is not None
    with tarfile.open(fileobj=archive.stdout, mode='r|') as tar:
        for member in tar:
            pure = pathlib.PurePosixPath(member.name)
            if pure.is_absolute() or '..' in pure.parts or '\\' in member.name or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                fail('Unsafe source archive member')
            destination = target.joinpath(*pure.parts)
            if member.isdir():
                if stat.S_IMODE(member.mode) != 0o755:
                    fail('Source archive directory has an unsupported mode')
                destination.mkdir(parents=True, exist_ok=True)
                destination.chmod(0o755)
                continue
            mode=stat.S_IMODE(member.mode)
            if mode not in (0o644,0o755):
                fail('Source archive regular file has an unsupported mode')
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists() or destination.is_symlink():
                fail('Duplicate source archive member')
            source_stream = tar.extractfile(member)
            if source_stream is None:
                fail('Source archive regular file has no data stream')
            with source_stream, destination.open('xb') as output:
                shutil.copyfileobj(source_stream, output, 65536)
            destination.chmod(mode)
    if archive.wait() != 0:
        fail('Could not create exact temporary P source snapshot')
    return target, remote_commit


def public_asset_download(packet: dict, work: pathlib.Path) -> dict:
    release = packet['release']
    api = f"https://api.github.com/repos/{REPOSITORY}/releases/tags/{urllib.parse.quote(release['tag'], safe='') }"
    request = urllib.request.Request(api, headers={'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(1024 * 1024 + 1)
    if len(body) > 1024 * 1024:
        fail('Public release metadata exceeds the fixed 1 MiB response bound')
    remote = json.loads(body)
    if remote.get('id') != release['releaseId'] or remote.get('tag_name') != release['tag'] or remote.get('draft') is not False or remote.get('published_at') != release['publishedAt']:
        fail('Immutable public release identity differs from the explicit local input')
    expected_names = {row['filename'] for row in release['assets'].values()}
    remote_names = [row.get('name') for row in remote.get('assets', []) if type(row) is dict]
    if len(remote_names) != 3 or set(remote_names) != expected_names:
        fail('Public release must contain exactly the three frozen proof assets')
    asset_dir = work / 'public'
    asset_dir.mkdir()
    reports = {}
    for key, expected in packet['release']['assets'].items():
        found = [row for row in remote.get('assets', []) if type(row) is dict and row.get('name') == expected['filename']]
        expected_url = f"https://github.com/{REPOSITORY}/releases/download/{release['tag']}/{expected['filename']}"
        if len(found) != 1 or found[0].get('size') != expected['sizeBytes'] or found[0].get('browser_download_url') != expected_url:
            fail(f'Public release metadata mismatch for {key}')
        destination = asset_dir / expected['filename']
        h = hashlib.sha256(); count = 0
        with urllib.request.urlopen(urllib.request.Request(expected_url, headers={'Accept': 'application/octet-stream'}), timeout=60) as response, destination.open('xb') as out:
            final = urllib.parse.urlsplit(response.geturl())
            if final.scheme != 'https' or final.username or final.password or (final.hostname or '').lower() not in {'github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'}:
                fail('Public asset redirect leaves the accepted unauthenticated HTTPS hosts')
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                count += len(chunk)
                if count > expected['sizeBytes']:
                    fail(f'Public asset exceeded exact size: {key}')
                h.update(chunk); out.write(chunk)
        if count != expected['sizeBytes'] or h.hexdigest() != expected['sha256']:
            fail(f'Public asset bytes differ from the local frozen package: {key}')
        reports[key] = {'filename': expected['filename'], 'sizeBytes': count, 'sha256': h.hexdigest()}
    if sum(row['sizeBytes'] for row in reports.values()) != packet['limits']['publicPackageFamilyBytes']:
        fail('Public package family size differs from the exact three-asset limit')
    return {'releaseId': remote['id'], 'tag': remote['tag_name'], 'publishedAt': remote['published_at'], 'assets': reports}


def stage_toolchain(packet: dict, work: pathlib.Path) -> dict:
    bun_path = shutil.which('bun')
    if not bun_path:
        fail('Pinned Bun executable is unavailable')
    bun = subprocess.run(['bun', '--version'], check=True, text=True, capture_output=True, timeout=10).stdout.strip()
    py = subprocess.run([sys.executable, '--version'], check=True, text=True, capture_output=True, timeout=10)
    python_version = (py.stdout or py.stderr).strip()
    if bun != '1.4.3' or python_version != 'Python 3.11.17':
        fail('Local public-H toolchain differs from the frozen Ubuntu 24.04 Bun 1.4.3/Python 3.11.17 inputs')
    if platform.system() != 'Linux' or platform.machine().lower() not in ('x86_64','amd64'):
        fail('Public H consumer requires the pinned Linux x86_64 guest, including an explicitly recorded emulation host when applicable')
    os_release_path=pathlib.Path('/etc/os-release').resolve(strict=True)
    if not os_release_path.is_file() or os_release_path.stat().st_size>8192:
        fail('Linux guest release identity is unavailable or exceeds its fixed bound')
    release_fields={}
    for line in os_release_path.read_text(encoding='utf-8').splitlines():
        if '=' in line:
            key,value=line.split('=',1)
            release_fields[key]=value.strip().strip('"')
    if release_fields.get('ID')!='ubuntu' or release_fields.get('VERSION_ID')!='24.04' or not release_fields.get('VERSION','').startswith('24.04.5'):
        fail('Runtime is not the exact Ubuntu 24.04.5 guest')
    python_path=pathlib.Path(sys.executable).resolve(strict=True)
    bun_real=pathlib.Path(bun_path).resolve(strict=True)
    identity = {
        'executionKind': 'local_linux_diagnostic',
        'executionId': packet['execution']['executionId'],
        'runtimeImageDigest': packet['execution']['runtimeImageDigest'],
        'platform': platform.platform(), 'guestArchitecture': platform.machine(),
        'guestDistribution':release_fields.get('ID'),'guestVersionId':release_fields.get('VERSION_ID'),
        'guestVersion':release_fields.get('VERSION'),
        'runtimeEngine': packet['execution']['runtimeEngine'],
        'emulatedGuest': packet['execution']['emulatedGuest'],
        'bun': bun, 'bunPath':bun_path, 'bunResolvedPath':str(bun_real), 'bunExecutableSha256':sha_file(bun_real),
        'python': python_version, 'pythonPath':sys.executable, 'pythonResolvedPath':str(python_path),
        'pythonExecutableSha256':sha_file(python_path),
    }
    (work / 'toolchain.json').write_text(json.dumps(identity, sort_keys=True, indent=2) + '\n')
    report_dir=pathlib.Path(os.environ['EVIDENCE'])/'reports'; report_dir.mkdir(exist_ok=True)
    (report_dir/'toolchain.json').write_text(json.dumps(identity,sort_keys=True,indent=2)+'\n')
    return identity


def stage_verify_source(packet: dict, work: pathlib.Path) -> dict:
    producer, public_tag_commit = source_git(packet, work)
    identity = {'executionKind':'local_linux_diagnostic','producerP':packet['source']['producerCommit'],
                'producerTree':packet['source']['producerTree'],'releaseM':packet['release']['releaseCommitM'],
                'releaseTag':packet['release']['tag'],'localExecutionId':packet['execution']['executionId'],
                'publicTagCommit':public_tag_commit,
                'localAdapterSha256':packet['execution']['localAdapterSha256'],
                'hostedWorkflowSha256':packet['execution']['hostedWorkflowSha256'],
                'runtimeImageDigest':packet['execution']['runtimeImageDigest'],
                'runtimeEngine':packet['execution']['runtimeEngine'],
                'runtimeHost':packet['execution']['runtimeHost'],'runtimeGuest':packet['execution']['runtimeGuest'],
                'localEvidenceIds':{key:packet['evidence'][key]['executionId'] for key in ('sdkProducer','d5','aggregate','unionContinuation')}}
    report_dir=pathlib.Path(os.environ['EVIDENCE'])/'reports'; report_dir.mkdir(exist_ok=True)
    (report_dir/'source-identity.json').write_text(json.dumps(identity,sort_keys=True,indent=2)+'\n')
    return {'producerPath':str(producer),**identity}


def stage_acquire_cli(packet: dict, work: pathlib.Path) -> dict:
    producer = work/'producer'
    if not producer.is_dir() or producer.is_symlink():
        fail('Exact temporary P source snapshot is missing')
    result=stage_acquire(packet,producer,work)
    report_dir=pathlib.Path(os.environ['EVIDENCE'])/'reports'; report_dir.mkdir(exist_ok=True)
    (report_dir/'public-byte-correspondence.json').write_text(json.dumps({'status':'passed',**result},sort_keys=True,indent=2)+'\n')
    return result


def stage_final_cli(packet: dict, work: pathlib.Path) -> dict:
    return verify_final(work,packet)


def stage_sdk_consumer(packet: dict, work: pathlib.Path) -> dict:
    producer=work/'producer'
    helper=producer/'scripts/python-package-mirror.py'
    spec=importlib.util.spec_from_file_location('sdk_public_h_package_mirror',helper)
    if spec is None or spec.loader is None:
        fail('Existing network-isolation helper cannot be loaded from exact P source')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    prefix,isolation=module.network_isolation_prefix()
    bun=shutil.which('bun')
    if not bun:
        fail('Pinned Bun executable is unavailable')
    result=subprocess.run(prefix+[bun,'scripts/test-sdk-install.ts'],cwd=producer,check=False)
    if result.returncode:
        fail('Installed public SDK consumer failed under '+str(isolation)[:120])
    output={'status':'passed','networkIsolation':isolation,'sdkAssetSha256':packet['release']['assets']['sdk']['sha256']}
    report_dir=pathlib.Path(os.environ['EVIDENCE'])/'reports'; report_dir.mkdir(exist_ok=True)
    (report_dir/'sdk-install.json').write_text(json.dumps(output,sort_keys=True,indent=2)+'\n')
    return output


CONTINUATION_HARNESS_FILES = (
    'run-union-continuation.sh', 'run-cell.sh', 'prove-bootstrap.py',
    'capture-bounded-log.py', 'finalize.py',
)


def continuation_harness_sha256(root: pathlib.Path) -> str:
    lines = []
    for name in CONTINUATION_HARNESS_FILES:
        path = root / 'harness' / name
        if path.is_symlink() or not path.is_file():
            fail(f'Full18 continuation harness member is missing or unsafe: {name}')
        lines.append(f'{sha_file(path)}  {name}\n')
    return hashlib.sha256(''.join(lines).encode('ascii')).hexdigest()


def validate_union_continuation(packet: dict, aggregate_root: pathlib.Path,
                                aggregate_index_path: pathlib.Path,
                                aggregate_index: dict) -> tuple[pathlib.Path, dict, pathlib.Path, pathlib.Path]:
    item = packet['evidence']['unionContinuation']
    root = abs_path(item['root'], 'full18 continuation evidence root').resolve(strict=True)
    receipt_path, receipt = referenced_json(root, item['receiptPath'], item['receiptSha256'],
                                             'full18 continuation receipt')
    evidence_root = receipt_path.parent.resolve(strict=True)
    if evidence_root.parent != root:
        fail('Full18 continuation receipt is not in the package output directory')
    fields = {
        'schema','status','executionId','attempt','source','originalAggregate','runtime','bootstrap',
        'commands','limits','stageResults','phaseTimes','hostLogBytes','metadataBytesBeforeReceipt',
        'metadataCapBytes','reports','priorEvidence','generatedAtUtc',
    }
    if (set(receipt) != fields or receipt.get('schema') != 'umf.local-full18-union-continuation/2'
            or receipt.get('status') != 'passed' or receipt.get('executionId') != item['executionId']
            or receipt.get('attempt') != item['attempt']):
        fail('Full18 continuation is not the exact successful closed continuation-003 receipt')
    if type(item['attempt']) is not int or item['attempt'] < 1:
        fail('Full18 continuation local attempt is invalid')
    require_git_object(item['sourceTree'], 'full18 continuation source tree')
    source = receipt.get('source')
    if (type(source) is not dict
            or set(source) != {'commit','tree','status','volume','mount','harnessSha256'}
            or source.get('commit') != packet['source']['producerCommit']
            or source.get('tree') != packet['source']['producerTree']
            or source.get('status') != 'clean in both cells'
            or source.get('volume') != 'umf-migration-source-267675510'
            or source.get('mount') != 'read-only'
            or source.get('harnessSha256') != item['harnessSha256']
            or item.get('sourceCommit') != source.get('commit')
            or item.get('sourceTree') != source.get('tree')):
        fail('Full18 continuation does not bind the exact clean P/tree and read-only source volume')
    harness_root = abs_path(item['harnessRoot'], 'full18 continuation harness root').resolve(strict=True)
    if harness_root != root or continuation_harness_sha256(harness_root) != item['harnessSha256']:
        fail('Full18 continuation harness files differ from the exact retained harness digest')
    runtime = receipt.get('runtime')
    expected_images = {
        'linux-x86_64-py311':'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556',
        'linux-x86_64-py314':'sha256:2474bc9010faea57300e5e8c33a6be6fce4d37dada3bf8af7d8230069f4c0a30',
    }
    if (type(runtime) is not dict or runtime.get('platform') != 'linux/amd64'
            or type(runtime.get('images')) is not dict or runtime['images'] != expected_images
            or not isinstance(runtime.get('engine'),str) or not runtime['engine'].startswith('OrbStack Docker')
            or not isinstance(runtime.get('runnerKernel'),str) or not runtime['runnerKernel']):
        fail('Full18 continuation runtime images or OrbStack Linux/amd64 identity differ')
    original = receipt.get('originalAggregate')
    assembly = packet['evidence']['aggregate']
    expected_index_ref = {'path':str(aggregate_index_path), 'bytes':aggregate_index_path.stat().st_size,
                          'sha256':sha_file(aggregate_index_path)}
    if (type(original) is not dict or set(original) != {'profile','sourceCommit','producerExecutionId',
            'producerAttempt','aggregateIndex','generatorCorpus','producerReceipt','mount','reassembled'}
            or original.get('sourceCommit') != packet['source']['producerCommit']
            or original.get('producerExecutionId') != assembly['executionId']
            or original.get('producerAttempt') != assembly['attempt']
            or original.get('aggregateIndex') != expected_index_ref
            or original.get('generatorCorpus',{}).get('path') != str(aggregate_root / assembly['generatorCorpusPath'])
            or original.get('producerReceipt',{}).get('path') != str(aggregate_root / assembly['assemblyReceiptPath'])
            or original.get('mount') != 'read-only' or original.get('reassembled') is not False):
        fail('Full18 continuation does not bind the exact original aggregate producer/index without reassembly')
    corpus_path = beneath(aggregate_root, assembly['generatorCorpusPath'], 'original generator corpus')
    producer_receipt_path = beneath(aggregate_root, assembly['assemblyReceiptPath'], 'original aggregate producer receipt')
    for key, path in (('generatorCorpus',corpus_path),('producerReceipt',producer_receipt_path)):
        ref = original.get(key)
        if type(ref) is not dict or set(ref) != {'path','bytes','sha256'} or ref.get('bytes') != path.stat().st_size or ref.get('sha256') != sha_file(path):
            fail(f'Full18 continuation does not bind original {key} bytes')
    if original.get('profile') != aggregate_index.get('profile'):
        fail('Full18 continuation original aggregate profile differs from the assembled index')

    bootstrap = receipt.get('bootstrap')
    if (type(bootstrap) is not dict or set(bootstrap) != {'role','name','version','wheel',
            'publisherJson','publisherAsset','cells'}
            or bootstrap.get('role') != 'operator/verifier-only; absent from target 18-wheel lock and installed mirror'
            or bootstrap.get('name') != 'packaging' or bootstrap.get('version') != '26.3'
            or type(bootstrap.get('cells')) is not dict
            or set(bootstrap['cells']) != ({'linux-x86_64-py311','linux-x86_64-py314'}
                                            | {'linux-x86_64-py311-sourceIdentity',
                                               'linux-x86_64-py314-sourceIdentity'})):
        fail('Full18 continuation bootstrap is not the exact packaging 26.3 operator-only profile')
    wheel_path = beneath(root, item['bootstrapWheelPath'], 'full18 operator bootstrap wheel')
    metadata_path = beneath(root, item['bootstrapMetadataPath'], 'full18 operator bootstrap publisher metadata')
    wheel_ref = bootstrap['wheel']; publisher_ref = bootstrap['publisherJson']
    if (type(wheel_ref) is not dict or set(wheel_ref) != {'path','bytes','sha256'}
            or continuation_file(root, wheel_ref.get('path'), 'receipt full18 operator bootstrap wheel') != wheel_path
            or wheel_ref.get('sha256') != item['bootstrapWheelSha256']
            or wheel_ref.get('bytes') != 129956 or wheel_path.stat().st_size != wheel_ref.get('bytes')
            or sha_file(wheel_path) != wheel_ref.get('sha256')
            or type(publisher_ref) is not dict or set(publisher_ref) != {'path','bytes','sha256'}
            or continuation_file(root, publisher_ref.get('path'), 'receipt full18 bootstrap publisher metadata') != metadata_path
            or publisher_ref.get('sha256') != item['bootstrapMetadataSha256']
            or metadata_path.stat().st_size != publisher_ref.get('bytes')
            or sha_file(metadata_path) != publisher_ref.get('sha256')):
        fail('Full18 operator bootstrap wheel or publisher metadata differs from its frozen byte references')
    if bootstrap['publisherAsset'] != {
            'url':'https://files.pythonhosted.org/packages/63/34/ba1c580383c9eada3711951fef0795c80b829a078d72188184bcab9dd527/packaging-26.3-py3-none-any.whl',
            'sha256':'d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c',
            'size':129956,'yanked':False}:
        fail('Full18 bootstrap wheel publisher identity differs from the exact public packaging 26.3 asset')
    metadata = json_file(metadata_path)
    if metadata.get('info',{}).get('version') != '26.3':
        fail('Full18 bootstrap publisher metadata is not packaging 26.3')
    urls = [row for row in metadata.get('urls',[]) if type(row) is dict and row.get('filename') == wheel_path.name]
    if (len(urls) != 1 or urls[0].get('url') != bootstrap['publisherAsset']['url']
            or urls[0].get('size') != wheel_path.stat().st_size
            or urls[0].get('digests',{}).get('sha256') != sha_file(wheel_path)
            or urls[0].get('yanked') is not False):
        fail('Full18 bootstrap wheel does not match the retained primary publisher JSON')
    cell_proofs = {}
    for cell in ('linux-x86_64-py311','linux-x86_64-py314'):
        ref = bootstrap['cells'][cell]
        if type(ref) is not dict or set(ref) != {'path','bytes','sha256'}:
            fail(f'{cell} bootstrap proof reference is not closed')
        proof_path = continuation_file(root, ref['path'], f'{cell} packaging bootstrap proof')
        proof = json_file(proof_path)
        expected_python_prefix = '3.11.' if cell.endswith('py311') else '3.14.'
        if (ref.get('bytes') != proof_path.stat().st_size or ref.get('sha256') != sha_file(proof_path)
                or proof.get('cell') != cell or not str(proof.get('pythonVersion','')).startswith(expected_python_prefix)
                or proof.get('packagingVersion') != '26.3'
                or proof.get('packagingImportOrigin') == ''
                or proof.get('bootstrapWheelSha256') != sha_file(wheel_path)
                or proof.get('bootstrapWheelBytes') != wheel_path.stat().st_size
                or proof.get('defaultEnvironmentEqual') is not True
                or proof.get('acquisitionDefaultEnvironment') != proof.get('replayDefaultEnvironment')):
            fail(f'{cell} bootstrap proof lacks exact version, wheel, import-origin and marker-environment equality')
        cell_proofs[cell] = {'path':ref['path'],'bytes':ref['bytes'],'sha256':ref['sha256']}
        identity_ref = bootstrap['cells'][f'{cell}-sourceIdentity']
        if type(identity_ref) is not dict or set(identity_ref) != {'path','bytes','sha256'}:
            fail(f'{cell} source identity reference is not closed')
        identity_path = continuation_file(root, identity_ref['path'], f'{cell} full18 source identity')
        identity = json_file(identity_path)
        if (identity_ref.get('bytes') != identity_path.stat().st_size
                or identity_ref.get('sha256') != sha_file(identity_path)
                or set(identity) != {'cell','sourceCommit','sourceTree','sourceStatus','pythonVersion',
                                     'containerNetwork','cellLogCapBytes'}
                or identity.get('cell') != cell
                or identity.get('sourceCommit') != packet['source']['producerCommit']
                or identity.get('sourceTree') != packet['source']['producerTree']
                or identity.get('sourceStatus') != 'clean'
                or not str(identity.get('pythonVersion','')).startswith(expected_python_prefix)
                or identity.get('containerNetwork') != 'none'
                or identity.get('cellLogCapBytes') != 1024*1024):
            fail(f'{cell} source identity file does not bind its actual clean source/runtime cell')
    cell_ids = {'linux-x86_64-py311','linux-x86_64-py314'}
    command_info = receipt.get('commands')
    if (type(command_info) is not dict
            or set(command_info) != {'selectorControl','controlOutcome','probe','cells','cellLogs','hostStageLogs'}
            or command_info.get('selectorControl') != 'tests/codegen/test_cohort_selector.py::InventoryTests::test_active_requirement_extras_refuse_but_inactive_optional_edge_stays_inactive'
            or not isinstance(command_info.get('controlOutcome'),str)
            or command_info.get('probe') != ('python -I tests/codegen/offline_mirror_probe.py --aggregate-index '
                '/aggregate/aggregate.json --selected-cell {cell} --expected-source-commit '
                + packet['source']['producerCommit'] + ' --mirror /aggregate/mirror '
                '--generator-corpus /aggregate/generator-corpus.json --report /out/reports/{cell}.json')
            or set(command_info.get('cells',{})) != cell_ids
            or set(command_info.get('cellLogs',{})) != cell_ids):
        fail('Full18 continuation command/control roster differs from the exact two-cell original replay')
    if command_info.get('controlOutcome') != 'passed in both cells: active requested extras refuse; inactive optional extra-marked requirement stays inactive':
        fail('Full18 continuation selector-control outcome differs from the exact original control')
    host_logs = command_info['hostStageLogs']
    if type(host_logs) is not dict:
        fail('Full18 continuation host-stage log roster is malformed')
    expected_cell_commands = ['packaging-bootstrap-install','packaging-bootstrap-proof','selector-control','union-replay']
    expected_host_log_names = {
        f'{cell}-{label}.log'
        for cell in cell_ids
        for label in ('union-replay','packaging-bootstrap-install','packaging-bootstrap-proof','selector-control')
    } | {f'host-{cell}-union-replay.log' for cell in cell_ids}
    if set(host_logs) != expected_host_log_names:
        fail('Full18 continuation log set is not the exact two-cell host and inner command roster')
    host_logs_by_name = {pathlib.PurePosixPath(ref['path']).name:ref
                         for ref in host_logs.values() if type(ref) is dict}
    if len(host_logs_by_name) != len(host_logs) or set(host_logs_by_name) != expected_host_log_names:
        fail('Full18 continuation host/command log references contain malformed or duplicate names')
    for cell in cell_ids:
        command_ref = command_info['cells'][cell]
        if type(command_ref) is not dict or set(command_ref) != {'path','bytes','sha256'}:
            fail(f'{cell} continuation command record reference is not closed')
        command_path = continuation_file(root, command_ref['path'], f'{cell} continuation command records')
        if command_ref.get('bytes') != command_path.stat().st_size or command_ref.get('sha256') != sha_file(command_path):
            fail(f'{cell} continuation command record bytes differ from their reference')
        command_rows = [json.loads(line) for line in command_path.read_text(encoding='utf-8').splitlines() if line]
        if any(type(row) is not dict for row in command_rows) or [row.get('name') for row in command_rows] != expected_cell_commands:
            fail(f'{cell} continuation command roster is incomplete or reordered')
        for command_row in command_rows:
            if (type(command_row) is not dict
                    or set(command_row) != {'name','commandExit','captureExit','logBytes','logSha256',
                                            'startedEpochNs','finishedEpochNs','log'}
                    or command_row.get('commandExit') != 0 or command_row.get('captureExit') != 0
                    or type(command_row.get('logBytes')) is not int or command_row['logBytes'] < 0
                    or type(command_row.get('startedEpochNs')) is not int
                    or type(command_row.get('finishedEpochNs')) is not int
                    or command_row['finishedEpochNs'] < command_row['startedEpochNs']
                    or not isinstance(command_row.get('logSha256'),str)
                    or re.fullmatch(r'[0-9a-f]{64}',command_row['logSha256']) is None
                    or command_row.get('log') != f"/out/logs/{cell}-{command_row.get('name')}.log"):
                fail(f'{cell} continuation contains a failed or incomplete bounded command row')
            host_log = host_logs_by_name.get(pathlib.PurePosixPath(command_row['log']).name)
            if (host_log is None
                    or host_log.get('path') != str(evidence_root/'logs'/pathlib.PurePosixPath(command_row['log']).name)
                    or host_log.get('bytes') != command_row['logBytes']
                    or host_log.get('sha256') != command_row['logSha256']):
                fail(f'{cell} continuation inner command log differs from its distinct host-captured original bytes')
        if sum(row['logBytes'] for row in command_rows) > 1024*1024:
            fail(f'{cell} continuation exceeds its explicit operator command-log cap')
        cell_log = command_info['cellLogs'][cell]
        if (type(cell_log) is not dict or set(cell_log) != {'commandRoster','totalBytes','capBytes'}
                or cell_log.get('commandRoster') != command_rows
                or cell_log.get('totalBytes') != sum(row['logBytes'] for row in command_rows)
                or cell_log.get('capBytes') != 1024*1024):
            fail(f'{cell} continuation cell-log summary differs from actual command records')
    host_bytes = 0
    for name, ref in host_logs.items():
        if type(ref) is not dict or set(ref) != {'path','bytes','sha256'}:
            fail('Full18 continuation host/command log reference is not closed')
        path = continuation_file(root, ref['path'], f'{name} continuation host log')
        if (path.name != name or path.parent != (evidence_root/'logs').resolve()
                or ref.get('bytes') != path.stat().st_size or ref.get('sha256') != sha_file(path)):
            fail(f'{name} continuation physical log bytes differ from their exact reference')
        if name in {f'host-{cell}-union-replay.log' for cell in cell_ids}:
            host_bytes += ref['bytes']
    if host_bytes != receipt.get('hostLogBytes'):
        fail('Full18 continuation host-log byte total differs from its exact logs')
    stage_rows = receipt.get('stageResults')
    if (type(stage_rows) is not list or len(stage_rows) != 2
            or {row.get('stage') for row in stage_rows if type(row) is dict}
                != {f'{cell}-union-replay' for cell in cell_ids}):
        fail('Full18 continuation stage roster is not the exact two selected Linux cells')
    host_log_by_path = {ref['path']:ref for ref in host_logs.values() if type(ref) is dict}
    for row in stage_rows:
        if type(row) is not dict:
            fail('Full18 continuation stage row is malformed')
        try:
            elapsed = float(row.get('elapsedSeconds',''))
            log_bytes = int(row.get('logBytes',''))
        except (TypeError,ValueError):
            fail('Full18 continuation stage timing or log size is malformed')
        if row.get('logPath') != f"logs/host-{row.get('stage')}.log":
            fail('Full18 continuation host-stage log path does not use its distinct host capture name')
        log_ref = host_log_by_path.get(str(receipt_path.parent / row.get('logPath','')))
        if (row.get('maxSeconds') != '3600' or row.get('exitCode') != '0'
                or type(elapsed) not in (int,float) or not math.isfinite(elapsed)
                or elapsed < 0 or elapsed > 3600 or log_ref is None
                or log_bytes != log_ref.get('bytes') or row.get('logSha256') != log_ref.get('sha256')):
            fail('Full18 continuation stage timing, exit or log does not bind the original bounded replay')
    limits = receipt.get('limits')
    original_limits = {
        'stageWatchdogSeconds':3600,'dockerStopGraceSeconds':30,'cpus':8,
        'memoryBytes':25769803776,'pidsLimit':8192,'pullPolicy':'never','platform':'linux/amd64',
        'network':'none','sourceAndAggregateMounts':'read-only',
        'scope':'preserved from /private/tmp/migration-local-python-route/run-full18-linux.sh; no original full18 log/evidence byte cap is claimed',
    }
    operator_caps = {
        'hostCapturedLogBytesTotal':1024*1024,'perCellCapturedCommandLogsBytes':1024*1024,
        'evidenceMetadataBytes':16*1024*1024,
        'origin':'defensive caps added for this continuation, not claims about the original full18 contract',
    }
    if (type(limits) is not dict or set(limits) != {'originalFull18LocalContract','addedOperatorCaps'}
            or limits.get('originalFull18LocalContract') != original_limits
            or limits.get('addedOperatorCaps') != operator_caps):
        fail('Full18 continuation changed original bounds or omitted its separately labeled operator caps')
    reports = receipt.get('reports')
    if type(reports) is not dict or set(reports) != cell_ids:
        fail('Full18 continuation does not bind exactly both Linux replay reports')
    for cell in cell_ids:
        report_ref = reports[cell]
        if type(report_ref) is not dict or set(report_ref) != {'path','bytes','sha256'}:
            fail(f'{cell} union report reference is not closed')
        report_path = continuation_file(root, report_ref['path'], f'{cell} full18 replay report')
        report = json_file(report_path)
        if (report_ref.get('bytes') != report_path.stat().st_size or report_ref.get('sha256') != sha_file(report_path)
                or report.get('status') != 'passed' or report.get('wheelCount') != 18
                or report.get('aggregate',{}).get('sourceCommit') != packet['source']['producerCommit']
                or report.get('aggregate',{}).get('indexSha256') != sha_file(aggregate_index_path)
                or report.get('aggregate',{}).get('selectedCell') != cell):
            fail(f'{cell} full18 report is not an exact successful current-source 18-wheel replay')
    if type(receipt.get('hostLogBytes')) is not int or not 0 <= receipt['hostLogBytes'] <= 1024*1024:
        fail('Full18 continuation exceeds its explicit operator host-log cap')
    if (type(receipt.get('metadataBytesBeforeReceipt')) is not int
            or type(receipt.get('metadataCapBytes')) is not int or receipt['metadataCapBytes'] != 16*1024*1024
            or receipt['metadataBytesBeforeReceipt'] + receipt_path.stat().st_size > receipt['metadataCapBytes']):
        fail('Full18 continuation exceeds its explicit operator metadata cap')
    prior = receipt.get('priorEvidence')
    if (type(prior) is not dict or prior.get('originalPy311UnionFailure',{}).get('status') != 'failed and preserved, not relabeled'
            or prior.get('continuation001',{}).get('limitsDisposition') != 'unqualified because it did not enforce original 3600s host watchdog'):
        fail('Full18 continuation did not retain the exact prior failure/unqualified dispositions')
    return root, receipt, wheel_path, metadata_path


def install_operator_bootstrap(packet: dict, work: pathlib.Path, wheel: pathlib.Path,
                               aggregate_index_path: pathlib.Path, aggregate_lock_path: pathlib.Path) -> dict:
    venv_path = work / 'operator-venv'
    if venv_path.exists() or venv_path.is_symlink():
        fail('Operator verifier environment must be fresh')
    create = subprocess.run([sys.executable,'-I','-m','venv',str(venv_path)],check=False,timeout=45)
    if create.returncode != 0:
        fail('Could not create the isolated operator/verifier environment')
    operator_python = venv_path/'bin/python3'
    if not operator_python.exists():
        fail('Isolated operator/verifier Python executable is missing')
    install_argv = [str(operator_python),'-I','-m','pip','--isolated','install',
                    '--disable-pip-version-check','--no-index','--no-deps','--ignore-installed',str(wheel)]
    install = subprocess.run(install_argv,check=False,timeout=90)
    if install.returncode != 0:
        fail('Offline packaging 26.3 operator bootstrap installation failed')
    proof_path = pathlib.Path(os.environ['EVIDENCE'])/'reports'/'packaging-bootstrap.json'
    proof_code = r'''
import hashlib, importlib.metadata, json, packaging, pathlib, platform, sys
from packaging.markers import default_environment
lock_path, wheel_path, proof_path = map(pathlib.Path, sys.argv[1:])
lock = json.loads(lock_path.read_text())
expected = lock['dependencyResolution']['markerEnvironment']
wheel = pathlib.Path(wheel_path)
origin = pathlib.Path(packaging.__file__).resolve()
prefix = pathlib.Path(sys.prefix).resolve()
try:
    origin.relative_to(prefix)
except ValueError:
    raise SystemExit('packaging import escaped the ephemeral operator environment')
env = default_environment()
proof = {'pythonVersion':platform.python_version(),'packagingVersion':importlib.metadata.version('packaging'),
         'packagingImportOrigin':str(origin),'operatorPrefix':str(prefix),
         'bootstrapWheelSha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),
         'bootstrapWheelBytes':wheel.stat().st_size,
         'acquisitionDefaultEnvironment':expected,'replayDefaultEnvironment':env,
         'defaultEnvironmentEqual':env == expected}
if proof['pythonVersion'] != '3.11.17' or proof['packagingVersion'] != '26.3' or not proof['defaultEnvironmentEqual']:
    raise SystemExit('operator bootstrap version or complete marker environment mismatch')
proof_path.write_text(json.dumps(proof,sort_keys=True,indent=2)+'\n')
'''
    proof_argv = [str(operator_python),'-I','-c',proof_code,str(aggregate_lock_path),str(wheel),str(proof_path)]
    verified = subprocess.run(proof_argv,check=False,timeout=30)
    if verified.returncode != 0 or proof_path.is_symlink() or not proof_path.is_file():
        fail('Offline packaging bootstrap did not verify the exact acquired cell marker environment')
    proof = json_file(proof_path, 128*1024)
    if (proof.get('pythonVersion') != '3.11.17' or proof.get('packagingVersion') != '26.3'
            or proof.get('bootstrapWheelSha256') != sha_file(wheel)
            or proof.get('bootstrapWheelBytes') != wheel.stat().st_size
            or proof.get('defaultEnvironmentEqual') is not True
            or proof.get('acquisitionDefaultEnvironment') != proof.get('replayDefaultEnvironment')):
        fail('Operator bootstrap proof differs from exact local wheel or 3.11 acquisition environment')
    proof['installArgv'] = install_argv
    proof['verificationArgv'] = ['<operator-python>','-I','-c','<fixed marker-environment proof>',str(aggregate_lock_path),str(wheel),str(proof_path)]
    return {'python':str(operator_python),'proof':proof,'proofPath':str(proof_path)}


def stage_acquire(packet: dict, producer: pathlib.Path, work: pathlib.Path) -> dict:
    public = public_asset_download(packet, work)
    ev = packet['evidence']
    sdk = ev['sdkProducer']
    sdk_root = abs_path(sdk['root'], 'SDK producer evidence root').resolve(strict=True)
    sdk_receipt_path, sdk_receipt = referenced_json(sdk_root, sdk['receiptPath'], sdk['receiptSha256'], 'SDK producer receipt')
    sdk_harness_path = beneath(sdk_root, sdk['harnessPath'], 'SDK producer harness')
    sdk_archive = beneath(sdk_root, sdk['archivePath'], 'SDK archive')
    sdk_manifest = beneath(sdk_root, sdk['manifestPath'], 'SDK source manifest')
    sdk_receipt_fields = {
        'schema','profile','status','sourceCommit','sourceTree','executionId','attempt',
        'harness','runtime','provisioning','resourceLimits','durationSeconds','aggregateTimeoutSeconds',
        'command','commands','consumer','artifacts','failureCode',
    }
    if (set(sdk_receipt) != sdk_receipt_fields
            or sdk_receipt.get('profile') != 'umf.sdk.distribution/1'
            or sdk_receipt.get('schema') != 'umf.local-linux-sdk-producer/1'
            or sdk_receipt.get('status') != 'passed'):
        fail('SDK producer receipt is not a successful closed local producer record')
    if (sdk_receipt.get('executionId') != sdk['executionId'] or sdk_receipt.get('attempt') != sdk['attempt']
            or sdk_receipt.get('sourceCommit') != packet['source']['producerCommit']
            or sdk_receipt.get('sourceTree') != packet['source']['producerTree']
            or sdk_receipt.get('harness') != {'sha256':sdk['harnessSha256']}
            or sdk_harness_sha256(sdk_harness_path) != sdk['harnessSha256']):
        fail('SDK producer receipt does not bind the exact execution, source/tree and harness input')
    command = sdk_receipt.get('command', {})
    if (type(command) is not dict or command.get('name') != 'sdk-test-install'
            or type(command.get('exitCode')) is not int or command.get('exitCode') != 0):
        fail('SDK producer receipt does not bind a successful installed 139-case consumer command')
    runtime = sdk_receipt.get('runtime')
    if (type(runtime) is not dict
            or set(runtime) != {'imageId','architecture','system','release','python','bun','node','cargo','rustc'}
            or runtime.get('imageId') != SDK_BUILDER_IMAGE_DIGEST
            or runtime.get('architecture') not in ('x86_64','amd64')
            or runtime.get('system') != 'Linux'
            or runtime.get('python') != '3.11.17'
            or runtime.get('bun') != '1.4.3'
            or runtime.get('node') != 'v26.12.1'
            or runtime.get('cargo') != 'cargo 1.90.0 (840b83a10 2025-07-30)'
            or runtime.get('rustc') != 'rustc 1.90.0 (1159e78c4 2025-09-14)'
            or not isinstance(runtime.get('release'),str) or not runtime['release']):
        fail('SDK producer receipt runtime differs from the exact recorded SDK builder identity')
    provisioning = sdk_receipt.get('provisioning')
    if (type(provisioning) is not dict or set(provisioning) != {'baseImageId','sdkBuildTools'}
            or provisioning.get('baseImageId') != packet['execution']['runtimeImageDigest']
            or type(provisioning.get('sdkBuildTools')) is not dict
            or set(provisioning['sdkBuildTools']) != {'ar','cc','installedPackages','ld','pkgConfig'}
            or any(type(value) is not str or not value for value in provisioning['sdkBuildTools'].values())):
        fail('SDK builder provisioning does not bind the exact existing Linux proof base and compiler tools')
    resource_limits = sdk_receipt.get('resourceLimits')
    if (resource_limits != {'cpus':4,'memoryBytes':8589934592,'pids':4096,
                            'network':'bridge','pullPolicy':'never'}
            or sdk_receipt.get('failureCode') is not None):
        fail('SDK producer limits or final failure code differ from the exact local producer contract')
    producer_duration = sdk_receipt.get('durationSeconds')
    if (sdk_receipt.get('aggregateTimeoutSeconds') != 1500
            or type(producer_duration) not in (int,float) or not math.isfinite(producer_duration)
            or producer_duration < 0
            or sdk_receipt['durationSeconds'] > 1500):
        fail('SDK producer receipt exceeded or changed its fixed aggregate command deadline')
    sdk_commands = sdk_receipt.get('commands')
    expected_sdk_commands = {
        'bun-install-frozen': (['bun','install','--frozen-lockfile'],300),
        'cargo-fetch-locked': (['cargo','fetch','--locked'],600),
        'sdk-build': (['bun','run','build:sdk'],600),
        'sdk-test-install': (['bun','scripts/test-sdk-install.ts'],180),
    }
    if type(sdk_commands) is not list or len(sdk_commands) != len(expected_sdk_commands):
        fail('SDK producer receipt lacks the exact bounded build/installed-consumer command roster')
    seen_sdk_commands = set()
    sdk_log_total = 0
    for command_row in sdk_commands:
        if type(command_row) is not dict or command_row.get('name') not in expected_sdk_commands:
            fail('SDK producer receipt command row is unknown or malformed')
        if command_row['name'] in seen_sdk_commands:
            fail('SDK producer receipt duplicates a bounded command')
        seen_sdk_commands.add(command_row['name'])
        expected_argv, expected_timeout = expected_sdk_commands[command_row['name']]
        duration = command_row.get('durationSeconds')
        applied_timeout = command_row.get('timeoutSeconds')
        if (command_row.get('argv') != expected_argv or type(command_row.get('exitCode')) is not int
                or command_row.get('exitCode') != 0
                or type(applied_timeout) is not int or applied_timeout < 1
                or applied_timeout > expected_timeout
                or type(duration) not in (int,float) or not math.isfinite(duration)
                or duration < 0 or duration > applied_timeout):
            fail(f"SDK producer command did not preserve its exact bounded argv: {command_row['name']}")
        log_ref = command_row.get('log')
        if type(log_ref) is not dict or set(log_ref) != {'path','sizeBytes','sha256'}:
            fail(f"SDK producer command log reference is incomplete: {command_row['name']}")
        log_path = beneath(sdk_root, log_ref['path'], f"SDK producer {command_row['name']} log")
        if (type(log_ref.get('sizeBytes')) is not int or log_path.stat().st_size != log_ref['sizeBytes']
                or sha_file(log_path) != log_ref.get('sha256')):
            fail(f"SDK producer command log custody differs: {command_row['name']}")
        sdk_log_total += log_ref['sizeBytes']
    if seen_sdk_commands != set(expected_sdk_commands) or sdk_log_total > LIMITS['aggregateLogBytes']:
        fail('SDK producer command roster or aggregate log bytes differ from the fixed limits')
    sdk_result = sdk_receipt.get('consumer', {})
    if (sdk_result.get('conformanceCases') != 139 or sdk_result.get('loaderEntrypoint') is not True
            or sdk_result.get('bundledActions') is not True or sdk_result.get('unifiedGenerator') is not True
            or sdk_result.get('singleInstall') is not True):
        fail('SDK producer receipt lacks the full installed 139-case consumer result')
    sdk_artifacts = sdk_receipt.get('artifacts')
    if type(sdk_artifacts) is not dict or set(sdk_artifacts) != {'sdkArchive','sdkManifest'}:
        fail('SDK producer receipt artifact roster is not the exact archive/manifest pair')
    for artifact_key, declared_path, declared_size, declared_sha in (
            ('sdkArchive',sdk['archivePath'],sdk['archiveSizeBytes'],sdk['archiveSha256']),
            ('sdkManifest',sdk['manifestPath'],sdk['manifestSizeBytes'],sdk['manifestSha256'])):
        ref = sdk_artifacts.get(artifact_key)
        if (type(ref) is not dict or set(ref) != {'path','sizeBytes','sha256'}
                or ref.get('path') != declared_path or ref.get('sizeBytes') != declared_size
                or ref.get('sha256') != declared_sha):
            fail(f'SDK producer receipt does not bind the declared {artifact_key} bytes')
    if sdk_archive.stat().st_size != packet['release']['assets']['sdk']['sizeBytes'] or sha_file(sdk_archive) != packet['release']['assets']['sdk']['sha256']:
        fail('Local SDK producer tarball differs from the exact public SDK asset')
    if (type(sdk['archiveSizeBytes']) is not int or sdk_archive.stat().st_size != sdk['archiveSizeBytes']
            or sha_file(sdk_archive) != sdk['archiveSha256']):
        fail('SDK archive differs from the exact producer receipt input')
    if (type(sdk['manifestSizeBytes']) is not int or sdk_manifest.stat().st_size != sdk['manifestSizeBytes']
            or sha_file(sdk_manifest) != sdk['manifestSha256']):
        fail('SDK manifest differs from the exact producer receipt input')
    manifest = json_file(sdk_manifest)
    if manifest.get('profile') != 'umf.sdk.distribution/1' or manifest.get('bundledVocabularies', {}).get('umf.actions') != '0.1.0' or type(manifest.get('sha256')) is not dict:
        fail('SDK producer manifest has incomplete public package identity')
    sdk_public = work / 'public' / packet['release']['assets']['sdk']['filename']
    if sdk_public.stat().st_size != sdk_archive.stat().st_size or sha_file(sdk_public) != sha_file(sdk_archive):
        fail('Public SDK asset differs byte-for-byte from the local producer package')
    cache = producer / '.cache/sdk-distribution'
    cache.mkdir(parents=True, exist_ok=True)
    with sdk_public.open('rb') as source_stream, (cache / 'umf-sdk.tgz').open('xb') as destination_stream:
        shutil.copyfileobj(source_stream,destination_stream,65536)

    d5 = ev['d5']; d5_root = abs_path(d5['root'], 'D5 evidence root').resolve(strict=True)
    d5_profile_evidence = validate_d5_profile_evidence(d5, d5_root)
    read_d5_json = referenced_local_json if d5_profile_evidence is not None else referenced_json
    d5_receipt_path, d5_receipt = read_d5_json(d5_root, d5['receiptPath'], d5['receiptSha256'], 'D5 receipt')
    d5_inputs_path, d5_inputs = read_d5_json(d5_root, d5['qualificationInputsPath'], d5['qualificationInputsSha256'], 'D5 qualification inputs')
    d5_context_path, d5_context = read_d5_json(d5_root, d5['runContextPath'], d5['runContextSha256'], 'D5 local runtime context')
    if d5_profile_evidence is None:
        if (d5_receipt.get('resourceProfile') == LOCAL_D5_PROFILE
                or d5_receipt.get('aggregateSeconds') == 3600
                or d5_inputs.get('resourceProfile') == LOCAL_D5_PROFILE
                or d5_context.get('resourceProfile') == LOCAL_D5_PROFILE
                or d5_context.get('aggregateSeconds') == 3600):
            fail('D5 3600-second receipt/context lacks the separately pinned resource-profile evidence')
        d5_resource_summary = None
    else:
        d5_resource_summary = validate_d5_selected_evidence(
            packet, d5, d5_root, d5_receipt, d5_inputs, d5_context_path,
            d5_context, d5_profile_evidence)
    owner_path = beneath(d5_root, d5['ownerManifestPath'], 'D5 owner manifest')
    owner = json_file(owner_path)
    cohort_lock_path = beneath(d5_root, d5['cohortLockPath'], 'D5 exact current cohort lock')
    cohort_lock = json_file(cohort_lock_path)
    mirror_manifest_path = beneath(d5_root, d5['mirrorManifestPath'], 'D5 exact current mirror manifest')
    mirror_manifest = json_file(mirror_manifest_path)
    payload_root = beneath(d5_root, d5['releasePayloadRoot'], 'D5 release-payload root')
    payload_receipt_path = beneath(payload_root, d5['releasePayloadReceiptPath'], 'release-payload receipt')
    payload = json_file(payload_receipt_path)
    if (d5_receipt.get('status') != 'LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY'
            or d5_receipt.get('executionKind') != 'local_linux_diagnostic'
            or d5_receipt.get('localExecutionId') != d5['executionId']
            or str(d5_receipt.get('localAttempt')) != str(d5['attempt'])
            or d5_receipt.get('sourceCommit') != packet['source']['producerCommit']
            or d5_receipt.get('adapterWorkflow') != f"local-access-boundaries-{d5['workflowSha256']}"
            or d5_receipt.get('cases') != 37 or d5_receipt.get('oracleGroups') != 16
            or d5_receipt.get('faultScenarios') != 3 or d5_receipt.get('noDefaultChecks') != 19
            or d5_receipt.get('commandCount') != 30
            or type(d5_receipt.get('logBytes')) is not int or d5_receipt['logBytes'] > LIMITS['aggregateLogBytes']
            or type(d5_receipt.get('evidenceBytes')) is not int or d5_receipt['evidenceBytes'] > LIMITS['metadataArtifactBytes']
            or d5_receipt.get('cleanupVerified') is not True):
        fail('Local D5 receipt is not the exact passing current-source 37-case result')
    if (d5_inputs.get('sourceCommit') != packet['source']['producerCommit']
            or d5_inputs.get('sourceTree') != packet['source']['producerTree']
            or d5_inputs.get('localExecutionId') != d5['executionId']
            or str(d5_inputs.get('localAttempt')) != str(d5['attempt'])
            or d5_inputs.get('executionKind') != 'local_linux_diagnostic'):
        fail('D5 qualification inputs do not bind the exact local attempt/source/tree')
    if (d5_inputs.get('workflowSha256') != d5['workflowSha256']
            or d5_receipt.get('currentCohortLockSha256') != sha_file(cohort_lock_path)
            or owner.get('cohortLockSha256') != sha_file(cohort_lock_path)
            or owner.get('mirrorManifestSha256') != sha_file(mirror_manifest_path)
            or d5_receipt.get('currentOwnerManifestSha256') != sha_file(owner_path)):
        fail('D5 receipt, owner manifest, qualification inputs and copied cohort bytes do not share exact custody')
    if (type(cohort_lock.get('packages')) is not list or len(cohort_lock['packages']) != 18
            or type(cohort_lock.get('wheels')) is not list or len(cohort_lock['wheels']) != 18
            or owner.get('status') != 'frozen-current-D5-cohort' or owner.get('wheelCount') != 18):
        fail('D5 owner and copied lock do not describe the complete original 18-wheel cohort')
    lock_wheels = {row.get('filename'): {'sha256':row.get('sha256'),'bytes':row.get('size')}
                   for row in cohort_lock['wheels'] if type(row) is dict}
    if len(lock_wheels) != 18 or owner.get('artifacts') != lock_wheels:
        fail('D5 frozen owner wheel hashes/sizes differ from the exact copied 18-wheel lock')
    if (d5_context.get('profile') != 'umf.local-docker-g02-d5-context/1'
            or d5_context.get('executionKind') != 'local_linux_diagnostic'
            or d5_context.get('hostedQualificationClaim') is not False
            or d5_context.get('executionId') != d5['executionId']
            or d5_context.get('attempt') != d5['attempt']
            or d5_context.get('sourceCommit') != packet['source']['producerCommit']
            or d5_context.get('sourceTree') != packet['source']['producerTree']
            or d5_context.get('workflowSha256') != d5_inputs.get('workflowSha256')
            or d5_context.get('runtimeImageReference') != RUNTIME_IMAGE_DIGEST
            or re.fullmatch(r'sha256:[0-9a-f]{64}', str(d5_context.get('runtimeImageConfigId',''))) is None
            or d5_context.get('postgresImageReference') != 'sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
            or re.fullmatch(r'sha256:[0-9a-f]{64}', str(d5_context.get('postgresImageConfigId',''))) is None
            or re.fullmatch(r'[0-9a-f]{64}', str(d5_context.get('postgresContainerId',''))) is None
            or d5_context.get('runtimeEngine') != 'OrbStack'
            or d5_context.get('host') != {'os':'Darwin','architecture':'aarch64'}
            or d5_context.get('guest') != {'os':'Linux','distribution':'Ubuntu','version':'24.04.5','architecture':'x86_64','emulated':True}
            or d5_context.get('clientExit') != 0
            or d5_context.get('postgresPlatform') != 'linux/arm64'
            or '18.6' not in '\n'.join(d5_context.get('postgresIdentityText', []))
            or '180006' not in d5_context.get('postgresIdentityText', [])[-1:]):
        fail('D5 local Docker context does not prove the isolated runtime, PostgreSQL 18.6 and cleanup')
    if (d5_profile_evidence is None
            and (d5_context.get('cleanup', {}).get('clientRemoved') is not True
                 or d5_context.get('cleanup', {}).get('postgresRemoved') is not True
                 or d5_context.get('cleanup', {}).get('networkRemoved') is not True)):
        fail('Original D5 route does not prove cleanup of its owned containers and network')
    require_digest(d5['workflowSha256'], 'D5 source workflow SHA-256')
    if (owner.get('sourceCommit') != packet['source']['producerCommit']
            or owner.get('localExecutionId') != d5['executionId']
            or str(owner.get('localAttempt')) != str(d5['attempt'])
            or owner.get('workflowSha256') != d5['workflowSha256']
            or payload.get('sourceCommit') != packet['source']['producerCommit']
            or payload.get('localExecutionId') != d5['executionId']
            or str(payload.get('localAttempt')) != str(d5['attempt'])
            or payload.get('cohortLockSha256') != owner.get('cohortLockSha256')):
        fail('D5 owner/payload source does not bind current P')
    owner_sha = sha_file(owner_path); payload_sha = sha_file(payload_receipt_path)
    if owner_sha != d5['ownerManifestSha256'] or payload_sha != d5['releasePayloadReceiptSha256']:
        fail('D5 owner/payload bytes differ from their frozen evidence identities')
    if d5_receipt.get('releasePayloadReceiptSha256') != payload_sha or d5_receipt.get('currentOwnerManifestSha256') != owner_sha or payload.get('ownerManifestSha256') != owner_sha:
        fail('D5 and release-payload receipts do not bind the exact owner/payload bytes')
    if payload.get('status') not in ('current-job-built-release-payload','LOCAL_DIAGNOSTIC_PASS_RELEASE_PAYLOAD') or payload.get('sourceTree') != packet['source']['producerTree'] or payload.get('localExecutionId') != d5['executionId']:
        fail('Release-payload source/tree/local-run identity differs')
    release_wheels = {row.get('filename'): row for row in payload.get('wheels', []) if type(row) is dict}
    if set(release_wheels) != {packet['release']['assets']['access']['filename'], packet['release']['assets']['codegen']['filename']} or len(payload.get('wheels', [])) != 2:
        fail('D5 payload does not contain exactly the public Access and Codegen wheels')
    owner_wheels = owner.get('artifacts', {})

    aggregate = ev['aggregate']; aggregate_root = abs_path(aggregate['root'], 'aggregate evidence root').resolve(strict=True)
    continuation_mode = aggregate.get('verificationMode') == 'assembly-plus-bounded-continuation003'
    if continuation_mode:
        aggregate_harness_raw = abs_path(aggregate['harnessPath'], 'full18 aggregate harness copy')
        try:
            harness_before = aggregate_harness_raw.lstat()
        except OSError:
            fail('Full18 aggregate harness copy is unavailable')
        if (not stat.S_ISREG(harness_before.st_mode) or aggregate_harness_raw.is_symlink()
                or harness_before.st_size > 1024 * 1024):
            fail('Full18 aggregate harness copy must be a bounded regular non-symlink file')
        aggregate_harness_path = aggregate_harness_raw.resolve(strict=True)
        harness_sha = sha_file(aggregate_harness_raw)
        try:
            harness_after = aggregate_harness_raw.lstat()
        except OSError:
            fail('Full18 aggregate harness copy changed during hashing')
        if (not stat.S_ISREG(harness_after.st_mode) or aggregate_harness_raw.is_symlink()
                or (harness_before.st_dev, harness_before.st_ino, harness_before.st_size, harness_before.st_mtime_ns)
                   != (harness_after.st_dev, harness_after.st_ino, harness_after.st_size, harness_after.st_mtime_ns)):
            fail('Full18 aggregate harness copy changed during hashing')
    else:
        aggregate_harness_path = beneath(aggregate_root, aggregate['harnessPath'], 'full18 aggregate harness')
        harness_sha = sha_file(aggregate_harness_path)
    if harness_sha != aggregate['harnessSha256']:
        fail('Aggregate producer harness bytes differ from the exact recorded source')
    assembly_path, assembly_receipt = referenced_json(
        aggregate_root, aggregate['assemblyReceiptPath'], aggregate['assemblyReceiptSha256'],
        'aggregate producer receipt')
    proof_path = proof_receipt = None
    if not continuation_mode:
        proof_path, proof_receipt = referenced_json(
            aggregate_root, aggregate['proofReceiptPath'], aggregate['proofReceiptSha256'],
            'full18 union proof receipt')
    assembly_fields = {'profile','schema','status','executionId','attempt','sourceCommit','sourceTree','source',
                       'harness','runtimeImages','runnerKernel','command','phaseTimes','stageResults',
                       'stageMaximums','files','generatedAtUtc'}
    if (set(assembly_receipt) != assembly_fields
            or assembly_receipt.get('profile') != 'umf.local-linux-full18-aggregate-producer/1'
            or assembly_receipt.get('schema') != 'umf.local-linux-full18-aggregate-producer/1'
            or assembly_receipt.get('status') != 'assembled'
            or assembly_receipt.get('command', {}).get('name') != 'assemble-linux-runtime-macos-inputs'
            or assembly_receipt.get('command', {}).get('exitCode') != 0):
        fail('Aggregate producer receipt is not the exact closed successful assembly record')
    expected_assembly_argv = ['python','-I','tests/codegen/aggregate_cohort.py','assemble-linux-runtime-macos-inputs',
                              '--input-root','/aggregate-input','--output','/out/aggregate',
                              '--source-commit',packet['source']['producerCommit']]
    assembly_command = assembly_receipt['command']
    if assembly_command.get('argv') != expected_assembly_argv:
        fail('Aggregate assembly command argv differs from the exact original recipe')
    phase = assembly_command.get('phase')
    log_ref = assembly_command.get('log')
    if (type(phase) is not dict or set(phase) != {'startUtc','finishUtc'}
            or not all(isinstance(phase.get(k),str) and phase[k] for k in ('startUtc','finishUtc'))
            or type(log_ref) is not dict or set(log_ref) != {'path','bytes','sha256'}):
        fail('Aggregate assembly phase or bounded command log receipt is incomplete')
    assembly_log = beneath(aggregate_root, log_ref['path'], 'aggregate assembly command log')
    if (type(log_ref.get('bytes')) is not int or assembly_log.stat().st_size != log_ref['bytes']
            or sha_file(assembly_log) != log_ref.get('sha256')):
        fail('Aggregate assembly command log bytes differ from its actual file')
    proof_fields = {'profile','schema','status','executionId','attempt','sourceCommit','sourceTree','source',
                    'harness','runtimeImages','runnerKernel','assemblyReceipt','selectedCellReplayCommands',
                    'unionReports','generatedAtUtc'}
    if (assembly_receipt.get('executionId') != aggregate['executionId']
            or assembly_receipt.get('attempt') != aggregate['attempt']
            or assembly_receipt.get('sourceCommit') != packet['source']['producerCommit']
            or assembly_receipt.get('sourceTree') != packet['source']['producerTree']
            or assembly_receipt.get('source') != {'commit':packet['source']['producerCommit'],
                                                   'tree':packet['source']['producerTree'],'status':'clean'}):
        fail('Aggregate producer receipt does not bind the exact local attempt/source/tree')
    if assembly_receipt.get('harness', {}).get('sha256') != aggregate['harnessSha256']:
        fail('Aggregate producer receipt does not bind the exact harness identity')
    if not continuation_mode:
        if (set(proof_receipt) != proof_fields
                or proof_receipt.get('profile') != 'umf.local-linux-full18-union-proof/1'
                or proof_receipt.get('schema') != 'umf.local-linux-full18-union-proof/1'
                or proof_receipt.get('status') != 'passed'):
            fail('Full18 union proof receipt is not the exact closed successful profile')
        if (proof_receipt.get('executionId') != aggregate['executionId']
                or proof_receipt.get('attempt') != aggregate['attempt']
                or proof_receipt.get('sourceCommit') != packet['source']['producerCommit']
                or proof_receipt.get('sourceTree') != packet['source']['producerTree']
                or proof_receipt.get('source') != {'commit':packet['source']['producerCommit'],
                                                     'tree':packet['source']['producerTree'],'status':'clean'}
                or proof_receipt.get('harness') != assembly_receipt.get('harness')
                or proof_receipt.get('runtimeImages') != assembly_receipt.get('runtimeImages')):
            fail('Aggregate producer and full18 proof do not share exact attempt/source/tree/harness/runtime identities')
        expected_assembly_ref = {'path':aggregate['assemblyReceiptPath'], 'bytes':assembly_path.stat().st_size,
                                 'sha256':aggregate['assemblyReceiptSha256']}
        if proof_receipt.get('assemblyReceipt') != expected_assembly_ref:
            fail('Full18 union receipt does not hash-bind the exact assembly receipt bytes')
    if assembly_receipt.get('runtimeImages', {}).get('platform') != 'linux/amd64':
        fail('Aggregate producer did not record the actual Linux amd64 runtime profile')
    replay_ids = {'linux-x86_64-py311','linux-x86_64-py314'}
    if not continuation_mode:
        selected_replays = proof_receipt.get('selectedCellReplayCommands')
        if (type(selected_replays) is not list or len(selected_replays) != 2
                or {row.get('stage') for row in selected_replays if type(row) is dict}
                    != {f'{cell}-union-replay' for cell in replay_ids}
                or any(type(row) is not dict or row.get('exitCode') != 0 for row in selected_replays)):
            fail('Full18 receipt does not record exactly two successful Linux union replay commands')
        for replay_row in selected_replays:
            if set(replay_row) != {'stage','exitCode','logPath','logBytes','logSha256'}:
                fail('Full18 replay command receipt has an unknown or incomplete field roster')
            replay_log = beneath(aggregate_root, replay_row['logPath'], f"{replay_row['stage']} log")
            if (type(replay_row['logBytes']) is not int or replay_log.stat().st_size != replay_row['logBytes']
                    or sha_file(replay_log) != replay_row['logSha256']):
                fail(f"Full18 replay command log custody differs: {replay_row['stage']}")
        report_refs = proof_receipt.get('unionReports')
        if type(report_refs) is not dict or set(report_refs) != replay_ids:
            fail('Full18 receipt does not bind exactly both Linux union report files')
        for cell, report_ref in report_refs.items():
            if type(report_ref) is not dict or set(report_ref) != {'path','bytes','sha256'}:
                fail(f'Full18 {cell} report reference is not closed')
            report_path, report = referenced_json(aggregate_root, report_ref['path'], report_ref['sha256'], f'{cell} union report')
            if (report_path.stat().st_size != report_ref['bytes'] or report.get('profile') != 'umf-offline-mirror-installed/1'
                    or report.get('status') != 'passed' or report.get('aggregate', {}).get('selectedCell') != cell):
                fail(f'Full18 {cell} union report is not the exact successful selected-cell replay')
    index_path = beneath(aggregate_root, aggregate['indexPath'], 'aggregate index')
    index = json_file(index_path)
    if (set(index) != {'profile','status','sourceCommit','coverage','runtimeCells','artifactTargets','union'}
            or index.get('profile') != 'umf.embedder-wheel-linux-runtime-macos-inputs/1'
            or index.get('sourceCommit') != packet['source']['producerCommit'] or index.get('status') != 'assembled'):
        fail('Aggregate index does not bind exact current P and an assembled local evidence profile')
    runtime_ids = ['linux-x86_64-py311','linux-x86_64-py314']; artifact_ids = ['macos-arm64-py311','macos-arm64-py314']
    expected_coverage = {'qualifiedRuntimeCells': runtime_ids, 'artifactTargets': artifact_ids, 'refreshedMacRuntime': 'unqualified', 'macReplay': 'not-performed'}
    rows = index.get('runtimeCells'); targets = index.get('artifactTargets')
    if index.get('coverage') != expected_coverage or type(rows) is not list or [x.get('id') for x in rows if type(x) is dict] != runtime_ids or type(targets) is not list or [x.get('id') for x in targets if type(x) is dict] != artifact_ids:
        fail('Aggregate is not exactly two Linux runtime cells plus data-only Mac targets')
    if any(type(x) is not dict or set(x) != {'id','lock','runtimeIdentity','qualificationReceipt'} for x in rows) or any(type(x) is not dict or set(x) != {'id','target','artifactManifest'} for x in targets):
        fail('Aggregate profile rows are not the closed original schema')
    expected_mac_targets = {
        'macos-arm64-py311': {'id':'macos-arm64-py311','os':'macos-14','architecture':'arm64','python':'3.11','libc':'not applicable'},
        'macos-arm64-py314': {'id':'macos-arm64-py314','os':'macos-14','architecture':'arm64','python':'3.14','libc':'not applicable'},
    }
    mac_manifest_values = {}
    if [target.get('id') for target in targets] != sorted(expected_mac_targets):
        fail('Aggregate Mac target roster is not the exact two data-only target set')
    for target in targets:
        target_id = target['id']; ref = target.get('artifactManifest')
        expected_manifest_path = f"aggregate/artifact-targets/{target_id}/artifact-target.json"
        if type(ref) is not dict or set(ref) != {'path','sha256'} or ref.get('path') != expected_manifest_path:
            fail(f'{target_id} Mac target manifest reference is not canonical')
        manifest_path = beneath(aggregate_root, ref['path'], f'{target_id} Mac target manifest')
        if sha_file(manifest_path) != ref['sha256']:
            fail(f'{target_id} Mac target manifest hash differs from aggregate index')
        manifest = json_file(manifest_path)
        expected_manifest_keys = {'profile','status','target','selection','sourceCommit','coreSemanticVersion',
                                  'packageRoots','packages','wheels','dependencyResolution'}
        if (set(manifest) != expected_manifest_keys
                or manifest.get('profile') != 'umf.embedder-wheel-artifact-target/1'
                or manifest.get('status') != 'verified-artifact-inputs'
                or manifest.get('target') != expected_mac_targets[target_id]
                or manifest.get('selection') != {'kind':'declared-target-wheel-tags','observedRuntime':False}
                or manifest.get('sourceCommit') != packet['source']['producerCommit']
                or manifest.get('coreSemanticVersion') != '0.10.0'
                or manifest.get('packageRoots') != {'production':['umf-core','umf-access','umf-codegen','umf-weft'],
                                                    'qualificationDrivers':['psycopg','psycopg-binary','jsonschema','ruamel-yaml']}
                or type(manifest.get('packages')) is not list or len(manifest['packages']) != 18
                or type(manifest.get('wheels')) is not list or len(manifest['wheels']) != 18):
            fail(f'{target_id} manifest is not the closed Mac artifact-only 18-package target')
        if target.get('target') != expected_mac_targets[target_id]:
            fail(f'{target_id} aggregate target descriptor differs from its actual data-only manifest')
        if any(type(item) is not dict for item in manifest['packages'] + manifest['wheels']):
            fail(f'{target_id} manifest contains a malformed package or wheel row')
        package_names = {re.sub(r'[-_.]+','-',item.get('distribution','')).lower() for item in manifest['packages']}
        wheel_names = {re.sub(r'[-_.]+','-',item.get('distribution','')).lower() for item in manifest['wheels']}
        if len(package_names) != 18 or package_names != wheel_names:
            fail(f'{target_id} manifest does not retain exactly 18 matching package and wheel selections')
        mac_manifest_values[target_id] = manifest
    union = index.get('union', {}); inventory = {row.get('filename'): row for row in union.get('inventory', []) if type(row) is dict}
    if len(inventory) != 30 or any(not isinstance(name,str) for name in inventory):
        fail('Aggregate union inventory is not the exact closed 30-wheel union')
    expected_union_refs = {f'unionWheel:{name}' for name in inventory}
    expected_assembly_file_keys = {
        'aggregateIndex','unionLock','mirrorManifest','aggregateGeneratorCorpus','sourceGeneratorCorpus',
        *{f'{cell}{suffix}' for cell in ('linux-x86_64-py311','linux-x86_64-py314')
          for suffix in ('SourceLock','SourceTemplate','ProducerOfflineReceipt','AggregateLock','AggregateOfflineReceipt')},
        *{f'{target}Manifest' for target in ('macos-arm64-py311','macos-arm64-py314')},
        *expected_union_refs,
    }
    if set(assembly_files) != expected_assembly_file_keys:
        fail('Aggregate producer file custody does not cover exactly the 30-wheel union')
    mirror_root = beneath(aggregate_root, union.get('wheelhouse'), 'aggregate wheelhouse')
    for filename, row in inventory.items():
        wheel_path = beneath(mirror_root, filename, 'aggregate union wheel')
        if type(row.get('size')) is not int or wheel_path.stat().st_size != row['size']:
            fail(f'Aggregate union wheel size differs for {filename}')
        ref = assembly_files[f'unionWheel:{filename}']
        if type(ref) is not dict or set(ref) != {'path','bytes','sha256'} or ref.get('path') != wheel_path.relative_to(aggregate_root).as_posix() or ref.get('bytes') != row['size'] or ref.get('sha256') != row.get('sha256') or sha_file(wheel_path) != row.get('sha256'):
            fail(f'Aggregate union wheel differs from its independent assembly custody row: {filename}')
    selected = [x for x in rows if x.get('id') == 'linux-x86_64-py311']
    if len(selected) != 1: fail('Aggregate selected Linux 3.11 cell is absent or duplicated')
    lock_path = beneath(aggregate_root, selected[0]['lock']['path'], 'selected Linux 3.11 lock')
    lock = json_file(lock_path)
    linux_versions = {
        re.sub(r'[-_.]+','-',row.get('distribution','')).lower(): row.get('version')
        for row in lock.get('packages', []) if type(row) is dict
    }
    if len(linux_versions) != 18:
        fail('Selected Linux 3.11 lock does not contain the exact 18-package source roster')
    for target_id, manifest in mac_manifest_values.items():
        mac_versions = {
            re.sub(r'[-_.]+','-',row.get('distribution','')).lower(): row.get('version')
            for row in manifest['packages']
        }
        if mac_versions != linux_versions:
            fail(f'{target_id} data-only Mac package/version set differs from the selected Linux full18 cohort')
    assembly_files = assembly_receipt.get('files')
    if type(assembly_files) is not dict or len(assembly_files) < 20:
        fail('Aggregate producer receipt has an incomplete file-custody map')
    def require_assembly_file(key: str, relative: str, path: pathlib.Path) -> None:
        ref = assembly_files.get(key)
        if type(ref) is not dict or set(ref) != {'path','bytes','sha256'} or ref.get('path') != relative:
            fail(f'Aggregate producer receipt lacks the exact {key} file reference')
        if (type(ref.get('bytes')) is not int or path.stat().st_size != ref['bytes']
                or sha_file(path) != ref.get('sha256')):
            fail(f'Aggregate producer receipt file bytes differ for {key}')
    require_assembly_file('aggregateIndex', aggregate['indexPath'], index_path)
    require_assembly_file('aggregateGeneratorCorpus', aggregate['generatorCorpusPath'],
                          beneath(aggregate_root, aggregate['generatorCorpusPath'], 'aggregate generator corpus'))
    require_assembly_file('sourceGeneratorCorpus', 'generator-corpus.json',
                          beneath(aggregate_root, 'generator-corpus.json', 'source generator corpus'))
    require_assembly_file('unionLock', 'aggregate/union.lock.json',
                          beneath(aggregate_root, 'aggregate/union.lock.json', 'aggregate union lock'))
    require_assembly_file('mirrorManifest', 'aggregate/mirror/manifest.json',
                          beneath(aggregate_root, 'aggregate/mirror/manifest.json', 'aggregate mirror manifest'))
    for cell in ('linux-x86_64-py311','linux-x86_64-py314'):
        require_assembly_file(f'{cell}SourceLock', f'cells/{cell}/cohort.lock.json',
                              beneath(aggregate_root, f'cells/{cell}/cohort.lock.json', f'{cell} source lock'))
        require_assembly_file(f'{cell}SourceTemplate', f'cells/{cell}/cohort-template.json',
                              beneath(aggregate_root, f'cells/{cell}/cohort-template.json', f'{cell} source template'))
        require_assembly_file(f'{cell}ProducerOfflineReceipt', f'cells/{cell}/offline-mirror-receipt.json',
                              beneath(aggregate_root, f'cells/{cell}/offline-mirror-receipt.json', f'{cell} producer receipt'))
        require_assembly_file(f'{cell}AggregateLock', f'aggregate/children/{cell}/cohort.lock.json',
                              beneath(aggregate_root, f'aggregate/children/{cell}/cohort.lock.json', f'{cell} child lock'))
        require_assembly_file(f'{cell}AggregateOfflineReceipt', f'aggregate/children/{cell}/offline-mirror-receipt.json',
                              beneath(aggregate_root, f'aggregate/children/{cell}/offline-mirror-receipt.json', f'{cell} child receipt'))
    for target in ('macos-arm64-py311','macos-arm64-py314'):
        require_assembly_file(f'{target}Manifest', f'aggregate/artifact-targets/{target}/artifact-target.json',
                              beneath(aggregate_root, f'aggregate/artifact-targets/{target}/artifact-target.json', f'{target} data-only manifest'))
    fixed = packet['fixedQualification']
    for key in ('access','codegen'):
        asset = packet['release']['assets'][key]; filename = asset['filename']; expected_sha = asset['sha256']; size = asset['sizeBytes']
        owner_row = owner_wheels.get(filename); payload_row = release_wheels.get(filename); union_row = inventory.get(filename)
        expected_dist, expected_version = ('umf-access',fixed['accessVersion']) if key=='access' else ('umf-codegen',fixed['codegenVersion'])
        if not owner_row or owner_row.get('sha256') != expected_sha or owner_row.get('bytes') != size:
            fail(f'Public {key} wheel differs from actual D5 owner custody')
        if not payload_row or payload_row.get('sha256') != expected_sha or payload_row.get('bytes') != size or payload_row.get('distribution') != expected_dist or payload_row.get('version') != expected_version:
            fail(f'Public {key} wheel differs from actual D5 release-payload receipt')
        if not union_row or union_row.get('sha256') != expected_sha or union_row.get('size') != size or union_row.get('distribution') != expected_dist or union_row.get('version') != expected_version:
            fail(f'Public {key} wheel differs from exact aggregate union identity')
        local_wheel = beneath(payload_root, filename, f'D5 {key} wheel')
        union_wheel = beneath(mirror_root, filename, f'aggregate {key} wheel')
        public_wheel = work / 'public' / filename
        if local_wheel.stat().st_size != size or union_wheel.stat().st_size != size or public_wheel.stat().st_size != size:
            fail(f'Public {key} wheel size differs across D5, aggregate union and public download')
        if sha_file(local_wheel) != expected_sha or sha_file(union_wheel) != expected_sha or sha_file(public_wheel) != expected_sha:
            fail(f'Public {key} wheel is not byte-identical across D5, aggregate union and public download')
    core = fixed
    core_row = inventory.get(core['coreLinuxWheelFilename'])
    if not core_row or core_row.get('distribution') != 'umf-core' or core_row.get('version') != core['coreDistributionVersion'] or core_row.get('size') != core['coreLinuxWheelSizeBytes'] or core_row.get('sha256') != core['coreLinuxWheelSha256']:
        fail('Core 0.10.3 distribution / 0.10.0 semantic selected-union wheel pin differs')
    weft_rows = [row for row in lock.get('wheels', []) if row.get('distribution') == fixed['weftWheelDistribution'] and row.get('version') == fixed['weftVersion']]
    if len(weft_rows) != 1: fail('Selected Linux 3.11 lock lacks exactly one pinned Weft 0.4.55 row')
    weft = weft_rows[0]; weft_union = inventory.get(weft.get('filename'))
    if weft.get('filename') != fixed['weftLinuxWheelFilename'] or weft.get('size') != fixed['weftLinuxWheelSizeBytes'] or weft.get('sha256') != fixed['weftWheelSha256'] or not weft_union or weft_union.get('sha256') != fixed['weftWheelSha256'] or weft_union.get('size') != fixed['weftLinuxWheelSizeBytes']:
        fail('Selected Linux Weft child lock differs from the exact Weft 0.4.55 public pin')
    weft_path = beneath(mirror_root, weft['filename'], 'aggregate Weft wheel')
    if weft_path.stat().st_size != fixed['weftLinuxWheelSizeBytes'] or sha_file(weft_path) != fixed['weftWheelSha256']:
        fail('Physical Weft wheel differs from the exact Weft 0.4.55 public pin')
    continuation_root, continuation_receipt, bootstrap_wheel, bootstrap_metadata = validate_union_continuation(
        packet, aggregate_root, index_path, index)
    operator = install_operator_bootstrap(packet, work, bootstrap_wheel, index_path, lock_path)
    # The original offline probe performs the complete eighteen-wheel and install checks.
    result = {'publicRelease': public, 'sdkManifestSha256': sha_file(sdk_manifest), 'sdkTarballSha256': sha_file(sdk_archive),
            'operatorBootstrap': {
                'receiptSha256':sha_file(beneath(continuation_root,ev['unionContinuation']['receiptPath'],'full18 continuation receipt')),
                'continuationExecutionId':continuation_receipt['executionId'],
                'continuationAttempt':continuation_receipt['attempt'],
                'wheelSha256':sha_file(bootstrap_wheel),'publisherMetadataSha256':sha_file(bootstrap_metadata),
                'proof':operator['proof'],
            },
            'localEvidence': {
                'sdkProducer': {'executionId':sdk_receipt['executionId'],'attempt':sdk_receipt['attempt'],
                                'receiptSha256':sha_file(sdk_receipt_path)},
                'd5': {'executionId':d5_receipt['localExecutionId'],'attempt':int(d5_receipt['localAttempt']),
                       'receiptSha256':sha_file(d5_receipt_path),'runContextSha256':sha_file(d5_context_path),
                       'cohortLockSha256':sha_file(cohort_lock_path),'ownerManifestSha256':owner_sha},
                'aggregate': {'executionId':assembly_receipt['executionId'],'attempt':assembly_receipt['attempt'],
                              'assemblyReceiptSha256':sha_file(assembly_path)},
                'unionContinuation': {'executionId':continuation_receipt['executionId'],
                                      'attempt':continuation_receipt['attempt'],
                                      'receiptSha256':sha_file(beneath(continuation_root,ev['unionContinuation']['receiptPath'],'full18 continuation receipt')),
                                      'harnessSha256':ev['unionContinuation']['harnessSha256']},
            },
            'd5ReceiptSha256': sha_file(beneath(d5_root,d5['receiptPath'],'D5 receipt')), 'ownerManifestSha256': owner_sha,
            'releasePayloadReceiptSha256': payload_sha, 'aggregateIndexSha256': sha_file(index_path),
            'selectedLinux311LockSha256': sha_file(lock_path), 'accessCodegenExactUnionCorrespondence': True,
            'coreDistributionVersion': fixed['coreDistributionVersion'], 'coreSemanticVersion': fixed['coreSemanticVersion'],
            'weftVersion': fixed['weftVersion'], 'weftWireProfile': fixed['weftWireProfile']}
    if continuation_mode:
        result['localEvidence']['aggregate']['verificationMode'] = 'assembly-plus-bounded-continuation003'
        result['localEvidence']['aggregate']['continuationReceiptSha256'] = sha_file(
            beneath(continuation_root, ev['unionContinuation']['receiptPath'], 'full18 continuation receipt'))
    else:
        result['localEvidence']['aggregate']['proofReceiptSha256'] = sha_file(proof_path)
    if d5_resource_summary is not None:
        result['d5ResourceProfile'] = d5_resource_summary
    return result


def verify_final(work: pathlib.Path, packet: dict) -> dict:
    prefinal_reports={'toolchain.json','source-identity.json','public-byte-correspondence.json',
                      'sdk-install.json','python-installed.json','packaging-bootstrap.json'}
    report_dir=work/'reports'
    if {path.name for path in report_dir.glob('*.json')} != prefinal_reports:
        fail('Pre-final local report roster is incomplete or contains unexpected JSON')
    if {path.name for path in (work/'logs').glob('*.log')} != {name+'.log' for name in EXPECTED_COMMANDS}:
        fail('Final local command-log roster is incomplete or contains unexpected logs')
    sdk_log = (work / 'logs/sdk-public-install-consumer-smoke.log').read_text(encoding='utf-8')
    lines = [line for line in sdk_log.splitlines() if line.startswith('{')]
    if not lines: fail('SDK consumer emitted no JSON result')
    result = json.loads(lines[-1]); fixed = packet['fixedQualification']
    if result.get('conformanceCases') != 139 or result.get('loaderEntrypoint') is not True or result.get('bundledActions') is not True or result.get('unifiedGenerator') is not True or result.get('singleInstall') is not True:
        fail('SDK consumer result does not prove the exact 139-case installed profile')
    py = json_file(work/'reports/python-installed.json')
    bootstrap = json_file(work/'reports/packaging-bootstrap.json',128*1024)
    correspondence = json_file(work/'reports/public-byte-correspondence.json')
    expected_continuation = packet['evidence']['unionContinuation']
    if (bootstrap.get('pythonVersion') != '3.11.17' or bootstrap.get('packagingVersion') != '26.3'
            or bootstrap.get('bootstrapWheelSha256') != expected_continuation['bootstrapWheelSha256']
            or bootstrap.get('defaultEnvironmentEqual') is not True
            or bootstrap.get('acquisitionDefaultEnvironment') != bootstrap.get('replayDefaultEnvironment')
            or pathlib.Path(bootstrap.get('operatorPrefix','')).resolve() != (work/'operator-venv').resolve()
            or correspondence.get('operatorBootstrap',{}).get('receiptSha256') != expected_continuation['receiptSha256']
            or correspondence.get('operatorBootstrap',{}).get('continuationExecutionId') != expected_continuation['executionId']
            or correspondence.get('operatorBootstrap',{}).get('continuationAttempt') != expected_continuation['attempt']):
        fail('Final public-H result does not retain exact current full18 operator-bootstrap provenance')
    versions = py.get('installedVersions', {})
    required = {'umf-access':fixed['accessVersion'],'umf-codegen':fixed['codegenVersion'],'umf-core':fixed['coreDistributionVersion'],fixed['weftWheelDistribution']:fixed['weftVersion']}
    core = py.get('coreNative', {})
    if py.get('status') != 'passed' or py.get('wheelCount') != 18 or py.get('aggregate',{}).get('selectedCell') != 'linux-x86_64-py311' or any(versions.get(k) != v for k,v in required.items()):
        fail('Selected Linux 3.11 installed mirror probe does not prove exact 18-wheel package versions')
    if core.get('wheel') != fixed['coreLinuxWheelFilename'] or core.get('semanticCoreVersion') != fixed['coreSemanticVersion'] or core.get('distributionVersion') != fixed['coreDistributionVersion'] or core.get('memberSha256') != fixed['coreLinuxNativeSha256'] or core.get('installedSha256') != fixed['coreLinuxNativeSha256'] or core.get('wheelSha256') != fixed['coreLinuxWheelSha256']:
        fail('Installed Core native member/semantic/distribution/wheel identity differs')
    output = {'status':'passed','sdkConformanceCases':139,'pythonWheelCount':18,'pythonCell':'linux-x86_64-py311','versions':versions,
              'operatorBootstrap':{'packagingVersion':bootstrap['packagingVersion'],
                                   'wheelSha256':bootstrap['bootstrapWheelSha256'],
                                   'wheelBytes':bootstrap['bootstrapWheelBytes'],
                                   'defaultEnvironmentEqual':bootstrap['defaultEnvironmentEqual'],
                                   'continuationExecutionId':expected_continuation['executionId'],
                                   'continuationAttempt':expected_continuation['attempt'],
                                   'continuationReceiptSha256':expected_continuation['receiptSha256']}}
    if 'd5ResourceProfile' in correspondence:
        output['d5ResourceProfile'] = correspondence['d5ResourceProfile']
    accepted=report_dir/'accepted-probe-fields.json'
    if accepted.exists() or accepted.is_symlink():
        fail('Accepted probe summary already exists before final verification')
    accepted.write_text(json.dumps(output,sort_keys=True,indent=2)+'\n')
    final_reports=prefinal_reports | {'accepted-probe-fields.json'}
    if {path.name for path in report_dir.glob('*.json')} != final_reports:
        fail('Final local report roster is incomplete or contains unexpected JSON')
    return output


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] not in ('run','--stage'):
        print('usage: run-local-public-h.py run INPUT.json EVIDENCE_DIR | --stage STAGE INPUT.json WORK_DIR', file=sys.stderr)
        return 2
    if sys.argv[1] == '--stage':
        if len(sys.argv) != 5: return 2
        # Stage interface is intentionally private; `run` is the supported entry point.
        stage, packet_path, work_path = sys.argv[2], pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4])
        packet = validate_inputs(json_file(packet_path),pathlib.Path(__file__))
        work = work_path.resolve(strict=True)
        if stage == 'toolchain-identity':
            stage_toolchain(packet, work); return 0
        if stage == 'verify-source-tag-and-tree':
            stage_verify_source(packet, work); return 0
        if stage == 'acquire-and-verify-public-and-qualified-archives':
            stage_acquire_cli(packet, work); return 0
        if stage == 'verify-final-probe-fields':
            stage_final_cli(packet, work); return 0
        if stage == 'sdk-public-install-consumer-smoke':
            stage_sdk_consumer(packet, work); return 0
        fail('Internal stage invoked without initialized source context')
    input_arg=pathlib.Path(sys.argv[2])
    if input_arg.is_symlink():
        fail('Input packet must not be a symlink')
    input_path, evidence_arg = input_arg.resolve(strict=True), pathlib.Path(sys.argv[3]).resolve()
    evidence_arg.mkdir(parents=True, exist_ok=False)
    receipt = evidence_arg/'receipt.json'; logs = evidence_arg/'logs'; reports = evidence_arg/'reports'
    logs.mkdir(); reports.mkdir()
    start = time.monotonic_ns(); deadline = start + LIMITS['aggregateSeconds']*1_000_000_000
    packet_value = None; records = []; status = 'FAIL_OR_UNKNOWN'; failure = 'Input preflight did not pass'
    receipt.write_text(json.dumps({'profile':EVIDENCE_PROFILE,'status':'FAIL_OR_UNKNOWN','executionKind':'local_linux_diagnostic','reason':failure},sort_keys=True,indent=2)+'\n')
    try:
        packet_value = validate_inputs(json_file(input_path),pathlib.Path(__file__))
        if input_path.stat().st_size > LIMITS['metadataArtifactBytes']:
            fail('Input manifest exceeds the original metadata evidence cap')
        shutil.copyfile(input_path,evidence_arg/'input-packet.json')
        source = packet_value['source']; evidence = packet_value['evidence']
        work = evidence_arg/'work'; work.mkdir(mode=0o700)
        producer = work/'producer'
        home=work/'home'; temp=work/'tmp'; home.mkdir(mode=0o700); temp.mkdir(mode=0o700)
        env={key:os.environ[key] for key in ('PATH','LANG','LC_ALL','TZ','SSL_CERT_FILE','SSL_CERT_DIR','LOCAL_RUNTIME_IMAGE_DIGEST') if key in os.environ}
        env.update({'HOME':str(home),'TMPDIR':str(temp),'CI':'1','INPUT_PACKET':str(input_path),
                    'PRODUCER_DIR':str(producer),'RUNNER_TEMP':str(work),'EVIDENCE':str(evidence_arg),
                    'SOURCE_P':source['producerCommit'],'SOURCE_TREE_P':source['producerTree'],
                    'SOURCE_H_LOCAL_SHA256':packet_value['execution']['localAdapterSha256']})
        for name in EXPECTED_COMMANDS:
            log = logs/(name+'.log')
            if name == 'toolchain-identity':
                argv = [sys.executable,'-I',__file__,'--stage','toolchain-identity',str(input_path),str(work)]
                row = capped_child(name, argv, pathlib.Path.cwd(), env, log, 180, deadline, LIMITS['evidenceReserveSeconds']*1_000_000_000, sum(p.stat().st_size for p in logs.glob('*.log')))
                if row['rawExit'] != 0 or row['captureExit'] != 0: fail('Toolchain identity failed')
            elif name == 'verify-source-tag-and-tree':
                argv=[sys.executable,'-I',__file__,'--stage',name,str(input_path),str(work)]
                row=capped_child(name,argv,pathlib.Path.cwd(),env,log,180,deadline,LIMITS['evidenceReserveSeconds']*1_000_000_000,sum(p.stat().st_size for p in logs.glob('*.log')))
            elif name == 'acquire-and-verify-public-and-qualified-archives':
                argv=[sys.executable,'-I',__file__,'--stage',name,str(input_path),str(work)]
                row=capped_child(name,argv,pathlib.Path.cwd(),env,log,180,deadline,LIMITS['evidenceReserveSeconds']*1_000_000_000,sum(p.stat().st_size for p in logs.glob('*.log')))
            elif name == 'bun-install-locked-source-dependencies':
                bun=shutil.which('bun')
                if not bun: fail('Pinned Bun executable is unavailable')
                argv=[bun,'install','--frozen-lockfile','--ignore-scripts']
                row=capped_child(name,argv,producer,env,log,180,deadline,LIMITS['evidenceReserveSeconds']*1_000_000_000,sum(p.stat().st_size for p in logs.glob('*.log')))
            elif name == 'sdk-public-install-consumer-smoke':
                argv=[sys.executable,'-I',__file__,'--stage',name,str(input_path),str(work)]
                row=capped_child(name,argv,producer,env,log,180,deadline,LIMITS['evidenceReserveSeconds']*1_000_000_000,sum(p.stat().st_size for p in logs.glob('*.log')))
            elif name == 'python-public-install-and-migration-smoke':
                agg=packet_value['evidence']['aggregate']; agg_root=abs_path(agg['root'],'aggregate evidence root').resolve(strict=True); index=json_file(beneath(agg_root,agg['indexPath'],'aggregate index'))
                operator_python=work/'operator-venv'/'bin'/'python3'
                if not operator_python.exists(): fail('Isolated packaging operator Python is unavailable')
                mirror_helper=producer/'scripts/python-package-mirror.py'
                spec=importlib.util.spec_from_file_location('sdk_public_h_python_mirror',mirror_helper)
                if spec is None or spec.loader is None: fail('Existing Python network-isolation helper is unavailable from exact P source')
                module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
                network_prefix,isolation=module.network_isolation_prefix()
                args=network_prefix+[str(operator_python),'-I',str(producer/'tests/codegen/offline_mirror_probe.py'),'--aggregate-index',str(beneath(agg_root,agg['indexPath'],'aggregate index')),'--selected-cell','linux-x86_64-py311','--expected-source-commit',source['producerCommit'],'--mirror',str(beneath(agg_root,index['union']['mirror'],'aggregate package index')),'--generator-corpus',str(beneath(agg_root,agg['generatorCorpusPath'],'generator corpus')),'--report',str(reports/'python-installed.json')]
                row=capped_child(name,args,producer,env,log,180,deadline,LIMITS['evidenceReserveSeconds']*1_000_000_000,sum(p.stat().st_size for p in logs.glob('*.log')))
            else:
                argv=[sys.executable,'-I',__file__,'--stage',name,str(input_path),str(evidence_arg)]
                row=capped_child(name,argv,pathlib.Path.cwd(),env,log,180,deadline,LIMITS['evidenceReserveSeconds']*1_000_000_000,sum(p.stat().st_size for p in logs.glob('*.log')))
            records.append(row)
            (evidence_arg/'command-records.jsonl').write_text(''.join(json.dumps(item,sort_keys=True)+'\n' for item in records))
            if row['rawExit'] != 0 or row['captureExit'] != 0 or row.get('truncated') or row.get('timedOut'):
                fail(f'Bounded command failed or log capture truncated: {name}')
            if sum(p.stat().st_size for p in logs.glob('*.log')) > LIMITS['aggregateLogBytes']:
                fail('Aggregate command logs exceed the original 1 MiB limit')
        status='LOCAL_DIAGNOSTIC_PASS'; failure=None
    except BaseException as exc:
        failure=type(exc).__name__ + ': ' + str(exc)[:240]
    finally:
        elapsed=time.monotonic_ns()-start
        rows_data=(evidence_arg/'command-records.jsonl').read_text() if (evidence_arg/'command-records.jsonl').is_file() else ''
        (evidence_arg/'command-records.jsonl').write_text(rows_data)
        log_total=sum(p.stat().st_size for p in logs.glob('*.log'))
        report_files=list(reports.glob('*.json'))
        selected=[evidence_arg/'input-packet.json',evidence_arg/'command-records.jsonl',*logs.glob('*.log'),*report_files]
        selected=[p for p in selected if p.is_file() and not p.is_symlink()]
        nonreceipt_total=sum(p.stat().st_size for p in selected)
        result={'profile':EVIDENCE_PROFILE,'status':status,'executionKind':'local_linux_diagnostic',
                'executionId':packet_value['execution']['executionId'] if packet_value else None,
                'attempt':packet_value['execution']['attempt'] if packet_value else None,
                'localAdapterSha256':packet_value['execution'].get('localAdapterSha256') if packet_value else None,
                'hostedWorkflowSha256':packet_value['execution'].get('hostedWorkflowSha256') if packet_value else None,
                'runtimeImageDigest':packet_value['execution'].get('runtimeImageDigest') if packet_value else None,
                'runtimeEngine':packet_value['execution'].get('runtimeEngine') if packet_value else None,
                'runtimeHost':packet_value['execution'].get('runtimeHost') if packet_value else None,
                'runtimeGuest':packet_value['execution'].get('runtimeGuest') if packet_value else None,
                'localInputSha256':sha_file(evidence_arg/'input-packet.json') if (evidence_arg/'input-packet.json').is_file() else None,
                'producerP':packet_value['source'].get('producerCommit') if packet_value else None,
                'producerTree':packet_value['source'].get('producerTree') if packet_value else None,
                'releaseM':packet_value['release'].get('releaseCommitM') if packet_value else None,
                'releaseTag':packet_value['release'].get('tag') if packet_value else None,
                'localEvidenceIds':{k:packet_value['evidence'][k]['executionId'] for k in ('sdkProducer','d5','aggregate','unionContinuation')} if packet_value else None,
                'commands':records,'commandCount':len(records),'aggregateElapsedNs':elapsed,'logBytes':log_total,
                'metadataArtifactBytes':0,'scope':'SDK 0.5.7 139-case consumer plus selected installed Linux x86_64 Python 3.11 full18 probe in Ubuntu 24.04.5 amd64 under emulation on an OrbStack Linux aarch64 engine and Darwin host; Mac inputs data-only, no Mac replay/runtime claim; hosted qualification not claimed.',
                'failure':failure}
        # Require the full seven-command sequence and successful bounded records for PASS.
        if status == 'LOCAL_DIAGNOSTIC_PASS' and ([row.get('name') for row in records] != EXPECTED_COMMANDS or any(row.get('rawExit') != 0 or row.get('captureExit') != 0 or row.get('truncated') or row.get('timedOut') for row in records) or elapsed > (LIMITS['aggregateSeconds']-LIMITS['evidenceReserveSeconds'])*1_000_000_000 or log_total > LIMITS['aggregateLogBytes'] or nonreceipt_total >= LIMITS['metadataArtifactBytes']):
            result['status']='FAIL_OR_UNKNOWN'; result['failure']='final-bound-or-command-roster-check-failed'
        for _ in range(4):
            body=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
            family_total=nonreceipt_total+len(body)
            if result['metadataArtifactBytes']==family_total:
                break
            result['metadataArtifactBytes']=family_total
        if family_total>LIMITS['metadataArtifactBytes']:
            result['status']='FAIL_OR_UNKNOWN'
            result['failure']='metadata-cap-before-receipt'
            body=(json.dumps({'profile':EVIDENCE_PROFILE,'status':'FAIL_OR_UNKNOWN','executionKind':'local_linux_diagnostic','failure':'metadata-cap-before-receipt','commandCount':len(records)},sort_keys=True,indent=2)+'\n').encode()
        receipt.write_bytes(body)
    print(str(receipt))
    return 0 if result['status']=='LOCAL_DIAGNOSTIC_PASS' else 1

if __name__ == '__main__':
    raise SystemExit(main())
