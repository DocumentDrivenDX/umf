"""Compare source schema constraints and emitted/round-tripped target independently."""
import json,copy
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
from referencing.jsonschema import DRAFT202012
case=json.loads(Path('fixtures/openapi/projection-cases.json').read_text())
registry=Registry().with_resources([(case[key]['$id'],Resource.from_contents(case[key],default_specification=DRAFT202012)) for key in ['tree','status']])
native=Draft202012Validator(case['tree'],registry=registry)
targets=[Draft202012Validator(json.loads(case['result']['nativeSchema'])),Draft202012Validator(json.loads(case['roundTripped']))]
for row in case['vectors']:
    assert native.is_valid(row['value'])==row['valid']
    for target in targets: assert target.is_valid(row['value'])==row['valid']
def audit(result):
    codes={x['code'] for x in result['issues']}
    assert {'OPENAPI_ANNOTATION','SCHEMA_ONLY','SCHEMA_IDENTITY'} <= codes
    assert result['source']['modules']
audit(case['result'])
for code in ['OPENAPI_ANNOTATION','SCHEMA_ONLY','SCHEMA_IDENTITY']:
    bad=copy.deepcopy(case['result']);bad['issues']=[x for x in bad['issues'] if x['code']!=code]
    try: audit(bad)
    except AssertionError: pass
    else: raise AssertionError('Missing loss report accepted: '+code)
report={'oracle':'jsonschema 4.26.0 / referencing 0.37.0','comparisons':len(case['vectors']),'targetRepresentations':2,'missingReportControls':3,'scope':'Source JSON Schema instance constraints versus projected and UMF-round-tripped target; no HTTP behavior, format assertions or dynamic scope'}
Path('fixtures/openapi/projection-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print('OpenAPI projection: 10 native instance comparisons, two target forms and three missing-report controls passed')

upstream=json.loads(Path('fixtures/openapi/upstream/examples/v3.1/tictactoe.json').read_text())
uri='https://example.test/tictactoe.json'
registry=Registry().with_resource(uri,Resource.from_contents(upstream,default_specification=DRAFT202012))
rows=json.loads(Path('fixtures/openapi/projection-upstream-cases.json').read_text())
for entry in rows:
    original=Draft202012Validator({'$ref':uri+'#/components/schemas/'+entry['name']},registry=registry)
    projected=Draft202012Validator(json.loads(entry['result']['nativeSchema']))
    for vector in entry['vectors']:
        assert original.is_valid(vector['value'])==projected.is_valid(vector['value'])==vector['valid']
report['upstreamComponents']=len(rows);report['upstreamComparisons']=sum(len(row['vectors']) for row in rows)
Path('fixtures/openapi/projection-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n')
print('OpenAPI pinned Tic Tac Toe: six components and twelve native/target comparisons passed')
