import json,tempfile,sys
from pathlib import Path
import pyarrow.parquet as pq
from deltalake import DeltaTable
base=Path('fixtures/parquet/offset-repair' if '--offset-repair' in sys.argv else 'fixtures/delta/parquet-checkpoint');results=[]
def observation(t,path,apps):
 m=t.metadata();p=t.protocol()
 return {'paths':sorted(u.removeprefix(path.as_uri()+'/').removeprefix(str(path)+'/') for u in t.file_uris()),'metadata':{'id':m.id,'name':m.name,'description':m.description,'partitionColumns':m.partition_columns,'configuration':m.configuration},'schema':json.loads(t.schema().to_json()),'protocol':{'reader':p.min_reader_version,'writer':p.min_writer_version,'readerFeatures':sorted(p.reader_features or []),'writerFeatures':sorted(p.writer_features or [])},'transactions':{a:t.transaction_version(a) for a in apps}}
with tempfile.TemporaryDirectory(prefix='umf-upstream-parquet-') as tmp:
 for c in json.load(open(base/'upstream-results.json'))['results']:
  source=Path(c['path']);path=Path(tmp)/c['id'];log=path/'_delta_log';log.mkdir(parents=True);(log/source.name).write_bytes(source.read_bytes());last={'version':int(c['version']),'size':pq.read_metadata(source).num_rows}
  if c['spec']=='v2':last['v2Checkpoint']={'path':source.name,'sizeInBytes':source.stat().st_size}
  (log/'_last_checkpoint').write_text(json.dumps(last))
  for b in c['bindings']:
   target=log/'_sidecars'/Path(b['path']).name;target.parent.mkdir(exist_ok=True);target.write_bytes(Path(b['file']).read_bytes())
  apps=[]
  if c['status']=='reconciled':apps=[n['members']['appId']['value'] for n in c['result']['recovery']['state']['transactions']]
  r={'id':c['id'],'umf':c['status']}
  try:
   original=observation(DeltaTable(path),path,apps);r['native']='accepted'
  except Exception as e:r.update(native='rejected',error=str(e));results.append(r);continue
  if c['status']=='reconciled':
   target=Path(tmp)/(c['id']+'-lowered');lower=target/'_delta_log';lower.mkdir(parents=True);(lower/'00000000000000000000.json').write_bytes((base/(c['id']+'.jsonl')).read_bytes())
   actual=observation(DeltaTable(target),target,apps);assert actual==original,(c['id'],[k for k in actual if actual[k]!=original[k]]);r['observationsAgree']=True
  results.append(r)
report={'runtime':'deltalake 1.6.4','dataFilesRead':False,'files':len(results),'nativeAccepted':sum(r['native']=='accepted' for r in results),'observationsAgree':sum(r.get('observationsAgree',False) for r in results),'results':results};(base/'upstream-oracle-results.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k!='results'})
