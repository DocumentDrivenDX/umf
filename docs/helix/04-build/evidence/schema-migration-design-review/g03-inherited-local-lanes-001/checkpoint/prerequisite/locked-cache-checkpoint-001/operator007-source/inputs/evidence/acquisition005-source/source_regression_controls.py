#!/usr/bin/env python3
"""Root-only, synthetic pure-helper controls; never invokes acquisition main."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import pathlib
import stat
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
OPERATOR = HERE / 'run_acquisition.py'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def load_operator():
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('locked_cargo_operator_helpers', OPERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def expect_failure(call, message):
    try:
        call()
    except RuntimeError:
        return
    raise AssertionError(message)


def check_hash_and_append_log(op):
    with tempfile.TemporaryDirectory(prefix='g03-acq003-log-control-') as td:
        root = pathlib.Path(td)
        op.OUTPUT = root
        op.START = 0.0
        op.DEADLINE = 0.0
        op.CLEANUP_MODE = False
        op.LOG_BYTES = 0
        data = b'bounded metadata stream\x00sample'
        fixture = root / 'fixture.bin'
        fixture.write_bytes(data)
        sha, blob, n, mode = op.hash_stable(fixture, 1024)
        require(sha == hashlib.sha256(data).hexdigest(), 'hash_stable SHA-256 position differs')
        require(blob == hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(), 'hash_stable Git blob position differs')
        require(type(n) is int and n == len(data), 'hash_stable byte-count position is not the integer file size')
        require(mode == stat.S_IMODE(fixture.stat().st_mode), 'hash_stable mode position differs')
        first = op.append_log(root / 'logs' / 'stdout.log', data, 1024)
        second = op.append_log(root / 'logs' / 'stderr.log', b'', 1024)
        require(first == {'path': 'logs/stdout.log', 'sizeBytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}, 'nonempty append_log receipt differs')
        require(second == {'path': 'logs/stderr.log', 'sizeBytes': 0, 'sha256': hashlib.sha256(b'').hexdigest()}, 'empty append_log receipt differs')
        require(type(op.LOG_BYTES) is int and op.LOG_BYTES == len(data), 'append_log aggregate must sum integer physical byte counts')
        require((root / first['path']).read_bytes() == data and (root / second['path']).read_bytes() == b'', 'append_log physical files differ')


def check_output_classification(op):
    with tempfile.TemporaryDirectory(prefix='g03-acq003-classification-') as td:
        root = pathlib.Path(td)
        (root / 'guest' / 'software').mkdir(parents=True)
        (root / 'guest' / 'evidence').mkdir(parents=True)
        (root / 'logs').mkdir()
        archive = root / 'guest' / 'software' / 'cargo-registry.tar'
        archive.write_bytes(b'A' * (1024 * 1024 + 1))
        (root / 'guest' / 'evidence' / 'status.json').write_text('{}\n')
        (root / 'logs' / 'metadata.stdout.log').write_bytes(b'log')
        (root / 'other' / 'software').mkdir(parents=True)
        (root / 'other' / 'software' / 'cargo-registry.tar').write_bytes(b'ordinary public file')
        rows, public_bytes, software_bytes, log_bytes = op.public_inventory(root)
        by_path = {r['path']: r for r in rows}
        exact = by_path['guest/software/cargo-registry.tar']
        same_name_elsewhere = by_path['other/software/cargo-registry.tar']
        require(exact['class'] == 'software-input' and exact['sizeBytes'] == 1024 * 1024 + 1, 'only the exact guest archive path is software input')
        require(same_name_elsewhere['class'] == 'public-evidence', 'same basename under another software directory must remain public evidence')
        require(software_bytes == 1024 * 1024 + 1, 'software bytes must include only the exact archive')
        require(public_bytes == 3 + len(b'ordinary public file') + 3 and log_bytes == 3, 'public and raw-log totals differ')
        (root / 'guest' / 'software' / 'unexpected.bin').write_bytes(b'extra')
        expect_failure(lambda: op.public_inventory(root), 'an extra file under the closed guest software subtree must fail')
    with tempfile.TemporaryDirectory(prefix='g03-acq003-public-cap-') as td:
        root = pathlib.Path(td)
        (root / 'ordinary.bin').write_bytes(b'B' * (1024 * 1024 + 1))
        expect_failure(lambda: op.public_inventory(root), 'ordinary public evidence over 1 MiB must fail')


def check_terminal_budget_and_deadline(op):
    with tempfile.TemporaryDirectory(prefix='g03-acq003-terminal-') as td:
        root = pathlib.Path(td)
        op.START = time.monotonic()
        op.DEADLINE = time.monotonic() + 60
        op.CLEANUP_MODE = True
        passed = root / 'passed.json'
        passed.write_text('{"status":"FAIL_OR_UNKNOWN"}\n')
        result = {'profile': 'synthetic-terminal-control/1', 'status': 'LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS', 'executionPerformed': True}
        receipt = op.promote_final_result(passed, result, 4096)
        raw = passed.read_bytes()
        stored = json.loads(raw)
        require(stored['status'] == 'LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS', 'synthetic terminal receipt lost pass status')
        require(stored['operatorResultBytes'] == len(raw) == receipt['sizeBytes'], 'terminal result size must match physical bytes')
        require(stored['publicEvidenceBytes'] == 4096 + len(raw) == receipt['inclusivePublicBytes'], 'terminal result must be included in aggregate public evidence')
        require(receipt['sha256'] == hashlib.sha256(raw).hexdigest(), 'terminal physical readback hash differs')

        capped = root / 'capped.json'
        seed = b'{"status":"FAIL_OR_UNKNOWN","seed":true}\n'
        capped.write_bytes(seed)
        expect_failure(lambda: op.promote_final_result(capped, dict(result), op.EVIDENCE_CAP - 64), 'inclusive aggregate cap shortage must reject pass promotion')
        require(capped.read_bytes() == seed, 'cap rejection must leave fail-only seed untouched')

        expired = root / 'expired.json'
        expired.write_bytes(seed)
        op.DEADLINE = time.monotonic() - 1
        try:
            op.promote_final_result(expired, dict(result), 4096)
        except RuntimeError as exc:
            require('original aggregate wall-clock bound reached' in str(exc), 'expired deadline must be the reason for rejecting promotion')
        else:
            raise AssertionError('expired original deadline must reject pass promotion')
        require(expired.read_bytes() == seed, 'expired deadline must leave fail-only seed untouched')


def main():
    op = load_operator()
    check_hash_and_append_log(op)
    check_output_classification(op)
    check_terminal_budget_and_deadline(op)
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    print(json.dumps({'status': 'PASS_SYNTHETIC_HELPER_REGRESSIONS', 'controlFamilies': 3,
                      'operatorSha256': digest(OPERATOR), 'suiteSha256': digest(pathlib.Path(__file__).resolve())},
                     sort_keys=True, separators=(',', ':')))


if __name__ == '__main__':
    raise SystemExit(main())
