import json,hashlib,platform,importlib.metadata as meta
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch
import tablespec.document_loader.fetch as fetch_module
import http.client
from tablespec.spark_factory import create_delta_spark_session
from tablespec.document_loader import fetch_sources,load_publication,export_bag,validate_bag,fixity_audit,publish_sources,LocalObjects,SparkMetadataSink
from tablespec.document_loader.publish import FIELDS
from tablespec.document_loader.core import LoaderError
ROOT=Path('/tmp/umf-spark-collector-qualification-081')
ROOT.mkdir(exist_ok=True)
PACK=Path('/Users/erik/.codex/worktrees/36f4/umf/spec/domain-packs/legal-supreme-court/companion.json')
INV=json.loads(Path('/tmp/umf-supreme-court-mirror/batches/0001.json').read_text())
original=load_publication(Path('/tmp/umf-supreme-court-mirror/pdf-state/0001'))['manifest']['rows']
hashes={r['id']:r['sha256'] for r in original}
INV['id']='spark-qualification-three-court-pdfs';INV['entries']=INV['entries'][:3]
for e in INV['entries']:e['expected_sha256']=hashes[e['id']]
INV['max_documents']=3
(ROOT/'inventory.json').write_text(json.dumps(INV,indent=2)+'\n')
RESULT={'started_at':datetime.now(timezone.utc).isoformat(),'python':platform.python_version(),'tablespec_package':meta.version('tablespec'),'umf_core_package':meta.version('umf-core'),'wheel_sha256':'8258bf0c129dc872e9ba4bd5aedaadd1ea909b34cb4746cfc879acd931a08a0b','umf_wheel_sha256':'b712eb6ea8cfd27694e37aaa7603c109063a3820bd11696e642300f2c26f7b84','pyspark':meta.version('pyspark'),'collector_engine':'0.0.8','companion':'1.0.0','checks':{},'scope':'local Spark driver acquisition + Delta metadata/local original-byte publication; not Databricks'}
spark=None
try:
 spark=create_delta_spark_session('umf-collector-runtime-qualification',custom_config={
  'spark.master':'local[2]','spark.driver.memory':'1g','spark.executor.memory':'1g','spark.sql.shuffle.partitions':'2','spark.default.parallelism':'2',
  'spark.sql.warehouse.dir':str(ROOT/'warehouse'),'spark.driver.bindAddress':'127.0.0.1','spark.driver.host':'127.0.0.1',
  'spark.jars':'/tmp/umf-qual-delta-spark-4.0.0.jar,/tmp/umf-qual-delta-storage-4.0.0.jar'})
 RESULT['spark_version']=spark.version
 RESULT['java_version']=spark.sparkContext._jvm.java.lang.System.getProperty('java.version')
 print('Spark session created',spark.version,flush=True)
 receipt=fetch_sources(PACK,ROOT/'inventory.json',ROOT/'state',rights='local-use')
 assert receipt['status']=='complete',receipt
 RESULT['checks']['driver_acquisition']=receipt
 pub=load_publication(ROOT/'state');assert all(r['sha256']==hashes[r['id']] for r in pub['manifest']['rows'])
 RESULT['checks']['original_hash_parity']=True
 refresh=fetch_sources(PACK,ROOT/'inventory.json',ROOT/'state',mode='refresh',rights='local-use')
 assert refresh['status']=='complete' and all(not i['new_revision'] for i in refresh['items']),refresh
 RESULT['checks']['unchanged_refresh']=refresh
 replay=fetch_sources(PACK,None,ROOT/'state',mode='replay',rights='local-use');assert replay['status']=='complete'
 RESULT['checks']['replay']=True
 handoff=ROOT/'handoff'
 if not handoff.exists():export_bag(ROOT/'state',handoff)
 checked=validate_bag(handoff);RESULT['checks']['fixity_audit']=fixity_audit(checked)
 spark.sql('CREATE DATABASE IF NOT EXISTS umf_collector_qualification')
 target='spark_catalog.umf_collector_qualification.documents'
 sink=SparkMetadataSink(spark,target);objects=LocalObjects(ROOT/'published-objects')
 with patch.object(fetch_module,'https_response',side_effect=AssertionError('SOURCE_HTTP_FORBIDDEN')), patch.object(http.client,'HTTPSConnection',side_effect=AssertionError('PUBLIC_HTTPS_FORBIDDEN')):
  first=publish_sources(checked,sink,objects,mode='replace')
 assert first['rows']==3 and spark.table(target).count()==3
 RESULT['checks']['native_publish_readback']=first
 with patch.object(fetch_module,'https_response',side_effect=AssertionError('SOURCE_HTTP_FORBIDDEN')), patch.object(http.client,'HTTPSConnection',side_effect=AssertionError('PUBLIC_HTTPS_FORBIDDEN')):
  second=publish_sources(checked,sink,objects,mode='merge')
 assert second['rows']==3 and spark.table(target).count()==3
 RESULT['checks']['merge_idempotence']=True
 RESULT['checks']['publish_with_python_source_https_forbidden']=True
 before_rows=[r.asDict(recursive=True) for r in spark.table(target).collect()]
 before_objects={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'published-objects').iterdir() if not p.name.startswith('.')}
 RESULT['target']=target
 RESULT['object_root']=str(ROOT/'published-objects')
 # A real schema mismatch must refuse without changing the valid table.
 bad='spark_catalog.umf_collector_qualification.wrong_schema'
 spark.sql(f'CREATE TABLE IF NOT EXISTS {bad} (wrong STRING) USING DELTA')
 try:
  publish_sources(checked,SparkMetadataSink(spark,bad),objects,mode='merge')
  raise AssertionError('schema mismatch accepted')
 except LoaderError as error:
  assert str(error)=='TARGET_SCHEMA'
 RESULT['checks']['schema_refusal']=True
 assert spark.table(target).count()==3
 assert sorted(before_rows,key=lambda r:r['id'])==sorted([r.asDict(recursive=True) for r in spark.table(target).collect()],key=lambda r:r['id'])
 assert before_objects=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'published-objects').iterdir() if not p.name.startswith('.')}
 RESULT['checks']['schema_refusal_preserves_valid_rows_and_objects']=True
 RESULT['checks']['source_hashes']={e['id']:hashes[e['id']] for e in INV['entries']}
 RESULT['status']='complete'
except Exception as error:
 RESULT['status']='failed';RESULT['error']=str(error);RESULT['error_type']=type(error).__name__
finally:
 RESULT['finished_at']=datetime.now(timezone.utc).isoformat()
 (ROOT/'result.json').write_text(json.dumps(RESULT,indent=2)+'\n')
 print(json.dumps({'status':RESULT['status'],'checks':list(RESULT['checks']),'error':RESULT.get('error')}),flush=True)
 if spark is not None:spark.stop()
if RESULT['status']!='complete':raise SystemExit(1)
