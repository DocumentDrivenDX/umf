"""Compare native log-state observations; upstream data/checkpoints are not present."""
import hashlib,json,tempfile
from pathlib import Path
import pyarrow as pa
from deltalake import DeltaTable
base=Path('fixtures/delta/upstream');report=json.loads((base/'history-results.json').read_text());manifest=json.loads((base/'manifest.json').read_text());hashes={f['path']:f['sha256'] for f in manifest['files']};results=[]
def observe(path,apps):
 try:
  t=DeltaTable(path);p=t.protocol();m=t.metadata()
  actions=pa.table(t.get_add_actions()).to_pylist()
  return {'status':'accepted','schema':json.loads(t.schema().to_json()),'metadata':{'id':m.id,'name':m.name,'description':m.description,'partitionColumns':m.partition_columns,'configuration':m.configuration},'protocol':{'reader':p.min_reader_version,'writer':p.min_writer_version,'readerFeatures':sorted(p.reader_features or []),'writerFeatures':sorted(p.writer_features or [])},'adds':sorted(actions,key=lambda a:a['path']),'transactions':{app:t.transaction_version(app) for app in sorted(apps)}}
 except Exception as e:return {'status':'rejected','errorType':type(e).__name__}
with tempfile.TemporaryDirectory(prefix='umf-history-upstream-') as tmp:
 for c in report['results']:
  root=Path(tmp)/c['id'];before=root/'original';log=before/'_delta_log';log.mkdir(parents=True);apps=set()
  for v in c['versions']:
   raw=(base/v['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==hashes[v['path']];(log/(v['version'].zfill(20)+'.json')).write_bytes(raw)
   for line in raw.decode('utf-8').splitlines():
    if line.strip():
     a=json.loads(line)
     if isinstance(a,dict) and isinstance(a.get('txn'),dict) and isinstance(a['txn'].get('appId'),str):apps.add(a['txn']['appId'])
  original=observe(before,apps);row={'id':c['id'],'umf':c['status'],'native':original}
  if c['status']=='reconciled':
   after=root/'lowered';out=after/'_delta_log';out.mkdir(parents=True);(out/'00000000000000000000.json').write_bytes((base/'history-exports'/(c['id']+'.jsonl')).read_bytes());recovered=observe(after,apps);row['lowered']=recovered;row['matches']=original==recovered
  results.append(row)
output={'runtime':'deltalake 1.6.4','scope':'Log-state observations without upstream data files or checkpoints','cases':len(results),'nativeAccepted':sum(r['native']['status']=='accepted' for r in results),'comparisons':sum('matches' in r for r in results),'mismatches':[r['id'] for r in results if r.get('matches') is False],'results':results}
(base/'history-oracle-results.json').write_text(json.dumps(output,indent=2,default=str)+'\n');print({k:v for k,v in output.items() if k!='results'})
assert not output['mismatches'],output['mismatches']
assert output['cases']==303 and output['nativeAccepted']==258 and output['comparisons']==278
assert sum(r['umf']=='reconciled' and r['native']['status']=='accepted' for r in results)==257
