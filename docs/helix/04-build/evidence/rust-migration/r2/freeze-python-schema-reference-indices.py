# SPDX-License-Identifier: MIT OR Apache-2.0
# Native Python int grammar and negative Sequence indexing in local references.
import sys,json,hashlib,platform,importlib.metadata,types
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
source_sha=hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest();assert source_sha=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
indices=['0','1','10','-1','-2','-11','+0','+1','-0','00','01',' 0','0 ','\t1\n','1_0','0_1','\u0660','\uff11','+\u0661','\u0661_\u0660','1\u0660','\u00a01\u00a0','\u20031\u2003','\u00851\u0085','\u001c1\u001c','','-','+','1.0','1e0','_1','1_','1__0','\u22121','\u200b1','\u00b2','11','-12','99999999999999999999','%30','%2D1','1%5f0','%D9%A1','%C2%A01%C2%A0','9'*5000]
def sig(e):return {'keyword':e.validator,'instancePath':list(e.absolute_path),'schemaPath':list(e.absolute_schema_path)}
def fail(e):return {'status':'evaluation-error','type':type(e).__name__,'message':str(e)}
cases=[]
for draft,uri in enumerate(uris):
 for operator in (['$ref','$dynamicRef']if draft==5 else['$ref']):
  for number,index in enumerate(indices):
   schema={'$schema':uri,'x-target':[{'type':'number'if i%2==0 else'string'}for i in range(11)],operator:'#/x-target/'+index};row={'id':f'draft{draft}-{operator[1:]}-index{number}','indexToken':index,'schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':{'kind':'string','value':'bad'},'methods':{}}
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
print(json.dumps({'profile':'umf.r2-sol-python-schema-reference-indices/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':source_sha,'scope':'Unchanged reached local-reference array index profile: urllib percent decoding, Python int string grammar including signs/whitespace/Unicode decimal digits/underscores, negative indexing and bounds. Ordinary instance bad matches odd-index string rules and fails even-index number rules. No network; no recursive nontermination. Runtime refusal classes/messages are native evidence rather than facade class-identity promises.','cases':cases},ensure_ascii=True,indent=2))
