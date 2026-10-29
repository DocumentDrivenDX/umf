#!/usr/bin/env python3
"""Bounded offline setup, controls and installed-source preflight."""
from __future__ import annotations

import hashlib
import json
import os
import selectors
import signal
import subprocess
import sys
import time
from pathlib import Path

OUT = Path('/out')
LIFECYCLE = '/harness/tests/lifecycle'
PYTHON = '/venv/bin/python'
BASE_PYTHON = '/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11'
PER_COMMAND = 180
TOTAL = int(os.environ.get('N12_SETUP_BUDGET_SECONDS', '240'))
STOP_GRACE = 10
PER_STREAM_RETAIN = 64 * 1024
LOG_LIMIT = 1024 * 1024


def run_one(name: str, argv: list[str], deadline: float, records: list[dict]) -> None:
    started = time.monotonic()
    command_deadline = min(deadline, started + PER_COMMAND)
    stdout_path = OUT / 'logs' / f'{name}.stdout.log'
    stderr_path = OUT / 'logs' / f'{name}.stderr.log'
    proc = subprocess.Popen(argv, cwd='/harness', stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, start_new_session=True, env={**os.environ,
            'PYTHONDONTWRITEBYTECODE': '1', 'TMPDIR': '/tmp',
            'BUN_RUNTIME_TRANSPILER_CACHE_PATH': '/tmp/bun-runtime-cache'})
    paths = [stdout_path, stderr_path]
    files = [path.open('xb') for path in paths]
    streams = [proc.stdout, proc.stderr]
    hashes = [hashlib.sha256(), hashlib.sha256()]
    raw_bytes = [0, 0]
    retained = [0, 0]
    selector = selectors.DefaultSelector()
    for index, stream in enumerate(streams):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, index)
    timed_out = False
    drain_expired = False
    term_at = None
    hard_deadline = command_deadline + STOP_GRACE + 3
    try:
        while selector.get_map():
            now = time.monotonic()
            if now >= command_deadline and term_at is None:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                term_at = now
            if term_at is not None and now >= term_at + STOP_GRACE and proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            if now >= hard_deadline and selector.get_map():
                drain_expired = True
                for key in list(selector.get_map().values()):
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                break
            for key, _ in selector.select(0.2):
                index = key.data
                try:
                    chunk = os.read(key.fileobj.fileno(), 65536)
                except BlockingIOError:
                    continue
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                raw_bytes[index] += len(chunk)
                hashes[index].update(chunk)
                allowance = max(0, PER_STREAM_RETAIN - retained[index])
                if allowance:
                    keep = chunk[:allowance]
                    files[index].write(keep)
                    retained[index] += len(keep)
    finally:
        selector.close()
        for handle in files:
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
    rc = proc.wait(timeout=STOP_GRACE + 3) if proc.poll() is None else proc.returncode
    record = {'name': name, 'argv': argv, 'exitCode': rc,
        'elapsedSeconds': round(time.monotonic() - started, 3),
        'timedOut': timed_out, 'drainExpired': drain_expired,
        'stdout': {'path': str(stdout_path), 'retainedBytes': retained[0],
                   'rawBytes': raw_bytes[0], 'sha256': hashes[0].hexdigest()},
        'stderr': {'path': str(stderr_path), 'retainedBytes': retained[1],
                   'rawBytes': raw_bytes[1], 'sha256': hashes[1].hexdigest()},
    }
    records.append(record)
    records_path = OUT / 'command-records.json'
    records_path.write_text(json.dumps({'profile': 'umf.g03-n12-setup-commands/1',
        'commands': records}, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    total = sum(row['stdout']['retainedBytes'] + row['stderr']['retainedBytes'] for row in records)
    if total > LOG_LIMIT or any(row['stdout']['rawBytes'] > row['stdout']['retainedBytes']
                                or row['stderr']['rawBytes'] > row['stderr']['retainedBytes'] for row in records):
        raise RuntimeError('setup logs exceeded the 1 MiB evidence cap or were truncated')
    if rc != 0 or timed_out or drain_expired:
        raise RuntimeError(f'{name} failed: exit={rc}, timeout={timed_out}, drainExpired={drain_expired}')
    if time.monotonic() >= deadline:
        raise RuntimeError('setup aggregate deadline exhausted')


def main() -> int:
    OUT.joinpath('logs').mkdir(parents=True, exist_ok=True)
    Path('/tmp/bun-runtime-cache').mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    deadline = started + TOTAL
    records: list[dict] = []
    steps = [
        ('runtime-identity', [BASE_PYTHON, '-I', '-c',
            "import sys; assert sys.version_info[:3] == (3,11,17), sys.version; assert sys.executable == '/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11', sys.executable; print(sys.version)"]),
        ('bun-runtime-identity', ['/bin/bash', '-euo', 'pipefail', '-c',
            "test \"$(bun --version)\" = 1.4.3; bun --version"]),
        ('bun-fixture', ['bun', f'{LIFECYCLE}/g03-defaults-native-fixture.ts',
                         '/out/g03-defaults-native-fixture.json']),
        ('create-fresh-venv', [BASE_PYTHON, '-m', 'venv', '/venv']),
        ('install-exact-held18', [PYTHON, '-I', '-m', 'pip', '--isolated', 'install',
            '--disable-pip-version-check', '--no-cache-dir', '--no-compile',
            '--only-binary=:all:', '--require-hashes',
            '--index-url', 'file:///cohort/aggregate/mirror/simple',
            '-r', '/cohort/aggregate/mirror/requirements.lock']),
        ('pip-check', [PYTHON, '-I', '-m', 'pip', '--isolated', 'check']),
        ('weft-wheel-member-proof', [PYTHON, '-I', '/operator/verify_weft_wheel.py']),
        ('predicate-mutation-tests', [PYTHON, '-I', f'{LIFECYCLE}/test_g03_campaign_predicates.py']),
        ('orchestration-mutation-tests', [PYTHON, '-I', f'{LIFECYCLE}/test_g03_campaign_orchestration.py']),
        ('installed-source-preflight', [PYTHON, '-I', '/operator/n12_guest.py', 'preflight',
                                        '--campaign-id', os.environ['N12_CAMPAIGN_ID']]),
    ]
    for name, argv in steps:
        run_one(name, argv, deadline, records)
    summary = {'profile': 'umf.g03-n12-setup/1', 'status': 'PASS_SETUP_AND_SOURCE_PREFLIGHT',
        'elapsedSeconds': round(time.monotonic() - started, 3), 'commandCount': len(records),
        'commandRecordPath': '/out/command-records.json', 'sourceAdmissionReceiptPath': '/out/source-admission.json'}
    (OUT / 'setup-result.json').write_text(json.dumps(summary, sort_keys=True, indent=2) + '\n')
    print(json.dumps(summary, sort_keys=True, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        Path('/out/setup-failure.json').write_text(json.dumps({
            'profile': 'umf.g03-n12-setup/1', 'status': 'FAIL_OR_UNKNOWN',
            'errorType': type(error).__name__, 'error': str(error)[:512]}, sort_keys=True, indent=2) + '\n')
        raise
