import hashlib,json,shutil,subprocess
from pathlib import Path
pin='ffdb326121ea89b7b8280e76a5caea923834bcef';cache=Path('.cache/jsonld-api');out=Path('native/jsonld/sources')
if not cache.exists():
    subprocess.run(['git','clone','https://github.com/w3c/json-ld-api.git',str(cache)],check=True)
    subprocess.run(['git','-C',str(cache),'checkout',pin],check=True)
assert subprocess.check_output(['git','-C',str(cache),'rev-parse','HEAD'],text=True).strip()==pin
out.mkdir(parents=True,exist_ok=True);files=[]
for p in sorted(p for p in (cache/'tests').rglob('*') if p.suffix in ['.jsonld','.nq']):
    dest=out/p.relative_to(cache/'tests');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);files.append({'path':str(dest),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
shutil.copyfile(cache/'LICENSE.md',out/'LICENSE.md')
m=json.loads((out/'expand-manifest.jsonld').read_text());(out/'manifest.json').write_text(json.dumps({'repository':'https://github.com/w3c/json-ld-api','commit':pin,'baseIRI':m['baseIri'],'cases':m['sequence'],'files':files},indent=2)+'\n')
print({'files':len(files),'expansionCases':len(m['sequence'])})
