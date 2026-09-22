"""Qualify explicit TableSpec expectation suites for zero lengths and integer domains."""
import os,sys,json,runpy,hashlib,importlib.metadata
from pathlib import Path
from decimal import Decimal
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');os.environ['PYSPARK_PYTHON']=sys.executable
import pydantic,jsonschema,great_expectations as gx,tablespec.type_mappings
from great_expectations.data_context.types.base import DataContextConfig,InMemoryStoreBackendDefaults
from pyspark.sql import SparkSession
root=Path('native/tablespec/sources');manifests=[Path('native/tablespec/sources.json'),Path('native/tablespec/cardinality-runtime/sources.json')]
for manifest in manifests:
    m=json.loads(manifest.read_text());assert m['commit']=='647e8e566ad78b864282ec65c0b0b2237aa63084'
    for row in m['files']:assert hashlib.sha256(Path(row['path']).read_bytes()).hexdigest()==row['sha256']
assert Path(tablespec.type_mappings.__file__).read_bytes()==(root/'src/tablespec/type_mappings.py').read_bytes()
UMF=runpy.run_path(str(root/'src/tablespec/models/umf.py'))['UMF'];gen=runpy.run_path('native/tablespec/cardinality-runtime/generators.py')
validator=jsonschema.Draft202012Validator(json.loads((root/'src/tablespec/schemas/umf.schema.json').read_text()))
capture_path=Path('fixtures/validation/facets-tablespec-projection.json')
projection_proof=Path('fixtures/validation/facets-tablespec-projection-native.json')
for path,h in json.loads(projection_proof.read_text())['sha256'].items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==h,path
rows=[];seen=set()
for projected in json.loads(capture_path.read_text())['rows']:
    if projected['status']!='projected' or projected['request']['profile']!='gx-suite-spark':continue
    source=json.loads(projected['nativeText'])
    for rule in source['expectations']['expectations']:
        key=json.dumps(rule,sort_keys=True)
        if key in seen:continue
        seen.add(key);col=source['columns'][0];kind=col['data_type'];low=rule['kwargs']['min_value'];high=rule['kwargs']['max_value']
        if kind=='VARCHAR':values=['','😀','e\u0301','x'*high,'x'*(high+1),None]
        elif kind=='INTEGER':values=list(dict.fromkeys([low-1,low,0,high,high+1]))+[None]
        else:
            values=[str(low),str(high),'0','1.25',None]
            if col['precision']<10:values.extend([str(low-1),str(high+1),str(high)+'.1'])
        rows.append({'name':projected['name'],'data_type':kind,'source':source,'expectation':rule['type'],'kwargs':rule['kwargs'],'stage':rule['meta']['stage'],'values':values})
assert len(rows)==11
spark=SparkSession.builder.master('local[1]').appName('umf-tablespec-facet-suite').config('spark.ui.enabled','false').config('spark.ui.showConsoleProgress','false').config('spark.driver.bindAddress','127.0.0.1').getOrCreate();spark.sparkContext.setLogLevel('ERROR')
observations=[];checks=0
try:
    context=gx.get_context(mode='ephemeral',project_config=DataContextConfig(config_version=4,analytics_enabled=False,store_backend_defaults=InMemoryStoreBackendDefaults(),progress_bars={'globally':False}))
    datasource=context.data_sources.add_spark(name='suite');asset=datasource.add_dataframe_asset(name='rows');batchdef=asset.add_batch_definition_whole_dataframe('whole')
    for row in rows:
        source=row['source'];rule=source['expectations']['expectations'][0]
        assert validator.is_valid(source),row['name'];model=UMF.model_validate(source);normalized=model.model_dump(mode='json');assert normalized['expectations']['expectations'][0]['kwargs']==rule['kwargs']
        gx_rule=model.expectations.expectations[0].to_gx_dict();assert gx_rule['meta']['validation_stage']==row['stage'] and gx_rule['meta']['blocking'] is True
        ctor=gx.expectations.ExpectColumnValueLengthsToBeBetween if row['data_type']=='VARCHAR' else gx.expectations.ExpectColumnValuesToBeBetween
        namespace={};exec(compile(gen['generate_pyspark_schema'](source),'<fixed-pinned-suite-fixture>','exec'),namespace);schema=namespace['facets_schema'];results=[]
        for value in row['values']:
            native_ok=not(row['data_type']=='INTEGER' and value is not None and not(-2147483648<=value<=2147483647))
            error=None;success=None;actual=None
            try:
                frame=spark.createDataFrame([{'value':Decimal(value) if row['data_type']=='DECIMAL' and value is not None else value}],schema)
                actual=frame.collect()[0]['value']
                batch=batchdef.get_batch(batch_parameters={'dataframe':frame});result=batch.validate(ctor(**gx_rule['kwargs'])).to_json_dict();success=result['success']
            except Exception as e:error=type(e).__name__
            assert (error is None)==native_ok,(row['name'],value,error)
            if not native_ok:assert error=='PySparkValueError'
            else:
                measured=len(actual) if row['data_type']=='VARCHAR' and actual is not None else actual
                expected=value is None or row['kwargs']['min_value']<=measured<=row['kwargs']['max_value'];assert success==expected,(row['name'],value,success,expected)
            results.append({'value':value,'nativeValue':str(actual) if isinstance(actual,Decimal) else actual,'carrierAccepted':native_ok,'validationSuccess':success,'errorType':error});checks+=1
        observations.append({'case':row['name'],'source':source,'normalized':normalized,'gxRule':gx_rule,'sparkSchema':schema.jsonValue(),'values':results})
    # A tolerated failure proportion is not an unconditional core bound.
    from pyspark.sql.types import StructType,StructField,IntegerType
    frame=spark.createDataFrame([{'value':127},{'value':128}],StructType([StructField('value',IntegerType(),True)]));batch=batchdef.get_batch(batch_parameters={'dataframe':frame});controls=[]
    for mostly,expected in [(1,False),(0.5,True)]:
        success=batch.validate(gx.expectations.ExpectColumnValuesToBeBetween(column='value',min_value=-128,max_value=127,mostly=mostly)).to_json_dict()['success'];assert success==expected;controls.append({'mostly':mostly,'success':success})
    paths=[capture_path,projection_proof,*manifests,Path(__file__),root/'src/tablespec/models/umf.py',root/'src/tablespec/schemas/umf.schema.json',root/'src/tablespec/type_mappings.py',Path('native/tablespec/cardinality-runtime/generators.py')]
    evidence={'scope':'Emitted TableSpec unified suite rules evaluated with GX on the native-generated Spark carrier; no whole ingestion or write-blocking guarantee','nativeVersion':m['commit'],'versions':{'pydantic':pydantic.__version__,'spark':spark.version,'greatExpectations':gx.__version__,'jsonschema':importlib.metadata.version('jsonschema'),'java':spark.sparkContext._jvm.java.lang.System.getProperty('java.version')},'cases':observations,'valueChecks':checks,'toleranceControls':controls,'limits':['GX bounds skip null values; they do not establish nullability or required presence.','Native INTEGER carrier is signed 32-bit; out-of-carrier values are rejected before GX.','Mostly below 1 can accept out-of-bound values and cannot supply an unconditional core bound.','Model metadata retains blocking/stage, but the whole TableSpec pipeline and write policy are not executed here.','Only well-formed Unicode scalar strings and the recorded integer values are exercised.'],'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
    Path('fixtures/validation/facets-tablespec-projection-values-native.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'suiteCases':len(observations),'valueChecks':checks,'toleranceControls':len(controls)}))
finally:spark.stop()
