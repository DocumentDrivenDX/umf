"""Discover actual pinned metadata behavior; not an ideal binding or row validator."""
import hashlib,json,runpy
from pathlib import Path
import pydantic,jsonschema,yaml
root=Path('native/tablespec/sources')
model_path=root/'src/tablespec/models/umf.py';schema_path=root/'src/tablespec/schemas/umf.schema.json'
manifest=json.loads(Path('native/tablespec/sources.json').read_text())
for source in manifest['files']:
    assert hashlib.sha256(Path(source['path']).read_bytes()).hexdigest()==source['sha256'],source['path']
UMF=runpy.run_path(str(model_path))['UMF'];schema=json.loads(schema_path.read_text())
validator=jsonschema.Draft202012Validator(schema)
cases=[('missing',None),('null',None),('false',False),('true',True),('empty-map',{}),('mixed-map',{'MD':False,'MP':True}),('all-true',{'MD':True,'MP':True}),('all-false',{'MD':False,'MP':False}),('custom-context',{'production':False,'staging':True}),('null-context',{'MD':None}),('string-false-context',{'MD':'false'}),('empty-string-context',{'MD':''}),('zero-context',{'MD':0}),('one-context',{'MD':1}),('empty-list-context',{'MD':[]}),('object-context',{'MD':{'unknown':True}}),('scalar-string-false','false'),('scalar-string-true','true'),('scalar-zero',0),('scalar-one',1),('array',[])]
rows=[]
for name,value in cases:
    column={'name':'value','data_type':'VARCHAR'}
    if name!='missing':column['nullable']=value
    data={'version':'1.0','table_name':'Availability','columns':[column]}
    errors=list(validator.iter_errors(data))
    observation={'accepted':False}
    try:
        model=UMF.model_validate(data);col=model.columns[0]
        observation={'accepted':True,'normalizedNullable':col.model_dump(mode='json')['nullable'],'nullableForAllContexts':col.is_nullable_for_all_contexts(),'requiredForAnyContext':col.is_required_for_any_context(),'dumpWithoutNone':col.model_dump(mode='json',exclude_none=True).get('nullable','<omitted>')}
    except Exception as error:observation['errorType']=type(error).__name__
    rows.append({'case':name,'source':data,'checkedSchemaAccepted':not errors,'schemaErrorPaths':sorted('/'+'/'.join(str(v) for v in e.path) for e in errors),'runtime':observation})
by={r['case']:r for r in rows}
assert by['false']['runtime']['accepted'] and not by['false']['checkedSchemaAccepted']
assert by['string-false-context']['runtime']['nullableForAllContexts'] is True
assert by['mixed-map']['runtime']['requiredForAnyContext'] is True
assert by['null-context']['runtime']['nullableForAllContexts'] is True
assert by['null-context']['runtime']['dumpWithoutNone']=={}
assert by['scalar-string-false']['runtime']['normalizedNullable'] is False
assert by['missing']['runtime']['nullableForAllContexts'] is True
assert by['missing']['source']['columns'][0].get('nullable','<missing>')=='<missing>'
recovery_path=Path('fixtures/validation/nullability-tablespec-profile.json')
recoveries=0
if recovery_path.exists():
    for row in json.loads(recovery_path.read_text())['rows']:
        parse=json.loads if row['nativeFormat']=='json' else yaml.safe_load
        original=parse(row['text'])
        unknown=row['variant']=='unknown-root'
        if unknown:assert original['future_native']==9007199254740993
        expected=by[row['nativeCase']]
        schema_accepted=False if unknown else expected['checkedSchemaAccepted']
        runtime_accepted=False if unknown else expected['runtime']['accepted']
        assert (not list(validator.iter_errors(original)))==schema_accepted
        try:
            model=UMF.model_validate(original)
            assert runtime_accepted
            assert model.columns[0].is_nullable_for_all_contexts()==expected['runtime']['nullableForAllContexts']
        except pydantic.ValidationError:
            assert not runtime_accepted
        for restored in row['recovered']:
            assert restored['text']==row['text']
            assert parse(restored['text'])==original
            recoveries+=1
    assert recoveries==168
result={'scope':'Pinned TableSpec metadata acceptance, normalization and aggregate helper behavior. No selected-context resolver, ideal availability binding, generated GX rule or row-execution claim.','nativeVersion':manifest['commit'],'pydantic':pydantic.__version__,'jsonschema':__import__('importlib.metadata',fromlist=['version']).version('jsonschema'),'rows':rows,'nativeRecoveryComparisons':recoveries,'recoveryInputSha256':hashlib.sha256(recovery_path.read_bytes()).hexdigest() if recovery_path.exists() else None,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [model_path,schema_path,Path(__file__)]}}
Path('fixtures/validation/nullability-tablespec-profile-native.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'runtimeAccepted':sum(r['runtime']['accepted'] for r in rows),'checkedSchemaAccepted':sum(r['checkedSchemaAccepted'] for r in rows),'schemaRuntimeDisagreements':sum(r['runtime']['accepted']!=r['checkedSchemaAccepted'] for r in rows)}))
