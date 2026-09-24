"""Native reverse-schema outcomes for the entire pinned Arrow integration binary subtree."""
import json,os,hashlib,sys
from pathlib import Path
import pyarrow as pa
from pyspark.sql.pandas.types import from_arrow_schema
from pyspark.java_gateway import launch_gateway
source=Path('fixtures/arrow/upstream');base=Path('fixtures/projections/arrow-spark-upstream');base.mkdir(exist_ok=True)
manifest=json.loads((source/'manifest.json').read_text());os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();rows=[];verified=0
try:
 for entry in manifest['files']:
  name=entry['path']
  if not name.endswith(('.stream','.arrow_file')):continue
  raw=(source/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==entry['sha256'];schema=(pa.ipc.open_file if name.endswith('.arrow_file') else pa.ipc.open_stream)(raw).schema
  row={'path':name,'sha256':entry['sha256'],'recovery':[]}
  for prefer in [False,True]:
   r={'preferTimestampNtz':prefer}
   try:
    spark=from_arrow_schema(schema,prefer_timestamp_ntz=prefer);r.update(python='accepted',schema=spark.jsonValue())
    try:r.update(jvm='accepted',jvmSchema=json.loads(g.jvm.org.apache.spark.sql.types.DataType.fromJson(spark.json()).json()))
    except Exception:r['jvm']='rejected'
   except Exception as e:r.update(python='rejected',jvm='not-run',errorType=type(e).__name__)
   if '--verify' in sys.argv:
    status=json.loads((base/'results.json').read_text());match=next(x for x in status['results'] if x['path']==name and x['preferTimestampNtz']==prefer)
    if match['status']=='projected':
     assert r['jvm']=='accepted';text=(base/(name+'.'+str(int(prefer))+'.spark.json')).read_text();assert json.loads(text)==r['schema'];assert json.loads(g.jvm.org.apache.spark.sql.types.DataType.fromJson(text).json())==r['jvmSchema'];verified+=1
   row['recovery'].append(r)
  rows.append(row)
finally:
 g.shutdown()
 if g.proc:g.proc.terminate();g.proc.wait(timeout=10)
assert len(rows)==182
assert sum(r['jvm']=='accepted' for row in rows for r in row['recovery'])==236
report={'commit':manifest['commit'],'pyarrow':pa.__version__,'spark':'4.0.1','cases':len(rows),'accepted':sum(r['jvm']=='accepted' for row in rows for r in row['recovery']),'results':rows};(base/'native-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
if '--verify' in sys.argv:assert verified==216
if '--verify' in sys.argv:(base/'oracle-results.json').write_text(json.dumps({'nativeVerifiedTargets':verified},indent=2)+'\n');print({'nativeVerifiedTargets':verified})
