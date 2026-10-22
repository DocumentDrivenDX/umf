# SPDX-License-Identifier: MIT OR Apache-2.0
# Independent typed display-schema paths after local-reference rebasing.
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
cases=[]
for draft,uri in enumerate(uris):
 family='extends'if draft==0 else'allOf';target={family:[{'type':'number'}]};reference={'$ref':'#/definitions/target'}
 controls=[('direct-array-path',target,'bad'),('root-ref-array-path',{'definitions':{'target':target},**reference},'bad'),('property-ref-array-path',{'definitions':{'target':target},'properties':{'x':reference}},{'x':'bad'}),('item-ref-array-path',{'definitions':{'target':target},'items':reference},['bad']),('outer-array-ref-array-path',{'definitions':{'target':target},family:[reference]},'bad'),('ref-numeric-key-array-path',{'definitions':{'target':{'properties':{'0':target}}},**reference},{'0':'bad'}),('ref-tuple-path',{'definitions':{'target':{'items':[{'type':'number'}]}},**reference},['bad']),('ref-prefix-path',{'definitions':{'target':{'prefixItems':[{'type':'number'}]}},**reference},['bad'])]
 for name,rule,instance in controls:
  schema={'$schema':uri,**rule};row={'id':f'draft{draft}-{name}','schemaRecipe':typed(schema),'schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance)}
  try:v=schema_validator(schema)
  except BaseException as e:row['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(row);continue
  try:row['errors']=[{'keyword':e.validator,'validatorValue':typed(e.validator_value),'instance':typed(e.instance),'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}for e in v.iter_errors(instance)]
  except BaseException as e:row['evaluationError']={'type':type(e).__name__,'message':str(e)}
  cases.append(row)
print(json.dumps({'profile':'umf.r2-sol-python-schema-path-segments/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':source_sha,'scope':'Exposed schema_path/absolute_schema_path segment types are part of ordinary facade value preservation. Referenced target array indices remain integers when target-relative display paths cannot be traversed through the original root. Numeric object keys remain strings. Source schemas and instances are typed recipes; construction and evaluation phases are recorded separately.','cases':cases},ensure_ascii=True,indent=2))
