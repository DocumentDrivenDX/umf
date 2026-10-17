import pathlib,hashlib,json,subprocess,os,zipfile
root=pathlib.Path('/private/tmp/sdk-native-actions-r16-r1');repo=pathlib.Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');source=repo/'python/umf_access/tests/native_actions_e2e.py';site=pathlib.Path('/private/tmp/sdk-r16-314-env/lib/python3.14/site-packages');proof={}
for label,base in [('sdk','/private/tmp/sdk-completion-runtime-r16-wheels'),('weft','/private/tmp/weft-combined-sdk-local-r15/wheels')]:
 w=next(pathlib.Path(base).glob('*.whl'));entries={}
 with zipfile.ZipFile(w) as z:
  for n in z.namelist():
   if '.dist-info/' in n or n.endswith('/'):continue
   b=z.read(n);assert b==(site/n).read_bytes(),n;entries[n]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 proof[label]={'wheelSha256':hashlib.sha256(w.read_bytes()).hexdigest(),'payloads':entries}
def snapshot():return {n:hashlib.sha256((site/n).read_bytes()).hexdigest() for group in proof.values() for n in group['payloads']}
before=snapshot();source_before=hashlib.sha256(source.read_bytes()).hexdigest();(root/'frozen-harness.py').write_bytes(source.read_bytes());(root/'wheel-installed-proof.json').write_text(json.dumps(proof,indent=2));rc=-1
try:
 with (root/'campaign.log').open('w') as log:rc=subprocess.run(['/private/tmp/sdk-r16-314-env/bin/python','-I','-B',str(source)],env=dict(os.environ,UMF_NATIVE_GENERATED_ROOT=str(root)),stdout=log,stderr=subprocess.STDOUT).returncode
finally:
 after=snapshot();source_after=hashlib.sha256(source.read_bytes()).hexdigest();(root/'outer-result.json').write_text(json.dumps({'exitCode':rc,'payloadCount':len(before),'installedStart':before,'installedEnd':after,'installedUnchanged':before==after,'harnessStart':source_before,'harnessEnd':source_after,'harnessUnchanged':source_before==source_after},indent=2));assert before==after and source_before==source_after
raise SystemExit(rc)
