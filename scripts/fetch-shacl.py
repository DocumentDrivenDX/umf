"""Fetch only the pinned SHACL 1.0 suite (never the adjacent SHACL 1.2 suite)."""
import concurrent.futures,hashlib,json,urllib.request
from pathlib import Path
REV='fe6275b93fa4de7fc070d82ca8e14d633b2d25da'
ROOT=Path('native/shacl/sources')
tree=json.load(urllib.request.urlopen(f'https://api.github.com/repos/w3c/data-shapes/git/trees/{REV}?recursive=1'))
assert not tree.get('truncated')
paths=[x['path'] for x in tree['tree'] if x['type']=='blob' and (x['path'].startswith('data-shapes-test-suite/') or x['path']=='LICENSE.md')]
def fetch(path):
 url=f'https://raw.githubusercontent.com/w3c/data-shapes/{REV}/{path}'
 data=urllib.request.urlopen(url).read();target=ROOT/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 return {'path':path,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:files=list(pool.map(fetch,paths))
ROOT.joinpath('manifest.json').write_text(json.dumps({'repository':'https://github.com/w3c/data-shapes','revision':REV,'scope':'data-shapes-test-suite (SHACL 1.0), plus repository license','files':files},indent=2)+'\n')
print({'revision':REV,'files':len(files)})
