#!/usr/bin/env python3
"""Verify the committed, locally built workbench before deployment signing."""
import argparse
import hashlib
import json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--without-installed-dependencies',action='store_true',help='Verify deployment assets and committed inputs without installing local build dependencies')
args=parser.parse_args()
root = Path(__file__).resolve().parents[2]
site = root / 'docs/helix/05-deploy/microsite/dist'
receipt = json.loads((site / 'assets/pack-tools/provenance.json').read_text())
if receipt.get('profile') != 'umf.pack-tools-browser-build/1' or receipt.get('compilerInputsMissing'):
    raise SystemExit('Incomplete pack-tools provenance')

def verify(base, entries):
    for name, expected in entries.items():
        path = (base / name).resolve()
        if not path.is_relative_to(base.resolve()):
            raise SystemExit('Provenance path escapes its root')
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise SystemExit(f'Pack-tools artifact/input changed: {name}')

inputs={name:digest for name,digest in receipt['inputs'].items() if not(args.without_installed_dependencies and name.startswith('node_modules/'))}
verify(root, inputs)
verify(root, receipt['compilerInputs'])
verify(site, receipt['outputs'])
verify(site, {'pack-tools.html': receipt['unsignedPageHtmlSha256']})
print(json.dumps({'profile':receipt['profile'], 'assets':len(receipt['outputs']), 'sourceInputs':len(inputs), 'dependencyInputsRecorded':sum(name.startswith('node_modules/') for name in receipt['inputs']), 'compilerInputs':len(receipt['compilerInputs']), 'status':'verified before signing'}))
