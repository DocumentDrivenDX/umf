# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exercise actual packaging-hook gates against copied repository inputs."""
import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PACKAGE=ROOT/'python/umf_codegen'
spec=importlib.util.spec_from_file_location('codegen_build_hook',PACKAGE/'hatch_build.py')
hook=importlib.util.module_from_spec(spec);spec.loader.exec_module(hook)
with tempfile.TemporaryDirectory() as directory:
    repository=Path(directory)/'repo'
    package=repository/'python/umf_codegen'
    shutil.copytree(PACKAGE,package,ignore=shutil.ignore_patterns('__pycache__'))
    # Test-only presence sentinel for the hook's repository-input verification.
    (repository/'.helix.yml').write_text('# test fixture\n')
    manifest=json.loads((package/'src/umf_codegen/_assets/manifest.json').read_text())
    assert manifest['operations'] == ['generatePythonClient','compileTableDeployment','verifyTableDeployment','compileTableMigration','verifyTableMigration']
    for name in manifest['inputs']:
        if name.startswith('node_modules/'):continue
        destination=repository/name;destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(ROOT/name,destination)
    instance=hook.CustomBuildHook(str(package),{},None,None,str(package/'dist'),'wheel')
    instance.initialize(None,{})
    changed=repository/'scripts/codegen/entry.ts';original=changed.read_bytes()
    changed.write_bytes(original+b'\n// changed after bundling\n')
    try:instance.initialize(None,{})
    except ValueError as error:assert 'Stale generator source' in str(error)
    else:raise AssertionError('stale source accepted')
    changed.write_bytes(original)
    bundle=package/'src/umf_codegen/_assets/generator.js.gz'
    bundle.write_bytes(bundle.read_bytes()+b'corrupt')
    try:instance.initialize(None,{})
    except ValueError as error:assert 'Codegen asset differs' in str(error)
    else:raise AssertionError('damaged payload accepted')
print(json.dumps({'packagingHookControls':['current-source-passes','stale-source-refuses','damaged-payload-refuses']}))
