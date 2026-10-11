"""Captured installed-wheel public preparation; no catalog authority."""
import hashlib,json,os,shutil,subprocess,sys,tempfile,uuid,zipfile
from pathlib import Path
ROOT=Path.cwd();T=Path('/private/tmp/truss-security-main-integration')
sha=lambda b:hashlib.sha256(b).hexdigest()
paths=[Path(__file__).resolve(),T/'packages/python/pyproject.toml',T/'packages/python/tests/test_security_preparation.py',T/'packages/python/tests/fixtures/security-association-core.json',T/'packages/python/tests/fixtures/security-association-binding.json',T/'docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json']
paths += [p for p in (T/'packages/python/src').rglob('*') if p.is_file() and '__pycache__' not in p.parts]
files={str(p):p.read_bytes() for p in paths};pins={p:sha(b) for p,b in files.items()}
out=ROOT/'docs/helix/04-build/evidence/security/public-security-preparation'/str(uuid.uuid4());out.mkdir(parents=True)
with zipfile.ZipFile(out/'preimages.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p,b in files.items():z.writestr(p.lstrip('/'),b)
with zipfile.ZipFile(out/'preimages.zip') as z:
 assert all(z.read(p.lstrip('/'))==b for p,b in files.items())
runtime_paths={'python':Path(sys.executable),'bun':Path(shutil.which('bun'))}
runtime_digests={key:sha(path.read_bytes()) for key,path in runtime_paths.items()}
results=[]
try:
 with tempfile.TemporaryDirectory(prefix='public-security-preparation-') as directory:
  temp=Path(directory);source=temp/'source';installed=temp/'installed';wheels=temp/'wheels'
  for p,b in files.items():
   if Path(p).is_relative_to(T):
    target=source/Path(p).relative_to(T);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
  env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PIP_NO_INDEX':'1','PIP_DISABLE_PIP_VERSION_CHECK':'1'};env.pop('PYTHONPATH',None)
  def run(label,command,cwd,env=env):
   result=subprocess.run(command,cwd=cwd,env=env,capture_output=True,text=True,timeout=60)
   (out/(label+'.log')).write_text(result.stdout+result.stderr)
   results.append({'id':label,'exit':result.returncode});assert result.returncode==0,label
  run('build',[sys.executable,'-m','pip','wheel','--no-deps','--no-build-isolation','--wheel-dir',str(wheels),'.'],source/'packages/python')
  wheel=next(wheels.glob('*.whl'));blob=wheel.read_bytes();(out/wheel.name).write_bytes(blob)
  run('install',[sys.executable,'-m','pip','install','--no-deps','--no-compile','--target',str(installed),str(wheel)],temp)
  test_env={**env,'PYTHONPATH':str(installed)}
  run('tests',[sys.executable,'-c',"import truss,sys,runpy;from pathlib import Path;assert Path(truss.__file__).resolve().is_relative_to(Path(sys.argv[1]).resolve());sys.argv=sys.argv[2:];runpy.run_path(sys.argv[0],run_name='__main__')",str(installed),str(source/'packages/python/tests/test_security_preparation.py'),'-v'],temp,test_env)
  # Compare every shipped Python source/asset to its captured original bytes.
  for p,b in files.items():
   relative=Path(p).relative_to(T) if Path(p).is_relative_to(T) else None
   if relative and relative.parts[:3]==('packages','python','src'):
    assert (installed/Path(*relative.parts[3:])).read_bytes()==b,str(relative)
  assert runtime_digests=={key:sha(path.read_bytes()) for key,path in runtime_paths.items()}
  assert all((source/Path(p).relative_to(T)).read_bytes()==b for p,b in files.items() if Path(p).is_relative_to(T))
  assert all(Path(p).read_bytes()==b for p,b in files.items()),'source changed'
 receipt={'status':'pass','scope':'fresh captured installed wheel public preparation of original security cohort only','sourceDigests':pins,'python':sys.version,'runtimeExecutableDigests':runtime_digests,'wheelSha256':sha(blob),'steps':results,'tests':5,'cleanup':'temporary installation/build removed','acceptancePromoted':False,'excluded':['database effects','ontology owner interpretation','registered binding semantics','authenticated owner/issuer/current cut','native report and publication','full installed wheel/backend acceptance','hermetic runtime/build toolchain proof']}
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'receipt':str(out/'receipt.json'),'sha256':sha((out/'receipt.json').read_bytes())}))
except Exception as error:
 (out/'failure.json').write_text(json.dumps({'status':'fail','reason':str(error),'sourceDigests':pins,'steps':results},indent=2)+'\n');raise
