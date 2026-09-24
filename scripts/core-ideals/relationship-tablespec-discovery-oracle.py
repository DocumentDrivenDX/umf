"""Pinned relationship-carrier discovery, not authored projection or enforcement."""
import hashlib, importlib.metadata, json, runpy
from copy import deepcopy
from pathlib import Path
import jsonschema
from pydantic import ValidationError

PIN = '647e8e566ad78b864282ec65c0b0b2237aa63084'
manifest_path = Path('native/tablespec/sources.json')
manifest = json.loads(manifest_path.read_text())
assert manifest['commit'] == PIN
paths = [Path(__file__), manifest_path]
for entry in manifest['files']:
    p = Path(entry['path'])
    assert hashlib.sha256(p.read_bytes()).hexdigest() == entry['sha256'], str(p)
    paths.append(p)
root = Path('native/tablespec/sources/src/tablespec')
UMF = runpy.run_path(str(root / 'models/umf.py'))['UMF']
validator = jsonschema.Draft202012Validator(json.loads((root / 'schemas/umf.schema.json').read_text()))
base = {'version':'1.0','table_name':'orders','primary_key':['id'],'columns':[
    {'name':'id','data_type':'INTEGER'}, {'name':'customer_id','data_type':'INTEGER'},
    {'name':'tenant_id','data_type':'INTEGER'}]}
fk = {'column':'customer_id','references_table':'customers','references_column':'id','confidence':0.95}
cardinality = {'type':'many_to_one','notation':'N:1','source_multiplicity':'*','target_multiplicity':'1'}
outgoing = {'target_table':'customers','source_column':'customer_id','target_column':'id',
            'type':'foreign_to_primary','confidence':0.95,'cardinality':cardinality}
lookup = {'source_key':'id','bridge_table':'enrollment','bridge_source_key':'order_id','bridge_target_key':'customer_id'}
cases = [
 ('absent',None), ('empty',{}), ('null-carriers',{'foreign_keys':None,'outgoing':None}),
 ('foreign-key',{'foreign_keys':[fk]}),
 ('unresolved-source',{'foreign_keys':[{**fk,'column':'missing'}]}),
 ('unresolved-target',{'foreign_keys':[{**fk,'references_table':'missing','references_column':'missing'}]}),
 ('duplicate-foreign-key',{'foreign_keys':[fk,fk]}),
 ('invalid-confidence',{'foreign_keys':[{**fk,'confidence':1.1}]}),
 ('unknown-fk-member',{'foreign_keys':[{**fk,'future':{'owned':True}}]}),
 ('outgoing',{'outgoing':[outgoing]}),
 ('bounded-participation',{'outgoing':[{**outgoing,'cardinality':{**cardinality,'source_multiplicity':'1..*','target_multiplicity':'1..3'}}]}),
 ('malformed-multiplicity',{'outgoing':[{**outgoing,'cardinality':{**cardinality,'source_multiplicity':'nonsense','target_multiplicity':'9..2'}}]}),
 ('contradictory-cardinality',{'outgoing':[{**outgoing,'cardinality':{**cardinality,'notation':'1:1','mandatory':True,'target_multiplicity':'0..*'}}]}),
 ('composite-join',{'outgoing':[{**outgoing,'join_conditions':[{'source_column':'tenant_id','target_column':'tenant_id'}]}]}),
 ('expression-join',{'outgoing':[{**outgoing,'source_expression':'TRIM(customer_id)','join_type':'full_outer'}]}),
 ('lookup-join',{'outgoing':[{**outgoing,'lookup_join':lookup}]}),
 ('lookup-and-expression',{'outgoing':[{**outgoing,'lookup_join':lookup,'source_expression':'TRIM(customer_id)'}]}),
 ('unknown-outgoing-member',{'outgoing':[{**outgoing,'future':{'owned':True}}]}),
 ('reverse-metadata',{'referenced_by':[{'table':'invoices','column':'id','foreign_key_column':'order_id','confidence':0.8}]}),
 ('unknown-carrier',{'future_relationships':[{'owned':True}]}),
]
rows=[]
for name, relationships in cases:
    source=deepcopy(base)
    if relationships is not None: source['relationships']=deepcopy(relationships)
    try:
        model=UMF.model_validate(source)
        normalized=model.model_dump(mode='json')['relationships']; runtime_ok=True; errors=[]
    except ValidationError as error:
        normalized=None; runtime_ok=False
        errors=[{'path':list(e['loc']),'type':e['type']} for e in error.errors()]
    schema_errors=[{'path':list(e.path),'validator':e.validator} for e in validator.iter_errors(source)]
    rows.append({'case':name,'source':source,'runtimeAccepted':runtime_ok,'checkedSchemaAccepted':not schema_errors,
                 'runtimeErrors':errors,'schemaErrors':schema_errors,'normalizedRelationships':normalized})
# Deliberately inspect both native interfaces; a metadata string is not a checked bound.
by={r['case']:r for r in rows}
assert not by['invalid-confidence']['runtimeAccepted'] and not by['invalid-confidence']['checkedSchemaAccepted']
for name in ['unresolved-source','unresolved-target','duplicate-foreign-key','malformed-multiplicity','contradictory-cardinality']:
    assert by[name]['runtimeAccepted'] and by[name]['checkedSchemaAccepted'], name
assert 'future' not in by['unknown-fk-member']['normalizedRelationships']['foreign_keys'][0]
assert 'future' not in by['unknown-outgoing-member']['normalizedRelationships']['outgoing'][0]
assert 'future_relationships' not in by['unknown-carrier']['normalizedRelationships']
mixed = by['lookup-and-expression']['normalizedRelationships']['outgoing'][0]
assert mixed['lookup_join'] == lookup and mixed['source_expression'] == 'TRIM(customer_id)'
for row in rows:
    assert row['runtimeAccepted'] == row['checkedSchemaAccepted'] == (row['case'] != 'invalid-confidence'), row['case']
proof={'nativeVersion':PIN,'scope':'Pinned TableSpec metadata model and checked JSON Schema only; no row enforcement, join execution or authored relationship projection claim',
       'bindingImplemented':False,'versions':{p:importlib.metadata.version(p) for p in ['pydantic','jsonschema']},
       'cases':rows,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}}
Path('fixtures/validation/relationship-tablespec-discovery-native.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'runtimeAccepted':sum(r['runtimeAccepted'] for r in rows),'schemaAccepted':sum(r['checkedSchemaAccepted'] for r in rows),'bindingImplemented':False}))
