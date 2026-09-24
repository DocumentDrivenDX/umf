"""Native Key discovery only: declarations and generated row validation are distinct."""
import hashlib, importlib, importlib.metadata, json, runpy
from pathlib import Path
import jsonschema
from pydantic import ValidationError

PIN = '647e8e566ad78b864282ec65c0b0b2237aa63084'
paths = [Path(__file__)]
for name in ['sources.json', 'cardinality-runtime/sources.json']:
    path = Path('native/tablespec') / name
    manifest = json.loads(path.read_text())
    assert manifest['commit'] == PIN
    paths.append(path)
    for entry in manifest['files']:
        source = Path(entry['path'])
        assert hashlib.sha256(source.read_bytes()).hexdigest() == entry['sha256'], str(source)
        paths.append(source)
root = Path('native/tablespec/sources/src/tablespec')
for module, source in [('tablespec.models.umf', root/'models/umf.py'), ('tablespec.type_mappings', root/'type_mappings.py')]:
    assert Path(importlib.import_module(module).__file__).read_bytes() == source.read_bytes(), module
UMF = runpy.run_path(str(root/'models/umf.py'))['UMF']
validator = jsonschema.Draft202012Validator(json.loads((root/'schemas/umf.schema.json').read_text()))
gen = runpy.run_path('native/tablespec/cardinality-runtime/generators.py')
base = {'version':'1.0', 'table_name':'Keys', 'columns':[
    {'name':'id','data_type':'INTEGER','nullable':{'default':False}},
    {'name':'tenant','data_type':'INTEGER','nullable':{'default':False}}]}
cases = [
    ('missing', {}, True, True),
    ('null', {'primary_key':None}, True, True),
    ('empty', {'primary_key':[]}, True, True),
    ('primary', {'primary_key':['id']}, True, True),
    ('compound', {'primary_key':['tenant','id']}, True, True),
    ('duplicate-component', {'primary_key':['id','id']}, True, True),
    ('missing-column', {'primary_key':['missing']}, False, True),
    ('implicit-meta-column', {'primary_key':['meta_missing']}, True, True),
    ('wrong-primary-type', {'primary_key':'id'}, False, False),
    ('alternate', {'unique_constraints':[['tenant']]}, True, True),
    ('primary-and-alternate', {'primary_key':['id'],'unique_constraints':[['tenant']]}, True, True),
    ('empty-alternate', {'unique_constraints':[[]]}, True, True),
    ('missing-alternate-column', {'unique_constraints':[['missing']]}, True, True),
    ('duplicate-alternate-component', {'unique_constraints':[['id','id']]}, True, True),
    ('duplicate-alternate', {'unique_constraints':[['id'],['id']]}, True, True),
    ('unknown-stable-id', {'primary_key':['id'],'key_id':'author-id'}, False, False),
]
results=[]
for name, changes, runtime_expected, schema_expected in cases:
    source={**base, **changes}
    try:
        model=UMF.model_validate(source)
        normalized=model.model_dump(mode='json')
        accepted=True
    except ValidationError:
        accepted=False
        normalized=None
    checked=validator.is_valid(source)
    assert (accepted,checked)==(runtime_expected,schema_expected), (name,accepted,checked)
    generated=gen['generate_json_schema'](source)
    jsonschema.Draft7Validator.check_schema(generated)
    row_validator=jsonschema.Draft7Validator(generated)
    rows=[{'id':1,'tenant':2},{'id':1,'tenant':2}]
    assert all(row_validator.is_valid(row) for row in rows), name
    assert not row_validator.is_valid({'id':'invalid','tenant':2}), name
    sql=gen['generate_sql_ddl'](source)
    assert 'PRIMARY KEY' not in sql.upper() and 'UNIQUE' not in sql.upper(), (name,sql)
    results.append({'case':name,'source':source,'runtimeAccepted':accepted,
        'checkedSchemaAccepted':checked,'normalizedDeclarations':None if normalized is None else {
            'primary_key':normalized['primary_key'],'unique_constraints':normalized['unique_constraints']},
        'effectivePrimaryKey':None if not accepted else model.effective_primary_key,
        'generatedRowSchema':generated,'generatedSQL':sql,
        'duplicateRowsIndividuallyAccepted':True,'invalidScalarRejected':True})
by={row['case']:row for row in results}
for name in ['missing','null','empty']:
    assert by[name]['effectivePrimaryKey']==['meta_checksum'], name
assert by['compound']['normalizedDeclarations']['primary_key']==['tenant','id']
name_boundaries=[]
for name,value,expected_runtime,expected_schema in [
    ('max-length','A'*128,True,True),('over-length','A'*129,False,False),
    ('unicode','注文',False,False),('leading-digit','1Orders',False,False),
    ('trailing-newline','Orders\n',False,True),('quoted','Order"name',False,False),
    ('underscore','_Orders',False,False),('valid-underscore','Order_1',True,True)]:
    for position in ['table','column']:
        source=json.loads(json.dumps(base))
        if position=='table':source['table_name']=value
        else:source['columns'][0]['name']=value
        try:UMF.model_validate(source);runtime_ok=True
        except ValidationError:runtime_ok=False
        schema_ok=validator.is_valid(source)
        assert (runtime_ok,schema_ok)==(expected_runtime,expected_schema),(position,name,runtime_ok,schema_ok)
        name_boundaries.append({'case':name,'position':position,'name':value,'runtimeAccepted':runtime_ok,'checkedSchemaAccepted':schema_ok})
proof={'nativeVersion':PIN,'scope':'Pinned metadata model, checked schema and generated row JSON Schema/SQL only; no execution-wide enforcement claim',
    'bindingImplemented':False,'versions':{p:importlib.metadata.version(p) for p in ['pydantic','jsonschema']},
    'cases':results,'nameBoundaries':name_boundaries,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}}
Path('fixtures/validation/key-tablespec-discovery-native.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'cases':len(results),'bindingImplemented':False}))
