import ast,hashlib,json,os,shutil,subprocess
from pathlib import Path
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');root=Path('/private/tmp/sdk-r13-relationship-native-prepared')
shutil.copytree('/private/tmp/sdk-r13-relationship-preflight-r1',root)
tree=ast.parse((repo/'python/umf_access/tests/relationship_joined_native_e2e.py').read_text())
declarations=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='DECLARATIONS' for v in n.targets))
main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
expr=next(n.value for n in main.body if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='binding' for v in n.targets))
model=json.loads((root/'stage-one-request.json').read_text())['sources'][0]['text']
binding=eval(compile(ast.Expression(expr),'<authored-binding>','eval'),{'hashlib':hashlib,'model':model})
(root/'relationship_declarations.py').write_text(declarations)
config={'package':'relationship_shop','modules':['relationship_declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':binding,'platform':[{'name':'postgresql','versions':['180006']}]}]}
(root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
env={k:v for k,v in os.environ.items() if k!='PYTHONPATH'}|{'PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':str(repo/'python/umf_access/src')+os.pathsep+str(root)}
for name,tail in [('build',[]),('check',['--check'])]:
 r=subprocess.run(['/private/tmp/sdk-r13-source-preflight-env/bin/python','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root),*tail],env=env,cwd=repo,text=True,capture_output=True)
 (root/f'cli-{name}.log').write_text(r.stdout+r.stderr);print(name,r.returncode,flush=True)
 if r.returncode:print(r.stdout+r.stderr);break
