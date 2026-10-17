import hashlib,json,subprocess,sys
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(exist_ok=True);files=[Path('/private/tmp/sdk-owner-probe-native.py'),Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/scripts/pg_owner_privilege_resolver.py'),Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/scripts/pg_runtime_privilege_resolver.py')];site=Path('/private/tmp/sdk-privilege-r18-weft-r16-env/lib/python3.14/site-packages');proof=json.load(open('/private/tmp/sdk-privilege-r18-r16-wheel-installed-proof.json'))
def snap():
 d={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
 for group in proof.values():
  for n,e in group['payloads'].items():
   p=site/n;h=hashlib.sha256(p.read_bytes()).hexdigest();assert h==e['sha256'];d[n]=h
 return d
before=snap();(out/'start-custody.json').write_text(json.dumps(before,indent=2));rc=-1
try:
 with (out/'campaign.log').open('w') as log:rc=subprocess.run([sys.executable,'-I','-B',str(files[0]),str(out)],stdout=log,stderr=subprocess.STDOUT).returncode
finally:
 after=snap();(out/'end-custody.json').write_text(json.dumps(after,indent=2));(out/'outer-result.json').write_text(json.dumps({'exitCode':rc,'sourceAndInstalledUnchanged':before==after},indent=2));assert before==after
raise SystemExit(rc)
