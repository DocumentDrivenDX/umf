#!/usr/bin/env python3
"""Pure source-owner controls; no Docker, product, or browser imports."""
from __future__ import annotations
import hashlib
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'runtime'))
from terminal_closure import dedupe_roots, owner_receipt_payload, replace_with_failure_receipt


def atomic_write(path, payload):
    path = pathlib.Path(path)
    temp = path.with_name('.' + path.name + '.control.tmp')
    temp.write_bytes(payload)
    temp.replace(path)


def control_receipt_self_size_and_cap():
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        other = root / 'route.json'
        other.write_text('{"status":"PASS"}\n')
        raw = other.read_bytes()
        row = {'path': str(other), 'sizeBytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        receipt = root / 'owner-result.json'
        document = {'status': 'PASS', 'run': str(root)}
        payload = owner_receipt_payload(document, [row], len(raw), receipt, 16 * 1024 * 1024)
        atomic_write(receipt, payload)
        readback = receipt.read_bytes()
        written = json.loads(readback)
        assert readback == payload
        assert written['inclusiveFiles'][-1]['sizeBytes'] == receipt.stat().st_size == len(readback)
        assert written['inclusiveBytesIncludingOwnerReceipt'] == len(raw) + receipt.stat().st_size
        assert written['inclusiveBytesIncludingOwnerReceipt'] <= 16 * 1024 * 1024
        assert written['inclusiveFiles'][-1]['sha256'] is None


def control_overlapping_roots_and_failure_replaces_pass():
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        nested = root / 'route' / 'nested'
        nested.mkdir(parents=True)
        (nested / 'evidence.bin').write_bytes(b'one physical file')
        roots = dedupe_roots([nested, root / 'route', root / 'route'])
        assert roots == [root / 'route']
        found = [p for base in roots for p in base.rglob('*') if p.is_file()]
        assert len(found) == 1 and sum(p.stat().st_size for p in found) == len(b'one physical file')

        receipt = root / 'owner-result.json'
        receipt.write_text('{"status":"PASS"}\n')
        failure = b'{"status":"FAIL_OR_UNKNOWN","evidencePublication":"refused"}\n'
        replace_with_failure_receipt(receipt, failure, atomic_write)
        stored = receipt.read_bytes()
        assert stored == failure
        assert json.loads(stored)['status'] == 'FAIL_OR_UNKNOWN'
        assert b'PASS' not in stored


if __name__ == '__main__':
    control_receipt_self_size_and_cap()
    control_overlapping_roots_and_failure_replaces_pass()
    print('terminal closure controls passed')
