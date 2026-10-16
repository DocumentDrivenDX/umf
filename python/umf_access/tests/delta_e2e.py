"""Owned actual Spark4/Delta4: CLI catalog -> public typed snapshot reads."""
import json,os,sys,tempfile,subprocess,hashlib
from pathlib import Path
from datetime import timedelta
from dataclasses import replace
root=Path(__file__).resolve().parents[3];generated=Path(os.environ['UMF_DELTA_GENERATED_ROOT']);sys.path.insert(0,str(generated))
from pyspark.sql import SparkSession
from umf_access.delta_read import SparkDeltaTarget,SparkConfiguration,DeltaSnapshot
from umf_access.targets import binding_digest,TargetMismatch
jars=Path(os.environ['UMF_DELTA_JARS']);expected={'delta-spark_2.13-4.0.0.jar':'538511702aae0ef6973a6a70af3d4543c9009f8edbed786a00737e2d3cd7f04e','delta-storage-4.0.0.jar':'9bdb9fb450f1e119eba53feb427f331b0d09072d26485b8273883ad72c9a2e1d'}
assert all(hashlib.sha256((jars/n).read_bytes()).hexdigest()==sha for n,sha in expected.items())
work=Path(tempfile.mkdtemp(prefix='umf-sdk-delta4-',dir='/private/tmp'));cases=[]
spark=(SparkSession.builder.master('local[1]').appName('UMF actual typed SDK Delta E2E')
 .config('spark.ui.enabled','false').config('spark.sql.shuffle.partitions','1').config('spark.databricks.delta.snapshotPartitions','1')
 .config('spark.driver.memory','512m').config('spark.sql.ansi.enabled','true').config('spark.sql.parser.escapedStringLiterals','false')
 .config('spark.jars',','.join(str(jars/n) for n in expected)).config('spark.sql.extensions','io.delta.sql.DeltaSparkSessionExtension')
 .config('spark.sql.catalog.spark_catalog','org.apache.spark.sql.delta.catalog.DeltaCatalog').config('spark.sql.warehouse.dir',str(work/'warehouse')).getOrCreate())
spark.sparkContext.setLogLevel('ERROR')
try:
 spark.sql("CREATE DATABASE sdk_spark LOCATION '"+str(work/'database')+"'")
 spark.sql("CREATE TABLE sdk_spark.orders (id STRING NOT NULL,status STRING NOT NULL) USING DELTA LOCATION '"+str(work/'orders')+"'")
 spark.sql("INSERT INTO sdk_spark.orders VALUES ('a','draft'),('b','approved'),('c','draft')")
 detail=spark.sql('DESCRIBE DETAIL sdk_spark.orders').first();version=spark.sql('DESCRIBE HISTORY sdk_spark.orders').first()['version']
 request=json.loads((root/'fixtures/access/native-actions/request.json').read_text());binding=request['binding'];binding['schema']='sdk_spark'
 (generated/'delta_declarations.py').write_text('from umf_access import query,Param\nfrom native_sales.models import Order\n@query\ndef selected(status:Param[str]):return Order.objects.filter(Order.c.status==status).order_by(Order.c.id.asc()).limit(10).all()\n')
 config={'package':'native_sales','modules':['delta_declarations'],'targets':[{'id':'owned','kind':'spark-delta','backendId':'weft-databricks','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':binding,'snapshots':{'orders':version},'platform':[{'name':'spark','versions':['4.0.1']},{'name':'delta','versions':['4.0.0']}]}]}
 (generated/'config.json').write_text(json.dumps(config))
 for extra in ([],['--check']):
  result=subprocess.run([sys.executable,'-B','-m','umf_access.build.catalog','catalog','--root',str(generated),'--config',str(generated/'config.json'),*extra],capture_output=True,text=True)
  assert result.returncode==0,result.stdout+result.stderr
 from native_sales import queries
 configuration=SparkConfiguration('sdk_spark',binding_digest(binding),(DeltaSnapshot('orders',detail['id'],version),),timedelta(seconds=30),True)
 entries=tuple(v.entry for v in queries._Q0.variants)
 target=SparkDeltaTarget(spark,configuration,entries);target.verify()
 assert [row.id for row in queries.selected(target,status='draft')]==['a','c']
 cases.append('public schema generation, CLI catalog/check and actual native filtered typed read')
 spark.sql("UPDATE sdk_spark.orders SET status='approved' WHERE id='a'")
 assert [row.id for row in queries.selected(target,status='draft')]==['a','c']
 cases.append('original compiler VERSION AS OF program preserves pinned snapshot after a real Delta update')
 assert queries.selected(target,status="draft' OR true--")==[]
 cases.append('query arguments remain native bound parameters')
 wrong=SparkDeltaTarget(spark,replace(configuration,snapshots=(DeltaSnapshot('orders','foreign',version),)),entries)
 try:queries.selected(wrong,status='draft')
 except TargetMismatch:pass
 else:raise AssertionError('foreign native table UUID accepted')
 cases.append('wrong table UUID refuses before user data dispatch')
 spark.conf.set('spark.sql.ansi.enabled','false')
 try:queries.selected(target,status='draft')
 except TargetMismatch:pass
 else:raise AssertionError('native profile drift accepted')
 spark.conf.set('spark.sql.ansi.enabled','true')
 cases.append('native SQL profile drift refuses')
 spark.sql("INSERT INTO sdk_spark.orders VALUES ('c','draft')")
 duplicate_version=spark.sql('DESCRIBE HISTORY sdk_spark.orders').first()['version']
 # Rebuild with the actual later snapshot; duplicate detection must precede
 # result release even though Delta's primary keys are informational.
 from umf_access.reviewed import ReviewedSQL
 duplicate_entry=ReviewedSQL('SELECT o.id AS id, o.status AS status FROM sales.order AS o WHERE o.status = :status ORDER BY o.id ASC',entries[0].parameters,entries[0].result,10).build(__import__('weft'),target='spark-delta4',binding=binding,snapshots={'orders':duplicate_version})
 duplicate_target=SparkDeltaTarget(spark,replace(configuration,snapshots=(DeltaSnapshot('orders',detail['id'],duplicate_version),)))
 try:duplicate_target.read(duplicate_entry,entries[0].parameters(status='draft'))
 except TargetMismatch:pass
 else:raise AssertionError('duplicate complete Key silently accepted')
 cases.append('actual duplicate Delta Keys refuse through original compiler integrity statement')
 print(json.dumps({'status':'pass' ,'cases':cases,'spark':spark.version,'delta':'4.0.0','jars':expected,'temporal':'HELD','scope':'owned local single-tenant STRING/BOOLEAN snapshot read profile; Unity Catalog service unqualified'},indent=2))
finally:spark.stop();print('ownedSparkStopped=true')
