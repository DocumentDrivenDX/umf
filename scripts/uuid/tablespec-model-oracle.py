"""Actual installed TableSpec model/schema/generator and Spark CSV/Parquet recovery."""
import csv,json,tempfile,hashlib,inspect,sys,subprocess,os,uuid
os.environ['PYSPARK_PYTHON']=sys.executable
os.environ['PYSPARK_DRIVER_PYTHON']=sys.executable
from pathlib import Path
import jsonschema,pyspark,tablespec.models.umf as model_module,tablespec.schemas.generators as generators,tablespec.type_mappings as mappings
from pyspark.sql import SparkSession
from pyspark.sql.types import StringType
source=Path('fixtures/validation/uuid/file-model-artifacts.json');cases=json.loads(source.read_text())['cases']
vectors=json.loads(Path('fixtures/validation/uuid/bit128-oracle.json').read_text())['cases']
root=Path(inspect.getfile(model_module)).parent.parent;schema_path=root/'schemas/umf.schema.json';schema=json.loads(schema_path.read_text());validator=jsonschema.Draft202012Validator(schema)
paths=[Path(inspect.getfile(m)) for m in [model_module,generators,mappings]]+[schema_path]
observations=[];returned=[]
with tempfile.TemporaryDirectory(prefix='umf-uuid-tablespec-') as temp:
 spark=SparkSession.builder.master('local[2]').appName('umf-uuid-model').config('spark.ui.enabled','false').config('spark.sql.warehouse.dir',str(Path(temp)/'warehouse')).config('spark.driver.bindAddress','127.0.0.1').getOrCreate()
 spark.sparkContext.setLogLevel('ERROR')
 try:
  for case in cases:
   if case['system']!='tablespec':continue
   bundle=json.loads(case['report']['candidate']['text']);spec=bundle['records'][1]
   for record in bundle['records']:
    model=model_module.UMF.model_validate(record);validator.validate(record)
    assert model_module.UMF.model_validate_json(model.model_dump_json())==model
   generated=generators.generate_pyspark_schema(spec);namespace={};exec(generated,namespace);native_schema=namespace[spec['table_name'].lower()+'_schema']
   assert all(isinstance(f.dataType,StringType) for f in native_schema)
   path=Path(temp)/(case['domain']+'.csv');rows=case['rows']
   with path.open('w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=native_schema.fieldNames());writer.writeheader();writer.writerows(rows)
   frame=spark.read.option('header',True).option('mode','FAILFAST').schema(native_schema).csv(str(path))
   observed=[r.asDict() for r in frame.collect()]
   def key(r):return json.dumps(r,sort_keys=True)
   assert sorted(map(key,observed))==sorted(map(key,rows))
   bits=lambda v: None if v is None else uuid.UUID(v).hex if case['domain']=='uuid' else v
   actual_pairs=[(bits(r['id']),bits(r['parent'])) for r in observed]
   expected_pairs=[(v['hex'],vectors[(i+1)%len(vectors)]['hex']) for i,v in enumerate(vectors)]+[(vectors[0]['hex'],None)]
   assert sorted(map(str,actual_pairs))==sorted(map(str,expected_pairs))
   stored=Path(temp)/(case['domain']+'.parquet');frame.write.mode('error').parquet(str(stored));decoded=[r.asDict() for r in spark.read.parquet(str(stored)).collect()]
   assert sorted(map(key,decoded))==sorted(map(key,rows))
   # Native strings accept malformed UUID and duplicates: residuals must remain real.
   bad=spark.createDataFrame([{'id':'malformed','parent':None},{'id':'malformed','parent':None}],schema=native_schema)
   assert bad.count()==2
   null_path=Path(temp)/(case['domain']+'-null.csv');null_path.write_text('id,parent\n,\n')
   null_rows=[r.asDict() for r in spark.read.option('header',True).schema(native_schema).csv(str(null_path)).collect()]
   assert null_rows==[{'id':None,'parent':None}]
   observations.append({'domain':case['domain'],'carrier':case['kind'],'rows':len(rows),'nativeSchema':native_schema.jsonValue(),'generatedSource':generated,'modelAndJsonSchemaAccepted':True,'csvRecovered':True,'parquetRecovered':True,'malformedAndDuplicatesAccepted':True,'csvRequirednessNotEnforced':True,'independentOracleFields':True})
   returned.append({'system':'tablespec','domain':case['domain'],'kind':case['kind'],'signed':None,'engine':'spark','rows':decoded,'invalidRows':[{'id':'malformed','parent':None},*null_rows]})
  version=spark.version
 finally:spark.stop()
result={'scope':'Installed source-bound TableSpec metadata/schema, actual generated Spark4.0.1 schema, CSV ingestion and Parquet recovery for canonical strings; grammar/uniqueness/FK remain codec/consumer obligations','spark':version,'python':sys.version,'inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sources':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'observations':observations}
Path('fixtures/validation/uuid/tablespec-model-native.json').write_text(json.dumps(result,indent=2)+'\n')
Path('fixtures/validation/uuid/tablespec-model-returned.json').write_text(json.dumps({'cases':returned})+'\n')
print({'spark':version,'cases':len(observations),'rows':sum(o['rows'] for o in observations)})
