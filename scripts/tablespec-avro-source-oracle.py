import json,runpy,hashlib
from pathlib import Path
import yaml
model_path=Path('native/tablespec/sources/src/tablespec/models/umf.py');mapping_path=Path('native/tablespec/sources/src/tablespec/type_mappings.py')
UMF=runpy.run_path(str(model_path))['UMF'];mapping=runpy.run_path(str(mapping_path))
def decode(n):
    if n['kind']=='object':return {k:decode(v) for k,v in n['members'].items()}
    if n['kind']=='array':return [decode(v) for v in n['items']]
    if n['kind']=='null':return None
    if n['kind']=='number':return json.loads(n['value'])
    return n['value']
rows=[]
for c in json.loads(Path('fixtures/tablespec/avro-projection.json').read_text())['cases']:
    native=json.loads(c['nativeSource']) if c['format']=='json' else yaml.safe_load(c['nativeSource'])
    original=UMF.model_validate(native).model_dump(mode='json');retained=UMF.model_validate(decode(c['result']['source']['extensions']['umf.tablespec']['root'])).model_dump(mode='json')
    assert original==retained
    rows.append({'id':c['id'],'sourceModelAgrees':True,'columns':len(original['columns'])})
helpers={'dateStringHelper':mapping['map_to_pyspark_type']('DATE'),'dateObjectHelper':str(mapping['map_to_pyspark_type_obj']('DATE')),'integerHelper':mapping['map_to_pyspark_type']('INTEGER'),'floatHelper':mapping['map_to_pyspark_type']('FLOAT'),'embeddingHelper':str(mapping['map_to_pyspark_type_obj']('EMBEDDING'))}
assert helpers['dateStringHelper']=='StringType()' and helpers['dateObjectHelper']=='DateType()'
Path('fixtures/tablespec/avro-source-oracle.json').write_text(json.dumps({'modelSha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'mappingSha256':hashlib.sha256(mapping_path.read_bytes()).hexdigest(),'cases':rows,'helpers':helpers,'scope':'Pinned source-model preservation and native helper observations; no pipeline execution or data-value conversion.'},indent=2)+'\n')
print({'cases':len(rows),'helpers':helpers})
