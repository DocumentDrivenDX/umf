import json,os,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
from deltalake import DeltaTable
from pyspark.java_gateway import launch_gateway
os.environ.setdefault('SPARK_LOCAL_IP','127.0.0.1');g=launch_gateway();j=g.jvm
base=Path('fixtures/delta/multipart');base.mkdir(parents=True,exist_ok=True)
def h(value,seed=42):
 return seed if value is None else int(j.org.apache.spark.sql.catalyst.expressions.Murmur3HashFunction.hash(j.org.apache.spark.unsafe.types.UTF8String.fromString(value),j.org.apache.spark.sql.types.DataTypes.StringType,seed))
vectors=[{'value':v,'seed':s,'hash':h(v,s)} for v in [None,'','a','ab','abc','abcd','abcde','é','中文','🙂','a.parquet','b.parquet','uabc@7'] for s in [42,-12345]]
(base/'hash-vectors.json').write_text(json.dumps({'spark':'4.0.1','vectors':vectors},indent=2)+'\n')
table=pq.read_table('fixtures/delta/parquet-checkpoint/v1.parquet');rows=table.to_pylist();parts=[]
for part in range(1,3):
 subset=[r for r in rows if h((r.get('add') or r.get('remove') or {}).get('path'))%2+1==part];name=f'00000000000000000010.checkpoint.{part:010d}.0000000002.parquet';file=base/name;pq.write_table(pa.Table.from_pylist(subset,schema=table.schema),file,compression='snappy');parts.append({'part':part,'path':str(file),'name':name,'rows':len(subset),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
results=[]
with tempfile.TemporaryDirectory(prefix='umf-multipart-') as tmp:
 path=Path(tmp);log=path/'_delta_log';log.mkdir()
 for p in parts:(log/p['name']).write_bytes(Path(p['path']).read_bytes())
 (log/'_last_checkpoint').write_text(json.dumps({'version':10,'size':len(rows),'parts':2}))
 for p in Path('fixtures/delta/history').glob('*.parquet'):(path/p.name).write_bytes(p.read_bytes())
 for version in range(10,13):
  if version>10:
   name=f'{version:020d}.json';(log/name).write_bytes(Path('fixtures/delta/checkpoint',name).read_bytes())
  t=DeltaTable(path);results.append({'version':str(t.version()),'rows':sorted(pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist(),key=lambda r:r['id']),'paths':sorted(Path(p).name for p in t.file_uris()),'job':t.transaction_version('job'),'other':t.transaction_version('other')})
(base/'manifest.json').write_text(json.dumps({'version':'10','partCount':2,'parts':parts},indent=2)+'\n');(base/'native-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4','clustering':'Spark 4.0.1 Murmur3HashFunction','earlierCommitsAbsent':True,'results':results},indent=2)+'\n');print({'parts':parts,'nativeSnapshots':len(results)});g.shutdown()
