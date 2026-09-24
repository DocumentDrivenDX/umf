"""Check emitted declarations with pinned TableSpec; never infer key enforcement."""
import hashlib, importlib, json, runpy
from pathlib import Path
import jsonschema
PIN='647e8e566ad78b864282ec65c0b0b2237aa63084'
paths=[Path(__file__),Path('fixtures/validation/key-tablespec-projected-schemas.json')]
for name in ['sources.json','cardinality-runtime/sources.json']:
    path=Path('native/tablespec')/name;manifest=json.loads(path.read_text());assert manifest['commit']==PIN;paths.append(path)
    for entry in manifest['files']:
        path=Path(entry['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256'];paths.append(path)
root=Path('native/tablespec/sources/src/tablespec')
for module,path in [('tablespec.models.umf',root/'models/umf.py'),('tablespec.type_mappings',root/'type_mappings.py')]:
    assert Path(importlib.import_module(module).__file__).read_bytes()==path.read_bytes()
UMF=runpy.run_path(str(root/'models/umf.py'))['UMF']
validator=jsonschema.Draft202012Validator(json.loads((root/'schemas/umf.schema.json').read_text()))
gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py')
rows=json.loads(paths[1].read_text());assert rows
observations=[]
for row in rows:
    source=json.loads(row['nativeText']);normalized=UMF.model_validate(source).model_dump(mode='json');validator.validate(source)
    assert normalized['primary_key']==source.get('primary_key')
    assert normalized['unique_constraints']==source.get('unique_constraints')
    instance={c['name']:({'BOOLEAN':True,'INTEGER':1,'DECIMAL':1.25}.get(c['data_type'],'code')) for c in source['columns']}
    generated=gen['generate_json_schema'](source);value_validator=jsonschema.Draft7Validator(generated)
    assert all(value_validator.is_valid(v) for v in [instance,instance]),row['name']
    invalid={**instance,source['columns'][0]['name']:[]};assert not value_validator.is_valid(invalid),row['name']
    observations.append({'case':row['name'],'modelAccepted':True,'schemaAccepted':True,'primaryTuple':normalized['primary_key'],'alternateTuples':normalized['unique_constraints'],'duplicateRowsIndividuallyAccepted':True,'invalidScalarRejected':True,'enforcementEstablished':False})
proof={'nativeVersion':PIN,'scope':'Emitted key tuple declarations accepted and retained by pinned model/schema; generated row validation accepts duplicates; no collection enforcement or exact comparator claim','rows':observations,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}}
Path('fixtures/validation/key-tablespec-projection-native.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'projectedSchemas':len(rows),'nativeAccepted':len(observations),'enforcementEstablished':False}))
