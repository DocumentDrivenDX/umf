import json,runpy,hashlib
from pathlib import Path
import yaml,pydantic
path=Path('native/tablespec/sources/src/tablespec/models/umf.py')
UMF=runpy.run_path(str(path))['UMF']
fixture=Path('fixtures/validation/field-tablespec-classification.json')
rows=[]
def inspect(text,fmt):
    try:
        model=UMF.model_validate(json.loads(text) if fmt=='json' else yaml.safe_load(text))
        return {'accepted':True,'model':model.model_dump(mode='json')}
    except Exception as error:
        return {'accepted':False,'error':str(error)}
for case in json.loads(fixture.read_text())['rows']:
    original=inspect(case['input'],case['nativeFormat'])
    assert case['recordExport']==case['input']
    assert inspect(case['recordExport'],case['nativeFormat'])==original
    if original['accepted']:
        record=case['recordSummary']
        assert record['kind']=='record' and record['name']==original['model']['table_name']
        assert record['references']==[{'role':'member','module':'table','element':'column:'+str(i)} for i in range(len(original['model']['columns']))]

    for recovery in case['exports']:
        recovered=inspect(recovery['text'],case['nativeFormat'])
        assert original==recovered
        if original['accepted']:
            column=original['model']['columns'][case['column']]
            actual=case['result']['target']['modules'][0]['elements'][case['column']]
            assert actual['kind']=='field' and actual['name']==column['name']
        rows.append({'id':case['id'],'column':case['column'],'mode':case['mode'],'format':recovery['format'],'nativeAccepted':original['accepted'],'recoveryAgrees':True})
result={'scope':'Pinned native model outcomes, table/member closure and accepted column identity after classification; not native coercion equivalence or down-projection','pydantic':pydantic.__version__,'modelSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'inputSha256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'rows':rows}
Path('fixtures/validation/field-tablespec-native.json').write_text(json.dumps(result,indent=2)+'\n')
print({'comparisons':len(rows),'nativeAccepted':sum(r['nativeAccepted'] for r in rows)})
