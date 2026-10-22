# SPDX-License-Identifier: MIT OR Apache-2.0
# Independent local-reference runtime phase and ordered terminal observations.
import sys,json,hashlib,platform,importlib.metadata,types
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
source_sha=hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest();assert source_sha=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
targets=[('missing-pointer',{},'#/missing'),('missing-anchor',{},'#missing'),('bad-array-index',{'x-target':[{}]},'#/x-target/not-an-index'),('scalar-traversal',{'x-target':None},'#/x-target/child')]
for name,value in [('null',None),('integer',5),('text','text'),('empty-array',[]),('array',[{}]),('false',False),('true',True)]:targets.append(('target-'+name,{'x-target':value},'#/x-target'))
def sig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def fail(e):return {'status':'evaluation-error','type':type(e).__name__,'message':str(e)}
cases=[]
for draft,uri in enumerate(uris):
 for operator in (['$ref','$dynamicRef'] if draft==5 else ['$ref']):
  for name,payload,reference in targets:
   branch={operator:reference};invalid={'type':'number'}
   placements=[('direct',branch)]
   if draft==0:placements += [('extends-prefix',{'extends':[invalid,branch]}),('extends-terminal-first',{'extends':[branch,invalid]})]
   else:placements += [('allof-prefix',{'allOf':[invalid,branch]}),('allof-terminal-first',{'allOf':[branch,invalid]}),('anyof-valid-first',{'anyOf':[{},branch]}),('oneof-valid-first',{'oneOf':[{},branch]})]
   for placement,rule in placements:
    schema={'$schema':uri,**payload,**rule};row={'id':f'draft{draft}-{operator[1:]}-{name}-{placement}','schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':{'kind':'string','value':'bad'},'methods':{}}
    try:v=schema_validator(schema)
    except BaseException as e:row['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(row);continue
    for method in ['is_valid','validate','iterate']:
     try:
      if method=='is_valid':result={'status':'validity','valid':v.is_valid('bad')}
      elif method=='validate':
       try:v.validate('bad');result={'status':'valid'}
       except ValidationError as e:result={'status':'validation-error','error':sig(e)}
      else:
       prefix=[];it=v.iter_errors('bad')
       while True:
        try:prefix.append(sig(next(it)))
        except StopIteration:result={'status':'end','prefix':prefix};break
        except BaseException as e:result={**fail(e),'prefix':prefix};break
     except BaseException as e:result=fail(e)
     row['methods'][method]=result
    cases.append(row)
print(json.dumps({'profile':'umf.r2-sol-python-schema-reference-terminals/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':source_sha,'scope':'Separate schema construction from reached local-reference evaluation. Missing pointers/anchors, invalid array-index/scalar traversal, inert scalar/array/non-schema targets, and valid boolean targets across six dialects and active $ref/$dynamicRef. Public first-error loops versus buffered predicates are retained. No network resources or recursive-reference nontermination probes.','cases':cases},ensure_ascii=True,indent=2))
