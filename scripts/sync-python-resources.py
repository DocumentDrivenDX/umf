#!/usr/bin/env python3
"""Synchronize or verify both Python packages against their canonical UMF resources."""
import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write', action='store_true')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if args.write and args.check:
    parser.error('Choose --write or --check')
subprocess.run([sys.executable, str(root / 'scripts/sync-codegen-resources.py'), '--write' if args.write else '--check'], cwd=root, check=True)
path = root / 'python/src/umf/_action_runtime_manifest.py'
spec = importlib.util.spec_from_file_location('umf_resource_inventory', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
if args.write:
    module.sync(root, root / 'python')
digest = module.check(root, root / 'python')
print(json.dumps({'profile':'umf.python-resource-cohort/1','status':'passed','actionRuntimeManifestSha256':digest}))
