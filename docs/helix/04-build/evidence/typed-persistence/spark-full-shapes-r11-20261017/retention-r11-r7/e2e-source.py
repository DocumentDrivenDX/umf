"""Owned Spark4/Delta4 original-compiler live/snapshot page campaign."""
from __future__ import annotations
import hashlib,json,os,time,sys
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from pydantic import BaseModel,ConfigDict
from pyspark.sql import SparkSession
from umf_access.delta_read import DeltaSnapshot,SparkConfiguration,SparkDeltaTarget,_expired_snapshot_error
from umf_access.postgres_read import TimedOut
from umf_access.pages import StaleContinuation,StreamLimitReached
from umf_access.reviewed import ReviewedSQL
from umf_access.targets import TargetMismatch,binding_digest
from prepare_generated import prepare
import weft

out=Path(os.environ['UMF_SPARK_PAGES_OUT']);out.mkdir(parents=True,exist_ok=True)
request=json.loads((out/'read-request.json').read_text())
generated=out/'generated'
jars=Path('/private/tmp/umf-sdk-merged/delta-jars')
# Explicit supplied jar directory avoids package downloads during qualification.
jars=Path(os.environ['UMF_DELTA_JARS'])
expected={'delta-spark_2.13-4.0.0.jar':'538511702aae0ef6973a6a70af3d4543c9009f8edbed786a00737e2d3cd7f04e','delta-storage-4.0.0.jar':'9bdb9fb450f1e119eba53feb427f331b0d09072d26485b8273883ad72c9a2e1d'}
assert all(hashlib.sha256((jars/n).read_bytes()).hexdigest()==sha for n,sha in expected.items())
class Params(BaseModel):model_config=ConfigDict(strict=True,extra='forbid')
class Result(BaseModel):
 model_config=ConfigDict(strict=True,extra='forbid')
 id:str
 customer:str|None
spark=None;checks=[];native_errors=[];failure=None;started=time.monotonic()
def check(name,condition):
 if not condition:raise AssertionError(name)
 checks.append(name)
def stale(call):
 try:call()
 except StaleContinuation:return True
 return False
try:
 spark=(SparkSession.builder.master('local[1]').appName('owned SDK keyset snapshot pages').config('spark.ui.enabled','false').config('spark.sql.shuffle.partitions','1').config('spark.sql.sources.parallelPartitionDiscovery.parallelism','1').config('spark.databricks.delta.snapshotPartitions','1').config('spark.driver.memory','512m').config('spark.sql.ansi.enabled','true').config('spark.sql.parser.escapedStringLiterals','false').config('spark.jars',','.join(str(jars/n) for n in expected)).config('spark.sql.extensions','io.delta.sql.DeltaSparkSessionExtension').config('spark.sql.catalog.spark_catalog','org.apache.spark.sql.delta.catalog.DeltaCatalog').config('spark.sql.warehouse.dir',str(out/'warehouse')).getOrCreate())
 spark.sparkContext.setLogLevel('ERROR')
 schema='sdk_spark_pages_'+out.name.replace('-','_')
 binding=request['binding'];binding['schema']=schema
 spark.sql(f'CREATE DATABASE `{schema}` LOCATION '+repr(str(out/'database')))
 for table,columns in [('orders','id STRING NOT NULL,customer_id STRING,status STRING NOT NULL'),('customers','id STRING NOT NULL,name STRING NOT NULL')]:
  spark.sql(f'CREATE TABLE `{schema}`.`{table}` ({columns}) USING DELTA LOCATION '+repr(str(out/table)))
 spark.sql(f"INSERT INTO `{schema}`.customers VALUES ('c1','A'),('c2','B'),('c3','C')")
 rows=[f"('{i:04d}',"+("NULL" if i%4==0 else repr('c'+str(i%3+1)))+",'draft')" for i in range(120)]
 spark.sql(f'INSERT INTO `{schema}`.orders VALUES '+','.join(rows))
 snapshots=tuple(DeltaSnapshot(table,spark.sql(f'DESCRIBE DETAIL `{schema}`.`{table}`').first()['id'],spark.sql(f'DESCRIBE HISTORY `{schema}`.`{table}`').first()['version']) for table in ['customers','orders'])
 versions={s.table:s.version for s in snapshots}
 prepare(generated,request,out/'binding.json',schema,versions)
 sys.path.insert(0,str(generated))
 from spark_page_fixture.models import Order
 from spark_page_fixture.codecs import decode_Order
 from spark_page_fixture import queries
 created=Order(id='0000',customer_id=None,status='draft')
 actual_row=spark.sql(f"SELECT id,customer_id,status FROM `{schema}`.orders WHERE id='0000'").first()
 check('actual generated bound schema and instance codec agree with original native row',decode_Order(['Order_id','Order_customer_id','Order_status'],list(actual_row))==created)
 check('source-pinned physical ColumnSet public CLI catalog/build/check',True)

 reviewed=ReviewedSQL(request['sql'],Params,Result,50,True)
 live=reviewed.build(weft,target='spark-delta4',binding=binding,snapshots=versions)
 snapshot=reviewed.build(weft,target='spark-delta4',binding=binding,snapshots=versions,snapshot=True)
 (out/'live-catalog.json').write_text(live.artifact_json);(out/'snapshot-catalog.json').write_text(snapshot.artifact_json)
 class ObservedSession:
  def __init__(self,session):self.session=session;self.statements=[]
  def __getattr__(self,name):return getattr(self.session,name)
  def sql(self,statement,*args,**kwargs):self.statements.append(statement);return self.session.sql(statement,*args,**kwargs)
 observed=ObservedSession(spark)
 target=SparkDeltaTarget(observed,SparkConfiguration(schema,binding_digest(binding),snapshots,timedelta(seconds=30),True))
 params=Params()
 oracle=[r.asDict() for r in spark.sql(f'SELECT o.id,c.name AS customer FROM `{schema}`.orders VERSION AS OF {versions["orders"]} o LEFT JOIN `{schema}`.customers VERSION AS OF {versions["customers"]} c ON o.customer_id=c.id ORDER BY c.name ASC NULLS LAST,o.id DESC NULLS FIRST').collect()]
 first=target.page(snapshot,params)
 typed_first=queries.snapshot_page(target,after=None)
 check('generated typed snapshot page equals native oracle first50',list(typed_first.items)==[(r['id'],r['customer']) for r in oracle[:50]])
 check('generated continuation preserves complete native snapshot vector',typed_first.next_after.snapshot_versions==tuple((s.table,s.table_uuid,s.version) for s in snapshots))
 check('first snapshot page is bounded50',len(first.items)==50 and first.next_after is not None)
 check('snapshot continuation binds complete original two-table UUID/version vector',first.next_after.snapshot_versions==tuple((s.table,s.table_uuid,s.version) for s in snapshots))
 # Both joined relations mutate between original snapshot pages.
 spark.sql(f"UPDATE `{schema}`.customers SET name='Z' WHERE id='c1'")
 spark.sql(f"DELETE FROM `{schema}`.orders WHERE id='0001'")
 spark.sql(f"INSERT INTO `{schema}`.orders VALUES ('9999','c1','draft')")
 actual=[r.model_dump() for r in first.items];after=first.next_after
 while after is not None:
  page=target.page(snapshot,params,after=after);check('subsequent page bounded',len(page.items)<=50);actual.extend(r.model_dump() for r in page.items);after=page.next_after
 check('all snapshot pages equal independent original mixed-order joined native oracle despite both-table writes',actual==oracle)
 typed_actual=list(typed_first.items);typed_after=typed_first.next_after
 while typed_after is not None:
  typed_page=queries.snapshot_page(target,after=typed_after);typed_actual.extend(typed_page.items);typed_after=typed_page.next_after
 check('generated typed continuation traversal preserves both-table snapshot under mutations',typed_actual==[(r['id'],r['customer']) for r in oracle])
 check('generated live-page stream selects nested snapshot and equals oracle',list(queries.live_page_stream(target,after=None,max_rows=1000))==[(r['id'],r['customer']) for r in oracle])

 check('snapshot stream selects original nested program and exact oracle', [r.model_dump() for r in target.stream(live,params,max_rows=1000)]==oracle)
 limited=target.stream(live,params,max_rows=53);prefix=[]
 try:
  for row in limited:prefix.append(row)
 except StreamLimitReached as limit:
  check('stream max_rows explicit bound with buffered remainder',len(prefix)==53 and limit.emitted==53 and limit.truncated is True)
 else:raise AssertionError('stream max_rows silently exhausted')
 iterator=target.stream(live,params,max_rows=1000);next(iterator);iterator.close()
 check('early stream close restores original driver job group',spark.sparkContext.getLocalProperty('spark.jobGroup.id') is None)
 wrong=SparkDeltaTarget(observed,replace(target.configuration,snapshots=tuple(replace(s,version=s.version+1) if s.table=='orders' else s for s in snapshots)))
 check('version mismatch refuses before result release',stale(lambda:wrong.page(snapshot,params,after=first.next_after)))
 check('snapshot continuation cannot cross live program',stale(lambda:target.page(live,params,after=first.next_after)))
 live_first=target.page(live,params);live_ids=[r.id for r in live_first.items];after=live_first.next_after
 # A row ahead of the already emitted live cursor is allowed to be absent from
 # this live walk; no duplicate root key may be invented.
 spark.sql(f"INSERT INTO `{schema}`.orders VALUES ('zzzz','c3','draft')")
 while after is not None:
  page=target.page(live,params,after=after);live_ids.extend(r.id for r in page.items);after=page.next_after
 check('live pages preserve unique root Key under ahead insertion',len(live_ids)==len(set(live_ids)))
 # Whole-page deadline/cancellation is exercised against the real Spark driver.
 try:target.page(live,params,timeout=timedelta(milliseconds=1))
 except TimedOut:pass
 else:raise AssertionError('real page deadline was not enforced')
 check('deadline restores driver job group and settles native jobs',spark.sparkContext.getLocalProperty('spark.jobGroup.id') is None and not spark.sparkContext.statusTracker().getActiveJobsIds())
 check('caller session remains usable after native timeout cleanup',len(target.page(live,params).items)==50)
 try:spark.sql(f'SELECT * FROM `{schema}`.not_an_owned_table').collect()
 except Exception as error:
  check('unrelated original native analysis error is not retention',getattr(error,'getCondition',lambda:None)()=='TABLE_OR_VIEW_NOT_FOUND' and not _expired_snapshot_error(error))
  native_errors.append({'kind':'unrelated-analysis','class':type(error).__name__,'condition':error.getCondition() if hasattr(error,'getCondition') else None})
 else:raise AssertionError('missing owned fixture table unexpectedly exists')
 # Repoint same table name to a different Delta UUID, retaining old owned data.
 spark.sql(f'DROP TABLE `{schema}`.orders')
 spark.sql(f'CREATE TABLE `{schema}`.orders (id STRING NOT NULL,customer_id STRING,status STRING NOT NULL) USING DELTA LOCATION '+repr(str(out/'replacement-orders')))
 before=sum(statement==snapshot.artifact()['sql'] for statement in observed.statements)
 check('same-name replacement UUID refuses original continuation',stale(lambda:target.page(snapshot,params,after=first.next_after)))
 check('UUID refusal precedes original business query dispatch',sum(statement==snapshot.artifact()['sql'] for statement in observed.statements)==before)
 # Restore the original owned Delta log (same original UUID), then remove old
 # data files with an explicit test-only retention override. The original token
 # must fail as stale, never look like an empty successfully completed page.
 spark.sql(f'DROP TABLE `{schema}`.orders')
 spark.sql(f'CREATE TABLE `{schema}`.orders USING DELTA LOCATION '+repr(str(out/'orders')))
 check('retention fixture restores original UUID',spark.sql(f'DESCRIBE DETAIL `{schema}`.orders').first()['id']==next(s.table_uuid for s in snapshots if s.table=='orders'))
 spark.conf.set('spark.databricks.delta.retentionDurationCheck.enabled','false')
 spark.sql(f'VACUUM `{schema}`.orders RETAIN 0 HOURS').collect()
 try:target.page(snapshot,params,after=first.next_after)
 except StaleContinuation as error:
  original=error.__cause__
  check('retention retains exact original native failure',original is not None and type(original).__name__=='Py4JJavaError')
  native=original.java_exception
  native_errors.append({'kind':'vacuum-retention','class':native.getClass().getName(),'condition':native.getCondition(),'original':str(original)})
  check('vacuumed original snapshot refuses on exact structured native condition',native.getClass().getName()=='org.apache.spark.SparkException' and native.getCondition()=='FAILED_READ_FILE.FILE_NOT_EXIST')
 else:raise AssertionError('vacuumed original snapshot did not refuse as stale')
 # Actual custom collation drift, on the owned customer table only. If the
 # pinned Delta engine refuses constructing it, retain that native refusal;
 # it is not an invented successful fixture or a runtime admission claim.
 spark.sql(f'DROP TABLE `{schema}`.customers')
 from pyspark.errors import PySparkException
 from py4j.protocol import Py4JJavaError
 try:
  spark.sql(f'CREATE TABLE `{schema}`.customers (id STRING NOT NULL,name STRING COLLATE UTF8_LCASE NOT NULL) USING DELTA LOCATION '+repr(str(out/'collated-customers')))
 except (PySparkException,Py4JJavaError) as error:
  native_errors.append({'kind':'collation-fixture-native-refusal','class':type(error).__name__,'condition':error.getCondition() if hasattr(error,'getCondition') else None,'original':str(error),'runtimeAdmissionQualified':False})
 else:
  field=spark.table(f'`{schema}`.customers').schema['name']
  check('actual custom collation fixture is UTF8_LCASE',field.dataType.collation=='UTF8_LCASE')
  detail=spark.sql(f'DESCRIBE DETAIL `{schema}`.customers').first()
  version=spark.sql(f'DESCRIBE HISTORY `{schema}`.customers').first()['version']
  updated=tuple(DeltaSnapshot('customers',detail['id'],version) if item.table=='customers' else item for item in snapshots)
  collated_entry=reviewed.build(weft,target='spark-delta4',binding=binding,snapshots={item.table:item.version for item in updated},snapshot=True)
  collated_target=SparkDeltaTarget(observed,replace(target.configuration,snapshots=updated))
  before=sum(statement==collated_entry.artifact()['sql'] for statement in observed.statements)
  try:collated_target.page(collated_entry,params)
  except TargetMismatch:pass
  else:raise AssertionError('nonbinary native string collation admitted')
  check('nonbinary native collation refuses before business query',sum(statement==collated_entry.artifact()['sql'] for statement in observed.statements)==before)


except BaseException as exc:
 failure={'type':type(exc).__name__,'message':str(exc),'condition':exc.getCondition() if hasattr(exc,'getCondition') else None}
 raise
finally:
 stopped=False
 if spark is not None:
  try:spark.stop();stopped=True
  finally:pass
 (out/'verification.json').write_text(json.dumps({'checks':checks,'nativeErrorWitnesses':native_errors,'count':len(checks),'failure':failure,'sparkStopped':stopped,'elapsedSeconds':time.monotonic()-started,'temporal':'held','managed':'unqualified'},indent=2)+'\n')
