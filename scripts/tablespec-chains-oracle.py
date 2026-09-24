import json,runpy,hashlib
from pathlib import Path
model_path=Path('native/tablespec/sources/src/tablespec/models/umf.py');UMF=runpy.run_path(str(model_path))['UMF']
rows=[]
for c in json.loads(Path('fixtures/validation/tablespec-chains.json').read_text())['cases']:
    r=c['result'];model=UMF.model_validate_json(r['nativeSchema']).model_dump(mode='json')
    assert r['source']==r['stages']['sourceToAvro']['source']
    assert r['stages']['sourceToAvro']['target']==r['stages']['avroToTableSpec']['source']
    for stage in ['sourceToAvro','avroToTableSpec']:
        observed=[issue['issue'] for issue in r['issues'] if issue['stage']==stage]
        assert observed==r['stages'][stage]['issues']
        assert all(issue['sourceDocumentPath']=='/stages/'+stage+'/source' for issue in r['issues'] if issue['stage']==stage)
    for exported in c['exports']:
        assert UMF.model_validate_json(exported['schema']).model_dump(mode='json')==model
    rows.append({'sourceKind':c['kind'],'columns':len(model['columns']),'recoveries':len(c['exports']),'stageIssues':{stage:len(r['stages'][stage]['issues']) for stage in r['stages']},'nativeTargetModelsAgree':True})
Path('fixtures/validation/tablespec-chains-oracle.json').write_text(json.dumps({'modelSha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'cases':rows,'scope':'Pinned TableSpec schema-model validation of composed outputs and issue-chain consistency; original native source/Avro evidence remains scoped to each stage contract. No composed row encoder or full semantic equivalence.'},indent=2)+'\n');print(rows)
