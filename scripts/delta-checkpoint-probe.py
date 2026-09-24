import json,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable
base=Path('fixtures/delta/checkpoint');base.mkdir(parents=True,exist_ok=True);history=Path('fixtures/delta/history')
actions=[json.loads(line) for line in (history/'snapshot-3.jsonl').read_text().splitlines()]
for a in actions:
 if 'protocol' in a:a['protocol']={'minReaderVersion':3,'minWriterVersion':7,'readerFeatures':['v2Checkpoint'],'writerFeatures':['v2Checkpoint']}
checkpoint=[{'checkpointMetadata':{'version':10}},*actions]
text='\n'.join(json.dumps(a,separators=(',',':')) for a in checkpoint)+'\n';name='00000000000000000010.checkpoint.12345678-1234-1234-1234-123456789abc.json'
(base/'checkpoint.jsonl').write_text(text)
last={'version':10,'size':len(checkpoint),'v2Checkpoint':{'path':name,'sizeInBytes':len(text.encode())}}
(base/'last-checkpoint.json').write_text(json.dumps(last)+'\n')
commits=[[{'remove':{'path':'b.parquet','dataChange':True,'deletionTimestamp':11}},{'txn':{'appId':'job','version':1}}],[{'commitInfo':{'operation':'CHECKPOINT RECOVERY'}}]]
results=[]
with tempfile.TemporaryDirectory(prefix='umf-v2-checkpoint-') as tmp:
 path=Path(tmp);log=path/'_delta_log';log.mkdir();(log/name).write_text(text);(log/'_last_checkpoint').write_text(json.dumps(last))
 for f in history.glob('*.parquet'):(path/f.name).write_bytes(f.read_bytes())
 for i in range(3):
  if i:
   raw='\n'.join(json.dumps(a,separators=(',',':')) for a in commits[i-1])+'\n';(log/f'{10+i:020d}.json').write_text(raw);(base/f'{10+i:020d}.json').write_text(raw)
  table=DeltaTable(path);rows=pa.RecordBatchReader.from_stream(table.scan()).read_all().to_pylist()
  results.append({'version':str(table.version()),'rows':sorted(rows,key=lambda r:r['id']),'paths':sorted(Path(p).name for p in table.file_uris()),'job':table.transaction_version('job'),'other':table.transaction_version('other')})
report={'runtime':'deltalake 1.6.4 DataFusion scan','earlierCommitsAbsent':True,'results':results,'dataFiles':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in history.glob('*.parquet')}}
(base/'native-results.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
