import os,json,subprocess,hashlib,zipfile
from pathlib import Path
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf'); work=Path('/private/tmp/umf-sdk-actions-pinned'); wheel=work/'wheel/umf_access-0.1.0.dev0-py3-none-any.whl';records=[]
def run(label,cmd):
 p=subprocess.run(list(map(str,cmd)),cwd=root,capture_output=True,text=True,env={k:v for k,v in os.environ.items() if k not in ('PYTHONPATH','PYTHONHOME','MYPYPATH')});(work/(label+'.log')).write_text(p.stdout+p.stderr);records.append({'label':label,'command':list(map(str,cmd)),'exitCode':p.returncode});print(label,p.returncode,flush=True)
 if p.returncode:raise RuntimeError((p.stdout+p.stderr)[-2000:])
run('generate',['bun','scripts/generate-access-reporting-fixture.ts',work/'generated'])
for name in ['python311','venv']:
 py=Path('/private/tmp/umf-sdk-merged')/name/'bin/python'
 code=f'''import unittest,sys,zipfile
from pathlib import Path
import umf_access
site=Path(umf_access.__file__).parent.parent
with zipfile.ZipFile({str(wheel)!r}) as z:
 for name in z.namelist():
  if name.startswith('umf_access/') and not name.endswith('/'): assert (site/name).read_bytes()==z.read(name),name
sys.path.insert(0,{str(work/'generated')!r})
suite=unittest.TestSuite()
for name in {['test_values_red.py','test_codec_support_red.py','test_golden_vectors.py','test_generated_models.py','test_generated_actiontypes.py','test_generated_projections.py','test_codecs.py','test_runtime_driven_codecs.py','test_dsl_runtime.py','test_capture.py','test_dsl_render.py','test_wheel_contract.py','test_action_clients.py']!r}:
 suite.addTests(unittest.defaultTestLoader.discover({str(root/'python/umf_access/tests')!r},pattern=name))
result=unittest.TextTestRunner(verbosity=2).run(suite)
assert not result.skipped,result.skipped
assert result.wasSuccessful()
print('installed-wheel byte equality verified; runtime tests',result.testsRun)
'''
 run('installed-'+name,[py,'-I','-B','-c',code])
 run('e2e-'+name,['bun','run','test:access-e2e','--python',py,'--wheel',wheel,'--report',work/('e2e-'+name+'.json')])
(work/'runtime-evidence.json').write_text(json.dumps({'commands':records,'wheelSha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),'temporalQualification':'HELD'},indent=2)+'\n')
