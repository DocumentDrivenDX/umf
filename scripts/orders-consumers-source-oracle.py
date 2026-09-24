import json,runpy,hashlib
from pathlib import Path
model_path=Path('native/tablespec/sources/src/tablespec/models/umf.py')
UMF=runpy.run_path(str(model_path))['UMF']
def decode(n):
    if n['kind']=='object':return {k:decode(v) for k,v in n['members'].items()}
    if n['kind']=='array':return [decode(v) for v in n['items']]
    if n['kind']=='null':return None
    if n['kind']=='number':return json.loads(n['value'])
    return n['value']
cases=[]
for case in json.loads(Path('fixtures/validation/orders-consumers.json').read_text())['cases']:
    payload=case['source']['extensions']['umf.tablespec']
    original=UMF.model_validate_json(payload['originalSource']).model_dump(mode='json')
    retained=UMF.model_validate(decode(case['bundle']['context']['source']['extensions']['umf.tablespec']['root'])).model_dump(mode='json')
    assert original==retained and len(original['columns'])==3
    cases.append({'unknownVocabulary':case['unknown'],'columns':3,'sourceModelAgrees':True})
Path('fixtures/validation/orders-consumers-source-oracle.json').write_text(json.dumps({'modelSha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'cases':cases,'scope':'Pinned TableSpec Pydantic schema model validation; no row or pipeline execution'},indent=2)+'\n')
print({'cases':len(cases)})
