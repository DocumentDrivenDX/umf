import json,runpy,hashlib
from pathlib import Path
import pydantic
source=Path('native/tablespec/sources/src/tablespec/models/umf.py')
UMF=runpy.run_path(str(source))['UMF']
fixture=Path('fixtures/validation/field-tablespec-projection.json')
rows=[]
for case in json.loads(fixture.read_text())['rows']:
    model=UMF.model_validate_json(case['text'])
    assert len(model.columns)==1
    assert model.columns[0].name==case['request']['columnName']
    assert model.columns[0].data_type==case['request']['nativeType']
    rows.append({'nativeType':model.columns[0].data_type,'mode':case['request']['mode'],'accepted':True})
record_rows=[]
for case in json.loads(fixture.read_text()).get('records',[]):
    if case['result']['status']=='blocked':
        assert 'target' not in case['result'] and 'text' not in case
        continue
    model=UMF.model_validate_json(case['text'])
    assert model.table_name=='Orders'
    assert [column.name for column in model.columns]==['id','label','active']
    expected={f['columnName']:f['nativeType'] for f in case['request']['fields']}
    assert all(column.data_type==expected[column.name] for column in model.columns)
    record_rows.append({'variant':case['variant'],'mode':case['request']['mode'],'accepted':True,'columns':len(model.columns)})
result={'records':record_rows,'scope':'Native schema model acceptance and column identity for explicit carriers; no row value or storage enforcement equivalence','pydantic':pydantic.__version__,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'inputSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'cases':rows}
Path('fixtures/validation/field-tablespec-projection-native.json').write_text(json.dumps(result,indent=2)+'\n')
print({'nativeAccepted':len(rows),'nativeRecordsAccepted':len(record_rows)})
