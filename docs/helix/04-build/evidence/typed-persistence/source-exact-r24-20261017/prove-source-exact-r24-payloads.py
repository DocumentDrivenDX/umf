from pathlib import Path
import hashlib,json,sys,sysconfig,zipfile,importlib.metadata
root=Path('/private/tmp/sdk-source-exact-r24-20261017');root.mkdir(exist_ok=True)
pure=Path(sysconfig.get_path('purelib'));sha=lambda b:hashlib.sha256(b).hexdigest();wheels=[Path('/private/tmp/sdk-completion-runtime-r24-wheels/umf_access-0.1.0.dev0-py3-none-any.whl'),Path('/private/tmp/weft-combined-sdk-local-r20/wheels/weft_sql-0.4.42.dev0-cp39-abi3-macosx_11_0_arm64.whl')];rows=[]
for wheel in wheels:
 with zipfile.ZipFile(wheel) as z:
  for name in z.namelist():
   if name.endswith('/') or '.dist-info/' in name:continue
   expected=sha(z.read(name));assert sha((pure/name).read_bytes())==expected,name;rows.append({'path':name,'sha256':expected})
assert len(rows)==49,len(rows)
r={'status':'pass','sdkSource':'8b52b7ab501225c1d02eb8f4e0213b37a95c871a','compilerSource':'a6ca6fe63c94c8a0d65dd6e661d99b28381520ef','wheels':{str(p):sha(p.read_bytes()) for p in wheels},'payloads':rows,'python':sys.version,'dependencies':{n:importlib.metadata.version(n) for n in ('pydantic','pydantic-core','psycopg','psycopg-binary','typing-extensions')},'temporal':'HELD'};(root/('installed-payloads-'+sys.argv[1]+'.json')).write_text(json.dumps(r,indent=2)+'\n');print('49 exact installed SDK/compiler payloads')
