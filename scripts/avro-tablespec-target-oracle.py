import json,runpy,hashlib
from pathlib import Path
model_path=Path('native/tablespec/sources/src/tablespec/models/umf.py');mapping_path=Path('native/tablespec/sources/src/tablespec/type_mappings.py')
UMF=runpy.run_path(str(model_path))['UMF'];mapping=runpy.run_path(str(mapping_path));rows=[]
fixture=json.loads(Path('fixtures/avro/tablespec-projection.json').read_text())
for case in fixture['cases']:
    model=UMF.model_validate_json(case['result']['nativeSchema']).model_dump(mode='json')
    for output in case['exports']:
        assert UMF.model_validate_json(output['schema']).model_dump(mode='json')==model
        rows.append({'id':case['id'],'format':output['format'],'columns':len(model['columns']),'nativeModelsAgree':True})
simple=json.loads(Path('fixtures/avro/tablespec-carrier-roundtrip.json').read_text());model=UMF.model_validate_json(simple['result']['nativeSchema'])
helpers={c.name:str(mapping['map_to_pyspark_type_obj'](c.data_type)) for c in model.columns}
assert helpers=={'title':'StringType()','count':'IntegerType()','flag':'BooleanType()','score':'FloatType()','optional':'StringType()'}
result={'modelSha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'mappingSha256':hashlib.sha256(mapping_path.read_bytes()).hexdigest(),'cases':rows,'simpleHelpers':helpers,'scope':'Pinned TableSpec Pydantic models validate generated schemas/recoveries and Spark helper carrier families; no TableSpec row, pipeline or logical-value execution'}
Path('fixtures/avro/tablespec-target-oracle.json').write_text(json.dumps(result,indent=2)+'\n');print({'recoveries':len(rows),'helpers':helpers})
