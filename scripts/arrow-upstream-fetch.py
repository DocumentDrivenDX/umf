"""Fetch the entire pinned upstream IPC integration subtree, without cherry-picking cases."""
import json,urllib.request,hashlib,concurrent.futures
from pathlib import Path
rev='9ff285c88565f0f6abc855918c6a342e70e4909c';root='data/arrow-ipc-stream/integration/';base=Path('fixtures/arrow/upstream');base.mkdir(parents=True,exist_ok=True)
tree=json.load(urllib.request.urlopen('https://api.github.com/repos/apache/arrow-testing/git/trees/'+rev+'?recursive=1'))
assert not tree.get('truncated')
files=[x for x in tree['tree'] if x['type']=='blob' and (x['path'].startswith(root) or x['path']=='LICENSE.txt')]
def fetch(entry):
    relative=entry['path'].removeprefix(root);path=base/relative;path.parent.mkdir(parents=True,exist_ok=True)
    raw=urllib.request.urlopen('https://raw.githubusercontent.com/apache/arrow-testing/'+rev+'/'+entry['path']).read()
    assert len(raw)==entry['size'];assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==entry['sha']
    path.write_bytes(raw);return {'path':relative,'upstreamPath':entry['path'],'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:entries=list(pool.map(fetch,files))
(base/'manifest.json').write_text(json.dumps({'repository':'https://github.com/apache/arrow-testing','commit':rev,'selection':'Complete data/arrow-ipc-stream/integration subtree plus LICENSE.txt; fuzz corpus is separate and not included','files':entries},indent=2)+'\n');print({'files':len(entries),'bytes':sum(x['size'] for x in entries)})
