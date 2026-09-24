import json,tempfile,hashlib
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
from deltalake import DeltaTable
base=Path('fixtures/delta/parquet-checkpoint');base.mkdir(parents=True,exist_ok=True)
grammar=json.load(open('spec/extensions/delta-log/action-schema.json'))['properties']
def arrow(s):
 if 'anyOf' in s:s=next(x for x in s['anyOf'] if x.get('type')!='null')
 if 'enum' in s and all(isinstance(x,str) for x in s['enum']):return pa.string()
 t=s['type'];t=next(x for x in t if x!='null') if isinstance(t,list) else t
 if t=='string':return pa.string()
 if t=='boolean':return pa.bool_()
 if t=='integer':return pa.int64() if s.get('format')=='int64' else pa.int32()
 if t=='array':return pa.list_(arrow(s['items']))
 if t=='object':
  if 'properties' in s:return pa.struct([(k,arrow(v)) for k,v in s['properties'].items()])
  return pa.map_(pa.string(),arrow(s['additionalProperties']))
 raise ValueError(s)
manifest=[];results=[]
for kind in ['v1','v2-embedded','v2-sidecars']:
 source='fixtures/delta/sidecars/checkpoint.jsonl' if kind=='v2-sidecars' else 'fixtures/delta/checkpoint/checkpoint.jsonl'
 actions=[json.loads(l) for l in Path(source).read_text().splitlines()]
 if kind=='v1':
  actions=[a for a in actions if 'checkpointMetadata' not in a]
  for a in actions:
   if 'protocol' in a:a['protocol']={'minReaderVersion':1,'minWriterVersion':2}
 keys=list(dict.fromkeys(k for a in actions for k in a));schema=pa.schema([(k,arrow(grammar[k])) for k in keys]);file=base/(kind+'.parquet');pq.write_table(pa.Table.from_pylist(actions,schema=schema),file,compression='snappy')
 sidecars=json.load(open('fixtures/delta/sidecars/manifest.json'))['sidecars'] if kind=='v2-sidecars' else []
 manifest.append({'id':kind,'spec':'v1' if kind=='v1' else 'v2','path':str(file),'version':'10','sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sidecars':[{'path':s['path'],'file':'fixtures/delta/sidecars/'+s['path'],'sha256':s['sha256']} for s in sidecars]})
 with tempfile.TemporaryDirectory(prefix='umf-parquet-checkpoint-') as tmp:
  path=Path(tmp);log=path/'_delta_log';log.mkdir();name='00000000000000000010.checkpoint'+('' if kind=='v1' else '.12345678-1234-1234-1234-123456789abc')+'.parquet';(log/name).write_bytes(file.read_bytes());last={'version':10,'size':len(actions)}
  if kind!='v1':last['v2Checkpoint']={'path':name,'sizeInBytes':file.stat().st_size}
  (log/'_last_checkpoint').write_text(json.dumps(last))
  for s in sidecars:
   folder=log/'_sidecars';folder.mkdir(exist_ok=True);(folder/s['path']).write_bytes(Path('fixtures/delta/sidecars',s['path']).read_bytes())
  for p in Path('fixtures/delta/history').glob('*.parquet'):(path/p.name).write_bytes(p.read_bytes())
  for version in range(10,13):
   if version>10:
    name=f'{version:020d}.json';(log/name).write_bytes(Path('fixtures/delta/checkpoint',name).read_bytes())
   t=DeltaTable(path);results.append({'id':kind,'version':str(t.version()),'rows':sorted(pa.RecordBatchReader.from_stream(t.scan()).read_all().to_pylist(),key=lambda r:r['id']),'paths':sorted(Path(p).name for p in t.file_uris()),'job':t.transaction_version('job'),'other':t.transaction_version('other')})
(base/'manifest.json').write_text(json.dumps({'cases':manifest},indent=2)+'\n');(base/'native-results.json').write_text(json.dumps({'runtime':'deltalake 1.6.4 DataFusion scan','earlierCommitsAbsent':True,'results':results},indent=2)+'\n');print({'nativeSnapshots':len(results)})
