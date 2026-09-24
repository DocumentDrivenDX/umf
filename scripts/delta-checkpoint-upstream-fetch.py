"""Pin Delta Parquet checkpoints, sidecars and last-checkpoint metadata for decoder conformance."""
import concurrent.futures,hashlib,json,urllib.request
from pathlib import Path
commit='90b904ede68627c2450007034d9724c043f1a66b';base=Path('fixtures/delta/checkpoint-upstream');base.mkdir(parents=True,exist_ok=True)
tree=json.load(urllib.request.urlopen('https://api.github.com/repos/delta-io/delta-rs/git/trees/'+commit+'?recursive=1'));assert not tree['truncated']
files=[x for x in tree['tree'] if x['type']=='blob' and ('/_delta_log/' in x['path'] and (x['path'].endswith('.parquet') or x['path'].endswith('/_last_checkpoint')) or x['path']=='LICENSE.txt')]
def fetch(entry):
 path=entry['path'];data=urllib.request.urlopen('https://raw.githubusercontent.com/delta-io/delta-rs/'+commit+'/'+path).read();assert len(data)==entry['size'];assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==entry['sha'];target=base/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);return {'path':path,'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'gitBlob':entry['sha']}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(fetch,files))
(base/'manifest.json').write_text(json.dumps({'repository':'https://github.com/delta-io/delta-rs','commit':commit,'selection':'Every Parquet blob and _last_checkpoint under _delta_log plus LICENSE.txt; excludes table data files','files':results},indent=2)+'\n');print({'files':len(results),'bytes':sum(x['size'] for x in results)})
