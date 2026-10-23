#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Materialize exact Rust-produced frozen clients for unchanged type/consumer tests."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--actual', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
rows = json.loads(args.actual.read_bytes())['results']
wanted = {'client/declared-native-module': 'native_demo', 'client/declared-native-domain-clock-module': 'domain_demo'}
root = args.output.resolve()
seen = set()
receipt = []
for row in rows:
    if row['id'] not in wanted:
        continue
    if row['id'] in seen or not row['actual']['ok']:
        raise ValueError('Expected one successful Rust result per native fixture')
    seen.add(row['id'])
    for file in row['actual']['result']['files']:
        path = Path(file['path'])
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != wanted[row['id']]:
            raise ValueError('Unexpected generated native fixture path')
        target = root / path
        target.resolve().relative_to(root)
        if target.exists():
            raise ValueError('Refusing to overwrite an existing generated fixture')
        content = file['text'].encode('utf-8')
        digest = hashlib.sha256(content).hexdigest()
        if digest != file['sha256']:
            raise ValueError('Rust file text does not match declared digest')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        receipt.append({'path': path.as_posix(), 'sha256': digest, 'bytes': len(content)})
if seen != wanted.keys():
    raise ValueError('Missing native fixture generation result')
print(json.dumps({'actualSha256': hashlib.sha256(args.actual.read_bytes()).hexdigest(), 'files': receipt}, sort_keys=True))
