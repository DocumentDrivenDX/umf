from pathlib import Path
import json,hashlib,sys,sysconfig,zipfile,importlib.metadata
sdk,compiler=sys.argv[1:];sha=lambda b:hashlib.sha256(b).hexdigest();root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/python/umf_access/src');pure=Path(sysconfig.get_path('purelib'));build=json.loads(Path('/private/tmp/sdk-completion-runtime-'+sdk+'-build.json').read_text());rows=[]
for name,expected in build['payloads'].items():
 assert sha((root/name).read_bytes())==sha((pure/name).read_bytes())==expected,name
 rows.append({'path':name,'sha256':expected})
wheel=next(Path('/private/tmp/weft-combined-sdk-local-'+compiler+'/wheels').glob('*.whl'))
with zipfile.ZipFile(wheel) as z:
 for name in z.namelist():
  if name.startswith('weft/') and (name.endswith('.so') or name.endswith('.py')):
   expected=sha(z.read(name));assert sha((pure/name).read_bytes())==expected,name;rows.append({'path':name,'sha256':expected})
r={'status':'pass','python':sys.version,'sdkSourceCommit':build['commit'],'sdkWheel':build['wheel'],'sdkWheelSha256':build['wheelSha256'],'compilerWheel':str(wheel),'compilerWheelSha256':sha(wheel.read_bytes()),'payloads':rows,'distributions':{n:importlib.metadata.version(n) for n in ('umf-access','weft-sql','pydantic')},'temporal':'HELD'};Path('/private/tmp/sdk-'+sdk+'-installed-byteproof.json').write_text(json.dumps(r,indent=2)+'\n');print(len(rows),'exact payloads')
