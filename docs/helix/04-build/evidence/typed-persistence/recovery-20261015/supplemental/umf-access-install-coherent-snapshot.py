from pathlib import Path
import datetime,hashlib,json,os,shutil,subprocess,sys
root=Path('/Users/erik/.codex/worktrees/39bf/umf')
evidence=root/'docs/helix/04-build/evidence/typed-persistence/production-packaging'
build=json.loads(Path('/private/tmp/umf-access-coherent-snapshot-build.json').read_text())
if build['status']!='pass': raise RuntimeError('No accepted wheel build')
profile=json.loads((root/'python/umf_access/compatibility-profile.json').read_text())
digest=build['wheelSha256'];snapshot=evidence/'snapshots'/digest
snapshot.mkdir(parents=True,exist_ok=True)
wheel=snapshot/Path(build['wheel']).name
shutil.copyfile(build['wheel'],wheel)
if hashlib.sha256(wheel.read_bytes()).hexdigest()!=digest: raise RuntimeError('wheel digest changed')
(snapshot/'build.json').write_text(json.dumps(build,indent=2)+'\n')
(snapshot/'profile.json').write_text(json.dumps(profile,indent=2)+'\n')
shutil.copytree('/private/tmp/umf-access-coherent-generated',snapshot/'generated',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
environment=Path('/private/tmp')/('umf-access-installed-'+digest[:16])
env={key:value for key,value in os.environ.items() if key not in {'PYTHONPATH','PYTHONHOME','MYPYPATH','VIRTUAL_ENV','CONDA_PREFIX','PYRIGHT_PYTHON_FORCE_VERSION'}}
env['UV_CACHE_DIR']='/private/tmp/umf-tp001-uv-cache';env['PYTHONDONTWRITEBYTECODE']='1'
commands=[]
def execute(label,command):
 result=subprocess.run(command,cwd='/private/tmp',env=env,text=True,capture_output=True)
 commands.append({'label':label,'command':command,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
 (snapshot/'installation-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 if result.returncode: raise RuntimeError(label+' refused')
 return result
if environment.exists(): raise RuntimeError('Snapshot environment already exists; refusing reuse')
execute('create-isolated-environment',[sys.executable,'-m','venv','--without-pip',str(environment)])
python=environment/'bin/python'
pins=[f'{name}=={version}' for name,version in profile['runtimeDependencies'].items()]
execute('offline-install-exact-wheel',['uv','pip','install','--offline','--python',str(python),str(wheel),*pins])
config={'profile':profile,'wheel':str(wheel),'manifest':str(snapshot/'generated/shop/_umf/manifest.json'),'generatedRoot':str(snapshot/'generated'),'package':'shop'}
(snapshot/'import-config.json').write_text(json.dumps(config,indent=2)+'\n')
script=root/'python/umf_access/tests/packaging/replay_installed.py'
import_probe=execute('installed-byte-abi-import-verification',[str(python),'-I','-B',str(script),'--child',str(snapshot/'import-config.json')])
source_manifest={name:{'sha256':sha,'matchesCurrentCheckout':hashlib.sha256((root/'python/umf_access'/name).read_bytes()).hexdigest()==sha if (root/'python/umf_access'/name).exists() else False} for name,sha in build['sources'].items()}
(snapshot/'source-manifest.json').write_text(json.dumps(source_manifest,indent=2)+'\n')
record={'kind':'installed-production-runtime-snapshot','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Exact immutable wheel snapshot for independent DSL/model replay; no full story/native acceptance','wheel':str(wheel),'wheelSha256':digest,'python':str(python),'checkerPython':'/private/tmp/umf-tp001-compat-env/bin/python','runtimeVersion':profile['runtimeAbi']['version'],'runtimeAbi':profile['runtimeAbi']['abi'],'sourceManifest':str(snapshot/'source-manifest.json'),'generatedRoot':str(snapshot/'generated'),'generatedManifest':str(snapshot/'generated/shop/_umf/manifest.json'),'buildReport':str(snapshot/'build.json'),'importProbe':json.loads(import_probe.stdout),'installationCommands':str(snapshot/'installation-commands.json'),'runtimeLookup':'Isolated interpreter with -I -B; no development PYTHONPATH/MYPYPATH fallback','snapshotSourceStatus':'Exact captured build source; subsequent source edits require a new wheel/environment','nativeTargets':'UNTESTED; no drivers/extras installed'}
(snapshot/'snapshot.json').write_text(json.dumps(record,indent=2)+'\n')
(evidence/'latest-installed-snapshot.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'wheel':str(wheel),'wheelSha256':digest,'python':str(python),'snapshot':str(snapshot/'snapshot.json'),'importStatus':record['importProbe']['status']}))
