"""Arrow-origin schema corpus with independently qualified Python/JVM recovery."""
import json,os,hashlib,sys
from pathlib import Path
import pyarrow as pa
from pyspark.sql.pandas.types import from_arrow_schema
from pyspark.java_gateway import launch_gateway
assert pa.__version__=='21.0.0'
base=Path('fixtures/projections/arrow-spark');base.mkdir(exist_ok=True)
types=[('fixed-binary',pa.binary(8)),('zero-binary',pa.binary(0)),('large-list',pa.large_list(pa.field('item',pa.int32(),False))),('fixed-list',pa.list_(pa.field('item',pa.int32(),False),3)),('zero-list',pa.list_(pa.int32(),0)),('dictionary',pa.dictionary(pa.int8(),pa.string(),ordered=True)),('dictionary-list',pa.dictionary(pa.int16(),pa.list_(pa.int64()))),('uint64',pa.uint64()),('float16',pa.float16()),('date64',pa.date64()),('time32',pa.time32('s')),('time64',pa.time64('ns')),('decimal32',pa.decimal32(9,2)),('decimal64',pa.decimal64(18,4)),('decimal256-small',pa.decimal256(38,8)),('decimal256-large',pa.decimal256(76,10)),('decimal-negative',pa.decimal128(10,-2)),('list-view',pa.list_view(pa.int32())),('run-end',pa.run_end_encoded(pa.int16(),pa.string())),('sorted-map',pa.map_(pa.string(),pa.int32(),keys_sorted=True)),('union',pa.union([pa.field('a',pa.int32()),pa.field('b',pa.string())],mode='dense'))]
for unit in ['s','ms','us','ns']:
 types.extend([('timestamp-'+unit,pa.timestamp(unit)),('zoned-'+unit,pa.timestamp(unit,'America/New_York')),('duration-'+unit,pa.duration(unit))])
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();rows=[]
try:
 for name,kind in types:
  schema=pa.schema([pa.field('value',kind,metadata={b'comment':b'origin'})],metadata={b'owner':b'example'});raw=schema.serialize().to_pybytes();(base/(name+'.arrow')).write_bytes(raw);row={'id':name,'sha256':hashlib.sha256(raw).hexdigest(),'description':str(schema),'recovery':[]}
  for prefer in [False,True]:
   r={'preferTimestampNtz':prefer}
   try:
    spark=from_arrow_schema(schema,prefer_timestamp_ntz=prefer);r.update(python='accepted',schema=spark.jsonValue())
    try:r.update(jvm='accepted',jvmSchema=json.loads(g.jvm.org.apache.spark.sql.types.DataType.fromJson(spark.json()).json()))
    except Exception:r['jvm']='rejected'
   except Exception:r.update(python='rejected',jvm='not-run')
   if '--verify' in sys.argv and r['jvm']=='accepted':
    text=(base/(name+'.'+str(int(prefer))+'.spark.json')).read_text();assert json.loads(text)==r['schema']
    assert json.loads(g.jvm.org.apache.spark.sql.types.DataType.fromJson(text).json())==r['jvmSchema']
   row['recovery'].append(r)
  rows.append(row)
finally:
 g.shutdown()
 if g.proc:g.proc.terminate();g.proc.wait(timeout=10)
assert len(rows)==33
python_rejected={'uint64','float16','date64','time32','time64','list-view','run-end','union'}
for row in rows:
 for r in row['recovery']:
  assert r['python']==('rejected' if row['id'] in python_rejected else 'accepted')
  assert r['jvm']==('not-run' if row['id'] in python_rejected else 'rejected' if row['id'] in {'decimal256-large','decimal-negative'} else 'accepted')
assert sum(r['jvm']=='accepted' for row in rows for r in row['recovery'])==46
report={'pyarrow':pa.__version__,'spark':'4.0.1','cases':len(rows),'results':rows};(base/'native-results.json').write_text(json.dumps(report,indent=2)+'\n');print([(r['id'],r['recovery'][0]['python'],r['recovery'][0]['jvm']) for r in rows])

if '--verify' in sys.argv:(base/'oracle-results.json').write_text(json.dumps({'emittedTargets':46,'jvmComparisons':46,'nativeRecoveryComparisons':46},indent=2)+'\n')
