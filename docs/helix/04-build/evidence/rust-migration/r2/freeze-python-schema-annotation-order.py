# SPDX-License-Identifier: MIT OR Apache-2.0
# Fixed native annotation helper order is independent of ordinary keyword order.
import sys,json,hashlib,platform,struct,importlib.metadata,types
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
source_sha=hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest();assert source_sha=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
nan=float('nan');arith={'multipleOf':.5};obj={'x':nan};arr=[nan];props={'properties':{'x':arith}};items={'items':arith};missing={'$ref':'#/missing'}
def typed(v):
 if type(v)is float:return {'kind':'float','bits':struct.pack('>d',v).hex()}
 if type(v)is str:return {'kind':'string','value':v}
 if type(v)is list:return {'kind':'array','items':[typed(x)for x in v]}
 if type(v)is dict:return {'kind':'object','members':[[k,typed(x)]for k,x in v.items()]}
 raise TypeError(type(v))
def sig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def failure(e):
 arithmetic=isinstance(e,(ValueError,OverflowError))and type(e).__name__!='_WrappedReferencingError'
 return {'status':'arithmetic-error'if arithmetic else'evaluation-error','type':type(e).__name__,'message':str(e)}
controls=[]
for name,keyword,value in [('contains','contains',arith),('ref','$ref','#/missing'),('if','if',{'contains':arith}),('allof','allOf',[items]),('anyof','anyOf',[{},items]),('oneof','oneOf',[{},items])]:
 for early in [False,True]:
  fields={keyword:value,'items':{}}if not early else{'items':{},keyword:value}
  controls.append(('array-items-'+name+'-'+str(int(early)),{'unevaluatedItems':False,'type':'object',**fields},arr))
for kind,instance,mark,invalid,arithbranch in [('object',obj,'unevaluatedProperties','string',props),('array',arr,'unevaluatedItems','object',items)]:
 pairs=[('if-comb',('if',arithbranch),('allOf',[missing])),('comb-priority',('anyOf',[{},arithbranch]),('oneOf',[missing]))]
 if kind=='object':pairs.extend([('ref-priority',('anyOf',[{},arithbranch]),('$ref','#/missing')),('dependent-priority',('anyOf',[{},arithbranch]),('dependentSchemas',{'x':missing}))])
 else:pairs.append(('ref-priority',('contains',arith),('$ref','#/missing')))
 for name,a,b in pairs:
  for reverse in [False,True]:
   fields=dict([a,b]if not reverse else[b,a]);controls.append((kind+'-'+name+'-'+str(int(reverse)),{mark:False,'type':invalid,**fields},instance))
cases=[]
for draft,uri in [(4,'https://json-schema.org/draft/2019-09/schema'),(5,'https://json-schema.org/draft/2020-12/schema')]:
 selected=list(controls)
 if draft==5:selected.append(('object-ap-before-up',{'unevaluatedProperties':arith,'type':'string','additionalProperties':missing},obj))
 for name,rule,instance in selected:
  schema={'$schema':uri,**rule};row={'id':f'draft{draft}-{name}','schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance),'methods':{}}
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
      except BaseException as e:result={**failure(e),'prefix':prefix};break
   except BaseException as e:result=failure(e)
   row['methods'][method]=result
  cases.append(row)
print(json.dumps({'profile':'umf.r2-sol-python-schema-annotation-order/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':source_sha,'scope':'Known annotation family closure: fixed dialect/kind helper order, early items returns versus refs/contains/if/combinators, and required predicate priority independent of ordinary keyword insertion order. No new semantic correction or candidate-derived expectation. Local references only; no network/recursive nontermination.','cases':cases},ensure_ascii=True,indent=2))
