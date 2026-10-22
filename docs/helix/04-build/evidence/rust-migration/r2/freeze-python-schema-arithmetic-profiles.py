# SPDX-License-Identifier: MIT OR Apache-2.0
# Confirm unchanged predecessor numeric observations across supported CPython profiles.
import sys,subprocess,json,hashlib,pathlib,platform
root=pathlib.Path('/Users/erik/.codex/worktrees/rust-binding-spike/umf')
r=root/'docs/helix/04-build/evidence/rust-migration/r2'
profiles=[]
for version,rpds in [('3.12.15','/Users/erik/.cache/uv/archive-v0/yAXYQIYufECcyKqT'),('3.13.16','/Users/erik/.cache/uv/archive-v0/iJqxDljMOPHbeWYg')]:
 exe=f'/Users/erik/.local/share/uv/python/cpython-{version}-macos-aarch64-none/bin/python'+version[:4]
 profile={'python':version,'executable':exe,'executableSha256':hashlib.sha256(pathlib.Path(exe).read_bytes()).hexdigest(),'captures':[]}
 for family in ['arithmetic','arithmetic-edges']:
  generator=r/f'freeze-python-schema-{family}.py'
  code=f'import sys,runpy,types;pkg=types.ModuleType("umf");pkg.__path__=["/private/tmp/umf-r2-predecessor-53de049/python/src/umf"];sys.modules["umf"]=pkg;sys.path.insert(0,{rpds!r});sys.path.insert(1,"/private/tmp/umf-r2-binding-venv/lib/python3.11/site-packages");runpy.run_path({str(generator)!r},run_name="__main__")'
  p=subprocess.run([exe,'-c',code],text=True,capture_output=True,check=True,cwd=root)
  data=json.loads(p.stdout); expectedpath=r/f'sol-python-schema-{family}-predecessor.json';expected=json.loads(expectedpath.read_text())
  assert data['python']==version
  assert data['cases']==expected['cases'],(version,family,'changed cases')
  assert data['instanceRecipes']==expected['instanceRecipes']
  assert data['schemaSourceSha256']==expected['schemaSourceSha256']
  dest=pathlib.Path(f'/private/tmp/umf-sol-schema-{family}-{version}.json');dest.write_text(p.stdout)
  profile['captures'].append({'fixture':expectedpath.name,'fixtureSha256':hashlib.sha256(expectedpath.read_bytes()).hexdigest(),'generatorSha256':hashlib.sha256(generator.read_bytes()).hexdigest(),'cases':len(data['cases']),'completeCaseRecordsEqual':True,'instanceRecipesEqual':True,'captureSha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'capturePath':str(dest)})
 profiles.append(profile)
result={'id':'R2-SOL-PYTHON-SCHEMA-ARITHMETIC-PROFILES-001','scope':'Independent unchanged predecessor schemas.py/jsonschema4.26.0 numeric outcome confirmation; does not constrain installed runtime patch version','source':'origin/main 53de049136c7e41b482d1a73665d031cd5fbaec6','basePython':'3.11.17','sharedExpectedSemantics':'All 2,586 complete case records, including status, validity, native exception class/message, schema source int/float spellings and instance recipes, are equal as JSON values across CPython 3.11.17, 3.12.15 and 3.13.16. Only capture Python metadata differs. Use the immutable 3.11 fixture records as shared expectations. Candidate arithmetic refusals follow the separately reviewed stable UmfCoreError mapping.','captureMethod':'Each interpreter loads the same archived umf.schemas and umf.json source via an isolated package shell, skipping unrelated package __init__/Pydantic imports. Pure Python jsonschema 4.26.0 dependencies are shared from the local cached environment; rpds is selected from a matching CPython-minor native wheel. No candidate implementation or outputs enter the oracle.','profiles':profiles,'overallR2Approved':False}
(r/'sol-python-schema-arithmetic-profiles.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
