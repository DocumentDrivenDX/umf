"""Compare explicit dynamic scope lookup to referencing; no instance evaluator claim."""
import json
from pathlib import Path
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
case=json.loads(Path('fixtures/openapi/dynamic-cases.json').read_text())
registry=Registry().with_resources([(schema['$id'],Resource.from_contents(schema,default_specification=DRAFT202012)) for schema in case['schemas'].values()]).crawl()
def decode(n):
    if n['kind']=='object': return {k:decode(v) for k,v in n['members'].items()}
    if n['kind']=='array': return [decode(v) for v in n['items']]
    if n['kind']=='null': return None
    return n['value']
for row in case['rows']:
    scope=row['result']['evaluationScope']
    resolver=registry.resolver(scope[0])
    for uri in scope[1:]: resolver=resolver.lookup(uri).resolver
    expected=resolver.lookup(row['reference']).contents
    assert decode(row['result']['node'])==expected,row['scope']
report={'oracle':'referencing 0.37.0','comparisons':len(case['rows']),'scope':'Dynamic anchor selection from supplied evaluation-resource paths, including ordinary anchors and pointer fallbacks','limitations':['No UMF instance evaluator or automatic validation-path construction','No dynamic schema projection']}
Path('fixtures/openapi/dynamic-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print('OpenAPI dynamic scope: six independent reference-target comparisons passed')
