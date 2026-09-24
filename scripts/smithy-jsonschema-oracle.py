import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing.exceptions import Unresolvable
report=json.loads(Path('fixtures/smithy/jsonschema-oracle-results.json').read_text())
row=next(c for c in report['cases'] if c['file']=='fixtures/smithy/emission.smithy' and c['rootShape']=='example#Input')
assert row['status']=='projected' and row['agrees']
schema=json.loads(row['schema']);Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema)
cases=json.loads(Path('fixtures/smithy/emission-vectors.json').read_text())
for case in cases:
 actual=validator.is_valid(case['instance'])
 assert actual==case['valid'],case['name']
# Demonstrate the native recursive-root defect independently; do not bless an unusable target.
recursive=next(c for c in report['cases'] if c['file']=='fixtures/smithy/domain.json' and c['rootShape']=='sales#Order')
assert recursive['status']=='blocked'
try:
 Draft202012Validator(json.loads(recursive['schema'])).is_valid({'id':'a','children':[{'id':'b'}]})
except Exception as error:
 assert isinstance(error,Unresolvable) and 'Order' in str(error)
else:
 raise AssertionError('Expected unresolved recursive reference')
print(f"Smithy JSON Schema: {len(cases)} independent target-instance vectors; dangling recursive reference confirmed")
