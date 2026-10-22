# SPDX-License-Identifier: MIT OR Apache-2.0
# Observe predecessor hash-set ordering variability; never derive expected output from Rust.
import subprocess,os,json,hashlib
from pathlib import Path
r=Path(__file__).resolve().parent
runner=r'''import sys,types,json,platform,importlib.metadata
pkg=types.ModuleType('umf');pkg.__path__=['/private/tmp/umf-r2-predecessor-53de049/python/src/umf'];sys.modules['umf']=pkg
sys.path.insert(0,sys.argv[1]);sys.path.insert(1,'/private/tmp/umf-r2-binding-venv/lib/python3.11/site-packages')
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
v=schema_validator({'additionalProperties':{'type':'number','multipleOf':.5}});instance={'a':'bad','b':float('nan')}
out={}
for method in ['is_valid','validate','iterate']:
 try:
  if method=='is_valid':result={'status':'validity','valid':v.is_valid(instance)}
  elif method=='validate':
   try:v.validate(instance);result={'status':'valid'}
   except ValidationError as e:result={'status':'validation-error','keyword':e.validator,'path':list(e.absolute_path)}
  else:
   prefix=[];it=v.iter_errors(instance)
   while True:
    try:e=next(it);prefix.append({'keyword':e.validator,'path':list(e.absolute_path)})
    except StopIteration:result={'status':'end','prefix':prefix};break
    except BaseException as e:result={'status':'arithmetic-error','class':type(e).__name__,'message':str(e),'prefix':prefix};break
 except BaseException as e:result={'status':'arithmetic-error','class':type(e).__name__,'message':str(e)}
 out[method]=result
print(json.dumps({'python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'methods':out},ensure_ascii=True))'''
records=[]
for version,rpds in [('3.11.17','/Users/erik/.cache/uv/archive-v0/J3y8nsDoqm6I-cnV'),('3.12.15','/Users/erik/.cache/uv/archive-v0/yAXYQIYufECcyKqT'),('3.13.16','/Users/erik/.cache/uv/archive-v0/iJqxDljMOPHbeWYg')]:
 executable=f'/Users/erik/.local/share/uv/python/cpython-{version}-macos-aarch64-none/bin/python{version[:4]}'
 for seed in range(6):
  p=subprocess.run([executable,'-c',runner,rpds],env={**os.environ,'PYTHONHASHSEED':str(seed)},text=True,capture_output=True,check=True)
  observed=json.loads(p.stdout);assert observed['python']==version and observed['jsonschema']=='4.26.0'
  records.append({'hashSeed':seed,**observed})
receipt={'id':'R2-SOL-PYTHON-SCHEMA-UNORDERED-EXTRAS-001','scope':'Native predecessor additionalProperties builds a set of extra keys; hash seed changes whether a type error or later arithmetic exception is observed first. This receipt documents ambiguity rather than declaring one random process the semantic oracle.','sourceRevision':'53de049136c7e41b482d1a73665d031cd5fbaec6','schemaSourceSha256':hashlib.sha256(Path('/private/tmp/umf-r2-predecessor-53de049/python/src/umf/schemas.py').read_bytes()).hexdigest(),'schemaText':'{"additionalProperties":{"type":"number","multipleOf":0.5}}','instanceRecipe':{'kind':'object','members':[['a',{'kind':'string','value':'bad'}],['b',{'kind':'float','bits':'7ff8000000000000'}]]},'records':records,'productionDecision':'pending explicit stable-order compatibility qualification; no candidate expected record changed','overallR2Approved':False}
p=r/'sol-python-schema-unordered-extras-predecessor.json';p.write_text(json.dumps(receipt,indent=2)+'\n');print(hashlib.sha256(p.read_bytes()).hexdigest());print([(x['python'],x['hashSeed'],x['methods']['is_valid']['status']) for x in records])
