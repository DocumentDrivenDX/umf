"""Pinned TableSpec facet discovery. Explicit native expectations precede observations."""
import os,sys,json,hashlib,runpy,importlib,importlib.metadata
from decimal import Decimal
from pathlib import Path
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');os.environ['PYSPARK_PYTHON']=sys.executable
import pydantic,jsonschema,great_expectations as gx
from great_expectations.data_context.types.base import DataContextConfig,InMemoryStoreBackendDefaults
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType,StructField,StringType
paths=[Path(f'native/tablespec/{part}') for part in ['sources.json','cardinality-runtime/sources.json','nullability-runtime/sources.json','facets-runtime/sources.json']]
for path in paths:
    manifest=json.loads(path.read_text());assert manifest['commit']=='647e8e566ad78b864282ec65c0b0b2237aa63084'
    for f in manifest['files']:
        assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
# Installed imports must match the pinned code whose semantics are being measured.
for module,file in [('tablespec.format_utils','nullability-runtime/format_utils.py'),('tablespec.type_mappings','sources/src/tablespec/type_mappings.py'),('tablespec.models.umf','sources/src/tablespec/models/umf.py'),('tablespec.schemas.generators','cardinality-runtime/generators.py'),('tablespec.casting_utils','facets-runtime/casting_utils.py'),('tablespec.dialects','facets-runtime/dialects.py'),('tablespec.date_formats','facets-runtime/date_formats.py')]:
    p=Path('native/tablespec')/file;assert Path(importlib.import_module(module).__file__).read_bytes()==p.read_bytes(),module;paths.append(p)
root=Path('native/tablespec/sources');UMF=runpy.run_path(str(root/'src/tablespec/models/umf.py'))['UMF']
validator=jsonschema.Draft202012Validator(json.loads((root/'src/tablespec/schemas/umf.schema.json').read_text()))
gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py');ingest=runpy.run_path('native/tablespec/facets-runtime/ingest_generator.py')
gxgen=runpy.run_path('native/tablespec/nullability-runtime/gx_baseline.py')
cases=[]
def add(name,column,runtime=True,schema=True):cases.append({'case':name,'column':{'name':'value',**column},'expectedRuntime':runtime,'expectedSchema':schema})
for t in ['VARCHAR','CHAR','TEXT','INTEGER','DECIMAL','FLOAT']:
    add(t+'-bare',{'data_type':t})
for name,v,model,schema in [('one',1,True,True),('zero',0,False,False),('negative',-1,False,False),('null',None,True,True),('fraction',1.5,False,False),('string','2',True,False),('boolean',True,True,False),('safe-max',9007199254740991,True,True),('unsafe-exact',9007199254740993,True,True)]:
    add('length-'+name,{'data_type':'VARCHAR','length':v},model,schema)
for t in ['VARCHAR','CHAR','TEXT','INTEGER','DECIMAL']:
    add('stray-length-'+t,{'data_type':t,'length':2})
for name,fields in [('max-only',{'max_length':2}),('conflict',{'length':1,'max_length':2}),('max-zero',{'max_length':0}),('max-negative',{'max_length':-1}),('max-string',{'max_length':'2'}),('unknown-unit',{'length':2,'length_unit':'future','future':{'x':[1,2]}})]:
    add(name,{'data_type':'VARCHAR',**fields})
for name,fields,model,schema in [('paired',{'precision':5,'scale':2},True,True),('scale-zero',{'precision':5,'scale':0},True,True),('precision-only',{'precision':5},True,True),('scale-only',{'scale':2},True,True),('scale-exceeds',{'precision':2,'scale':5},True,True),('precision-39',{'precision':39,'scale':2},True,True),('zero-precision',{'precision':0,'scale':0},False,False),('negative-scale',{'precision':5,'scale':-1},False,False),('coerced-pair',{'precision':'5','scale':'2'},True,False),('boolean-pair',{'precision':True,'scale':False},True,False),('null-pair',{'precision':None,'scale':None},True,True),('unsafe-precision',{'precision':9007199254740993,'scale':2},True,True)]:
    add('decimal-'+name,{'data_type':'DECIMAL',**fields},model,schema)
for t in ['VARCHAR','INTEGER','FLOAT']:
    add('stray-decimal-'+t,{'data_type':t,'precision':5,'scale':2})
for t in ['INTEGER','FLOAT','VARCHAR']:
    add('unknown-width-'+t,{'data_type':t,'integerWidth':{'bits':8,'signed':False}})
observations=[];sources={};generated={}
def render(source):
    js=gen['generate_json_schema'](source)
    try:jsonschema.Draft7Validator.check_schema(js);valid=True
    except jsonschema.SchemaError:valid=False
    sp=gen['generate_pyspark_schema'](source);namespace={};exec(compile(sp,'<trusted-pinned-schema-generator>','exec'),namespace)
    return {'jsonSchemaText':json.dumps(js),'jsonSchemaValid':valid,'sparkSource':sp,'sparkSchema':namespace['facets_schema'].jsonValue(),'sql':gen['generate_sql_ddl'](source),'ingestTarget':ingest['_typed_type'](source['columns'][0]),'ingestCast':ingest['_cast_for'](source['columns'][0])}
for row in cases:
    source={'version':'1.0','table_name':'Facets','columns':[row['column']]};sources[row['case']]=source
    try:normalized=UMF.model_validate(source).model_dump(mode='json');accepted=True
    except pydantic.ValidationError:normalized=None;accepted=False
    schema_ok=validator.is_valid(source);assert (accepted,schema_ok)==(row['expectedRuntime'],row['expectedSchema']),(row['case'],accepted,schema_ok)
    # Numeric lexemes remain text, including exact integers beyond the JS metadata profile.
    result={k:v for k,v in row.items() if k!='column'};result.update(sourceText=json.dumps(source),runtimeAccepted=accepted,checkedSchemaAccepted=schema_ok)
    raw=render(source);result['raw']=raw;generated[row['case']]=raw
    if normalized is not None:result['normalizedText']=json.dumps(normalized);result['normalized']=render(normalized)
    observations.append(result)
by={r['case']:r for r in observations}
assert len(cases)==44,len(cases)
assert 'maxLength' not in json.loads(by['length-one']['raw']['jsonSchemaText'])['properties']['value']
assert json.loads(by['max-only']['raw']['jsonSchemaText'])['properties']['value']['maxLength']==2
assert 'maxLength' not in json.loads(by['max-only']['normalized']['jsonSchemaText'])['properties']['value']
assert not by['max-negative']['raw']['jsonSchemaValid'] and not by['max-string']['raw']['jsonSchemaValid']
assert by['decimal-paired']['raw']['sparkSchema']['fields'][0]['type']=='decimal(10,0)'
assert by['decimal-paired']['raw']['ingestTarget']=='DECIMAL(5,2)'
assert by['DECIMAL-bare']['raw']['ingestTarget']=='DECIMAL(10,2)'
assert 'DECIMAL(5,2)' in by['decimal-paired']['raw']['sql']
assert by['INTEGER-bare']['raw']['sparkSchema']['fields'][0]['type']=='integer'
assert 'integerWidth' not in json.loads(by['unknown-width-INTEGER']['normalizedText'])['columns'][0]
spark=SparkSession.builder.master('local[1]').appName('umf-tablespec-facets').config('spark.ui.enabled','false').config('spark.ui.showConsoleProgress','false').config('spark.driver.bindAddress','127.0.0.1').getOrCreate();spark.sparkContext.setLogLevel('ERROR')
values=[]
def value_case(name,profile,value,json_ok,spark_ok,expected):
    raw=generated[profile];namespace={};exec(compile(raw['sparkSource'],'<trusted-pinned-schema-generator>','exec'),namespace)
    actual=None;error=None
    js=jsonschema.Draft7Validator(json.loads(raw['jsonSchemaText'])).is_valid({'value':value})
    try:actual=spark.createDataFrame([{'value':value}],namespace['facets_schema']).collect()[0]['value'];ok=True
    except Exception as e:ok=False;error=type(e).__name__
    assert (js,ok)==(json_ok,spark_ok),(name,js,ok,error)
    if not ok:assert error=='PySparkValueError',(name,error)
    if ok:assert actual==expected,(name,actual,expected)
    values.append({'case':name,'profile':profile,'inputText':str(value),'jsonAccepted':js,'sparkAccepted':ok,'sparkValueText':None if actual is None else str(actual),'sparkErrorType':error})
try:
    for name,value in [('empty',''),('ascii','a'),('over','abc'),('supplementary','😀'),('combining','e\u0301'),('supplementary-pair','😀😀')]:
        value_case('length-'+name,'length-one',value,True,True,value)
        value_case('max-'+name,'max-only',value,len(value)<=2,True,value)
    for name,value in [('min',-2147483648),('max',2147483647),('below',-2147483649),('above',2147483648),('unsigned8',255),('outside8',256)]:
        ok=-2147483648<=value<=2147483647;value_case('integer-'+name,'unknown-width-INTEGER',value,True,ok,value)
    for name,value,expected in [('exact','1.00','1'),('fraction','1.25','1'),('negative','-1.75','-2'),('large-for-author','12345.67','12346')]:
        value_case('decimal-'+name,'decimal-paired',Decimal(value),True,True,Decimal(expected))
    value_case('float-narrowing','FLOAT-bare',1.0000000000000002,True,True,1.0)
    native_types=[]
    for profile,expected in [('decimal-paired',True),('decimal-scale-zero',True),('decimal-scale-exceeds',False),('decimal-precision-39',False),('decimal-coerced-pair',True),('decimal-boolean-pair',False)]:
        ddl=generated[profile]['ingestTarget'];error=None;actual=None
        try:actual=spark._jsparkSession.sessionState().sqlParser().parseDataType(ddl).json()
        except Exception as e:error=type(e).__name__
        assert (error is None)==expected,(profile,ddl,error)
        if not expected:assert error==('ArithmeticException' if profile=='decimal-precision-39' else 'ParseException'),(profile,error)
        native_types.append({'profile':profile,'target':ddl,'accepted':error is None,'nativeTypeJson':actual,'errorType':error})
    cast_results=[]
    for ansi in [True,False]:
        spark.conf.set('spark.sql.ansi.enabled',str(ansi).lower())
        for name,text,target,expected in [('exact','1.25','decimal-paired','1.25'),('round','1.235','decimal-paired','1.24'),('negative-round','-1.235','decimal-paired','-1.24'),('author-overflow','1000','decimal-paired',None),('bare-fraction','1.235','DECIMAL-bare','1.24')]:
            expr=generated[target]['ingestCast'];frame=spark.createDataFrame([{'value':text}],StructType([StructField('value',StringType(),True)]));actual=None;error=None
            try:actual=frame.selectExpr(expr+' AS result').collect()[0]['result']
            except Exception as e:error=type(e).__name__
            expect_error=ansi and name=='author-overflow'
            assert (error is not None)==expect_error,(name,ansi,error)
            if expect_error:assert error=='ArithmeticException',(name,error)
            if not expect_error:assert (None if actual is None else str(actual))==expected,(name,ansi,actual,expr)
            cast_results.append({'case':name,'ansiEnabled':ansi,'input':text,'profile':target,'expression':expr,'output':None if actual is None else str(actual),'errorType':error})
    spark.conf.set('spark.sql.ansi.enabled','true')
    # Execute the actual baseline-generated length expectation; generation alone is not enforcement.
    context=gx.get_context(mode='ephemeral',project_config=DataContextConfig(config_version=4,analytics_enabled=False,store_backend_defaults=InMemoryStoreBackendDefaults(),progress_bars={'globally':False}))
    source=context.data_sources.add_spark(name='facet_probe');asset=source.add_dataframe_asset(name='values');batchdef=asset.add_batch_definition_whole_dataframe('whole')
    gx_rows=[]
    for profile in ['length-one','max-only','conflict']:
        baseline=gxgen['BaselineExpectationGenerator']().generate_baseline_column_expectations(sources[profile]['columns'][0]);rules=[e for e in baseline if e['type']=='expect_column_value_lengths_to_be_between'];assert len(rules)==1
        rule=rules[0];expected_max=1 if profile=='length-one' else 2;assert rule['kwargs']['max_value']==expected_max
        for text in ['','a','😀','e\u0301','😀😀','abc']:
            batch=batchdef.get_batch(batch_parameters={'dataframe':spark.createDataFrame([{'value':text}])});result=batch.validate(gx.expectations.ExpectColumnValueLengthsToBeBetween(**rule['kwargs'])).to_json_dict();assert result['success']==(len(text)<=expected_max),(profile,text,result)
            gx_rows.append({'profile':profile,'value':text,'generatedRule':rule,'success':result['success']})
    evidence={'scope':'Native TableSpec facet discovery: checked schema, Pydantic, raw/normalized generators, Spark values, ingest cast expressions and generated GX length expectations. Binding not yet implemented.','nativeVersion':manifest['commit'],'versions':{'pydantic':pydantic.__version__,'jsonschema':importlib.metadata.version('jsonschema'),'spark':spark.version,'greatExpectations':gx.__version__,'java':spark.sparkContext._jvm.java.lang.System.getProperty('java.version')},'declarations':observations,'values':values,'nativeTypes':native_types,'ingestCasts':cast_results,'gxLength':gx_rows,'limits':['No whole ingestion pipeline, table DDL execution, Delta write, browser binding or UMF recovery is claimed.','Bare native source and generated JSON/Spark/GX/ingest profiles have different bounds; classification must name its evidence profile.','Raw and normalized native source are separate inputs; normalization drops unknown max_length, integerWidth and future members.','Only non-surrogate Unicode scalar strings are checked; no Unicode normalization, grapheme or collation equivalence is asserted.','Exact native numeric tokens are retained as text; acceptance of huge native integers does not widen UMF safe-integer metadata limits.','Native decimal casts may round; overflow throws with ANSI enabled and returns null with ANSI disabled. No matching type label establishes exact input conversion.'],'references':['https://spark.apache.org/docs/4.0.1/api/scala/org/apache/spark/sql/types/DecimalType.html','https://spark.apache.org/docs/4.0.1/sql-ref-ansi-compliance.html'],'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths+[Path(__file__),Path('scripts/core-ideals/facets-tablespec-profile-oracle.ts'),Path('native/tablespec/facets-runtime/ingest_generator.py'),Path('native/tablespec/nullability-runtime/gx_baseline.py'),root/'src/tablespec/schemas/umf.schema.json']))}}
    out=Path('fixtures/validation/facets-tablespec-profile-native.json');out.write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'declarations':len(observations),'values':len(values),'nativeTypes':len(native_types),'ingestCasts':len(cast_results),'gxLengthChecks':len(gx_rows),'bindingImplemented':False}))
finally:spark.stop()
