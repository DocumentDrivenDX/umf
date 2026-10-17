import hashlib,json,os,subprocess,sys,zipfile,sysconfig
from pathlib import Path
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');out=Path('/private/tmp/sdk-bulk-list-oldowner-source-r1-20261017');wheel=next(Path('/private/tmp/weft-combined-sdk-local-r16/wheels').glob('*.whl'));pure=Path(sysconfig.get_path('purelib'));sha=lambda b:hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(wheel) as z:
 payloads={n:sha(z.read(n)) for n in z.namelist() if n.startswith('weft/') and (n.endswith('.so') or n.endswith('.py'))}
 assert all(sha((pure/n).read_bytes())==v for n,v in payloads.items())
command=[sys.executable,'-B','-m','umf_access.build.catalog','catalog','--root',str(out),'--config',str(out/'native-catalog-config.json')];env={**os.environ,'PYTHONPATH':str(root/'python/umf_access/src')};result=subprocess.run(command,capture_output=True,text=True,env=env);(out/'old-owner-public-cli-refusal.log').write_text(result.stdout+result.stderr);assert result.returncode==1 and 'NATIVE_BULK_LIST_SLOT_METADATA_REQUIRED' in result.stderr
sys.path.insert(0,str(out));from native_sales import queries
from umf_access.commands import CommandPlan
from umf_access.protocols import ActionRefused
count=0
for value in vars(queries).values():
 if isinstance(value,CommandPlan):
  for variant in value.variants:
   try:variant.program.checked()
   except ActionRefused as e:assert e.code=='NATIVE_BULK_LIST_SLOT_METADATA_REQUIRED';count+=1
   else:raise AssertionError('old serialized list metadata promoted')
assert count==2
(out/'old-owner-gate.json').write_text(json.dumps({'status':'pass','scope':'Original old-owner metadata promotion refusal only; no native workload','wheel':str(wheel),'wheelSha256':sha(wheel.read_bytes()),'installedPayloads':payloads,'publicCLI':{'command':command,'exitCode':result.returncode,'refusal':'NATIVE_BULK_LIST_SLOT_METADATA_REQUIRED'},'actualSerializedProgramsRefused':count,'temporal':'HELD'},indent=2))
print('actual old-owner public CLI and',count,'original serialized programs refuse before dispatch')
