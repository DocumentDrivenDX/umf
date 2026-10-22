#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Incremental Rust differential feedback; final qualification pins a built cohort separately."""
from __future__ import annotations
import argparse
import hashlib
import gzip
import json
import subprocess
import time
from pathlib import Path


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate native JSON output key: {key}')
        result[key] = value
    return result


def difference(expected, actual, path='$'):
    # JSON numbers share one carrier; booleans do not share that carrier.
    if type(expected) is not type(actual):
        numeric = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
        if not (numeric(expected) and numeric(actual)):
            return {'path': path, 'reason': 'value types differ', 'expected': str(expected)[:250], 'actual': str(actual)[:250]}
    if isinstance(expected, dict):
        if expected.keys() != actual.keys():
            return {'path': path, 'reason': 'object members differ', 'expectedMembers': sorted(expected), 'actualMembers': sorted(actual)}
        for key in expected:
            mismatch = difference(expected[key], actual[key], path + '/' + key.replace('~', '~0').replace('/', '~1'))
            if mismatch:
                return mismatch
    elif isinstance(expected, list):
        if len(expected) != len(actual):
            return {'path': path, 'reason': 'array lengths differ', 'expectedLength': len(expected), 'actualLength': len(actual)}
        for index, (a, b) in enumerate(zip(expected, actual)):
            mismatch = difference(a, b, path + '/' + str(index))
            if mismatch:
                return mismatch
    elif expected != actual:
        return {'path': path, 'reason': 'values differ', 'expected': str(expected)[:500], 'actual': str(actual)[:500]}
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--operation', action='append', default=[])
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--timeout', type=float, default=300)
    args = parser.parse_args()
    binary = args.binary.resolve(); root = args.root.resolve(); fixture = args.fixture.resolve()
    if not args.timeout > 0:
        parser.error('--timeout must be positive')
    frozen = fixture.read_bytes(); corpus = json.loads(gzip.decompress(frozen) if fixture.suffix == ".gz" else frozen)
    rows = corpus.get('cases', corpus.get('vectors', []) + corpus.get('diffs', []))
    rows = [row for row in rows if not args.operation or row['operation'] in args.operation]
    if not rows or len({row['id'] for row in rows}) != len(rows):
        raise ValueError('Expected nonempty cases with unique IDs')
    payload = b''.join(json.dumps({'operation': row['operation'], 'request': row['request']}, ensure_ascii=True, separators=(',', ':')).encode() + b'\n' for row in rows)
    binary_hash = sha(binary.read_bytes())
    start = time.monotonic()
    run = subprocess.run([str(binary), str(root)], input=payload, capture_output=True, timeout=args.timeout, cwd=root)
    duration = time.monotonic() - start
    # JSON strings may contain raw U+0085/U+2028/U+2029. splitlines() changes
    # those strings; only the ASCII LF emitted by the driver frames records.
    frames = run.stdout.split(b'\n')
    if frames and frames[-1] == b'':
        frames.pop()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    actual_path = args.report.with_suffix('.actual.json')
    raw_path = args.report.with_suffix('.stdout.jsonl')
    stderr_path = args.report.with_suffix('.stderr.log')
    raw_path.write_bytes(run.stdout); stderr_path.write_bytes(run.stderr)
    if run.returncode or len(frames) != len(rows):
        raise RuntimeError(f'Native replay failed: exit={run.returncode}, records={len(frames)}/{len(rows)}, stderr={stderr_path}')
    actual_rows = [{'id': row['id'], 'actual': json.loads(frame, object_pairs_hook=unique_object)} for row, frame in zip(rows, frames)]
    actual_path.write_text(json.dumps({'format': 'umf-r3-replay-results/1', 'results': actual_rows}, ensure_ascii=True) + '\n')
    mismatches = []
    outcomes = []
    for row, observed in zip(rows, actual_rows):
        mismatch = difference(row['expected'], observed['actual'])
        outcomes.append({'id': row['id'], 'operation': row['operation'], 'matches': mismatch is None})
        if mismatch:
            mismatches.append({'id': row['id'], 'operation': row['operation'], **mismatch})
    report = {'schema': 'umf.r3-incremental-native-replay/1', 'scope': 'Incremental diagnostic replay; binary hash does not independently establish a clean source/build cohort', 'binary': str(binary), 'binarySha256': binary_hash, 'binaryChangedDuringRun': sha(binary.read_bytes()) != binary_hash, 'fixture': str(fixture), 'fixtureSha256': sha(frozen), 'driverScriptSha256': sha(Path(__file__).read_bytes()), 'elapsedSeconds': duration, 'cases': len(rows), 'matches': len(rows)-len(mismatches), 'mismatches': mismatches, 'outcomes': outcomes, 'actualPath': str(actual_path), 'rawPath': str(raw_path), 'stderrPath': str(stderr_path)}
    args.report.write_text(json.dumps(report, ensure_ascii=True, indent=2) + '\n')
    print(json.dumps({'cases': len(rows), 'matches': report['matches'], 'mismatches': len(mismatches), 'report': str(args.report)}))
    return 1 if mismatches else 0


if __name__ == '__main__':
    raise SystemExit(main())
