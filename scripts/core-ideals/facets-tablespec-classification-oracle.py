"""Verify portable facet classifications against pinned native generators, not their TS implementation."""
import json,hashlib,runpy
from pathlib import Path
import pydantic,yaml,tablespec.type_mappings,tablespec.format_utils
root=Path('native/tablespec/sources');native_path=Path('fixtures/validation/facets-tablespec-profile-native.json');proof=json.loads(native_path.read_text())
for path,h in proof['sha256'].items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==h,path
for module,file in [(tablespec.type_mappings,root/'src/tablespec/type_mappings.py'),(tablespec.format_utils,Path('native/tablespec/nullability-runtime/format_utils.py'))]:assert Path(module.__file__).read_bytes()==file.read_bytes()
UMF=runpy.run_path(str(root/'src/tablespec/models/umf.py'))['UMF'];gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py');gx=runpy.run_path('native/tablespec/nullability-runtime/gx_baseline.py')['BaselineExpectationGenerator']()
path=Path('fixtures/validation/facets-tablespec-classification.json');rows=json.loads(path.read_text())['rows'];observations=[];recoveries=0;claims=0
pinned={r['case']:r['sourceText'] for r in proof['declarations']}
providers=Path('native/tablespec/sources/examples/providers.yaml').read_text()
profiles=['declared-metadata','json-schema','pyspark-schema','gx-spark','ingest-cast','unresolved']
exact_cases=['FLOAT-bare','INTEGER-bare','decimal-paired','max-only','unknown-unit','decimal-unsafe-precision']
expected_keys={(case,profile,form,mode,obligation,0) for case in pinned for profile in profiles for form in ['raw','model-normalized'] for mode in ['strict','report'] for obligation in (['value-domain','exact-input'] if case in exact_cases else ['value-domain'])}
expected_keys|={(f'providers:{column}',profile,'raw',mode,'value-domain',column) for column in range(4) for profile in ['gx-spark','pyspark-schema'] for mode in ['strict','report']}
actual_keys=[]
def exact_count(value,minimum):return type(value) is int and minimum<=value<=9007199254740991
for row in rows:
    request=row['request'];actual_keys.append((row['case'],request['profile'],request['input'],request['mode'],request['obligation'],request['column']))
    if row['case'].startswith('providers:'):
        assert row['sourceText']==providers and row['nativeFormat']=='yaml'
    else:assert row['sourceText']==pinned[row['case']] and row['nativeFormat']=='json'
    parse=json.loads if row['nativeFormat']=='json' else yaml.safe_load
    original=parse(row['sourceText']);request=row['request'];col=original['columns'][request['column']];facets=row['mapping']['facets'];source=original
    if request['input']=='model-normalized':
        try:source=UMF.model_validate(original).model_dump(mode='json')
        except pydantic.ValidationError:source=None
    assert row['status']==('blocked' if request['mode']=='strict' and row['residuals'] else 'classified'),(row['case'],request)
    expected={};profile=request['profile']
    # Derive expected positive claims from the pinned native output, with explicit
    # core-domain restrictions. Missing/unsupported facets must not pass by omission.
    if source is not None:
        native=source['columns'][request['column']]
        if col['data_type'] in ['VARCHAR','CHAR','TEXT']:
            maximum=None;raw_parameter=None
            if profile=='json-schema':
                maximum=gen['generate_json_schema'](source)['properties'][col['name']].get('maxLength');raw_parameter=col.get('max_length')
            elif profile=='gx-spark':
                rules=[e for e in gx.generate_baseline_column_expectations(native) if e['type']=='expect_column_value_lengths_to_be_between']
                if rules:maximum=rules[0]['kwargs']['max_value']
                raw_parameter=(col.get('max_length') or col.get('length')) if request['input']=='raw' else col.get('length')
            if exact_count(maximum,1) and exact_count(raw_parameter,1):expected['length']={'max':maximum,'unit':'unicode-scalar'}
        if col['data_type']=='DECIMAL' and exact_count(col.get('precision'),1) and exact_count(col.get('scale'),0) and col['scale']<=col['precision']:
            if profile=='declared-metadata' or profile=='ingest-cast' and col['precision']<=38:expected.update(precision=col['precision'],scale=col['scale'])
        if col['data_type']=='INTEGER' and profile in ['pyspark-schema','ingest-cast']:expected['integerWidth']={'bits':32,'signed':True}
    assert facets==expected,(row['case'],request,facets,expected)
    if facets:
        assert source is not None,(row['case'],request)
        native=source['columns'][request['column']];profile=request['profile']
        if 'length' in facets:
            maximum=facets['length']['max'];assert type(maximum) is int and 1<=maximum<=9007199254740991
            assert facets['length']['unit']=='unicode-scalar' and col['data_type'] in ['VARCHAR','CHAR','TEXT']
            if profile=='json-schema':assert gen['generate_json_schema'](source)['properties'][col['name']]['maxLength']==maximum
            else:
                assert profile=='gx-spark'
                rules=[e for e in gx.generate_baseline_column_expectations(native) if e['type']=='expect_column_value_lengths_to_be_between'];assert len(rules)==1 and rules[0]['kwargs']['max_value']==maximum
            claims+=1
        if 'precision' in facets:
            p=facets['precision'];s=facets['scale'];assert type(p) is int and type(s) is int and 0<=s<=p<=9007199254740991 and p>=1
            assert type(col.get('precision')) is int and type(col.get('scale')) is int and (p,s)==(col['precision'],col['scale'])
            assert profile in ['declared-metadata','ingest-cast']
            if profile=='ingest-cast':
                recorded=next(n for n in proof['declarations'] if n['case']==row['case']);rendered=recorded['normalized' if request['input']=='model-normalized' else 'raw']['ingestTarget'];assert rendered==f'DECIMAL({p},{s})' and p<=38
            claims+=1
        if 'integerWidth' in facets:
            assert col['data_type']=='INTEGER' and profile in ['pyspark-schema','ingest-cast'];assert facets['integerWidth']=={'bits':32,'signed':True}
            source_ns={};exec(compile(gen['generate_pyspark_schema'](source),'<pinned-native-generator>','exec'),source_ns);assert source_ns[source['table_name'].lower()+'_schema'].fields[request['column']].dataType.simpleString()=='int'
            if profile=='ingest-cast':assert next(n for n in proof['declarations'] if n['case']==row['case'])['raw']['ingestTarget']=='INT'
            claims+=1
    if row['case']=='FLOAT-bare' and request['profile']=='pyspark-schema' and request['obligation']=='exact-input':assert row['status']==('blocked' if request['mode']=='strict' else 'classified') and row['residuals']
    for recovery in row['recovered']:
        assert recovery['text']==row['sourceText'];assert parse(recovery['text'])==original;recoveries+=1
    observations.append({'case':row['case'],'profile':request['profile'],'input':request['input'],'obligation':request['obligation'],'mode':request['mode'],'status':row['status'],'facets':facets})
assert len(rows)==1216,len(rows)
assert len(set(actual_keys))==len(actual_keys) and set(actual_keys)==expected_keys,'Missing or duplicated profile cases'
paths=[Path('native/tablespec/sources/examples/providers.yaml'),path,native_path,Path(__file__),root/'src/tablespec/models/umf.py',root/'src/tablespec/type_mappings.py',Path('native/tablespec/cardinality-runtime/generators.py'),Path('native/tablespec/nullability-runtime/gx_baseline.py'),Path('native/tablespec/nullability-runtime/format_utils.py')]
r={'scope':'Profile-qualified native facet claims and exact original source recovery, checked against pinned native generators and native discovery results; no down-projection or full binding acceptance','nativeVersion':proof['nativeVersion'],'pydantic':pydantic.__version__,'cases':len(rows),'facetClaims':claims,'nativeRecoveries':recoveries,'rows':observations,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
Path('fixtures/validation/facets-tablespec-classification-native.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k] for k in ['cases','facetClaims','nativeRecoveries']}))
