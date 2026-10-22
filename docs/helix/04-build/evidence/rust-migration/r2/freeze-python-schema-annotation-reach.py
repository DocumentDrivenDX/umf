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
controls=[('up-wrongkind-primitive',{'anyOf':[{},arith],'unevaluatedProperties':False},nan),('up-wrongkind-array',{'anyOf':[{}, {'contains':arith}],'unevaluatedProperties':False},[nan]),('ui-wrongkind-object',{'anyOf':[{}, {'properties':{'b':arith}}],'unevaluatedItems':False},{'b':nan}),('up-after-type-error',{'anyOf':[{}, {'properties':{'b':arith}}],'type':'string','unevaluatedProperties':False},{'b':nan}),('ui-after-type-error',{'anyOf':[{}, {'contains':arith}],'type':'object','unevaluatedItems':False},[nan]),('up-after-min-properties-error',{'anyOf':[{}, {'properties':{'b':arith}}],'minProperties':2,'unevaluatedProperties':False},{'b':nan}),('up-before-required',{'unevaluatedProperties':False,'required':['missing']},{'a':0}),('ui-before-type',{'unevaluatedItems':False,'type':'object'},[0]),('up-before-type-annotation-replay',{'unevaluatedProperties':False,'type':'string','anyOf':[{}, {'properties':{'b':arith}}]},{'b':nan}),('ui-before-type-annotation-replay',{'unevaluatedItems':False,'type':'object','anyOf':[{}, {'contains':arith}]},[nan]),('up-after-successful-if',{'if':{'properties':{'x':{'type':'number'}}},'then':{'properties':{'x':{}}},'unevaluatedProperties':False},{'x':1}),('up-before-successful-if',{'unevaluatedProperties':False,'if':{'properties':{'x':{'type':'number'}}},'then':{'properties':{'x':{}}}},{'x':1}),('not-wrongkind-annotations',{'not':{'anyOf':[{},arith],'unevaluatedProperties':False}},nan),('if-wrongkind-annotations',{'if':{'anyOf':[{},arith],'unevaluatedProperties':False},'then':{'type':'string'},'else':{}},nan),('contains-wrongkind-annotations',{'contains':{'anyOf':[{},arith],'unevaluatedProperties':False}},[nan]),('ref-wrongkind-annotations',{'$defs':{'target':{'anyOf':[{},arith],'unevaluatedProperties':False}},'$ref':'#/$defs/target'},nan)]
def errsig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def terminal(e):return {'status':'arithmetic-error','type':type(e).__name__,'message':str(e)}
cases=[]
for draft,uri in enumerate(uris):
 extra=[]

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
out={'profile':'umf.r2-sol-python-schema-annotation-reach/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest(),'scope':'Annotation type guards, actual keyword position, and deferred native annotation predicates; deterministic method outcomes only.','cases':cases}
print(json.dumps(out,ensure_ascii=True,allow_nan=False,indent=2))
