# SPDX-License-Identifier: MIT OR Apache-2.0
# Approved correction target: only replace predecessor set traversal with owned insertion order.
import sys,json,hashlib,platform,struct,importlib.metadata
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');sys.path.insert(0,str(old))
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
from jsonschema._utils import find_additional_properties
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
def typed(v):
 if v is None:return {'kind':'null'}
 if type(v) is bool:return {'kind':'boolean','value':v}
 if type(v) is float:return {'kind':'float','bits':struct.pack('>d',v).hex()}
 if type(v) is int:return {'kind':'integer','decimal':str(v)}
 if type(v) is str:return {'kind':'string','points':[ord(c) for c in v]}
 if type(v) is dict:return {'kind':'object','members':[[k,typed(x)] for k,x in v.items()]}
 if type(v) is list:return {'kind':'array','items':[typed(x) for x in v]}
 raise TypeError(type(v))
def sig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def terminal(e):return {'status':'arithmetic-error','type':type(e).__name__,'message':str(e)}
base={'type':'number','multipleOf':.5};nan=float('nan')
controls=[('ordered-first-invalid',{'additionalProperties':base},{'a':'bad','b':nan}),('ordered-arithmetic-first',{'additionalProperties':base},{'b':nan,'a':'bad'}),('ordered-two-invalid',{'additionalProperties':base},{'z':'bad','a':'bad'}),('declared-pattern-excluded',{'properties':{'known':{}},'patternProperties':{'^p':{}},'additionalProperties':base},{'known':nan,'pSkip':nan,'a':'bad','b':nan}),('unchanged-false-aggregate',{'additionalProperties':False},{'z':0,'a':0}),('unchanged-false-pattern-aggregate',{'patternProperties':{'^p':{}},'additionalProperties':False},{'z':0,'a':0,'pSkip':0})]
def rewrite(v,draft):
 if type(v) is dict:return {('divisibleBy' if draft==0 and k=='multipleOf' else k):rewrite(x,draft) for k,x in v.items()}
 if type(v) is list:return [rewrite(x,draft) for x in v]
 return v
cases=[]
for draft,uri in enumerate(uris):
 for name,rule,instance in controls:
  schema={'$schema':uri,**rewrite(rule,draft)};validator=schema_validator(schema);ap=schema['additionalProperties']
  def errors():
   if type(ap) is not dict:yield from validator.iter_errors(instance);return
   for key in find_additional_properties(instance,schema):
    for error in validator.descend(instance[key],ap,path=key):
     error.schema_path.appendleft('additionalProperties');yield error
  record={'id':f'draft{draft}-{name}','schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance),'methods':{}}
  for method in ['is_valid','validate','iterate']:
   try:
    if method=='is_valid':result={'status':'validity','valid':next(errors(),None) is None}
    elif method=='validate':
     first=next(errors(),None);result={'status':'valid'} if first is None else {'status':'validation-error','error':sig(first)}
    else:
     prefix=[];it=errors()
     while True:
      try:prefix.append(sig(next(it)))
      except StopIteration:result={'status':'end','prefix':prefix};break
      except BaseException as e:result={**terminal(e),'prefix':prefix};break
   except BaseException as e:result=terminal(e)
   record['methods'][method]=result
  cases.append(record)
out={'profile':'umf.r2-sol-python-schema-unordered-targets/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'sourceRevision':'53de049136c7e41b482d1a73665d031cd5fbaec6','derivation':'Reviewed correction R2-SOL-CORRECTION-003. Unchanged predecessor scalar/descend kernels; only schema-valued additionalProperties extra-key traversal uses find_additional_properties insertion order without wrapping it in set(). Boolean false aggregate controls use unchanged native iter_errors. These are approved target observations, not rewritten predecessor baseline observations.','cases':cases}
print(json.dumps(out,ensure_ascii=True,allow_nan=False,indent=2))
