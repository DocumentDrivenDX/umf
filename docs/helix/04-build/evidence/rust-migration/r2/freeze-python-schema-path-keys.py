# SPDX-License-Identifier: MIT OR Apache-2.0
# Typed path keys retain raw source text rather than JSON Pointer escaping.
import sys,json,hashlib,platform,struct,importlib.metadata,types
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
source_sha=hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest();assert source_sha=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
def typed(v):
 if v is None:return {'kind':'null'}
 if type(v)is bool:return {'kind':'boolean','value':v}
 if type(v)is int:return {'kind':'integer','decimal':str(v)}
 if type(v)is float:return {'kind':'float','bits':struct.pack('>d',v).hex()}
 if type(v)is str:return {'kind':'string','points':list(map(ord,v))}
 if type(v)is list:return {'kind':'array','items':[typed(x)for x in v]}
 if type(v)is dict:return {'kind':'object','members':[[k,typed(x)]for k,x in v.items()]}
 raise TypeError(type(v))
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
keys=['a/b','a~b','~1','~0','~p000030','0','01','','a//b','/~','\U0001f600'];cases=[]
for draft,uri in enumerate(uris):
 for index,key in enumerate(keys):
  for referenced in [False,True]:
   target={'properties':{key:{'type':'number'}}};rule={'definitions':{'target':target},'$ref':'#/definitions/target'}if referenced else target;schema={'$schema':uri,**rule};instance={key:'bad'};row={'id':f'draft{draft}-key{index}-'+('ref'if referenced else'direct'),'schemaRecipe':typed(schema),'schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance)}
   try:v=schema_validator(schema)
   except BaseException as e:row['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(row);continue
   try:row['errors']=[{'keyword':e.validator,'validatorValue':typed(e.validator_value),'instance':typed(e.instance),'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}for e in v.iter_errors(instance)]
   except BaseException as e:row['evaluationError']={'type':type(e).__name__,'message':str(e)}
   cases.append(row)
print(json.dumps({'profile':'umf.r2-sol-python-schema-path-keys/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':source_sha,'scope':'Ordinary direct/referenced path keys remain raw source text in typed schema/instance path segments. Slash/tilde escaping belongs to pointer strings only. Numeric-string, empty, literal marker-shaped and astral keys remain distinct. Constructor and evaluation phases are separate. No semantic correction: exact predecessor fields are required.','cases':cases},ensure_ascii=True,indent=2))
