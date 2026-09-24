"""Capture official ODCS schemas/examples from an immutable release checkout."""
import subprocess,json,hashlib
from pathlib import Path
commit='f0bdad95346905d500be5ef4b2c2d9b1d95223b7';cache=Path('.cache/odcs-upstream');base=Path('native/odcs/sources')
if not cache.exists():subprocess.run(['git','clone','--depth','1','--branch','v3.2.0','https://github.com/bitol-io/open-data-contract-standard.git',str(cache)],check=True)
assert subprocess.check_output(['git','-C',str(cache),'rev-parse','HEAD'],text=True).strip()==commit
paths=[cache/'LICENSE',cache/'README.md',cache/'docs/references.md',cache/'schema/README.md',*[cache/f'schema/odcs-json-schema-v{v}.json' for v in ['3.0.0','3.0.1','3.0.2','3.1.0','3.2.0']],*sorted((cache/'docs/examples').rglob('*.yaml'))]
records=[]
for p in paths:
 relative=p.relative_to(cache);target=base/relative;target.parent.mkdir(parents=True,exist_ok=True);data=p.read_bytes();target.write_bytes(data);records.append({'path':str(target),'upstreamPath':str(relative),'sha256':hashlib.sha256(data).hexdigest()})
(base/'manifest.json').write_text(json.dumps({'repository':'bitol-io/open-data-contract-standard','release':'v3.2.0','commit':commit,'scope':'Complete YAML example subtree and selected versioned schemas at this release snapshot; version strings alone do not identify later patched schemas','files':records},indent=2)+'\n');print({'files':len(records),'examples':sum(r['upstreamPath'].endswith('.yaml') for r in records)})
