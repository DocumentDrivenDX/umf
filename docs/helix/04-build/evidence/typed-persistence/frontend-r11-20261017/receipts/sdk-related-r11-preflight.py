import ast,hashlib,json,subprocess,sys
from pathlib import Path
root=Path('/private/tmp/sdk-related-r11-native-prepared')
harness=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/python/umf_access/tests/related_native_e2e.py')
tree=ast.parse(harness.read_text());declarations=next(n.value.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='DECLARATIONS' for t in n.targets))
main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
ns={'root':root,'json':json,'hashlib':hashlib}
for node in main.body:
 if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'request','model','binding'} for t in node.targets):
  exec(compile(ast.Module(body=[node],type_ignores=[]),str(harness),'exec'),ns)
config={'package':'alias_shop','modules':['related_declarations'],'targets':[{'id':'local','kind':'postgresql','backendId':'weft-postgresql','backendVersion':'raw-read/0.1','targetProfile':'weft.raw-read/0.1','binding':ns['binding'],'platform':[{'name':'postgresql','versions':['180006']}]}]}
(root/'related_declarations.py').write_text(declarations);(root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
for suffix in ((),('--check',)):
 r=subprocess.run([sys.executable,'-I','-B','-m','umf_access.build.catalog','catalog','--config',str(root/'config.json'),'--root',str(root),*suffix],capture_output=True,text=True)
 (root/('preflight-check.log' if suffix else 'preflight-build.log')).write_text(r.stdout+r.stderr)
 print(r.stdout+r.stderr,flush=True);assert r.returncode==0
