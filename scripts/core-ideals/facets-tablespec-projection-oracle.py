"""Check emitted artifacts against native TableSpec models and consumer generators."""
import json,hashlib,runpy,importlib.metadata
from pathlib import Path
import jsonschema,tablespec.type_mappings,tablespec.format_utils
root=Path('native/tablespec/sources');proofpath=Path('fixtures/validation/facets-tablespec-suite-native.json');proof=json.loads(proofpath.read_text())
for path,h in proof['sha256'].items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==h,path
for module,path in [(tablespec.type_mappings,root/'src/tablespec/type_mappings.py'),(tablespec.format_utils,Path('native/tablespec/nullability-runtime/format_utils.py'))]:assert Path(module.__file__).read_bytes()==path.read_bytes()
UMF=runpy.run_path(str(root/'src/tablespec/models/umf.py'))['UMF'];gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py');baseline=runpy.run_path('native/tablespec/nullability-runtime/gx_baseline.py')['BaselineExpectationGenerator']()
validator=jsonschema.Draft202012Validator(json.loads((root/'src/tablespec/schemas/umf.schema.json').read_text()))
path=Path('fixtures/validation/facets-tablespec-projection.json');rows=json.loads(path.read_text())['rows'];assert len(rows)==540
projected=0;recoveries=0;claims=0;observations=[];suite_rules=set()
for row in rows:
    request=row['request'];facets=row['mapping']['facets'];assert row['status']==('blocked' if request['mode']=='strict' and row['residuals'] else 'projected')
    if row['status']=='blocked':assert row['nativeText'] is None and row['recoveries']==[];continue
    projected+=1;source=json.loads(row['nativeText']);assert validator.is_valid(source),list(validator.iter_errors(source));model=UMF.model_validate(source)
    assert source['table_name']=='Facets' and len(source['columns'])==1
    col=source['columns'][0];assert col['name']=='value' and col['data_type'] in ['VARCHAR','TEXT','INTEGER','DECIMAL','FLOAT']
    assert set(source)<= {'version','table_name','columns','expectations'} and set(col)<= {'name','data_type','length','max_length','precision','scale'}
    for key in ['length','max_length','precision','scale']:
        if key in col:assert type(col[key]) is int and 0<=col[key]<=9007199254740991
    native=model.model_dump(mode='json') if request['input']=='model-normalized' else source
    # Only the closed, validated corpus above reaches the trusted native code generator.
    namespace={};exec(compile(gen['generate_pyspark_schema'](source),'<validated-projection-corpus>','exec'),namespace);carrier=namespace['facets_schema'].fields[0].dataType
    rules=[]
    if request['profile']=='gx-suite-spark':
        rules=[e.to_gx_dict() for e in model.expectations.expectations]
        for r in rules:
            assert r['kwargs']['mostly']==1 and r['meta']['blocking'] is True
            suite_rules.add(json.dumps({'type':r['type'],'kwargs':r['kwargs']},sort_keys=True))
    if 'length' in facets:
        f=facets['length'];assert f['unit']=='unicode-scalar';p=request['profile']
        if p=='json-schema':assert gen['generate_json_schema'](native)['properties']['value']['maxLength']==f['max']
        elif p=='gx-spark':assert next(r for r in baseline.generate_baseline_column_expectations(native['columns'][0]) if r['type']=='expect_column_value_lengths_to_be_between')['kwargs']['max_value']==f['max']
        else:
            assert p=='gx-suite-spark' and carrier.typeName()=='string'
            r=next(r for r in rules if r['type']=='expect_column_value_lengths_to_be_between');assert r['kwargs']['min_value']==0 and r['kwargs']['max_value']==f['max']
        claims+=1
    if 'integerWidth' in facets:
        f=facets['integerWidth'];assert carrier.typeName()=='integer'
        if request['profile']=='gx-suite-spark':
            r=next(r for r in rules if r['type']=='expect_column_values_to_be_between');assert r['kwargs']['min_value']==(-2**(f['bits']-1) if f['signed'] else 0) and r['kwargs']['max_value']==2**(f['bits']-(1 if f['signed'] else 0))-1
        else:assert request['profile'] in ['pyspark-schema','ingest-cast'] and f=={'bits':32,'signed':True}
        claims+=1
    if 'precision' in facets:
        p,s=facets['precision'],facets['scale'];assert (col['precision'],col['scale'])==(p,s)
        if request['profile']=='gx-suite-spark':
            assert carrier.precision==10 and carrier.scale==0 and s==0
            r=next(r for r in rules if r['type']=='expect_column_values_to_be_between');assert r['kwargs']['min_value']==-(10**p-1) and r['kwargs']['max_value']==10**p-1
        elif request['profile']=='pyspark-schema':assert (carrier.precision,carrier.scale)==(p,s)
        elif request['profile']=='ingest-cast':assert p<=38 # Actual casts are covered by the separate pinned native profile oracle.
        else:assert request['profile']=='declared-metadata'
        claims+=1
    for recovery in row['recoveries']:assert recovery['source']==row['author']['target'];recoveries+=1
    assert {r['format'] for r in row['recoveries']}=={'json','yaml'}
    if row['name'].startswith('facetless'):assert facets=={} and not any(k in col for k in ['precision','scale','length','max_length'])
    observations.append({'case':row['name'],'request':request,'nativeValid':True,'carrier':carrier.jsonValue(),'facetClaims':facets})
assert projected>300 and claims>50 and recoveries==projected*2
paths=[path,proofpath,Path(__file__),root/'src/tablespec/models/umf.py',root/'src/tablespec/schemas/umf.schema.json',Path('native/tablespec/cardinality-runtime/generators.py'),Path('native/tablespec/nullability-runtime/gx_baseline.py')]
r={'scope':'Emitted artifact model/schema validity, native consumer representation and retained ideal recovery; no whole pipeline or complete binding qualification','cases':len(rows),'projected':projected,'idealRecoveries':recoveries,'facetClaims':claims,'uniqueSuiteRules':len(suite_rules),'nativeVersion':proof['nativeVersion'],'versions':{'pydantic':importlib.metadata.version('pydantic'),'jsonschema':importlib.metadata.version('jsonschema'),'pyspark':importlib.metadata.version('pyspark')},'rows':observations,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/facets-tablespec-projection-native.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k] for k in ['cases','projected','idealRecoveries','facetClaims','uniqueSuiteRules']}))
