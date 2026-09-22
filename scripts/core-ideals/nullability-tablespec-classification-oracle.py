"""Verify selected exact declarations and native archive recovery, not data-row semantics."""
import json,hashlib,runpy
from pathlib import Path
import pydantic,jsonschema,yaml
manifest=json.loads(Path('native/tablespec/sources.json').read_text())
for file in manifest['files']:assert hashlib.sha256(Path(file['path']).read_bytes()).hexdigest()==file['sha256']
UMF=runpy.run_path('native/tablespec/sources/src/tablespec/models/umf.py')['UMF']
validator=jsonschema.Draft202012Validator(json.loads(Path('native/tablespec/sources/src/tablespec/schemas/umf.schema.json').read_text()))
path=Path('fixtures/validation/nullability-tablespec-classification.json');rows=json.loads(path.read_text())['rows']
def runtime(data):
    try:return {'accepted':True,'model':UMF.model_validate(data).model_dump(mode='json')}
    except pydantic.ValidationError:return {'accepted':False}
observations=[];recoveries=0;declared=0
for row in rows:
    parse=json.loads if row['nativeFormat']=='json' else yaml.safe_load
    data=parse(row['source']);options=row['request'];raw=data['columns'][0].get('nullable');native=runtime(data)
    schema_accepted=not list(validator.iter_errors(data))
    value=None
    if options['profile']!='unresolved' and options['carrier']=='null-value':
        if type(raw) is bool and options['profile']=='runtime-model':value=raw
        elif type(raw) is dict and options['context'] is not None and type(raw.get(options['context'])) is bool:value=raw[options['context']]
    expected='unspecified' if value is None else 'absent-allowed' if value else 'required'
    assert row['mapping']['nullability']==expected
    assert row['status']==('blocked' if options['mode']=='strict' and value is None else 'classified')
    if value is not None:
        assert native['accepted']
        normalized=native['model']['columns'][0]['nullable']
        assert (normalized if type(raw) is bool else normalized[options['context']]) is value
        assert row['mapping']['interpretation']=='declared'
        if options['profile']=='checked-schema':assert schema_accepted
        declared+=1
    for recovery in row['recovered']:
        assert recovery['text']==row['source']
        restored=parse(recovery['text']);assert runtime(restored)==native
        assert (not list(validator.iter_errors(restored)))==schema_accepted
        recoveries+=1
    observations.append({'case':row['case'],'nativeFormat':row['nativeFormat'],'profile':options['profile'],'context':options['context'],'mode':options['mode'],'runtimeAccepted':native['accepted'],'checkedSchemaAccepted':schema_accepted,'nullability':expected,'status':row['status']})
assert len(rows)==504 and declared==40 and recoveries==544,(len(rows),declared,recoveries)
result={'scope':'Declared availability metadata under selected profile/context, confirmed against pinned runtime normalization and checked schema; no row enforcement, omission or defaults equivalence','nativeVersion':manifest['commit'],'pydantic':pydantic.__version__,'cases':len(rows),'declared':declared,'nativeRecoveries':recoveries,'rows':observations,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [path,Path(__file__),Path('native/tablespec/sources.json')]}}
Path('fixtures/validation/nullability-tablespec-classification-native.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'declared':declared,'recoveries':recoveries}))
