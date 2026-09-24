"""Independent supplied-URI traversal and unmodified official target-object checks."""
import json
from pathlib import Path
from urllib.parse import urljoin,urldefrag,unquote
from jsonschema import Draft202012Validator
from jsonschema.validators import SPECIFICATIONS
from referencing import Resource
root=Path('spec/extensions/openapi/upstream');schema=json.loads((root/'3.1-schema.json').read_text());registry=SPECIFICATIONS.with_resource(schema['$id'],Resource.from_contents(schema))
def decode(node):
 kind=node['kind']
 if kind=='object':return {k:decode(v) for k,v in node['members'].items()}
 if kind=='array':return [decode(v) for v in node['items']]
 if kind=='null':return None
 if kind=='number':return json.loads(node['value'])
 return node['value']
artifact=json.loads(Path('fixtures/openapi/reference-resolution.json').read_text());payload=artifact['source']['modules'][0]['elements'][0]['extensions']['umf.openapi'];result=artifact['result']
resources={payload['baseUri']:decode(payload['root']),**{r['uri']:decode(r['root']) for r in payload['resources']}}
def at(uri,pointer):
 node=resources[uri]
 if pointer:
  for key in pointer[1:].split('/'):node=node[key.replace('~1','/').replace('~0','~')]
 return node
uri=payload['baseUri'];pointer='/paths/~1x/get/responses/200';chain=[];descriptions=[]
node=at(uri,pointer)
while '$ref' in node:
 chain.append((uri,pointer));descriptions.append(node.get('description'))
 uri,fragment=urldefrag(urljoin(uri,node['$ref']));pointer=unquote(fragment);node=at(uri,pointer)
assert len(chain)==2 and result['target']['uri']==uri and result['target']['pointer']==pointer
assert decode(result['target']['node'])==node
assert result['effectiveAnnotations']['description']==next(d for d in descriptions if d is not None)=='Outer override'
validator=Draft202012Validator({'$ref':schema['$id']+'#/$defs/response'},registry=registry)
assert validator.is_valid(node)
# Wrong declared role must not be accepted merely because the JSON target exists.
assert not Draft202012Validator({'$ref':schema['$id']+'#/$defs/parameter'},registry=registry).is_valid(node)
rows=[]
for case in json.loads(Path('fixtures/openapi/reference-kind-cases.json').read_text()):
 check=Draft202012Validator({'$ref':schema['$id']+'#/$defs/'+case['kind']},registry=registry)
 assert check.is_valid(case['target']);assert not check.is_valid(None)
 rows.append({'kind':case['kind'],'validTargetAccepted':True,'scalarTargetRejected':True})
Path('fixtures/openapi/reference-oracle-results.json').write_text(json.dumps({'chainHops':len(chain),'targetMatches':True,'outerDescriptionOverride':True,'wrongRoleRejected':True,'roles':rows,'limits':['Supplied-file Reference Object chain only; caller-declared role','No source-role inference, nested-reference closure, Schema Object scope or runtime evaluation']},indent=2)+'\n')
print('OpenAPI Reference Objects: two-hop target, default annotations and all seven typed roles verified')
