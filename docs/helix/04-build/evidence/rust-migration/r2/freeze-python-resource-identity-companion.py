# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive exact-predecessor controls for the known resource-identity defects."""
from pathlib import Path
import hashlib
base=Path(__file__).with_name('freeze-python-recursive-resource-scope.py')
assert hashlib.sha256(base.read_bytes()).hexdigest()=='855ebc1ce1065fd526c8ddd672639018f74272acd7c6ba12c892208739312a8f'
exec(compile(base.read_text().split('controls=[]')[0],str(base),'exec'))
import importlib.util
from jsonschema import Draft4Validator,Draft6Validator,Draft7Validator,Draft201909Validator,Draft202012Validator
controls=[];pair='\ud800\udc00';astral='\U00010000';esc='\U000f0000'
# Reached opaque references still require source-preserving target binding.
for key in [pair,astral]:
 schema={'$schema':URI,'$defs':{pair:{'enum':['pair']},astral:{'enum':['astral']}},'x-target':{'$ref':'#/$defs/'+key},'$ref':'#/x-target'}
 for value in ['pair','astral']:controls.append((f'opaque-origin-{list(map(ord,key))}-{value}',schema,value))
# Legacy ids remain active when there is no same-object ref sibling.
for draft,uri,idkey in [('draft4','http://json-schema.org/draft-04/schema#','id'),('draft6','http://json-schema.org/draft-06/schema#','$id'),('draft7','http://json-schema.org/draft-07/schema#','$id')]:
 for suffix in ['', '#']:
  inner={idkey:'inner.json'+suffix,'definitions':{'needle':{'enum':['inner']}},'properties':{'v':{'$ref':'#/definitions/needle'}}}
  schema={'$schema':uri,idkey:'https://example.test/legacy/root.json','definitions':{'needle':{'enum':['outer']},'inner':inner},'$ref':'#/definitions/inner'}
  for value in ['inner','outer']:controls.append((f'legacy-active-{draft}-trailing{bool(suffix)}-{value}',schema,{'v':value}))
# Exact accepted profile: plain jsonschema dependency, no optional URI validators.
payloads=[('high','\ud800'),('low','\udc00'),('pair',pair),('astral',astral),('replacement','\ufffd'),('marker',esc),('marker-pair','\udb80\udc00'),('literal-surrogate-token',esc+'sD800'+esc),('literal-marker-token',esc+'e'+esc)]
for draft,uri,idkey in [('draft4','http://json-schema.org/draft-04/schema#','id'),('draft6','http://json-schema.org/draft-06/schema#','$id'),('draft7','http://json-schema.org/draft-07/schema#','$id'),('draft2019',URI,'$id'),('draft2020','https://json-schema.org/draft/2020-12/schema','$id')]:
 for label,payload in payloads:
  controls.append((f'uri-admit-{draft}-{label}',{'$schema':uri,idkey:'https://example.test/'+payload+'/root.json','type':'string'},'ok'))
 for label,identifier in [('empty',''),('hash','#'),('trailing','https://example.test/root.json#')]:
  controls.append((f'uri-admit-{draft}-{label}',{'$schema':uri,idkey:identifier,'type':'string'},'ok'))
# Distinct URI identities must survive actual recursive lookup and relative joins.
pairs=[('high-replacement','\ud800','\ufffd'),('pair-astral',pair,astral),('marker-pair',esc,'\udb80\udc00'),('marker-collision','\ud800',esc+'sD800'+esc),('marker-escape',esc,esc+'e'+esc)]
for label,a,b in pairs:
 def node(identifier,tag):return {'$id':identifier,'$recursiveAnchor':True,'anyOf':[{'enum':[tag]},{'type':'object','additionalProperties':{'$recursiveRef':'#'}}]}
 schema={'$schema':URI,'$id':'https://example.test/identity/root.json','$defs':{'a':node(a+'/inner.json','a'),'b':node(b+'/inner.json','b')},'properties':{'a':{'$ref':'#/$defs/a'},'b':{'$ref':'#/$defs/b'}}}
 for name,instance in [('correct',{'a':{'x':'a'},'b':{'x':'b'}}),('a-wrong',{'a':{'x':'b'}}),('b-wrong',{'b':{'x':'a'}}),('nested',{'b':{'x':{'y':'b'}}})]:controls.append((f'uri-lookup-{label}-{name}',schema,instance))
for label,payload in payloads:
 inner={'$id':'../'+payload+'/inner.json','$defs':{'needle':{'enum':['inner']}},'properties':{'v':{'$ref':'#/$defs/needle'}}}
 schema={'$schema':URI,'$id':'https://example.test/'+payload+'/root.json','$defs':{'inner':inner},'properties':{'entry':{'$ref':'#/$defs/inner'}}}
 for value in ['inner','outer']:controls.append((f'uri-relative-join-{label}-{value}',schema,{'entry':{'v':value}}))
cases=[]
for name,schema,instance in controls:
 row={'id':name,'schemaRecipe':typed(schema),'instanceRecipe':typed(instance),'methods':{}}
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
optional={name:importlib.util.find_spec(name)is not None for name in ['rfc3987','rfc3986_validator','rfc3987_syntax','uri_template']}
checkers={c.__name__:sorted(k for k in c.FORMAT_CHECKER.checkers if k in ['uri','uri-reference','iri','iri-reference'])for c in [Draft4Validator,Draft6Validator,Draft7Validator,Draft201909Validator,Draft202012Validator]}
assert not any(optional.values()) and not any(checkers.values())
print(json.dumps({'profile':'umf.r2-sol-python-resource-identity-companion/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'referencing':importlib.metadata.version('referencing'),'sourceSha256':{'schemas.py':sha(OLD/'umf/schemas.py'),'referencing/_core.py':sha(referencing._core.__file__),'referencing/jsonschema.py':sha(referencing.jsonschema.__file__)},'generatorSha256':sha(__file__),'baseGeneratorSha256':sha(base),'uriAdmissionProfile':{'checkSchemaUsesClassFormatChecker':True,'optionalModules':optional,'registeredUriFormatCheckers':checkers,'declaredPredecessorDependency':'jsonschema>=4.25,<5 without format extras'},'scope':'Known-binder companion only: opaque reached source refs, active legacy ids without same-object ref, valid trailing empty fragments, exact accepted surrogate/marker URI identity and meaningful recursive/relative-scope lookup. Original89 immutable; no semantic correction or candidate expected observations.','cases':cases},ensure_ascii=True,indent=2))
