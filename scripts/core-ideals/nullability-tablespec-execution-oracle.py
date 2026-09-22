"""Run native TableSpec-generated availability expectations on local Spark rows."""
import os,sys,json,hashlib,runpy
from pathlib import Path
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');os.environ['PYSPARK_PYTHON']=sys.executable
import great_expectations as gx
from great_expectations.data_context.types.base import DataContextConfig,InMemoryStoreBackendDefaults
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType,StructField,StringType
import tablespec.format_utils
root=Path('native/tablespec/nullability-runtime');manifest=json.loads((root/'sources.json').read_text())
for f in manifest['files']:assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
assert Path(tablespec.format_utils.__file__).read_bytes()==(root/'format_utils.py').read_bytes()
generator=runpy.run_path(str(root/'gx_baseline.py'))['BaselineExpectationGenerator']()
corpus_path=Path('fixtures/validation/nullability-tablespec-projection.json');corpus=json.loads(corpus_path.read_text())['rows']
cases=[]
for ideal,context,profile in [('required',None,'runtime-model'),('absent-allowed',None,'runtime-model'),('unspecified',None,'runtime-model'),('required','MD','checked-schema'),('absent-allowed','MD','checked-schema')]:
    row=next(r for r in corpus if r['variant']=='clean' and r['ideal']==ideal and r['request']['context']==context and r['request']['profile']==profile and r['request']['carrier']=='null-value' and r['request']['mode']=='strict')
    column=json.loads(row['nativeText'])['columns'][0]
    cases.append({'name':ideal+('-MD' if context else '-global'),'column':column,'contextColumn':'LOB' if context else None,'expectedUnexpected':2 if ideal=='required' and context else 4 if ideal=='required' else None,'expectedElements':4 if context else 7,'source':'generated-projection'})
# Native consumer behavior controls: routing and normalization are separate execution choices.
cases.extend([
 {'name':'context-without-routing','column':{'name':'value','data_type':'VARCHAR','nullable':{'MD':False,'MP':True}},'contextColumn':None,'expectedUnexpected':4,'expectedElements':7,'source':'native-control'},
 {'name':'null-context-raw','column':{'name':'value','data_type':'VARCHAR','nullable':{'MD':None}},'contextColumn':'LOB','expectedUnexpected':2,'expectedElements':4,'source':'native-control'},
 {'name':'null-context-normalized','column':{'name':'value','data_type':'VARCHAR','nullable':{}},'contextColumn':'LOB','expectedUnexpected':None,'expectedElements':4,'source':'native-control'},
 {'name':'quoted-context','column':{'name':'value','data_type':'VARCHAR','nullable':{"O'Reilly":False}},'contextColumn':'LOB','expectedError':True,'source':'native-control'},
])
cases.append({**cases[0],'name':'required-all-present','presentOnly':True,'expectedUnexpected':0,'expectedElements':3})
def exception_messages(value):
    if isinstance(value,dict):
        own=[value.get('exception_message','')] if value.get('raised_exception') else []
        return own+[message for child in value.values() for message in exception_messages(child)]
    if isinstance(value,list):return [message for child in value for message in exception_messages(child)]
    return []
rows=[{'LOB':'MD','value':None},{'LOB':'MD'},{'LOB':'MD','value':''},{'LOB':'MD','value':'null'},{'LOB':'MP','value':None},{'LOB':'MP','value':'x'},{'value':None}]
spark=SparkSession.builder.master('local[1]').appName('umf-tablespec-availability').config('spark.ui.enabled','false').config('spark.driver.bindAddress','127.0.0.1').config('spark.sql.shuffle.partitions','1').config('spark.ui.showConsoleProgress','false').getOrCreate()
spark.sparkContext.setLogLevel('ERROR');results=[]
try:
    frame=spark.createDataFrame(rows,StructType([StructField('LOB',StringType(),True),StructField('value',StringType(),True)]))
    normalized=[r.asDict() for r in frame.collect()];assert normalized[0]==normalized[1]
    context=gx.get_context(mode='ephemeral',project_config=DataContextConfig(config_version=4,analytics_enabled=False,store_backend_defaults=InMemoryStoreBackendDefaults(),progress_bars={'globally':False}))
    datasource=context.data_sources.add_spark(name='local');asset=datasource.add_dataframe_asset(name='rows');definition=asset.add_batch_definition_whole_dataframe('rows');batch=definition.get_batch(batch_parameters={'dataframe':frame})
    for case in cases:
        rules=[r for r in generator.generate_baseline_column_expectations(case['column'],context_column=case['contextColumn']) if r['type']=='expect_column_values_to_not_be_null']
        observation={'name':case['name'],'source':case['source'],'column':case['column'],'contextColumn':case['contextColumn'],'rules':rules}
        if case.get('expectedUnexpected') is None and not case.get('expectedError'):
            assert not rules;observation['outcome']='no-availability-constraint'
        else:
            assert len(rules)==1;kwargs=rules[0]['kwargs'];error=None;result=None;messages=[]
            try:
                active_batch=definition.get_batch(batch_parameters={'dataframe':frame.filter('value IS NOT NULL')}) if case.get('presentOnly') else batch
                result=active_batch.validate(gx.expectations.ExpectColumnValuesToNotBeNull(**kwargs)).to_json_dict()
                messages=exception_messages(result['exception_info'])
                if messages:error='native-metric-exception'
            except Exception as e:error=type(e).__name__;messages=[str(e)]
            if case.get('expectedError'):
                assert error is not None and any('PARSE_SYNTAX_ERROR' in m for m in messages),(kwargs,result,error);observation.update(outcome='native-refusal',error='PARSE_SYNTAX_ERROR')
            else:
                assert error is None,(case['name'],error,result)
                assert result['success'] is (case['expectedUnexpected']==0) and result['result']['unexpected_count']==case['expectedUnexpected'] and result['result']['element_count']==case['expectedElements'],(case,result)
                observation.update(outcome='executed',unexpectedCount=result['result']['unexpected_count'],elementCount=result['result']['element_count'])
        results.append(observation)
    result={'scope':'Only native-generated not-null expectations on explicit Spark string/null rows; routing and raw/model normalization remain separate bindings; no whole pipeline equivalence','nativeVersion':manifest['commit'],'greatExpectations':gx.__version__,'spark':spark.version,'java':spark.sparkContext._jvm.java.lang.System.getProperty('java.version'),'rows':rows,'sparkRows':normalized,'observations':results,'limits':['Omitted value members become Spark null under the explicit schema; this is not a general JSON omission/null equivalence.','No availability rule is generated for absent-allowed/unspecified; this does not validate unrelated constraints.','Without a routing column, native mixed-context generation applies the most restrictive constraint globally.','Raw null context and normalized empty map produce different native rules.','The pinned generator does not escape quoted context values for Spark SQL; the native engine refuses that rule.','String row-condition API is deprecated in GX 1.15.1; later GX versions are not claimed.'],'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [corpus_path,root/'sources.json',Path(__file__)]}}
    Path('fixtures/validation/nullability-tablespec-execution-native.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'cases':len(results),'executed':sum(r['outcome']=='executed' for r in results),'noConstraint':sum(r['outcome']=='no-availability-constraint' for r in results),'nativeRefusals':sum(r['outcome']=='native-refusal' for r in results)}))
finally:spark.stop()
