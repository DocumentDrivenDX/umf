"""Independent URI/pointer lookup over supplied files; no external fetching."""
import json
from pathlib import Path
from urllib.parse import urljoin,urldefrag,unquote
import yaml
from jsonschema import Draft4Validator
rows=[]
for format in ['json','yaml']:
 artifact=json.loads(Path(f'fixtures/openapi/resource-bundle-{format}.json').read_text())
 def load(bundle):
  parse=lambda text:json.loads(text) if format=='json' else yaml.safe_load(text)
  return {bundle['baseUri']:parse(bundle['schema']),**{r['uri']:parse(r['text']) for r in bundle['resources']}}
 original,edited=map(load,[artifact['original'],artifact['edited']])
 base=artifact['original']['baseUri'];lookup_count=0
 def lookup(reference,origin,resources):
  uri,fragment=urldefrag(urljoin(origin,reference));node=resources[uri]
  if fragment:
   pointer=unquote(fragment);assert pointer.startswith('/')
   for key in pointer[1:].split('/'):
    key=key.replace('~1','/').replace('~0','~');node=node[int(key)] if isinstance(node,list) else node[key]
  return node
 def walk(value,origin):
  global lookup_count
  if isinstance(value,dict):
   if '$ref' in value:lookup(value['$ref'],origin,original);lookup_count+=1
   for child in value.values():walk(child,origin)
  elif isinstance(value,list):
   for child in value:walk(child,origin)
 for uri,value in original.items():walk(value,uri)
 for resource in artifact['original']['resources']:
  suffix=resource['uri'].split('/petstore/')[1]
  source=Path(f'fixtures/openapi/upstream/examples/v2.0/{format}/petstore-separate/{suffix}').read_text()
  assert resource['text']==source
 pet=lookup('Pet.'+format,base,original);changed=lookup('Pet.'+format,base,edited)
 assert Draft4Validator(pet).is_valid({'id':7,'name':'Pet'})
 assert not Draft4Validator(changed).is_valid({'id':7,'name':'Pet'})
 assert Draft4Validator(changed).is_valid({'id':'7','name':'Pet'})
 assert lookup('parameters.'+format+'#/tagsParam/name',base,original)=='tags'
 rows.append({'format':format,'documents':len(original),'referencesLookedUp':lookup_count,'exactResourceSources':True,'editedTypeEnforced':True})
Path('fixtures/openapi/resource-bundle-oracle-results.json').write_text(json.dumps({'results':rows,'scope':'Literal URI and JSON Pointer lookup in the pinned Swagger example; no nested ID/anchor/dynamic-scope inference'},indent=2)+'\n')
print('OpenAPI bundles: both five-document variants retain sources, resolve supplied pointers and enforce edited Pet ID type')
