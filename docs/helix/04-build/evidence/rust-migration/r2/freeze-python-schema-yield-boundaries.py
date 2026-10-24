# SPDX-License-Identifier: MIT OR Apache-2.0
# Independent unchanged predecessor controls for sibling and buffered-yield boundaries.
import sys,json,hashlib,platform,struct,importlib.metadata
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');sys.path.insert(0,str(old))
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
assert hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest()=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
nan=float('nan');arith={'multipleOf':.5};fail={'type':'number'};fa={**fail,**arith};af={**arith,**fail}
def typed(v):
 if type(v) is float:return {'kind':'float','bits':struct.pack('>d',v).hex()}
 if type(v) is int:return {'kind':'integer','decimal':str(v)}
 if type(v) is str:return {'kind':'string','value':v}
 if v is None:return {'kind':'null'}
 if type(v) is list:return {'kind':'array','items':[typed(x) for x in v]}
 if type(v) is dict:return {'kind':'object','members':[[k,typed(x)] for k,x in v.items()]}
 raise TypeError(type(v))
def rewrite(v,draft):
 if type(v) is dict:return {('divisibleBy' if draft==0 and k=='multipleOf' else k):rewrite(x,draft) for k,x in v.items()}
 if type(v) is list:return [rewrite(x,draft) for x in v]
 return v
controls=[('items-first-invalid',{'items':fa},['bad',nan]),('items-arithmetic-first',{'items':fa},[nan,'bad']),('items-middle-invalid',{'items':fa},[0,'bad',nan]),('prefix-first-invalid',{'prefixItems':[fail,arith]},['bad',nan]),('properties-first-invalid',{'properties':{'a':fail,'b':arith}},{'a':'bad','b':nan}),('properties-arithmetic-first',{'properties':{'b':arith,'a':fail}},{'a':'bad','b':nan}),('pattern-properties-first-invalid',{'patternProperties':{'^a$':fail,'^b$':arith}},{'a':'bad','b':nan}),('additional-properties-one-invalid',{'additionalProperties':fa},{'a':'bad','b':0}),('required-two-missing',{'required':['a','b']},{}),('property-names-two-invalid',{'propertyNames':{'minLength':2,'pattern':'^z'}},{'a':0,'bb':0}),('dependencies-schema-first-invalid',{'dependencies':{'a':fail,'b':{'properties':{'b':arith}}}},{'a':0,'b':nan}),('dependent-schemas-first-invalid',{'dependentSchemas':{'a':fail,'b':{'properties':{'b':arith}}}},{'a':0,'b':nan}),('dependencies-required-two',{'dependencies':{'a':['x','y']}},{'a':0}),('dependent-required-two',{'dependentRequired':{'a':['x','y']}},{'a':0}),('unevaluated-properties-buffered',{'unevaluatedProperties':fa},{'a':'bad','b':nan}),('unevaluated-properties-ordinary',{'unevaluatedProperties':{'type':'string'}},{'a':0,'b':0}),('unevaluated-properties-false',{'unevaluatedProperties':False},{'a':0,'b':0}),('unevaluated-items-buffered',{'unevaluatedItems':fa},['bad',nan]),('unevaluated-items-ordinary',{'unevaluatedItems':{'type':'string'}},[0,0]),('unevaluated-items-false',{'unevaluatedItems':False},[0,0]),('contains-first-success',{'contains':arith},[0,nan]),('contains-second-success',{'contains':arith},[nan,0]),('contains-first-invalid',{'contains':fa},['bad',nan]),('contains-over-max-first',{'contains':arith,'maxContains':0},[0,nan]),('allof-first-invalid',{'allOf':[fail,arith]},'bad'),('allof-child-items',{'allOf':[{'items':fa},{}]},['bad',nan]),('extends-first-invalid',{'extends':[fail,arith]},'bad'),('anyof-all-invalid',{'anyOf':[{'type':'string'},{'type':'number'}]},None),('oneof-all-invalid',{'oneOf':[{'type':'string'},{'type':'number'}]},None),('oneof-after-first-valid-predicate',{'oneOf':[{},fa]},'bad'),('not-child-items',{'not':{'items':fa}},['bad',nan]),('if-child-items',{'if':{'items':fa},'then':False,'else':True},['bad',nan]),('contains-child-items',{'contains':{'items':fa}},[['bad',nan],[0]]),('ref-public-prefix',{'$defs':{'target':fa},'$ref':'#/$defs/target'},'bad'),('ref-arithmetic-prefix',{'$defs':{'target':{'type':'string',**arith}},'$ref':'#/$defs/target'},nan),('dynamic-ref-arithmetic-prefix',{'$defs':{'target':{'$dynamicAnchor':'target','type':'string',**arith}},'$dynamicRef':'#target'},nan)]
def errsig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def terminal(e):return {'status':'arithmetic-error','type':type(e).__name__,'message':str(e)}
cases=[]
for draft,uri in enumerate(uris):
 extra=[]
 if draft<5:extra=[('tuple-items-first-invalid',{'items':[fail,arith]},['bad',nan]),('additional-items-first-invalid',{'items':[{}],'additionalItems':fa},[0,'bad',nan])]
 for name,rule,instance in controls+extra:
  schema={'$schema':uri,**rewrite(rule,draft)};record={'id':f'draft{draft}-{name}','schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance),'methods':{}}
  try:validator=schema_validator(schema)
  except BaseException as e:record['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(record);continue
  for method in ['is_valid','validate','iterate']:
   try:
    if method=='is_valid':result={'status':'validity','valid':validator.is_valid(instance)}
    elif method=='validate':
     try:validator.validate(instance);result={'status':'valid'}
     except ValidationError as e:result={'status':'validation-error','error':errsig(e)}
    else:
     prefix=[];it=validator.iter_errors(instance)
     while True:
      try:prefix.append(errsig(next(it)))
      except StopIteration:result={'status':'end','prefix':prefix};break
      except BaseException as e:result={**terminal(e),'prefix':prefix};break
   except BaseException as e:result=terminal(e)
   record['methods'][method]=result
  cases.append(record)
out={'profile':'umf.r2-sol-python-schema-yield-boundaries/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest(),'scope':'Deterministic ordered public-yield loops, buffered combinators/unevaluated keywords, predicates and references. additionalProperties has one invalid extra so set iteration cannot change the public error set/order or arithmetic status. Recursive nontermination and hash-seed-dependent mixed additionalProperties arithmetic order are separately qualified, not silently frozen from one random process.','cases':cases}
print(json.dumps(out,ensure_ascii=True,allow_nan=False,indent=2))
