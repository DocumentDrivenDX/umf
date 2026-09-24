import hashlib,json,shutil,subprocess
from pathlib import Path
pin='3bf782ba9a40dd1b143435abe386d38df64f2b47';cache=Path('.cache/jsonld-framing');out=Path('native/jsonld/framing-sources')
if not cache.exists():
    subprocess.run(['git','clone','https://github.com/w3c/json-ld-framing.git',str(cache)],check=True)
    subprocess.run(['git','-C',str(cache),'checkout',pin],check=True)
assert subprocess.check_output(['git','-C',str(cache),'rev-parse','HEAD'],text=True).strip()==pin
out.mkdir(parents=True,exist_ok=True);files=[]
for p in sorted((cache/'tests').rglob('*.jsonld')):
    dest=out/p.relative_to(cache/'tests');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);files.append({'path':str(dest),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
shutil.copyfile(cache/'LICENSE.md',out/'LICENSE.md')
m=json.loads((out/'frame-manifest.jsonld').read_text());(out/'manifest.json').write_text(json.dumps({'repository':'https://github.com/w3c/json-ld-framing','commit':pin,'baseIRI':m['baseIri'],'cases':m['sequence'],'files':files},indent=2)+'\n')
print({'files':len(files),'framingCases':len(m['sequence'])})
