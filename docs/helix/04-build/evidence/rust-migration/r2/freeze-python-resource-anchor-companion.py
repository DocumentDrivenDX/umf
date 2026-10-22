# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive exact-predecessor controls for the known resource-identity defects."""
from pathlib import Path
import hashlib
base=Path(__file__).with_name('freeze-python-recursive-resource-scope.py')
assert hashlib.sha256(base.read_bytes()).hexdigest()=='855ebc1ce1065fd526c8ddd672639018f74272acd7c6ba12c892208739312a8f'
exec(compile(base.read_text().split('controls=[]')[0],str(base),'exec'))
import importlib.util
from jsonschema import Draft4Validator,Draft6Validator,Draft7Validator,Draft201909Validator,Draft202012Validator
controls=[]
for draft,uri in [('2019',URI),('2020','https://json-schema.org/draft/2020-12/schema')]:
 for label,payload in [('high','\ud800'),('pair','\ud800\udc00'),('astral','\U00010000')]:
  inner={'$id':payload+'/inner.json','$defs':{'target':{'$anchor':'pick','enum':['inner']}},'properties':{'v':{'$ref':'#pick'}}}
  schema={'$schema':uri,'$id':'https://example.test/root.json','$defs':{'inner':inner,'outer':{'$anchor':'pick','enum':['outer']}},'$ref':'#/$defs/inner'}
  for value in ['inner','outer']: controls.append((f'anchor-{draft}-{label}-{value}',schema,{'v':value}))
for label,payload in [('high','\ud800'),('pair','\ud800\udc00'),('astral','\U00010000')]:
 inner={'$id':payload+'/inner.json','$recursiveAnchor':True,'anyOf':[{'enum':['inner']},{'type':'object','additionalProperties':{'$recursiveRef':'#ignored'}}]}
 schema={'$schema':URI,'$id':'https://example.test/root.json','$defs':{'inner':inner},'properties':{'v':{'$ref':'#/$defs/inner'}}}
 for value in ['inner','outer']: controls.append((f'recursive-nonhash-{label}-{value}',schema,{'v':{'x':value}}))
for draft,uri,key in [('4','http://json-schema.org/draft-04/schema#','id'),('6','http://json-schema.org/draft-06/schema#','$id'),('7','http://json-schema.org/draft-07/schema#','$id')]:
 schema={'$schema':uri,key:'https://example.test/root.json','definitions':{'target':{key:'#pick','enum':['inner']}},'properties':{'v':{'$ref':'#pick'}}}
 for value in ['inner','outer']: controls.append((f'legacy-anchor-{draft}-{value}',schema,{'v':value}))
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
print(json.dumps({'profile':'umf.r2-sol-python-resource-anchor-companion/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'referencing':importlib.metadata.version('referencing'),'sourceSha256':{'schemas.py':sha(OLD/'umf/schemas.py'),'referencing/_core.py':sha(referencing._core.__file__),'referencing/jsonschema.py':sha(referencing.jsonschema.__file__)},'generatorSha256':sha(__file__),'baseGeneratorSha256':sha(base),'uriAdmissionProfile':{'checkSchemaUsesClassFormatChecker':True,'optionalModules':optional,'registeredUriFormatCheckers':checkers,'declaredPredecessorDependency':'jsonschema>=4.25,<5 without format extras'},'scope':'Known identity route closure: local named anchors under native surrogate/pair/astral resource identifiers, legacy fragment anchors, and embedded recursiveRef whose literal fragment is ignored by the predecessor. Immutable native outcomes; no correction.','cases':cases},ensure_ascii=True,indent=2))
