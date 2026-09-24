import subprocess,json,hashlib
from pathlib import Path
commit='051e945bb8d64ffd60639c666615ace88d561e2f';cache=Path('.cache/linkml-model');base=Path('native/linkml/sources')
if not cache.exists():subprocess.run(['git','clone','--depth','1','--branch','v1.11.0','https://github.com/linkml/linkml-model.git',str(cache)],check=True)
assert subprocess.check_output(['git','-C',str(cache),'rev-parse','HEAD'],text=True).strip()==commit
paths=[cache/'LICENSE',cache/'pyproject.toml',*sorted((cache/'linkml_model').glob('*.py')),*sorted((cache/'linkml_model/model/schema').glob('*.yaml')),*sorted((cache/'linkml_model/jsonschema').glob('*.json')),*sorted((cache/'tests/input/examples').glob('*.yaml'))];records=[]
for p in paths:
 rel=p.relative_to(cache);target=base/rel;target.parent.mkdir(parents=True,exist_ok=True);data=p.read_bytes();target.write_bytes(data);records.append({'path':str(target),'upstreamPath':str(rel),'sha256':hashlib.sha256(data).hexdigest()})
(base/'manifest.json').write_text(json.dumps({'repository':'linkml/linkml-model','release':'v1.11.0','commit':commit,'files':records},indent=2)+'\n');print({'files':len(records)})
