"""Check the full generated reporting package and query/action misuse cases."""
from pathlib import Path
import argparse
import subprocess,os,json
parser=argparse.ArgumentParser();parser.add_argument('--environment',type=Path,required=True);parser.add_argument('--work-dir',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent;envdir=args.environment.resolve();out=args.work_dir.resolve();out.mkdir(parents=True,exist_ok=True);generated=out/'generated';runtime=root/'python/umf_access/src'
subprocess.run(['bun',str(root/'scripts/generate-access-reporting-fixture.ts'),str(generated)],check=True,cwd=root)
base=root/'tests/compilation/python/static/queries/negative'
names=['unknown_column','wrong_operand','wrong_param','foreign_column_filter','foreign_column_select','foreign_projection','wrong_eq_operand','wrong_ne_operand','null_optional_filter','update_unknown_field','update_wrong_type','ninth_select_column']
negative=[base/(n+'.py') for n in names]+sorted((root/'tests/compilation/python/static/joins/negative').glob('*.py'))
negative+=sorted((root/'tests/compilation/python/static/actions/negative').glob('*.py'))
positive=[root/'tests/compilation/python/static/actions/positive.py',generated/'commerce',root/'tests/compilation/python/static/joins/positive.py',root/'tests/compilation/python/static/queries/positive/runtime_types.py',root/'tests/compilation/python/static/queries/positive/terminals.py']
env=dict(os.environ,PYTHONPATH=f'{runtime}:{generated}',MYPYPATH=f'{runtime}:{generated}')
for file in (generated/'commerce').glob('*.py'):
 text=file.read_text()
 assert not any(s in text for s in ('type: ignore','pyright: ignore','ty: ignore')),file
report={}
for tool in ('mypy','pyright','ty'):
 report[tool]={}
 for phase,files in [('positive',positive),('negative',negative)]:
  cmd=[str(envdir/'bin'/tool)]
  if tool=='mypy':cmd+=['--python-version','3.11','--check-untyped-defs','--namespace-packages','--explicit-package-bases','--follow-imports=silent','--cache-dir',str(out/'mypy-cache')]+list(map(str,files))
  elif tool=='ty':cmd+=['check','--python-version','3.11','--python',str(envdir),'--extra-search-path',str(runtime),'--extra-search-path',str(generated),'--output-format','concise']+list(map(str,files))
  else:
   config=out/f'pyright-{phase}.json';config.write_text(json.dumps({'include':[os.path.relpath(p,out) for p in files],'extraPaths':[str(runtime),str(generated)],'typeCheckingMode':'basic','pythonVersion':'3.11'}));cmd+=['--project',str(config),'--pythonpath',str(envdir/'bin/python')]
  result=subprocess.run(cmd,env=env,capture_output=True,text=True,cwd=root);text=result.stdout+result.stderr;(out/f'{tool}-{phase}.log').write_text(text)
  found=[p.name for p in negative if str(p.relative_to(root)) in text] if phase=='negative' else []
  ok=result.returncode==0 if phase=='positive' else len(found)==len(negative) and result.returncode!=0 and 'unresolved-import' not in text and 'Cannot find' not in text and 'could not be resolved' not in text
  report[tool][phase]={'passed':ok,'exitCode':result.returncode,'covered':found,'count':len(found)}
  print(tool,phase,ok,len(found),flush=True)
(out/'typing-results.json').write_text(json.dumps(report,indent=2))
assert all(x['passed'] for checker in report.values() for x in checker.values()),report
