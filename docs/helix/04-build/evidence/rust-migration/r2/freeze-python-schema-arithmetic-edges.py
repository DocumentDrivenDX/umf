# SPDX-License-Identifier: MIT OR Apache-2.0
# Independent predecessor-only observations; candidate results are never expected values.
import sys, json, hashlib, platform, importlib.metadata
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src')
sys.path.insert(0,str(old))
from umf.schemas import schema_validator
assert Path(sys.modules["umf.schemas"].__file__).resolve() == (old/"umf/schemas.py").resolve()
assert importlib.metadata.version("jsonschema") == "4.26.0"
assert hashlib.sha256((old/"umf/schemas.py").read_bytes()).hexdigest() == "22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402"
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
values={'nan':float('nan'),'inf':float('inf'),'-inf':-float('inf'),'large-float':1e308,'large-int':2**1024,'negative-large-int':-(2**1024),'zero-int':0,'zero-float':0.0,'negative-zero':-0.0,'one-int':1,'one-float':1.0,'negative-one':-1.0,'half':.5,'three-tenths':.3,'quotient-rounding':.30000000000000004,'subnormal':5e-324,'negative-subnormal':-5e-324}
rules=[{'type':'integer'},{'type':'number'},{'minimum':1.0},{'maximum':1.0},{'exclusiveMinimum':1.0},{'exclusiveMaximum':1.0}]+[{'multipleOf':d} for d in [1,1.0,2,2.0,3,3.0,.25,.3,5e-324,9007199254740991]]+[{'const':1.0},{'enum':[1.0]},{'not':{'type':'integer'}}]
records=[]
for draft,uri in enumerate(uris):
 for ri,rule in enumerate(rules):
  if draft<2 and any(k in rule for k in ['exclusiveMinimum','exclusiveMaximum']):
   k=next(iter(rule)); rule={k:True,'minimum' if k=='exclusiveMinimum' else 'maximum':1.0}
  if draft==0 and 'multipleOf' in rule: rule={'divisibleBy':rule['multipleOf']}
  schema={'$schema':uri,**rule}
  for name,value in values.items():
   case={'id':f'draft{draft}-rule{ri}-{name}','schema':schema,'schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instance':name}
   try:
    validator=schema_validator(schema)
    try: case['outcome']={'status':'validity','valid':validator.is_valid(value)}
    except BaseException as e: case['outcome']={'status':'instance-error','type':type(e).__name__,'message':str(e)}
   except BaseException as e: case['outcome']={'status':'schema-error','type':type(e).__name__,'message':str(e)}
   records.append(case)
print(json.dumps({'python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest(),'profile':'umf.r2-sol-python-schema-arithmetic-edges/1','instanceRecipes':{name:({'kind':'int','decimal':str(value)} if type(value) is int else {'kind':'float','bits':__import__('struct').pack('>d',value).hex()}) for name,value in values.items()},'cases':records},ensure_ascii=True,allow_nan=False,indent=2))
