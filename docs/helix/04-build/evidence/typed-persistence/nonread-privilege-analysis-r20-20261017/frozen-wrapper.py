from pathlib import Path
import json,hashlib,zipfile,subprocess,sys
out=Path(sys.argv[1]);custody=out.with_name(out.name+'-custody');custody.mkdir();site=Path('/private/tmp/sdk-privilege-r20-weft-r18-env/lib/python3.14/site-packages');source=Path('/private/tmp/sdk-nonread-probe-native.py');helper=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/scripts/pg_owner_privilege_resolver.py');node=helper.with_name('pg_runtime_privilege_resolver.py');inputs=Path('/private/tmp/sdk-owner-nonread-r18-preflight');proof={}
for label,folder in [('sdk','/private/tmp/sdk-completion-runtime-r20-wheels'),('weft','/private/tmp/weft-combined-sdk-local-r18/wheels')]:
 w=next(Path(folder).glob('*.whl'));entries={}
 with zipfile.ZipFile(w) as z:
  for n in z.namelist():
   if '.dist-info/' in n or n.endswith('/'):continue
   b=z.read(n);assert b==(site/n).read_bytes();entries[n]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 proof[label]={'wheel':str(w),'sha256':hashlib.sha256(w.read_bytes()).hexdigest(),'payloads':entries}
def snap():
 result={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,helper,node,*inputs.glob('*.json')]}
 for group in proof.values():
  for name,e in group['payloads'].items():
   h=hashlib.sha256((site/name).read_bytes()).hexdigest();assert h==e['sha256'];result[name]=h
 return result
before=snap();(custody/'wheel-installed.json').write_text(json.dumps(proof,indent=2));(custody/'before.json').write_text(json.dumps(before,indent=2));rc=-1
try:
 with(custody/'campaign.log').open('w')as log:rc=subprocess.run([sys.executable,'-I','-B',str(source),str(out),str(inputs)],stdout=log,stderr=subprocess.STDOUT).returncode
finally:
 after=snap();(custody/'after.json').write_text(json.dumps(after,indent=2));(custody/'result.json').write_text(json.dumps({'exitCode':rc,'sourceInputsInstalledUnchanged':before==after},indent=2));assert before==after
raise SystemExit(rc)
