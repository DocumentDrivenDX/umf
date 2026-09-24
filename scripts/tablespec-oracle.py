import json,runpy,hashlib
from pathlib import Path
import pydantic,yaml
source=Path('native/tablespec/sources/src/tablespec/models/umf.py')
models=runpy.run_path(str(source));UMF=models['UMF'];Column=models['UMFColumn']
schema=UMF.model_json_schema();schema['$schema']='https://json-schema.org/draft/2020-12/schema';schema['$id']='urn:umf:tablespec:native-model:647e8e5'
Path('spec/extensions/tablespec/native-model.schema.json').write_text(json.dumps(schema,indent=2)+'\n')
def validate(text,format):
    try:
        model=UMF.model_validate(json.loads(text) if format=='json' else yaml.safe_load(text))
        return {'accepted':True,'normalized':model.model_dump(mode='json')}
    except Exception as e: return {'accepted':False,'error':str(e)}
rows=[]
for c in json.loads(Path('fixtures/tablespec/roundtrip.json').read_text())['results']:
    original=validate(c['input'],c['format'])
    for output in c['exports']:
        recovered=validate(output['text'],c['format'])
        rows.append({'id':c['id'],'format':output['format'],'nativeAccepted':original['accepted'],'agrees':original==recovered,'original':original})
nullable=[{'input':v,'normalized':Column(name='value',data_type='INTEGER',nullable=v).model_dump(mode='json')['nullable']} for v in [True,False,{'sales':False,'support':True},None]]
Path('fixtures/tablespec/oracle.json').write_text(json.dumps({'pydantic':pydantic.__version__,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'nullable':nullable,'cases':rows,'scope':'Pinned native model validation and normalization before/after exact source recovery; not cross-system equivalence'},indent=2)+'\n')
assert all(r['agrees'] for r in rows)
print({'cases':len(rows),'nativeAccepted':sum(r['nativeAccepted'] for r in rows),'nullableCases':len(nullable)})
