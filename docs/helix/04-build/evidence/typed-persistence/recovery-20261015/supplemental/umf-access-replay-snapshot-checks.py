from pathlib import Path
import hashlib,json,os,subprocess,shutil
root=Path('/Users/erik/.codex/worktrees/39bf/umf')
evidence=root/'docs/helix/04-build/evidence/typed-persistence/production-packaging'
record=json.loads((evidence/'latest-installed-snapshot.json').read_text())
snapshot=Path(record['sourceManifest']).parent
python=record['python'];checker=record['checkerPython']
env={key:value for key,value in os.environ.items() if key not in {'PYTHONPATH','PYTHONHOME','MYPYPATH','VIRTUAL_ENV','CONDA_PREFIX','PYRIGHT_PYTHON_FORCE_VERSION'}}
env['MYPY_CACHE_DIR']='/private/tmp/umf-access-snapshot-mypy-'+record['wheelSha256'][:16];env['PYTHONDONTWRITEBYTECODE']='1'
configs=snapshot/'checker-config';configs.mkdir(exist_ok=True)
(configs/'mypy.ini').write_text('[mypy]\npython_version = 3.12\ncheck_untyped_defs = True\ndisallow_any_generics = True\nwarn_unused_ignores = True\n')
(configs/'pyrightconfig.json').write_text(json.dumps({'pythonVersion':'3.12','typeCheckingMode':'strict','extraPaths':[record['generatedRoot']],'reportUnusedImport':False},indent=2)+'\n')
commands=[]
def execute(label,command):
 result=subprocess.run(command,cwd='/private/tmp',env=env,text=True,capture_output=True)
 (snapshot/(label+'.stdout')).write_text(result.stdout)
 (snapshot/(label+'.stderr')).write_text(result.stderr)
 commands.append({'label':label,'command':command,'exitCode':result.returncode,'stdout':label+'.stdout','stderr':label+'.stderr'})
 print(label,result.returncode,result.stdout[-500:],result.stderr[-500:])
sources=[str(path) for path in sorted((Path(record['generatedRoot'])/'shop').rglob('*.py'))]
execute('generated-mypy',[checker,'-I','-m','mypy','--python-executable',python,'--config-file',str(configs/'mypy.ini'),*sources])
execute('generated-pyright',[checker,'-I','-m','pyright','--pythonpath',python,'--project',str(configs/'pyrightconfig.json'),*sources])
files=['test_dsl_runtime.py','test_capture.py','test_dsl_render.py']
test_sources=snapshot/'test-sources';test_sources.mkdir(exist_ok=True)
for name in files: shutil.copyfile(root/'python/umf_access/tests'/name,test_sources/name)
for name in files:
 execute(name[:-3],[python,'-I','-B','-m','unittest','discover','-s',str(test_sources),'-p',name])
result={'kind':'exact-installed-snapshot-checks','wheelSha256':record['wheelSha256'],'python':python,'scope':'Generated minimal Order static replay and DSL/capture/render unit corpora against verified installed wheel. Not complete STP closure.','status':'pass' if all(command['exitCode']==0 for command in commands) else 'refused','commands':commands,'testSources':{name:hashlib.sha256((test_sources/name).read_bytes()).hexdigest() for name in files},'runtimeLookup':'Isolated -I -B runtime interpreter; no PYTHONPATH/MYPYPATH; cwd /private/tmp','nativeTargets':'UNTESTED'}
(snapshot/'installed-checks.json').write_text(json.dumps(result,indent=2)+'\n')
record['installedChecks']=str(snapshot/'installed-checks.json')
record['installedChecksStatus']=result['status']
(snapshot/'snapshot.json').write_text(json.dumps(record,indent=2)+'\n')
(evidence/'latest-installed-snapshot.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'status':result['status'],'snapshot':str(snapshot)}))
