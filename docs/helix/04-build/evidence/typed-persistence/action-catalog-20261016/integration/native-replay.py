import hashlib,json,os,subprocess,tempfile
from pathlib import Path
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');work=Path('/private/tmp/umf-sdk-actions-pinned');pg=Path(tempfile.mkdtemp(prefix='umf-sdk-pg18-',dir='/private/tmp'));(pg/'socket').mkdir();tools=Path('/opt/homebrew/opt/postgresql@18/bin');commands=[];started=False
wheel=Path('/private/tmp/umf-praxis-joins/wheels/weft_sql-0.1.0-cp39-abi3-macosx_11_0_arm64.whl')
assert hashlib.sha256(wheel.read_bytes()).hexdigest()=='23399ac55ca886587aa4762f5674adf24d40a1429d54cda8c10276846603aabf'
def run(label,command,env=None):
 result=subprocess.run(list(map(str,command)),cwd=root,env=env,text=True,capture_output=True)
 (work/(label+'.log')).write_text(result.stdout+result.stderr)
 commands.append({'label':label,'command':list(map(str,command)),'exitCode':result.returncode,'log':label+'.log'})
 print(label,result.returncode,flush=True)
 if result.returncode:raise RuntimeError(label+' '+(result.stdout+result.stderr)[-1200:])
try:
 run('native-init',[tools/'initdb','-D',pg/'data','-A','trust','-U','sdk_test','--no-sync'])
 run('native-start',[tools/'pg_ctl','-D',pg/'data','-l',pg/'server.log','-o',f"-F -k {pg/'socket'} -c listen_addresses='' -p 55492",'-w','start']);started=True
 env={k:v for k,v in os.environ.items() if k not in ('PYTHONPATH','PYTHONHOME','UMF_WEFT_RAW_COMPILER')}
 env.update(UMF_PG_TEST_DSN=f"host={pg/'socket'} port=55492 dbname=postgres user=sdk_test",UMF_GENERATED_REPORTING_PACKAGE='1')
 code=f'''import sys,unittest,zipfile
from pathlib import Path
import umf_access
site=Path(umf_access.__file__).parent.parent
with zipfile.ZipFile({str(work/'wheel/umf_access-0.1.0.dev0-py3-none-any.whl')!r}) as z:
 for name in z.namelist():
  if name.startswith('umf_access/') and not name.endswith('/'):assert (site/name).read_bytes()==z.read(name)
sys.path.insert(0,{str(work/'generated')!r})
suite=unittest.defaultTestLoader.discover({str(root/'python/umf_access/tests')!r},pattern='test_reviewed_reads.py')
result=unittest.TextTestRunner(verbosity=2).run(suite)
assert not result.skipped,result.skipped
assert result.testsRun==15,result.testsRun
assert result.wasSuccessful()
from commerce.codecs import decode_OrderCustomer
row=decode_OrderCustomer(['orderId','name'],['o-1',None])
assert row.name is None
try:decode_OrderCustomer(['orderId','name'],['o-1',123])
except ValueError:pass
else:raise AssertionError('joined codec accepted invalid carrier')
print('joined thin codec: nullable right row and invalid carrier controls pass')
'''
 run('native-tests',[Path('/private/tmp/umf-sdk-merged/python311/bin/python'),'-I','-B','-c',code],env)
 status='pass'
except Exception as error:
 status='fail';print(str(error),flush=True)
finally:
 if started:
  try:run('native-stop',[tools/'pg_ctl','-D',pg/'data','-m','fast','-w','stop'])
  except Exception:status='fail'
 clean=not (pg/'data/postmaster.pid').exists()
 (work/'native-replay.json').write_text(json.dumps({'status':status,'postgresql':'18.6','python':'3.11.17','tests':15,'cluster':str(pg),'ownedServerStopped':clean,'weftWheelSha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),'sdkWheelSha256':hashlib.sha256((work/'wheel/umf_access-0.1.0.dev0-py3-none-any.whl').read_bytes()).hexdigest(),'commands':commands,'scope':'Actual installed wheels and generated schema/capture/catalog/native reads on an isolated owned cluster; no Lakebase service or temporal qualification.'},indent=2)+'\n')
raise SystemExit(status!='pass' or not clean)
