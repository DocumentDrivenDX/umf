import json,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
from deltalake import DeltaTable
base=Path('fixtures/delta/sidecars');base.mkdir(parents=True,exist_ok=True)
actions=[json.loads(l) for l in Path('fixtures/delta/checkpoint/checkpoint.jsonl').read_text().splitlines()]
adds=[a for a in actions if 'add' in a];checkpoint=[a for a in actions if 'add' not in a]
add=pa.struct([('path',pa.string()),('partitionValues',pa.map_(pa.string(),pa.string())),('size',pa.int64()),('modificationTime',pa.int64()),('dataChange',pa.bool_()),('stats',pa.string()),('tags',pa.map_(pa.string(),pa.string()))])
remove=pa.struct([('path',pa.string()),('deletionTimestamp',pa.int64()),('dataChange',pa.bool_())])
schema=pa.schema([('add',add),('remove',remove)])
files=[]
for i,a in enumerate(adds):
 rows=[a]
 if i==0:rows.append({'remove':{'path':'retired.parquet','deletionTimestamp':1,'dataChange':False}})
 name=f'part-{i}.parquet';p=base/name;pq.write_table(pa.Table.from_pylist(rows,schema=schema),p,compression='snappy');raw=p.read_bytes();files.append({'path':name,'sha256':hashlib.sha256(raw).hexdigest()})
 checkpoint.append({'sidecar':{'path':name,'sizeInBytes':len(raw),'modificationTime':0,'tags':{'fixture':'authored'}}})
text='\n'.join(json.dumps(a,separators=(',',':')) for a in checkpoint)+'\n';(base/'checkpoint.jsonl').write_text(text)
name='00000000000000000010.checkpoint.12345678-1234-1234-1234-123456789abc.json'
last={'version':10,'size':len(actions)+1,'v2Checkpoint':{'path':name,'sizeInBytes':len(text.encode())}}
(base/'last-checkpoint.json').write_text(json.dumps(last)+'\n')
results=[]
with tempfile.TemporaryDirectory(prefix='umf-sidecars-') as tmp:
 path=Path(tmp);log=path/'_delta_log';side=log/'_sidecars';side.mkdir(parents=True);(log/name).write_text(text);(log/'_last_checkpoint').write_text(json.dumps(last))
 for f in files:(side/f['path']).write_bytes((base/f['path']).read_bytes())
 for p in Path('fixtures/delta/history').glob('*.parquet'):(path/p.name).write_bytes(p.read_bytes())
 for i in range(3):
  if i:
   filename=f'{10+i:020d}.json';raw=Path('fixtures/delta/checkpoint',filename).read_bytes();(base/filename).write_bytes(raw);(log/filename).write_bytes(raw)
  t=DeltaTable(path);results.append({'version':str(t.version()),'rows':sorted(pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist(),key=lambda r:r['id']),'paths':sorted(Path(p).name for p in t.file_uris()),'job':t.transaction_version('job'),'other':t.transaction_version('other')})
(base/'manifest.json').write_text(json.dumps({'sidecars':files},indent=2)+'\n');(base/'native-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','earlierCommitsAbsent':True,'results':results},indent=2)+'\n');print(results)
