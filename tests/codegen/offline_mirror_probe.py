# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build and qualify the frozen stack mirror in a clean file-index-only venv."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import subprocess
import tempfile
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)

parser = argparse.ArgumentParser()
parser.add_argument('--wheelhouse', required=True, type=Path)
parser.add_argument('--lock', required=True, type=Path)
parser.add_argument('--mirror', required=True, type=Path)
parser.add_argument('--generator-corpus', required=True, type=Path)
parser.add_argument('--fixture-root', type=Path, default=ROOT / 'fixtures/table-lifecycle/legal')
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()

lock, checked_wheels = MIRROR.locked_wheels(args.lock, args.wheelhouse)
expected_cells = lock.get('intendedCells', lock.get('supportedCells', []))
cell = MIRROR.select_runner_cell(expected_cells, platform.python_version().rsplit('.', 1)[0])
if cell is None:
    raise SystemExit('Current runner OS release, architecture, libc or Python is outside the lock cells')
try:
    network_prefix, isolation_name = MIRROR.network_isolation_prefix()
except RuntimeError as error:
    raise SystemExit(str(error)) from None
manifest = MIRROR.build_mirror(args.lock, args.wheelhouse, args.mirror)

with tempfile.TemporaryDirectory(prefix='umf-offline-mirror-') as directory:
    work = Path(directory)
    environment = work / 'venv'
    venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    index = (args.mirror / 'simple').as_uri()
    install = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check',
         '--no-cache-dir', '--only-binary=:all:', '--require-hashes', '--index-url', index,
         '-r', str(args.mirror / 'requirements.lock')],
        check=False, text=True, capture_output=True,
    )
    if install.returncode:
        raise SystemExit('Offline mirror install refused:\n' + install.stdout + install.stderr)
    check = subprocess.run(network_prefix + [str(python), '-I', '-m', 'pip', '--isolated', 'check'],
                           check=False, text=True, capture_output=True)
    if check.returncode:
        raise SystemExit('Installed dependency closure is inconsistent:\n' + check.stdout + check.stderr)

    corpus = json.loads(args.generator_corpus.read_text(encoding='utf-8'))
    if not corpus:
        raise SystemExit('Generator corpus is empty')
    request = dict(corpus[0]['request'])
    source = request.pop('text')
    package = request['package']
    schema = work / 'source.json'
    schema.write_text(source, encoding='utf-8')
    generated = work / 'generated'
    generate = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_codegen', 'generate', '--schema', str(schema),
         '--package', package, '--output', str(generated)],
        check=False, text=True, capture_output=True,
    )
    if generate.returncode:
        raise SystemExit('Installed umf-codegen generate failed:\n' + generate.stdout + generate.stderr)
    generate_check = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_codegen', 'check', '--schema', str(schema),
         '--package', package, '--output', str(generated)],
        check=False, text=True, capture_output=True,
    )
    if generate_check.returncode:
        raise SystemExit('Installed umf-codegen check failed:\n' + generate_check.stdout + generate_check.stderr)

    fixture_root = args.fixture_root
    plan_paths = [fixture_root / f'plan-00{i}.json' for i in (1, 2, 3)]
    table_check = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_access.lifecycle.cli', 'check',
         *[part for path in plan_paths for part in ('--plan', str(path))]],
        check=False, text=True, capture_output=True,
    )
    if table_check.returncode:
        raise SystemExit('Installed umf-table check failed:\n' + table_check.stdout + table_check.stderr)

    first = json.loads(plan_paths[0].read_text(encoding='utf-8'))
    second = json.loads(plan_paths[1].read_text(encoding='utf-8'))
    options = json.loads((fixture_root / 'evolution-options.json').read_text(encoding='utf-8'))
    request_path = work / 'new-request.json'
    request_path.write_text(json.dumps({
        'id': 'offline-mirror-generated-plan',
        'predecessor': second['predecessor'],
        'previous': first['next'],
        'next': second['next'],
        'options': options,
    }), encoding='utf-8')
    output_plan = work / 'new-plan.json'
    table_new = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_access.lifecycle.cli', 'new', '--request', str(request_path),
         '--output', str(output_plan)],
        check=False, text=True, capture_output=True,
    )
    if table_new.returncode or not output_plan.is_file():
        raise SystemExit('Installed umf-table new failed:\n' + table_new.stdout + table_new.stderr)

    apply_refusal = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_access.lifecycle.cli', 'apply', '--plan', str(plan_paths[0]),
         '--approved-digest', '0' * 64, '--expected-head', 'initial', '--dsn', 'dbname=invalid-offline-probe'],
        check=False, text=True, capture_output=True,
    )
    try:
        refused = json.loads(apply_refusal.stderr)
    except json.JSONDecodeError:
        raise SystemExit('Unapproved apply did not return structured refusal:\n' + apply_refusal.stdout + apply_refusal.stderr) from None
    if apply_refusal.returncode == 0 or refused.get('code') != 'approval-required':
        raise SystemExit('Unapproved apply did not refuse before database connection:\n' + apply_refusal.stdout + apply_refusal.stderr)

    versions = subprocess.run(
        network_prefix + [str(python), '-I', '-c',
         "import importlib.metadata,json; print(json.dumps({d:importlib.metadata.version(d) for d in ('umf-access','umf-codegen','umf-core','weft-sql','mini-racer')}))"],
        check=True, text=True, capture_output=True,
    )
    receipt = {
        'profile': 'umf-offline-mirror-installed/1',
        'cell': {'os': cell['os'], 'architecture': cell['architecture'], 'libc': cell['libc'],
                 'python': platform.python_version(), 'runnerIdentity': MIRROR.runner_identity()},
        'lockSha256': MIRROR.sha256(args.lock),
        'mirrorManifestSha256': MIRROR.sha256(args.mirror / 'manifest.json'),
        'wheelCount': len(checked_wheels),
        'wheelInventorySha256': hashlib.sha256(json.dumps(checked_wheels, sort_keys=True).encode()).hexdigest(),
        'install': {'indexScheme': 'file', 'pipIsolated': True, 'cache': 'disabled',
                    'sourceBuilds': 'forbidden', 'requireHashes': True, 'dependencyCheck': 'passed',
                    'networkIsolation': isolation_name},
        'installedVersions': json.loads(versions.stdout),
        'probes': {
            'umf-codegen-generate': 'passed', 'umf-codegen-check': 'passed',
            'umf-table-check': 'passed', 'umf-table-new': 'passed',
            'umf-table-apply': 'approval-required before connection',
        },
        'status': 'passed',
    }
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
print(json.dumps({'status': receipt['status'], 'cell': receipt['cell'], 'wheels': receipt['wheelCount']}))
