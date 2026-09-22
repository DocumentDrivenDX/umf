import json,hashlib,runpy
from pathlib import Path
import pydantic,jsonschema
manifest=json.loads(Path('native/tablespec/sources.json').read_text())
for f in manifest['files']:assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
UMF=runpy.run_path('native/tablespec/sources/src/tablespec/models/umf.py')['UMF']
validator=jsonschema.Draft202012Validator(json.loads(Path('native/tablespec/sources/src/tablespec/schemas/umf.schema.json').read_text()))
path=Path('fixtures/validation/nullability-tablespec-projection.json');corpus=json.loads(path.read_text());rows=[]
for row in corpus['rows']:
    if row['status']=='blocked':
        assert row['nativeText'] is None and row['residuals'];continue
    native=json.loads(row['nativeText']);model=UMF.model_validate(native);column=native['columns'][0];normalized=model.columns[0].model_dump(mode='json');encoding=row['mapping']['encoding']
    if encoding=='omitted':assert 'nullable' not in column and normalized['nullable'] is None
    elif encoding=='boolean':
        assert type(column['nullable']) is bool and column['nullable'] is (row['ideal']=='absent-allowed')
        assert normalized['nullable'] is column['nullable'] and row['request']['profile']=='runtime-model'
    else:
        context=row['request']['context'];assert column['nullable']=={context:row['ideal']=='absent-allowed'}
        assert normalized['nullable']==column['nullable']
    checked=not list(validator.iter_errors(native));assert checked==(encoding!='boolean')
    assert len(row['profileNotes'])==(0 if checked else 1)
    if row['request']['profile']=='checked-schema':assert checked
    if row['request']['mode']=='strict':assert not row['residuals']
    assert row['recoveries']==['json','yaml']
    rows.append({'nativeType':row['request']['nativeType'],'ideal':row['ideal'],'profile':row['request']['profile'],'context':row['request']['context'],'encoding':encoding,'runtimeAccepted':True,'checkedSchemaAccepted':checked})
assert len(corpus['rows'])==204 and len(rows)==146
result={'scope':'Generated TableSpec metadata acceptance/normalization in pinned Pydantic and checked schema; no row enforcement or omitted-member equivalence','nativeVersion':manifest['commit'],'pydantic':pydantic.__version__,'cases':len(corpus['rows']),'nativeTargets':len(rows),'idealRecoveries':sum(len(r['recoveries']) for r in corpus['rows']),'scalarBooleanDisagreements':sum(not r['checkedSchemaAccepted'] for r in rows),'rows':rows,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [path,Path(__file__),Path('native/tablespec/sources.json')]}}
Path('fixtures/validation/nullability-tablespec-projection-native.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['cases','nativeTargets','idealRecoveries','scalarBooleanDisagreements']}))
