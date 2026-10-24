# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive exact-predecessor controls for the known resource-identity defects."""
from pathlib import Path
import hashlib
base=Path(__file__).with_name('freeze-python-recursive-resource-scope.py')
assert hashlib.sha256(base.read_bytes()).hexdigest()=='855ebc1ce1065fd526c8ddd672639018f74272acd7c6ba12c892208739312a8f'
exec(compile(base.read_text().split('controls=[]')[0],str(base),'exec'))
import importlib.util
from jsonschema import Draft4Validator,Draft6Validator,Draft7Validator,Draft201909Validator,Draft202012Validator
from urllib.parse import urljoin
controls=[]
for draft,uri,key in [('3','http://json-schema.org/draft-03/schema#','id'),('4','http://json-schema.org/draft-04/schema#','id'),('6','http://json-schema.org/draft-06/schema#','$id'),('7','http://json-schema.org/draft-07/schema#','$id'),('2019',URI,'$id'),('2020','https://json-schema.org/draft/2020-12/schema','$id')]:
 for container in ['definitions','$defs']:
  inner={key:'inner.json','definitions':{'needle':{'enum':['inner']}},'properties':{'v':{'$ref':'#/definitions/needle'}}}
  schema={'$schema':uri,key:'https://example.test/root.json','definitions':{'needle':{'enum':['outer']}},container:{'inner':inner},'$ref':'#/'+container+'/inner'}
  # Preserve the root needle when definitions is the selected container.
  schema['definitions']['needle']={'enum':['outer']}
  for value in ['inner','outer']:controls.append((f'container-{draft}-{container}-{value}',schema,{'v':value}))
bases=['https://example.test/a/root.json','https://example.test/a/dir/','https://example.test/a/root.json;bp?bq#bf','relative/dir/root.json','file:///a/root.json','urn:example:root','https://example.test/\ud800/root.json']
refs=['','dir/','dir','.', '..','../','../../','/abs//path/','//other.test/x','?q','#f',';p','a;p?q#f','?','#','a/../','a//b','http://other.test/a','https:other','urn:example:new']
uri_operations=[{'base':list(map(ord,b)),'reference':list(map(ord,r)),'result':list(map(ord,urljoin(b,r)))}for b in bases for r in refs]
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
print(json.dumps({'profile':'umf.r2-sol-python-resource-uri-operations/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'referencing':importlib.metadata.version('referencing'),'sourceSha256':{'schemas.py':sha(OLD/'umf/schemas.py'),'referencing/_core.py':sha(referencing._core.__file__),'referencing/jsonschema.py':sha(referencing.jsonschema.__file__)},'generatorSha256':sha(__file__),'baseGeneratorSha256':sha(base),'uriAdmissionProfile':{'checkSchemaUsesClassFormatChecker':True,'optionalModules':optional,'registeredUriFormatCheckers':checkers,'declaredPredecessorDependency':'jsonschema>=4.25,<5 without format extras'},'scope':'Known resource closure: per-dialect definitions/$defs boundaries plus finite native urllib.parse.urljoin operation families used by accepted resource IDs. No correction.','uriOperations':uri_operations,'cases':cases},ensure_ascii=True,indent=2))
