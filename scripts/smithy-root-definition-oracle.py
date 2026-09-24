import json
from pathlib import Path
from jsonschema import Draft202012Validator
report=json.loads(Path('fixtures/smithy/jsonschema-root-definition-results.json').read_text())
projected=[row for row in report['cases'] if row['status']=='projected']
for row in projected:
 assert row['agrees'] and row['targetRoundTrip']
 Draft202012Validator.check_schema(json.loads(row['targetSchema']))
def schema(root):
 row=next(row for row in projected if row['rootShape']==root)
 return json.loads(row['targetSchema'])
vectors=[
 ('sales#Order',{'id':'a'},True),
 ('sales#Order',{'id':'a','children':[{'id':'b','children':[{'id':'c'}]}]},True),
 ('sales#Order',{'id':'a','children':[{}]},False),
 ('sales#Order',{'id':'a','children':[{'id':''}]},False),
 ('recursive#Node',{'name':'a'},True),
 ('recursive#Node',{'name':'a','children':[{'name':'b','children':[{'name':'c'}]}]},True),
 ('recursive#Node',{'name':'a','children':[{}]},False),
 ('recursive#Node',{'name':'a','children':[{'name':2}]},False),
 ('recursive#Nodes',[{'name':'a','children':[{'name':'b'}]}],True),
 ('recursive#Nodes',[{}],False),
 ('recursive#Envelope',{'root':{'name':'a','children':[{'name':'b'}]}},True),
 ('recursive#Envelope',{'root':{'name':'a','children':[{}]}},False),
 ('recursive#Envelope',{},False),
]
for root,instance,expected in vectors:
 assert Draft202012Validator(schema(root)).is_valid(instance)==expected,(root,instance)
node=schema('recursive#Node')
for body in [node,node['$defs']['Node']]:
 assert body['properties']['count']['default']==9007199254740993
 assert body['properties']['snapshot']['default']=='{"$ref":"#/$defs/Node"}'
assert node['properties']['children']['items']['$ref']=='#/$defs/Node'
print(f"Smithy root definitions: {len(projected)} independent meta-schema checks; {len(vectors)} recursive instance vectors; exact numeric/literal defaults unchanged")
