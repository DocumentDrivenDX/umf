# SPDX-License-Identifier: MIT OR Apache-2.0
# Confirm unchanged predecessor method observations on supported CPython minors.
import subprocess,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[6]
evidence=Path(__file__).resolve().parent
profiles=[]
for version,rpds in [('3.12.15','/Users/erik/.cache/uv/archive-v0/yAXYQIYufECcyKqT'),('3.13.16','/Users/erik/.cache/uv/archive-v0/iJqxDljMOPHbeWYg')]:
 executable=Path(f'/Users/erik/.local/share/uv/python/cpython-{version}-macos-aarch64-none/bin/python{version[:4]}')
 profile={'python':version,'executable':str(executable),'executableSha256':hashlib.sha256(executable.read_bytes()).hexdigest(),'captures':[]}
 for family in ['yield-boundaries']:
  generator=evidence/f'freeze-python-schema-{family}.py'
  code=f'import sys,runpy,types;pkg=types.ModuleType("umf");pkg.__path__=["/private/tmp/umf-r2-predecessor-53de049/python/src/umf"];sys.modules["umf"]=pkg;sys.path.insert(0,{rpds!r});sys.path.insert(1,"/private/tmp/umf-r2-binding-venv/lib/python3.11/site-packages");runpy.run_path({str(generator)!r},run_name="__main__")'
  capture=subprocess.run([str(executable),'-c',code],capture_output=True,text=True,check=True,cwd=evidence)
  observed=json.loads(capture.stdout)
  expected_path=evidence/f'sol-python-schema-{family}-predecessor.json'
  expected=json.loads(expected_path.read_text())
  assert observed['python']==version
  for key in ['cases','schemaSourceSha256','jsonschema']:assert observed[key]==expected[key],(version,family,key)
  output=Path(f'/private/tmp/umf-sol-python-schema-{family}-{version}.json');output.write_text(capture.stdout)
  profile['captures'].append({'fixture':expected_path.name,'fixtureSha256':hashlib.sha256(expected_path.read_bytes()).hexdigest(),'generatorSha256':hashlib.sha256(generator.read_bytes()).hexdigest(),'cases':len(observed['cases']),'methodObservations':sum(len(c['methods']) for c in observed['cases']),'completeRecordsEqual':True,'captureSha256':hashlib.sha256(capture.stdout.encode()).hexdigest(),'capturePath':str(output)})
 profiles.append(profile)
receipt={'id':'R2-SOL-PYTHON-SCHEMA-YIELD-BOUNDARIES-PROFILES-001','source':'origin/main 53de049136c7e41b482d1a73665d031cd5fbaec6','jsonschema':'4.26.0','basePython':'3.11.17','scope':'All 226 schema-instance cases, including one native schema admission refusal, and 675 method observations are equal as JSON values across CPython 3.11.17, 3.12.15 and 3.13.16. This includes ordered keyword/path prefixes and arithmetic exception class/messages. Immutable 3.11 fixtures are shared expected semantic records; candidate native arithmetic exceptions use the separately approved stable Rust error mapping.','captureMethod':'Each interpreter loads unchanged predecessor schemas.py/json.py via an isolated package shell, skipping unrelated package __init__/Pydantic imports; pure Python jsonschema dependencies are shared from the local cache and rpds matches the interpreter minor. No candidate outputs enter the oracle.','profiles':profiles,'overallR2Approved':False}
path=evidence/'sol-python-schema-yield-boundaries-profiles.json';path.write_text(json.dumps(receipt,indent=2)+'\n')
print(hashlib.sha256(path.read_bytes()).hexdigest())
