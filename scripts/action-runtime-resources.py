#!/usr/bin/env python3
"""Generate/check Python's fixed resource custody from its explicit source inventory."""
import ast
import hashlib
import json
from pathlib import Path
import re
import sys
ROOT=Path(__file__).resolve().parents[1]
source_path=ROOT/'python/src/umf/action_runtime.py'
source=source_path.read_text()
module=ast.parse(source)
inventory=next(ast.literal_eval(node.value) for node in module.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='_RESOURCE_FILES' for t in node.targets))
hook=ast.parse((ROOT/'python/hatch_build.py').read_text())
hook_inventory=next(ast.literal_eval(node.value) for node in hook.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='ACTION_RUNTIME_RESOURCES' for t in node.targets))
if set(inventory.values())!=set(hook_inventory):raise SystemExit('Python resource loader/build inventory drift')
resources={name:{'file':filename,'source':path,'sha256':hashlib.sha256((ROOT/path).read_bytes()).hexdigest()} for name,(filename,path) in inventory.items()}
manifest=(json.dumps({'format':'umf.action-runtime-resources/1','resources':resources},sort_keys=True,indent=2)+'\n').encode()
expected=hashlib.sha256(manifest).hexdigest()
replacement=re.sub(r'_MANIFEST_SHA256 = "[0-9a-f]{64}"',f'_MANIFEST_SHA256 = "{expected}"',source,count=1)
target=ROOT/'python/src/umf/action_runtime_resource_manifest.json'
if '--check' in sys.argv:
 if target.read_bytes()!=manifest or replacement!=source:raise SystemExit('Stale Python action/saga resource custody')
else:
 target.write_bytes(manifest);source_path.write_text(replacement)
print(f'Python resource custody verified ({len(resources)} resources).')
