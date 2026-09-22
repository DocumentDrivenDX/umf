"""Assert pinned native declaration and generated-schema boundaries before UMF binding work."""
import os,sys,json,hashlib,runpy,importlib.metadata
from pathlib import Path
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1')
os.environ['PYSPARK_PYTHON']=sys.executable
import pydantic,jsonschema,tablespec.type_mappings
from pyspark.sql import SparkSession
from pyspark.sql.types import ArrayType,FloatType
root=Path('native/tablespec/sources')
manifest_paths=[Path('native/tablespec/sources.json'),Path('native/tablespec/cardinality-runtime/sources.json')]
for path in manifest_paths:
    manifest=json.loads(path.read_text())
    for f in manifest['files']:
        assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
assert Path(tablespec.type_mappings.__file__).read_bytes()==(root/'src/tablespec/type_mappings.py').read_bytes()
UMF=runpy.run_path(str(root/'src/tablespec/models/umf.py'))['UMF']
validator=jsonschema.Draft202012Validator(json.loads((root/'src/tablespec/schemas/umf.schema.json').read_text()))
gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py')
# Expectations are authored independently of the observed native results.
cases=[]
def add(name,column,runtime,schema):
    cases.append({'case':name,'source':{'version':'1.0','table_name':'Cardinality','columns':[{'name':'value',**column}]},'expectedRuntime':runtime,'expectedSchema':schema})
for t in ['VARCHAR','DECIMAL','INTEGER','DATE','DATETIME','TIMESTAMP','BOOLEAN','TEXT','CHAR','FLOAT']:
    add(t,{'data_type':t},True,True)
for t in ['ARRAY','ARRAY<FLOAT>','MAP','STRUCT','EMBEDDING(3)','embedding','EMBEDDING_FUTURE']:
    add(t,{'data_type':t,'dimension':3},False,False)
for name,dimension,runtime,schema in [('missing',None,False,True),('null',None,False,True),('one',1,True,True),('three',3,True,True),('zero',0,False,False),('negative',-1,False,False),('fraction',1.5,False,False),('string','3',True,False),('boolean',True,True,False)]:
    col={'data_type':'EMBEDDING'}
    if name!='missing':col['dimension']=dimension
    add('embedding-'+name,col,runtime,schema)
add('scalar-stray-dimension',{'data_type':'INTEGER','dimension':3},False,True)
add('future-column-content',{'data_type':'EMBEDDING','dimension':3,'future_shape':{'unknown':[1,2]}},True,True)
observations=[]
for row in cases:
    source=row['source'];schema_ok=validator.is_valid(source);normalized=None
    try:normalized=UMF.model_validate(source).model_dump(mode='json');runtime_ok=True
    except pydantic.ValidationError:runtime_ok=False
    assert runtime_ok==row['expectedRuntime'] and schema_ok==row['expectedSchema'],(row['case'],runtime_ok,schema_ok)
    result={**row,'runtimeAccepted':runtime_ok,'checkedSchemaAccepted':schema_ok}
    if normalized is not None:
        result['normalizedColumn']=normalized['columns'][0]
        result['generatedJsonSchema']=gen['generate_json_schema'](normalized)
        try:jsonschema.Draft7Validator.check_schema(result['generatedJsonSchema']);result['generatedJsonSchemaValid']=True
        except jsonschema.SchemaError:result['generatedJsonSchemaValid']=False
        result['generatedSparkSource']=gen['generate_pyspark_schema'](normalized)
        result['generatedSql']=gen['generate_sql_ddl'](normalized)
        namespace={};exec(compile(result['generatedSparkSource'],'<trusted-pinned-schema-generator>','exec'),namespace)
        result['generatedSparkSchema']=namespace['cardinality_schema'].jsonValue()
    observations.append(result)
by={r['case']:r for r in observations}
for t in ['VARCHAR','DECIMAL','INTEGER','DATE','DATETIME','TIMESTAMP','BOOLEAN','TEXT','CHAR','FLOAT']:
    assert not isinstance(by[t]['generatedSparkSchema']['fields'][0]['type'],dict),t
assert 'future_shape' not in by['future-column-content']['normalizedColumn']
assert by['future-column-content']['source']['columns'][0]['future_shape']=={'unknown':[1,2]}
embedding=by['embedding-three'];assert embedding['normalizedColumn']['dimension']==3
# Raw and normalized inputs must not be conflated. None-valued descriptions in a
# full model dump cause the pinned generator to emit invalid JSON Schema annotations.
assert not embedding['generatedJsonSchemaValid']
raw_embedding_json=gen['generate_json_schema'](embedding['source'])
jsonschema.Draft7Validator.check_schema(raw_embedding_json)
assert embedding['generatedSparkSchema']['fields'][0]['type']=={'type':'array','elementType':'float','containsNull':True}
assert embedding['generatedJsonSchema']['properties']['value']['minItems']==3
assert embedding['generatedJsonSchema']['properties']['value']['maxItems']==3
assert by['embedding-string']['normalizedColumn']['dimension']==3
assert by['embedding-boolean']['normalizedColumn']['dimension']==1
# Raw generator acceptance is not schema/model acceptance: malformed prefixes are lowered too.
raw_controls=[]
for name in ['EMBEDDING_FUTURE','embedding','embedding-missing','scalar-stray-dimension']:
    row=by[name];raw_controls.append({'case':name,'runtimeAccepted':row['runtimeAccepted'],'checkedSchemaAccepted':row['checkedSchemaAccepted'],'jsonSchema':gen['generate_json_schema'](row['source']),'sparkSource':gen['generate_pyspark_schema'](row['source'])})
assert raw_controls[0]['jsonSchema']['properties']['value']['type']=='array'
assert 'items' not in raw_controls[2]['jsonSchema']['properties']['value']
# Explicit expected value behavior, including different meanings of absence and item nulls.
values=[
 ('ordered',[3.0,1.0,2.0],True,True),('duplicates',[1.0,1.0,1.0],True,True),
 ('empty',[],False,True),('short',[1.0],False,True),('long',[1.0,2.0,3.0,4.0],False,True),
 ('null-item',[1.0,None,2.0],False,True),('null-container',None,False,True),
 ('narrowing',[1.0000000000000002,1.0,2.0],True,True),
 ('nested',[[1.0],[2.0],[3.0]],False,False),('map',{'x':1.0},False,False),
 ('string','[1,2,3]',False,False),('integer-items',[1,2,3],True,False),
 ('omitted',None,True,True),
]
spark=SparkSession.builder.master('local[1]').appName('umf-tablespec-cardinality').config('spark.ui.enabled','false').config('spark.driver.bindAddress','127.0.0.1').config('spark.ui.showConsoleProgress','false').getOrCreate()
spark.sparkContext.setLogLevel('ERROR')
value_rows=[]
try:
    namespace={};exec(compile(embedding['generatedSparkSource'],'<trusted-pinned-schema-generator>','exec'),namespace)
    spark_schema=namespace['cardinality_schema'];assert isinstance(spark_schema[0].dataType,ArrayType) and isinstance(spark_schema[0].dataType.elementType,FloatType)
    json_validator=jsonschema.Draft7Validator(raw_embedding_json)
    for name,value,json_ok,spark_ok in values:
        row={} if name=='omitted' else {'value':value}
        accepted=json_validator.is_valid(row);assert accepted==json_ok,(name,'json',accepted)
        actual=None;error_type=None
        try:actual=spark.createDataFrame([row],spark_schema).collect()[0].asDict();native_ok=True
        except Exception as error:native_ok=False;error_type=type(error).__name__
        assert native_ok==spark_ok,(name,'spark',native_ok,error_type)
        if name in ['ordered','duplicates','empty','short','long','null-item','null-container']:assert actual==row,(name,actual)
        if name=='narrowing':assert actual['value'][0]==1.0 and value[0]!=1.0
        if name=='omitted':assert actual=={'value':None}
        value_rows.append({'case':name,'input':row,'jsonAccepted':accepted,'sparkAccepted':native_ok,'sparkValue':actual,'sparkErrorType':error_type})
    evidence={'scope':'Pinned TableSpec declaration acceptance and generated JSON Schema / PySpark value behavior. Native discovery only; UMF Cardinality classification/projection and recovery remain unfinished.','nativeVersion':manifest['commit'],'versions':{'pydantic':pydantic.__version__,'jsonschema':importlib.metadata.version('jsonschema'),'spark':spark.version,'java':spark.sparkContext._jvm.java.lang.System.getProperty('java.version')},'declarations':observations,'rawGeneratorControls':raw_controls,'valueSchema':raw_embedding_json,'values':value_rows,'limits':['Only the named generator paths and synthetic rows are executed; no complete TableSpec ingestion pipeline or GX execution claim.','SQL output is retained but not executed by this probe.','Value validation uses the checked raw-input generated JSON Schema. Full normalized model dumps produce invalid null-valued description annotations; that output is recorded but not claimed valid.','Unknown column metadata is accepted then dropped by Pydantic normalization; UMF must retain the original source.','EMBEDDING dimensionality is enforced by generated JSON Schema but absent from the generated Spark data type. Item-null and numeric precision rules also differ.','Runtime normalization of dimension strings/booleans is observed, never permission to infer exact authored integer metadata.','UMF native archive recovery, strict/report projections and Chromium checks remain required binding work.'],'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*manifest_paths,Path(__file__),root/'src/tablespec/models/umf.py',root/'src/tablespec/schemas/umf.schema.json',root/'src/tablespec/type_mappings.py',Path('native/tablespec/cardinality-runtime/generators.py')]}}
    out=Path('fixtures/validation/cardinality-tablespec-profile-native.json');out.write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps({'declarations':len(observations),'profileDisagreements':sum(r['runtimeAccepted']!=r['checkedSchemaAccepted'] for r in observations),'rawGeneratorControls':len(raw_controls),'valueCases':len(value_rows),'valueDisagreements':sum(r['jsonAccepted']!=r['sparkAccepted'] for r in value_rows),'floatNarrowings':1}))
finally:spark.stop()
