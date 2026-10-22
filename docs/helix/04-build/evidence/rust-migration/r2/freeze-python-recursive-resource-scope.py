# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent predecessor resource/scope observations; never imports candidate UMF."""
import sys,json,hashlib,platform,struct,importlib.metadata,types
from pathlib import Path
OLD=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(OLD/'umf')];sys.modules['umf']=pkg
from umf.schemas import schema_validator
from jsonschema.exceptions import ValidationError
import referencing._core,referencing.jsonschema
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(OLD/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(OLD/'umf/schemas.py')=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
assert sha(referencing._core.__file__)=='d923c67da4efcc0dec46a6e3ff8476c02fbe7e25e8942515a4b14b249eb3759f'
assert sha(referencing.jsonschema.__file__)=='8d767ab7ac7da13bd31cc202d2d4726858d6e6bdaa78739b62ebbb52149f2b74'
SUITE=Path('/tmp/umf-json-schema-test-suite/tests/draft2019-09/recursiveRef.json')
URI='https://json-schema.org/draft/2019-09/schema'
def typed(v):
 if v is None:return {'kind':'null'}
 if type(v)is bool:return {'kind':'bool','value':v}
 if type(v)is int:return {'kind':'integer','decimal':str(v)}
 if type(v)is float:return {'kind':'float','bits':struct.pack('>d',v).hex()}
 if type(v)is str:return {'kind':'string','codepoints':list(map(ord,v))}
 if type(v)is list:return {'kind':'array','items':[typed(x)for x in v]}
 if type(v)is dict:return {'kind':'object','members':[[list(map(ord,k)),typed(x)]for k,x in v.items()]}
 raise TypeError(type(v))
def path(v):return [{'index':x}if type(x)is int else{'key':list(map(ord,x))}for x in v]
def sig(e):return {'keyword':e.validator,'instancePath':path(e.absolute_path),'schemaPath':path(e.absolute_schema_path)}
def failure(e):return {'status':'evaluation-error','type':type(e).__name__,'message':str(e)}
controls=[]
for gi,g in enumerate(json.loads(SUITE.read_text())):
 for ci,t in enumerate(g['tests']):controls.append((f'official-{gi}-{ci}',g['schema'],t['data'],{'group':gi,'case':ci,'officialValid':t['valid']}))
# Nearest source resource, including a target below that resource root.
for draft,uri,defs in [('draft4','http://json-schema.org/draft-04/schema#','definitions'),('draft6','http://json-schema.org/draft-06/schema#','definitions'),('draft7','http://json-schema.org/draft-07/schema#','definitions'),('draft2019',URI,'$defs'),('draft2020','https://json-schema.org/draft/2020-12/schema','$defs')]:
 idkey='id'if draft=='draft4'else'$id'
 inner={idkey:'inner.json',defs:{'needle':{'const':'inner'}if draft!='draft4'else{'enum':['inner']},'wrapper':{'$ref':f'#/{defs}/needle'}},'$ref':f'#/{defs}/wrapper'}
 schema={'$schema':uri,idkey:'https://example.test/scope/outer.json',defs:{'needle':{'const':'outer'}if draft!='draft4'else{'enum':['outer']},'inner':inner},'$ref':f'#/{defs}/inner'}
 for v in ['inner','outer']:controls.append((f'{draft}-nested-pointer-{v}',schema,v,{}))
# Direct resource descent changes the base but does not itself push lookup history.
for outer in [None,False,True]:
 for anchor in [None,False,True]:
  inner={'$id':'inner.json','anyOf':[{'type':'integer'},{'type':'object','additionalProperties':{'$recursiveRef':'#'}}]}
  if anchor is not None:inner['$recursiveAnchor']=anchor
  schema={'$schema':URI,'$id':'https://example.test/direct/root.json','anyOf':[{'type':'boolean'},{'type':'object','additionalProperties':inner}]}
  if outer is not None:schema['$recursiveAnchor']=outer
  for v in [1,True]:controls.append((f'direct-outer-{outer}-inner-{anchor}-{type(v).__name__}',schema,{'foo':{'bar':v}},{}))
# The nearest unanchored lookup-history resource is a barrier to outer anchors.
for middle in [None,False,True]:
 inner={'$id':'inner.json','$recursiveAnchor':True,'anyOf':[{'type':'boolean'},{'type':'object','additionalProperties':{'$recursiveRef':'#'}}]}
 mid={'$id':'middle.json','$defs':{'inner':inner},'anyOf':[{'type':'integer'},{'$ref':'#/$defs/inner'}]}
 if middle is not None:mid['$recursiveAnchor']=middle
 schema={'$schema':URI,'$id':'https://example.test/history/root.json','$recursiveAnchor':True,'anyOf':[{'type':'string'},{'type':'object','additionalProperties':mid}]}
 for v in [1,'outer',True]:controls.append((f'history-middle-{middle}-{type(v).__name__}',schema,{'foo':{'bar':v}},{}))
# The native recursive applicator always asks for '#', even for other accepted text.
for ref in ['#','#/$defs/leaf','#/missing','#unknown','other.json']:
 schema={'$schema':URI,'$id':'https://example.test/text/root.json','type':'object','properties':{'p':{'$recursiveRef':ref}},'$defs':{'leaf':{'type':'integer'}}}
 for v in [1,{}]:controls.append((f'recursive-text-{ref}-{type(v).__name__}',schema,{'p':v},{}))
# A non-schema annotation object with an id does not declare a schema resource.
for keyword in ['$defs','x-target']:
 inner={'$id':'inner.json','$defs':{'needle':{'const':'inner'}},'$ref':'#/$defs/needle'}
 schema={'$schema':URI,'$id':'https://example.test/boundary/root.json','$defs':{'needle':{'const':'outer'}}}
 if keyword=='$defs':schema['$defs']['inner']=inner;schema['$ref']='#/$defs/inner'
 else:schema[keyword]=inner;schema['$ref']='#/x-target'
 for v in ['inner','outer']:controls.append((f'boundary-{keyword}-{v}',schema,v,{}))
# Source keys with identical UTF-16 units still name distinct Python targets.
pair='\ud800\udc00';astral='\U00010000'
for key in [pair,astral]:
 inner={'$id':'inner.json','$defs':{pair:{'const':'pair'},astral:{'const':'astral'}},'$ref':'#/$defs/'+key}
 schema={'$schema':URI,'$id':'https://example.test/origin/root.json','$defs':{'inner':inner},'$ref':'#/$defs/inner'}
 for v in ['pair','astral']:controls.append((f'origin-{list(map(ord,key))}-{v}',schema,v,{}))
cases=[]
for name,schema,instance,extra in controls:
 row={'id':name,'schemaRecipe':typed(schema),'instanceRecipe':typed(instance),'methods':{},**extra}
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
print(json.dumps({'profile':'umf.r2-sol-python-recursive-resource-scope/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'referencing':importlib.metadata.version('referencing'),'sourceSha256':{'schemas.py':sha(OLD/'umf/schemas.py'),'referencing/_core.py':sha(referencing._core.__file__),'referencing/jsonschema.py':sha(referencing.jsonschema.__file__),'recursiveRef.json':sha(SUITE)},'generatorSha256':sha(__file__),'scope':'All 34 pinned official recursiveRef cases plus nearest source resource/pointer, native lookup-history barriers/direct descent, recursive keyword text, recognized versus opaque resource boundaries and raw-pair/astral source-origin controls. No candidate expected outcomes or correction overlay. Typed recipe object keys and strings are codepoint arrays, preserving Python source identity.','cases':cases},ensure_ascii=True,indent=2))
