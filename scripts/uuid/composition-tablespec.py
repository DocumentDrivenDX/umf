import csv,json,tempfile,hashlib,inspect,sys,os
from pathlib import Path
os.environ['PYSPARK_PYTHON']=sys.executable;os.environ['PYSPARK_DRIVER_PYTHON']=sys.executable
import jsonschema,tablespec.models.umf as model,tablespec.schemas.generators as generator,tablespec.type_mappings as mappings
from pyspark.sql import SparkSession
source=Path('fixtures/validation/uuid/composition-artifacts.json');cases=json.loads(source.read_text())['cases'];schema_path=Path(inspect.getfile(model)).parent.parent/'schemas/umf.schema.json';validator=jsonschema.Draft202012Validator(json.loads(schema_path.read_text()));observations=[]
with tempfile.TemporaryDirectory(prefix='umf-composition-spark-') as temp:
 spark=SparkSession.builder.master('local[2]').appName('umf-composition').config('spark.ui.enabled','false').config('spark.sql.warehouse.dir',str(Path(temp)/'warehouse')).config('spark.driver.bindAddress','127.0.0.1').getOrCreate();spark.sparkContext.setLogLevel('ERROR')
 try:
  for case in cases:
   if case['system']!='tablespec':continue
   records=[]
   for i,(spec,pop) in enumerate(zip(json.loads(case['report']['candidate']['text'])['records'],case['records'])):
    model.UMF.model_validate(spec);validator.validate(spec);ns={};generated=generator.generate_pyspark_schema(spec);exec(generated,ns);native_schema=ns[spec['table_name'].lower()+'_schema'];path=Path(temp)/(case['stage']+str(i)+'.csv')
    with path.open('w',newline='') as f:
     writer=csv.DictWriter(f,fieldnames=native_schema.fieldNames());writer.writeheader();writer.writerows(pop['rows'])
    frame=spark.read.option('header',True).option('escape','"').option('mode','FAILFAST').schema(native_schema).csv(str(path));stored=Path(temp)/(case['stage']+str(i)+'.parquet');frame.write.mode('error').parquet(str(stored));rows=[r.asDict() for r in spark.read.parquet(str(stored)).collect()]
    assert sorted(map(lambda r:json.dumps(r,sort_keys=True),rows))==sorted(map(lambda r:json.dumps(r,sort_keys=True),pop['rows']))
    for row in rows:
     if pop['record']['element']=='child':
      assert row['count']=='-9223372036854775808' and row['price']=='1234567890123456.7890' and row['label']=="雪 O'Brien"
      if case['stage']!='mixed':
       nested=json.loads(row['itemMap']);assert nested['empty']==[] and nested['missing'] is None and nested['values'][1]==nested['values'][2]=='00112233-4455-6677-8899-aabbccddeeff'
    invalid=[]
    if pop['record']['element']=='child':
     bad=dict(rows[0]);bad['count']='not-an-integer';badpath=Path(temp)/(case['stage']+'-invalid.parquet');spark.createDataFrame([bad],native_schema).write.mode('error').parquet(str(badpath));invalid=[r.asDict() for r in spark.read.parquet(str(badpath)).collect()]
    records.append({'record':pop['record'],'rows':rows,'invalidRows':invalid,'generatedSource':generated,'schema':native_schema.jsonValue()})
   observations.append({'system':'tablespec','stage':case['stage'],'records':records,'independentScalarAndNestedUuidChecks':True})
  version=spark.version
 finally:spark.stop()
paths=[Path(inspect.getfile(m)) for m in [model,generator,mappings]]+[schema_path]
Path('fixtures/validation/uuid/composition-tablespec.json').write_text(json.dumps({'spark':version,'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sources':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'observations':observations},indent=2)+'\n');print({'stages':len(observations),'spark':version})
