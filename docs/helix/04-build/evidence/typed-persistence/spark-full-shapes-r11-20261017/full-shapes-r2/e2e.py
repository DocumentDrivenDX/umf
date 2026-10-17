"""Actual Spark4/Delta4 full source-bound non-temporal projection campaign."""
from __future__ import annotations
import hashlib,json,os,sys,time
from dataclasses import replace
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from pydantic import BaseModel,ConfigDict,create_model
from pyspark.sql import SparkSession
from umf_access.delta_read import DeltaSnapshot,SparkConfiguration,SparkDeltaTarget
from umf_access.pages import StaleContinuation,StreamLimitReached
from umf_access.reviewed import ReviewedSQL,ReadBuildError
from umf_access.targets import binding_digest
from umf_access.types import Vector
from umf_access.values import ValueRuleError
from prepare_generated import prepare
import weft
root=Path(__file__).parent
request=json.loads((root/'read-request.json').read_text())
class Params(BaseModel):model_config=ConfigDict(strict=True,extra='forbid')
class Result(BaseModel):
 model_config=ConfigDict(strict=True,extra='forbid')
 id:str
 customer:str|None
 tiny:int
 small:int
 count:int
 big:int
 amount:Decimal
 payload:bytes
 embedding:Vector
spark=None;checks=[];failure=None;started=time.monotonic()
def check(name,condition):
 if not condition:raise AssertionError(name)
 checks.append(name)
def bounded(stream,maximum,truncated,label):
 result=[]
 try:
  for item in stream:result.append(item)
 except StreamLimitReached as limit:
  check(label+' explicit limit custody',limit.max_rows==maximum and limit.emitted==maximum and limit.truncated is truncated)
  return result
 raise AssertionError(label+' silently exhausted')
def normalized(row):
 d=row.asDict();d['payload']=bytes(d['payload']);d['embedding']=tuple(d['embedding']);return d
try:
 jars=Path(os.environ['UMF_DELTA_JARS']);jar_names=['delta-spark_2.13-4.0.0.jar','delta-storage-4.0.0.jar']
 expected_jars=['538511702aae0ef6973a6a70af3d4543c9009f8edbed786a00737e2d3cd7f04e','9bdb9fb450f1e119eba53feb427f331b0d09072d26485b8273883ad72c9a2e1d']
 assert all(hashlib.sha256((jars/name).read_bytes()).hexdigest()==sha for name,sha in zip(jar_names,expected_jars,strict=True))
 spark=(SparkSession.builder.master('local[1]').appName('owned SDK source-bound Spark projections').config('spark.ui.enabled','false').config('spark.sql.shuffle.partitions','1').config('spark.sql.sources.parallelPartitionDiscovery.parallelism','1').config('spark.databricks.delta.snapshotPartitions','1').config('spark.driver.memory','512m').config('spark.sql.ansi.enabled','true').config('spark.sql.parser.escapedStringLiterals','false').config('spark.jars',','.join(str(jars/n) for n in jar_names)).config('spark.sql.extensions','io.delta.sql.DeltaSparkSessionExtension').config('spark.sql.catalog.spark_catalog','org.apache.spark.sql.delta.catalog.DeltaCatalog').config('spark.sql.warehouse.dir',str(root/'warehouse')).getOrCreate());spark.sparkContext.setLogLevel('ERROR')
 schema='sdk_spark_full_shapes_'+root.name.replace('-','_');binding=request['binding'];binding['schema']=schema
 spark.sql(f'CREATE DATABASE `{schema}` LOCATION '+repr(str(root/'database')))
 spark.sql(f'CREATE TABLE `{schema}`.orders (id STRING NOT NULL,customer_id STRING,status STRING NOT NULL,tiny TINYINT NOT NULL,small SMALLINT NOT NULL,count INT NOT NULL,big BIGINT NOT NULL,amount DECIMAL(38,9) NOT NULL,payload BINARY NOT NULL,embedding ARRAY<FLOAT> NOT NULL) USING DELTA LOCATION '+repr(str(root/'orders')))
 spark.sql(f'CREATE TABLE `{schema}`.customers (id STRING NOT NULL,name STRING NOT NULL) USING DELTA LOCATION '+repr(str(root/'customers')))
 spark.sql(f"INSERT INTO `{schema}`.customers VALUES ('c1','A'),('c2','B'),('c3','C')")
 rows=[]
 for i in range(123):
  tiny=-128 if i==0 else 127 if i==1 else i-60
  small=-32768 if i==0 else 32767 if i==1 else i*200-12000
  count=-2147483648 if i==0 else 2147483647 if i==1 else 1000000000+i
  big=-9223372036854775808 if i==0 else 9223372036854775807 if i==1 else 4611686018427387904+i
  customer='NULL' if i%4==0 else repr('c'+str(i%3+1))
  rows.append(f"('{i:04d}',{customer},'draft',CAST({tiny} AS TINYINT),CAST({small} AS SMALLINT),CAST('{count}' AS INT),CAST('{big}' AS BIGINT),CAST('99999999999999999999999999999.{i%5:09d}' AS DECIMAL(38,9)),unhex('{i:02x}00ff'),array(CAST(0.5 AS FLOAT),CAST({i} AS FLOAT),CAST(-2.0 AS FLOAT)))")
 spark.sql(f'INSERT INTO `{schema}`.orders VALUES '+','.join(rows))
 snapshots=tuple(DeltaSnapshot(t,spark.sql(f'DESCRIBE DETAIL `{schema}`.`{t}`').first()['id'],spark.sql(f'DESCRIBE HISTORY `{schema}`.`{t}`').first()['version']) for t in ['customers','orders']);versions={s.table:s.version for s in snapshots}
 prepare(root/'generated',request,root/'binding.json',schema,versions);sys.path.insert(0,str(root/'generated'))
 from spark_page_fixture import queries
 from spark_page_fixture.models import Order
 from spark_page_fixture.codecs import decode_Order
 native=spark.sql(f"SELECT id,customer_id,status,tiny,small,count,big,amount,payload,embedding FROM `{schema}`.orders WHERE id='0000'").first();data=native.asDict();data['payload']=bytes(data['payload']);data['embedding']=tuple(data['embedding']);created=Order(**data)
 check('actual generated full native schema instance construction and codec',decode_Order(['Order_id','Order_customer_id','Order_status','tiny','small','count','big','amount','payload','embedding'],list(data.values()))==created)
 reviewed=ReviewedSQL(request['sql'],Params,Result,50,True)
 entry=reviewed.build(weft,target='spark-delta4',binding=binding,snapshots=versions,snapshot=True,stream_page_size=True)
 target=SparkDeltaTarget(spark,SparkConfiguration(schema,binding_digest(binding),snapshots,timedelta(seconds=30),True));params=Params();target._inventory(entry.artifact())
 oracle_sql=f'SELECT o.id,c.name AS customer,o.tiny,o.small,o.count,o.big,o.amount,o.payload,o.embedding FROM `{schema}`.orders VERSION AS OF {versions["orders"]} o LEFT JOIN `{schema}`.customers VERSION AS OF {versions["customers"]} c ON o.customer_id=c.id ORDER BY c.name ASC NULLS LAST,o.id DESC NULLS FIRST'
 oracle=[normalized(r) for r in spark.sql(oracle_sql).collect()]
 first=target.page(entry,params);actual=[r.model_dump() for r in first.items];after=first.next_after
 check('native full shape firstpage exact independent oracle',actual==oracle[:50])
 spark.sql(f"UPDATE `{schema}`.orders SET amount=CAST('9.000000001' AS DECIMAL(38,9)),payload=unhex('deadbeef'),embedding=array(CAST(1 AS FLOAT),CAST(2 AS FLOAT),CAST(3 AS FLOAT)) WHERE id='0000'")
 spark.sql(f"UPDATE `{schema}`.customers SET name='Z' WHERE id='c1'")
 while after is not None:
  page=target.page(entry,params,after=after);actual.extend(r.model_dump() for r in page.items);after=page.next_after
 check('native fullshape snapshot rows stable after bothrelation updates',actual==oracle)
 typed=queries.snapshot_page(target,after=None)
 check('generated typed fullshape snapshot public API matches exact oracle',[list(row) for row in typed.items]==[[row[name] for name in ['id','tiny','small','count','big','amount','payload','embedding']] for row in oracle[:50]])
 model_page=queries.model_page(target,after=None)
 model_expected=[{'id':row['id'],'name':row['customer'],**{name:row[name] for name in ['tiny','small','count','big','amount','payload','embedding']}} for row in oracle]
 check('generated nine-field model projection includes native joined Customer name',[row.model_dump() for row in model_page.items]==model_expected[:50])

 check('native original stream page_size7 exactoracle', [r.model_dump() for r in bounded(target.stream(entry,params,max_rows=17,page_size=7),17,True,"rawstream17")]==oracle[:17])
 check('generated typed stream page_size11 exactoracle',[list(row) for row in bounded(queries.live_page_stream(target,after=None,max_rows=25,page_size=11),25,True,'typedstream25')]==[list(row.values()) for row in oracle[:25]])
 NativeResult=create_model('NativeResult',__config__=ConfigDict(strict=True,extra='forbid'),**{name:(field.annotation,...) for name,field in Result.model_fields.items() if name!='customer'})
 root_sql='SELECT o.id, o.tiny, o.small, o.count, o.big, o.amount, o.payload, o.embedding FROM "commerce"."Order" AS o ORDER BY o.id ASC LIMIT 50'
 root_entry=ReviewedSQL(root_sql,Params,NativeResult,50).build(weft,target='spark-delta4',binding=binding,snapshots={'orders':versions['orders']})
 root_target=SparkDeltaTarget(spark,SparkConfiguration(schema,binding_digest(binding),tuple(item for item in snapshots if item.table=='orders'),timedelta(seconds=30),True))
 root_oracle=[normalized(row) for row in spark.sql(f'SELECT o.id,o.tiny,o.small,o.count,o.big,o.amount,o.payload,o.embedding FROM `{schema}`.orders VERSION AS OF {versions["orders"]} o ORDER BY o.id ASC LIMIT 50').collect()]
 check('native nonpage fixedsnapshot full projections exact independent oracle',[row.model_dump() for row in root_target.read(root_entry,params)]==root_oracle)
 numeric_order='ORDER BY o.amount ASC NULLS LAST, o.big DESC NULLS LAST, o.id ASC NULLS LAST'
 numeric_sql=request['sql'].split('ORDER BY')[0]+numeric_order+' LIMIT 50'
 numeric_entry=ReviewedSQL(numeric_sql,Params,Result,50,True).build(weft,target='spark-delta4',binding=binding,snapshots=versions,snapshot=True,stream_page_size=True)
 numeric_oracle=[normalized(row) for row in spark.sql(oracle_sql.split('ORDER BY')[0]+numeric_order).collect()]
 check('native exact Decimal38 and Bigint cursor stream equals independent oracle',[row.model_dump() for row in bounded(target.stream(numeric_entry,params,max_rows=38,page_size=7),38,True,"numericstream38")]==numeric_oracle[:38])
 check('exactfullpage limit is explicit unknown without extra fetch',[row.model_dump() for row in bounded(target.stream(entry,params,max_rows=14,page_size=7),14,None,'exactpage14')]==oracle[:14])
 check('actual native exhaustion is normal completion',[row.model_dump() for row in target.stream(entry,params,max_rows=1000,page_size=50)]==oracle)
 before_group=spark.sparkContext.getLocalProperty('spark.jobGroup.id');stream=target.stream(entry,params,max_rows=1000,page_size=7);next(stream);stream.close()
 check('native fullshape earlyclose restores job group',spark.sparkContext.getLocalProperty('spark.jobGroup.id')==before_group)
 for invalid in (0,True,51):
  try:target.stream(entry,params,max_rows=10,page_size=invalid)
  except ValueError:checks.append('invalid stream size refused '+repr(invalid))
  else:raise AssertionError('invalid stream size dispatched')
 spark.sql(f"UPDATE `{schema}`.orders SET embedding=array(CAST(1 AS FLOAT),CAST(2 AS FLOAT))")
 corrupt_snapshots=tuple(DeltaSnapshot(old.table,old.table_uuid,spark.sql(f'DESCRIBE HISTORY `{schema}`.`{old.table}`').first()['version']) for old in snapshots)
 corrupt_versions={item.table:item.version for item in corrupt_snapshots}
 corrupt_entry=reviewed.build(weft,target='spark-delta4',binding=binding,snapshots=corrupt_versions,snapshot=True,stream_page_size=True)
 corrupt_target=SparkDeltaTarget(spark,SparkConfiguration(schema,binding_digest(binding),corrupt_snapshots,timedelta(seconds=30),True))
 try:corrupt_target.page(corrupt_entry,params)
 except ValueRuleError:checks.append('actual native wrongdimension Vector refuses before result release')
 else:raise AssertionError('native wrongdimension Vector silently released')
 (root/'catalog.json').write_text(entry.artifact_json)
except BaseException as error:
 failure={'type':type(error).__name__,'message':str(error)};raise
finally:
 stopped=False
 if spark is not None:spark.stop();stopped=True
 (root/'verification.json').write_text(json.dumps({'checks':checks,'failure':failure,'sparkStopped':stopped,'elapsedSeconds':time.monotonic()-started,'temporalQualification':'held'},indent=2))
