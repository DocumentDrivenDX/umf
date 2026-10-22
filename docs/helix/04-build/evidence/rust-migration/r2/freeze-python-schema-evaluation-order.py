# SPDX-License-Identifier: MIT OR Apache-2.0
# Capture only unchanged predecessor outcomes; never import the candidate.
import sys,json,hashlib,platform,struct,importlib.metadata
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src')
sys.path.insert(0,str(old))
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
assert hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest()=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
recipes={'nan':float('nan'),'inf':float('inf'),'large-int':2**1024,'large-float':1e308,'zero':0,'text':'x'}
arith={'multipleOf':.5};fail={'type':'string'};fa={**fail,**arith};af={**arith,**fail}
schemas=[('fail-arith',fa,'scalar'),('arith-fail',af,'scalar'),('enum-arith',{'enum':['x'],**arith},'scalar'),('arith-enum',{**arith,'enum':['x']},'scalar'),('allOf-fail-arith',{'allOf':[fail,arith]},'scalar'),('allOf-arith-fail',{'allOf':[arith,fail]},'scalar'),('allOf-combined',{'allOf':[fa,{}]},'scalar'),('anyOf-valid-arith',{'anyOf':[{},arith]},'scalar'),('anyOf-arith-valid',{'anyOf':[arith,{}]},'scalar'),('anyOf-combined-valid',{'anyOf':[fa,{}]},'scalar'),('anyOf-valid-combined',{'anyOf':[{},fa]},'scalar'),('oneOf-valid-arith',{'oneOf':[{},arith]},'scalar'),('oneOf-combined-valid',{'oneOf':[fa,{}]},'scalar'),('not-fail-arith',{'not':fa},'scalar'),('not-arith-fail',{'not':af},'scalar'),('if-fail-arith',{'if':fa,'then':arith,'else':{}},'scalar'),('if-arith-fail',{'if':af,'then':arith,'else':{}},'scalar'),('contains-fail-arith',{'contains':fa},'array'),('contains-arith-fail',{'contains':af},'array'),('properties-fail-arith',{'properties':{'x':fa}},'object'),('items-fail-arith',{'items':fa},'array'),('anyOf-unevaluated',{'anyOf':[{}, {'properties':{'x':arith}}],'unevaluatedProperties':False},'object')]
def error_record(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def error(e):return {'status':'arithmetic-error','type':type(e).__name__,'message':str(e)}
def rewrite(v,draft):
 if type(v) is dict:return {('divisibleBy' if draft==0 and k=='multipleOf' else k):rewrite(x,draft) for k,x in v.items()}
 if type(v) is list:return [rewrite(x,draft) for x in v]
 return v
cases=[]
for draft,uri in enumerate(uris):
 for name,rule,shape in schemas:
  schema={'$schema':uri,**rewrite(rule,draft)}
  for value_name,raw in recipes.items():
   instance=raw if shape=='scalar' else [raw] if shape=='array' else {'x':raw}
   record={'id':f'draft{draft}-{name}-{value_name}','schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':{'shape':shape,'value':value_name},'methods':{}}
   try:v=schema_validator(schema)
   except BaseException as e:record['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(record);continue
   for method in ['is_valid','validate','iterate']:
    try:
     if method=='is_valid':result={'status':'validity','valid':v.is_valid(instance)}
     elif method=='validate':
      try:v.validate(instance);result={'status':'valid'}
      except ValidationError as e:result={'status':'validation-error','error':error_record(e)}
     else:
      prefix=[];it=v.iter_errors(instance)
      while True:
       try:prefix.append(error_record(next(it)))
       except StopIteration:result={'status':'end','prefix':prefix};break
       except BaseException as e:result={**error(e),'prefix':prefix};break
    except BaseException as e:result=error(e)
    record['methods'][method]=result
   cases.append(record)
out={'profile':'umf.r2-sol-python-schema-evaluation-order/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest(),'instanceValues':{name:({'kind':'integer','decimal':str(value)} if type(value) is int else {'kind':'float','bits':struct.pack('>d',value).hex()} if type(value) is float else {'kind':'string','value':value}) for name,value in recipes.items()},'cases':cases}
print(json.dumps(out,ensure_ascii=True,allow_nan=False,indent=2))
