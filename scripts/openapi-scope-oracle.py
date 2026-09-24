"""Independent JSON Schema static scope checks; not an OpenAPI runtime oracle."""
import json
from pathlib import Path
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
case=json.loads(Path('fixtures/openapi/scope-cases.json').read_text())
root=case['native']['components']['schemas']['Root']
base='https://example.test/semantic/models/root'
external={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'https://example.test/canonical','$anchor':'external','type':'boolean'}
registry=Registry().with_resources([('https://example.test/semantic/api.json',Resource.from_contents(root,default_specification=DRAFT202012)),('https://example.test/external.json',Resource.from_contents(external))]).crawl()
def decode(n):
    if n['kind']=='object': return {k:decode(v) for k,v in n['members'].items()}
    if n['kind']=='array': return [decode(v) for v in n['items']]
    if n['kind']=='null': return None
    return n['value']
checked=[]
for row in case['rows']:
    ref=row['reference']
    if ref.startswith(case['base']) or ref.startswith('https://example.test/semantic/api.json'): continue
    expected=registry.resolver(base).lookup(ref).contents
    assert decode(row['result']['node'])==expected,ref
    checked.append(ref)
assert len(checked)==4
report={'oracle':'Python referencing 0.37.0','references':checked,'passed':4,'limitations':['OpenAPI document identity and role discovery are authored tests; this oracle checks JSON Schema static references only','No dynamic-reference evaluation']}
Path('fixtures/openapi/scope-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print('OpenAPI schema scope: four independent JSON Schema static resolutions agree')
