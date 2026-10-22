# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check the downloaded native V8 wheel against the pinned matrix before install."""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--wheelhouse', required=True, type=Path)
parser.add_argument('--pins', required=True, type=Path)
parser.add_argument('--expected-platform', required=True)
args = parser.parse_args()
pins = json.loads(args.pins.read_text(encoding='utf-8'))
expected = next((item for item in pins['wheels'] if item['platform'] == args.expected_platform), None)
if expected is None:
    raise SystemExit(f'Unadvertised mini-racer platform: {args.expected_platform}')
wheels = list(args.wheelhouse.glob('*.whl'))
if len(wheels) != 1 or wheels[0].name != expected['filename']:
    raise SystemExit(f'Expected exact pinned wheel {expected["filename"]}; got {[p.name for p in wheels]}')
wheel = wheels[0]
actual_hash = hashlib.sha256(wheel.read_bytes()).hexdigest()
if actual_hash != expected['sha256']:
    raise SystemExit('mini-racer wheel SHA-256 differs from pinned PyPI artifact')
with zipfile.ZipFile(wheel) as archive:
    metadata_files = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
    if len(metadata_files) != 1:
        raise SystemExit('Wheel must contain exactly one METADATA')
    metadata = archive.read(metadata_files[0]).decode('utf-8').splitlines()
    fields = {}
    for line in metadata:
        if line and not line[0].isspace() and ':' in line:
            name, value = line.split(':', 1)
            fields.setdefault(name.lower(), []).append(value.strip())
    if fields.get('name') != ['mini-racer'] or fields.get('version') != [pins['version']]:
        raise SystemExit('Wheel METADATA differs from pinned package/version')
print(json.dumps({'filename': wheel.name, 'sha256': actual_hash, 'sizeBytes': wheel.stat().st_size, 'metadata': 'verified'}))
