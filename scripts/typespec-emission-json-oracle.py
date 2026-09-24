import json
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
r=json.loads(Path('fixtures/typespec/json-schema-emission.json').read_text())
base='https://example.test/'
registry=Registry().with_resources([(base+name,Resource.from_contents(json.loads(text))) for name,text in r['files'].items()])
validator=Draft202012Validator({'$ref':base+'@typespec/json-schema/Person.json'},registry=registry)
valid={'firstName':'A','lastName':'B','age':12,'address':{'street':'s','city':'c','country':'x'}}
cases=[(valid,True),({**valid,'age':-1},False),({**valid,'age':2147483648},False),({**valid,'nickNames':['a','a']},False),({**valid,'address':{'street':'s'}},False),({**valid,'cars':[{'kind':'ev','brand':'b','model':'m'}]},True),({**valid,'cars':[{'kind':'hybrid','brand':'b','model':'m'}]},False)]
for value,expected in cases: assert validator.is_valid(value)==expected,value
Path('fixtures/typespec/emission-json-oracle-results.json').write_text(json.dumps({'validator':'jsonschema 4.26.0','cases':len(cases),'scope':'Independent JSON validation of native emitted bounds, required fields, uniqueness and external references'},indent=2)+'\n')
print('TypeSpec emitted JSON Schema: seven independent instance cases passed')

# These checks deliberately demonstrate differences from the authored source domain.
# Python integers stay exact; a JavaScript-rounded instance would hide the literal loss.
numeric_checks = []
for case in json.loads(Path('fixtures/typespec/emission/numeric-results.json').read_text()):
    strategy = case['strategy']
    before = Draft202012Validator(json.loads(case['original']['files']['@typespec/json-schema/NumericBoundary.json']))
    after = Draft202012Validator(json.loads(case['edited']['files']['@typespec/json-schema/NumericBoundary.json']))
    base_value = {'signed': '0' if strategy == 'string' else 0, 'unsigned': '0' if strategy == 'string' else 0, 'literal': 9007199254740992, 'percent': 75}
    checks = [
        ('rounded-literal-accepted', base_value, True, False),
        ('exact-source-literal-rejected', {**base_value, 'literal': 9007199254740993}, False, False),
        ('edited-percent-bound', {**base_value, 'percent': 50}, True, True),
        ('percent-lower-bound', {**base_value, 'percent': -1}, False, False),
        ('int64-overflow-accepted', {**base_value, 'signed': str(2**63) if strategy == 'string' else 2**63, 'percent': 50}, True, True),
        ('negative-uint64-accepted', {**base_value, 'unsigned': '-1' if strategy == 'string' else -1, 'percent': 50}, True, True),
    ]
    if strategy == 'string':
        checks.append(('nonnumeric-string-accepted', {**base_value, 'signed': 'not a number', 'percent': 50}, True, True))
    for name, value, expected_before, expected_after in checks:
        assert before.is_valid(value) == expected_before, (strategy, name, 'before')
        assert after.is_valid(value) == expected_after, (strategy, name, 'after')
        numeric_checks.append({'strategy': strategy, 'case': name, 'before': expected_before, 'after': expected_after})
Path('fixtures/typespec/emission/numeric-oracle-results.json').write_text(json.dumps({'validator': 'jsonschema 4.26.0', 'comparisons': len(numeric_checks)*2, 'checks': numeric_checks, 'scope': 'Native-emitter numeric losses and edited bounds; exact Python integers expose rounded literals. Acceptance of out-of-domain values is a demonstrated loss, not conformance.'}, indent=2)+'\n')
print(f'TypeSpec numeric emission: {len(numeric_checks)*2} independent comparisons expose losses and enforce edited bounds')

projected = json.loads(Path('fixtures/typespec/emission/projection.json').read_text())
projected_registry = Registry().with_resources([(uri, Resource.from_contents(json.loads(text))) for uri, text in projected['resources'].items()])
root_uri = next(x['retrievalUri'] for x in projected['result']['resources'] if x['file'] == projected['result']['policy']['rootFile'])
projected_registry = projected_registry.with_resource(root_uri, Resource.from_contents(json.loads(projected['native'])))
projected_validator = Draft202012Validator({'$ref': root_uri}, registry=projected_registry)
for value, expected in cases:
    assert projected_validator.is_valid(value) == expected, value
codes = {x['code'] for x in projected['result']['issues']}
assert {'TYPESPEC_UNREVIEWED_SEMANTICS', 'TYPESPEC_NUMERIC_PRECISION', 'TYPESPEC_INT64_CONSTRAINTS'} <= codes
Path('fixtures/typespec/emission/projection-oracle-results.json').write_text(json.dumps({'validator': 'jsonschema 4.26.0', 'cases': len(cases), 'scope': 'Target UMF native re-export and registered dependency URIs preserve emitted validator behavior; not source semantic equivalence.'}, indent=2)+'\n')
print(f'TypeSpec materialized projection: {len(cases)} independent target instance checks passed')
