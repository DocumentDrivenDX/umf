import json
from pathlib import Path
from jsonschema import Draft202012Validator
rows=json.loads(Path('fixtures/smithy/jsonschema-service-context-results.json').read_text())['cases']
for row in rows:
 assert row['agrees']
 if row['status']=='projected':
  assert row['targetRoundTrip']
  Draft202012Validator.check_schema(json.loads(row['targetSchema']))
 else:
  assert row.get('error') and 'outside the selected service closure' in row['error']
def target(root,service):
 return json.loads(next(row['targetSchema'] for row in rows if row['rootShape']==root and row['serviceContext']==service))
schema=target('shared#Request','shared#Api')
assert schema['properties']['sales']['$ref']=='#/$defs/SalesCustomer'
assert schema['properties']['support']['$ref']=='#/$defs/SupportCustomer'
assert schema['$defs']['SalesCustomer']['required']==['id']
assert schema['$defs']['SupportCustomer']['required']==['ticket']
validator=Draft202012Validator(schema)
vectors=[
 ({'sales':{'id':'a'},'support':{'ticket':5}},True),
 ({'sales':{'ticket':5},'support':{'id':'a'}},False),
 ({'sales':{'id':3},'support':{'ticket':5}},False),
 ({'sales':{'id':''},'support':{'ticket':5}},False),
 ({'sales':{'id':'a'}},False),
 ({'sales':{'id':'a'},'support':{'ticket':'5'}},False),
 ({'sales':{'id':'a'},'support':{'ticket':0.5}},True),
]
for instance,valid in vectors:assert validator.is_valid(instance)==valid,instance
for root,service,accepted,rejected in [('com.foo#StructureA','com.foo#ServiceA','y','a'),('com.bar#StructureB','com.bar#ServiceB','a','y')]:
 validator=Draft202012Validator(target(root,service))
 assert validator.is_valid({'a':accepted})
 assert not validator.is_valid({'a':rejected})
print(f"Smithy service context: {sum(r['status']=='projected' for r in rows)} target meta-schemas, 11 instance vectors; distinct namespace identities and explicit closure rejection verified")
