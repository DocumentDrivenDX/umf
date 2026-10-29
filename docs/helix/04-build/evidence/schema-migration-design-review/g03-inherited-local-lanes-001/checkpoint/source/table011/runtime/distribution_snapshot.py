#!/usr/bin/env python3
"""Bounded snapshot of exact installed cohort distributions; reads METADATA only."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, stat
from email.parser import Parser

LOCK_SHA256 = '4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51'
WHEEL_SHA256 = '32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd'
WHEEL_BYTES = 14358901
PROFILE = 'umf.g03-fresh-installed-distribution-snapshot/1'
REPORT_CAP = 1024 * 1024
LOCK_CAP = 1024 * 1024
METADATA_CAP = 2 * 1024 * 1024

def fail(message: str) -> None:
    raise RuntimeError(message)

def canonical_name(name: str) -> str:
    return re.sub(r'[-_.]+', '-', name).lower()

def read_regular(path: pathlib.Path, cap: int) -> bytes:
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or path.is_symlink() or before.st_size > cap:
        fail('unsafe or oversized input: ' + str(path))
    raw = bytearray()
    with path.open('rb') as stream:
        while True:
            block = stream.read(min(65536, cap + 1 - len(raw)))
            if not block:
                break
            raw.extend(block)
            if len(raw) > cap:
                fail('input grew beyond cap: ' + str(path))
    after = path.lstat()
    if len(raw) != before.st_size or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        fail('input changed during bounded read: ' + str(path))
    return bytes(raw)

def expected_distributions(lock_path: pathlib.Path) -> tuple[list[dict], str]:
    raw = read_regular(lock_path, LOCK_CAP)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != LOCK_SHA256:
        fail('requirements lock differs from the pinned final cohort')
    expected = {}
    for line in raw.decode('utf-8', 'strict').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r'([^=<>!~;\s]+)==([^\s;]+)\s+--hash=sha256:([0-9a-f]{64})', line)
        if not match:
            fail('requirements lock row is outside the closed hash-pinned form')
        name, version, wheel_sha = match.groups()
        key = canonical_name(name)
        if key in expected:
            fail('requirements lock contains a duplicate normalized distribution')
        expected[key] = {'name': key, 'version': version, 'wheelSha256': wheel_sha}
    if len(expected) != 18 or expected.get('umf-weft', {}).get('wheelSha256') != WHEEL_SHA256:
        fail('requirements lock does not close over the exact 18-member cohort and selected Weft wheel')
    return [expected[k] for k in sorted(expected)], digest

def installed_distributions(site: pathlib.Path, expected: list[dict]) -> tuple[list[dict], list[dict]]:
    if site.is_symlink() or not site.is_dir():
        fail('fresh virtual environment site-packages is not a real directory')
    expected_by_name = {row['name']: row for row in expected}
    actual = {}
    for entry in sorted(site.iterdir(), key=lambda p: p.name):
        if entry.name.endswith('.dist-info'):
            if entry.is_symlink() or not entry.is_dir():
                fail('installed distribution metadata directory is unsafe')
            metadata = entry / 'METADATA'
            message = Parser().parsestr(read_regular(metadata, METADATA_CAP).decode('utf-8', 'strict'))
            name = message.get('Name')
            version = message.get('Version')
            if not name or not version:
                fail('installed distribution metadata lacks Name or Version')
            key = canonical_name(name)
            if key in actual:
                fail('duplicate installed distribution metadata: ' + key)
            actual[key] = {'name': key, 'version': version}
    bootstrap = []
    for name, row in actual.items():
        expected_row = expected_by_name.get(name)
        if expected_row is None:
            if name not in ('pip', 'setuptools'):
                fail('unexpected installed distribution: ' + name)
            bootstrap.append(row)
        elif row['version'] != expected_row['version']:
            fail('installed version differs from final cohort lock: ' + name)
    if set(actual) - {'pip', 'setuptools'} != set(expected_by_name):
        fail('fresh installed distribution roster differs from exact final 18-wheel lock')
    return [actual[name] for name in sorted(expected_by_name)], sorted(bootstrap, key=lambda r: r['name'])

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--requirements', required=True, type=pathlib.Path)
    parser.add_argument('--site-packages', required=True, type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    parser.add_argument('--wheel-sha256', required=True)
    parser.add_argument('--wheel-size', required=True, type=int)
    args = parser.parse_args()
    if (args.wheel_sha256, args.wheel_size) != (WHEEL_SHA256, WHEEL_BYTES):
        fail('selected wheel identity differs from the closed table packet')
    expected, lock_sha = expected_distributions(args.requirements)
    packages, bootstrap = installed_distributions(args.site_packages, expected)
    snapshot = {'profile': PROFILE, 'lockedDistributionCount': len(packages), 'packages': packages,
        'bootstrapAllowlist': {'permittedNames': ['pip', 'setuptools'], 'observed': bootstrap},
        'requirements': {'sha256': lock_sha, 'distributionCount': len(expected)},
        'wheel': {'sha256': args.wheel_sha256, 'sizeBytes': args.wheel_size},
        'matching': True}
    raw = json.dumps(snapshot, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8') + b'\n'
    if len(raw) > REPORT_CAP:
        fail('installed cohort snapshot exceeds its 1 MiB public-file cap')
    with args.output.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    print(json.dumps({'profile': PROFILE, 'snapshotBytes': len(raw), 'snapshotSha256': hashlib.sha256(raw).hexdigest(),
        'lockedDistributionCount': len(packages), 'bootstrapDistributionCount': len(bootstrap)}, sort_keys=True, separators=(',', ':')))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
