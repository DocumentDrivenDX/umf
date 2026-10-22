# SPDX-License-Identifier: MIT OR Apache-2.0
# Independent annotation marking versus required predicate replay.
import sys,json,hashlib,platform,struct,importlib.metadata,types,inspect
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
import jsonschema._utils,jsonschema._legacy_keywords
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
source_sha=hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest();assert source_sha=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
nan=float('nan');arith={'multipleOf':.5};props={'properties':{'x':arith}};obj={'x':nan};arr=[nan]
up={'unevaluatedProperties':False,'type':'string'};ui={'unevaluatedItems':False,'type':'object'}
controls=[
 ('up-properties-mark',{**up,**props},obj),
 ('up-patterns-mark',{**up,'patternProperties':{'^x$':arith}},obj),
 ('up-dependent-mark',{**up,'dependentSchemas':{'x':props}},obj),
 ('up-dependent-ignores-ordinary-type',{**up,'dependentSchemas':{'x':{'type':'number',**props}}},obj),
 ('up-if-then-mark',{**up,'if':{},'then':props},obj),
 ('up-if-else-mark',{**up,'if':{'type':'string'},'else':props},obj),
 ('up-ap-predicate',{**up,'additionalProperties':arith},obj),
 ('up-ap-predicate-declared',{**up,'properties':{'x':{}},'additionalProperties':arith},obj),
 ('up-up-predicate-declared',{'unevaluatedProperties':arith,'type':'string','properties':{'x':{}}},obj),
 ('up-allof-predicate',{**up,'allOf':[props]},obj),
 ('up-anyof-all-predicates',{**up,'anyOf':[{},props]},obj),
 ('up-oneof-predicates',{**up,'oneOf':[{},props]},obj),
 ('up-ref-mark',{**up,'definitions':{'target':props},'$ref':'#/definitions/target'},obj),
 ('up-ap-false-mark',{**up,**props,'additionalProperties':False},obj),
 ('ui-items-mark',{**ui,'items':arith},arr),
 ('ui-prefix-mark',{**ui,'prefixItems':[arith]},arr),
 ('ui-tuple-mark',{**ui,'items':[arith]},arr),
 ('ui-items-true',{**ui,'items':True},arr),
 ('ui-items-false',{**ui,'items':False},arr),
 ('ui-contains-predicate',{**ui,'contains':arith},arr),
 ('ui-ui-predicate-items',{'unevaluatedItems':arith,'type':'object','items':{}},arr),
 ('ui-ui-predicate-prefix',{'unevaluatedItems':arith,'type':'object','prefixItems':[{}]},arr),
 ('ui-if-then-mark',{**ui,'if':{},'then':{'items':arith}},arr),
 ('ui-if-else-mark',{**ui,'if':{'type':'object'},'else':{'items':arith}},arr),
 ('ui-allof-predicate',{**ui,'allOf':[{'items':arith}]},arr),
 ('ui-anyof-all-predicates',{**ui,'anyOf':[{}, {'items':arith}]},arr),
 ('ui-ref-mark',{**ui,'definitions':{'target':{'items':arith}},'$ref':'#/definitions/target'},arr),
 ('ui-additional-items-mark',{**ui,'items':[],'additionalItems':arith},arr),
]
def typed(v):
 if type(v)is float:return {'kind':'float','bits':struct.pack('>d',v).hex()}
 if type(v)is int:return {'kind':'integer','decimal':str(v)}
 if type(v)is str:return {'kind':'string','value':v}
 if v is None:return {'kind':'null'}
 if type(v)is list:return {'kind':'array','items':[typed(x)for x in v]}
 if type(v)is dict:return {'kind':'object','members':[[k,typed(x)]for k,x in v.items()]}
 raise TypeError(type(v))
def rewrite(v,draft):
 if type(v)is dict:return {('divisibleBy'if draft==0 and k=='multipleOf'else k):rewrite(x,draft)for k,x in v.items()}
 if type(v)is list:return [rewrite(x,draft)for x in v]
 return v
def sig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def fail(e):return {'status':'arithmetic-error'if isinstance(e,(ValueError,OverflowError))else'evaluation-error','type':type(e).__name__,'message':str(e)}
selected=[4]if len(sys.argv)>1 and sys.argv[1]=='legacy2019'else[0,1,2,3,5]
cases=[]
for draft in selected:
 for name,rule,instance in controls:
  schema={'$schema':uris[draft],**rewrite(rule,draft)};row={'id':f'draft{draft}-{name}','schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance),'methods':{}}
  try:v=schema_validator(schema)
  except BaseException as e:row['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(row);continue
  for method in ['is_valid','validate','iterate']:
   try:
    if method=='is_valid':result={'status':'validity','valid':v.is_valid(instance)}
    elif method=='validate':
     try:v.validate(instance);result={'status':'valid'}
     except ValidationError as e:result={'status':'validation-error','error':sig(e)}
    else:
     prefix=[];it=v.iter_errors(instance)
     while True:
      try:prefix.append(sig(next(it)))
      except StopIteration:result={'status':'end','prefix':prefix};break
      except BaseException as e:result={**fail(e),'prefix':prefix};break
   except BaseException as e:result=fail(e)
   row['methods'][method]=result
  cases.append(row)
print(json.dumps({'profile':'umf.r2-sol-python-schema-annotation-mechanism/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':source_sha,'helperSourceSha256':{'utils':hashlib.sha256(Path(jsonschema._utils.__file__).read_bytes()).hexdigest(),'legacy':hashlib.sha256(Path(jsonschema._legacy_keywords.__file__).read_bytes()).hexdigest()},'scope':'Unchanged native key/item annotation marking versus required validity predicates, at reached unevaluated keyword before an intervening type diagnostic. Legacy2019 is a separate frozen baseline; no existing correction is silently broadened. Constructor and evaluation phases remain separate.','draftIndices':selected,'cases':cases},ensure_ascii=True,indent=2))
