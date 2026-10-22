# SPDX-License-Identifier: MIT OR Apache-2.0
# Supplemental independent phase attribution; original subject fixture is immutable.
import sys,json,hashlib,platform,struct,importlib.metadata,types
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src')
pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest()=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
assert importlib.metadata.version('jsonschema')=='4.26.0'
fixture=Path(__file__).with_name('sol-python-schema-error-subjects-predecessor.json')
assert hashlib.sha256(fixture.read_bytes()).hexdigest()=='e93bac66f68c16acef799beec894638bf8733d8107347f2e062dd075de7f13b1'
def untype(v):
 k=v['kind']
 if k=='null':return None
 if k=='boolean':return v['value']
 if k=='integer':return int(v['decimal'])
 if k=='float':return struct.unpack('>d',bytes.fromhex(v['bits']))[0]
 if k=='string':return ''.join(map(chr,v['points'])) if 'points'in v else v['value']
 if k=='array':return [untype(x) for x in v['items']]
 if k=='object':return {k:untype(x) for k,x in v['members']}
 raise ValueError(k)
def failure(e):return {'type':type(e).__name__,'message':str(e)}
cases=[]
for c in json.loads(fixture.read_text())['cases']:
 if 'schemaError' not in c:continue
 schema=untype(c['schemaRecipe']);instance=untype(c['instanceRecipe']);row={'id':c['id']}
 try:validator=schema_validator(schema)
 except BaseException as e:
  row.update(phase='construction',error=failure(e));cases.append(row);continue
 row['phase']='iteration';row['construction']='accepted';methods={}
 for name in ['is_valid','validate','iter_errors']:
  prefix=[]
  try:
   if name=='iter_errors':
    for e in validator.iter_errors(instance):prefix.append({'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)})
    result={'status':'end','prefix':prefix}
   else:
    value=getattr(validator,name)(instance);result={'status':'return','value':value}
  except BaseException as e:
   result={'status':'error','error':failure(e)}
   if name=='iter_errors':result['prefix']=prefix
  methods[name]=result
 row['methods']=methods;cases.append(row)
print(json.dumps({'python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'cases':cases},ensure_ascii=True,indent=2))
