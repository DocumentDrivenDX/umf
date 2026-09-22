"""Compare UMF classifications and recoveries to pinned native declarations."""
import json,hashlib,runpy
from pathlib import Path
import pydantic,jsonschema,yaml
manifest=Path('native/tablespec/sources.json')
for source in json.loads(manifest.read_text())['files']:
    assert hashlib.sha256(Path(source['path']).read_bytes()).hexdigest()==source['sha256']
root=Path('native/tablespec/sources/src/tablespec')
UMF=runpy.run_path(str(root/'models/umf.py'))['UMF']
validator=jsonschema.Draft202012Validator(json.loads((root/'schemas/umf.schema.json').read_text()))
path=Path('fixtures/validation/cardinality-tablespec-classification.json');rows=json.loads(path.read_text())['rows']
def runtime(data):
    try:return UMF.model_validate(data).model_dump(mode='json')
    except pydantic.ValidationError:return None
recoveries=0;declared=0;observations=[]
for row in rows:
    parse=json.loads if row['nativeFormat']=='json' else yaml.safe_load
    source=parse(row['source']);native=runtime(source);schema_ok=validator.is_valid(source);request=row['request'];mapping=row['mapping']
    if mapping['interpretation']=='declared':
        assert request['profile']!='unresolved'
        assert native is not None if request['profile']=='runtime-model' else schema_ok
        col=source['columns'][0]
        if mapping['cardinality']=='array':assert col['data_type']=='EMBEDDING'
        else:assert mapping['cardinality']=='one' and col['data_type'] in ['VARCHAR','DECIMAL','INTEGER','DATE','DATETIME','TIMESTAMP','BOOLEAN','TEXT','CHAR','FLOAT']
        dimension=col.get('dimension')
        assert dimension is None or type(dimension) is int and dimension>0
        declared+=1
    else:
        assert mapping['cardinality']=='unspecified'
        assert row['status']==('blocked' if request['mode']=='strict' else 'classified')
    for recovery in row['recovered']:
        assert recovery['text']==row['source']
        restored=parse(recovery['text']);assert restored==source
        assert runtime(restored)==native and validator.is_valid(restored)==schema_ok
        recoveries+=1
    observations.append({'case':row['case'],'nativeFormat':row['nativeFormat'],'profile':request['profile'],'mode':request['mode'],'runtimeAccepted':native is not None,'checkedSchemaAccepted':schema_ok,'cardinality':mapping['cardinality'],'status':row['status']})
assert len(rows)==336 and declared==116 and recoveries==452,(len(rows),declared,recoveries)
result={'scope':'Selected-profile declared shape and exact native archive recovery; not item or execution equivalence','nativeVersion':json.loads(manifest.read_text())['commit'],'pydantic':pydantic.__version__,'cases':len(rows),'declared':declared,'nativeRecoveries':recoveries,'rows':observations,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [path,Path(__file__),manifest]}}
Path('fixtures/validation/cardinality-tablespec-classification-native.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'cases':len(rows),'declared':declared,'nativeRecoveries':recoveries}))
