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
values={'nan':float('nan'),'inf':float('inf'),'-inf':-float('inf'),'large-float':1e308,'large-int':2**1024,'negative-large-int':-(2**1024),'zero':0,'negative-zero':-0.0,'half':.5}
rules=[{'type':'number'},{'type':'integer'},{'minimum':0},{'maximum':0},{'exclusiveMinimum':0},{'exclusiveMaximum':0},{'multipleOf':1},{'multipleOf':.5},{'multipleOf':.1},{'multipleOf':1e-308},{'const':0},{'enum':[0,1]}]
records=[]
for draft,uri in enumerate(uris):
 for ri,rule in enumerate(rules):
  if draft<2 and any(k in rule for k in ['exclusiveMinimum','exclusiveMaximum']):
   k=next(iter(rule)); rule={k:True,'minimum' if k=='exclusiveMinimum' else 'maximum':0}
  if draft==0 and 'multipleOf' in rule: rule={'divisibleBy':rule['multipleOf']}
  schema={'$schema':uri,**rule}
  for name,value in values.items():
   case={'id':f'draft{draft}-rule{ri}-{name}','schema':schema,'instance':name}
   try:
    validator=schema_validator(schema)
    try: case['outcome']={'status':'validity','valid':validator.is_valid(value)}
    except BaseException as e: case['outcome']={'status':'instance-error','type':type(e).__name__,'message':str(e)}
   except BaseException as e: case['outcome']={'status':'schema-error','type':type(e).__name__,'message':str(e)}
   records.append(case)
print(json.dumps({'python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest(),'profile':'umf.r2-sol-python-schema-arithmetic/1','instanceRecipes':{name:({'kind':'int','decimal':str(value)} if type(value) is int else {'kind':'float','bits':__import__('struct').pack('>d',value).hex()}) for name,value in values.items()},'cases':records},ensure_ascii=True,allow_nan=False,indent=2))
