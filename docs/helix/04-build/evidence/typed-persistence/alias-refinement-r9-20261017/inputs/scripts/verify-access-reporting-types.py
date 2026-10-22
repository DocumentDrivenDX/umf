"""Check the full generated reporting package and query/action misuse cases."""
from pathlib import Path
import argparse
import subprocess,os,json
from dataclasses import asdict
from access_type_diagnostics import DiagnosticMismatch,validate_negative
parser=argparse.ArgumentParser();parser.add_argument('--installed-runtime',action='store_true');parser.add_argument('--environment',type=Path,required=True);parser.add_argument('--work-dir',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent;envdir=args.environment.resolve();out=args.work_dir.resolve();out.mkdir(parents=True,exist_ok=True);generated=out/'generated';runtime=Path(subprocess.check_output([str(envdir/'bin/python'),'-I','-c','import sysconfig;print(sysconfig.get_path("purelib"))'],text=True).strip()) if args.installed_runtime else root/'python/umf_access/src'
subprocess.run(['bun',str(root/'scripts/generate-access-reporting-fixture.ts'),str(generated)],check=True,cwd=root)
subprocess.run(['bun',str(root/'scripts/generate-access-native-action-fixture.ts'),str(generated)],check=True,cwd=root)
subprocess.run(['bun',str(root/'scripts/generate-access-refinement-fixture.ts'),str(generated)],check=True,cwd=root)
subprocess.run(['bun',str(root/'scripts/generate-access-search-fixture.ts'),str(generated)],check=True,cwd=root)
base=root/'tests/compilation/python/static/queries/negative'
names=['unknown_column','wrong_operand','wrong_param','foreign_column_filter','foreign_column_select','foreign_projection','wrong_eq_operand','wrong_ne_operand','null_optional_filter','update_unknown_field','update_wrong_type','ninth_select_column']
names += ['distinct_wrong_operand', 'distinct_wrong_param', 'prefix_wrong_operand', 'prefix_wrong_param']
negative=[base/(n+'.py') for n in names]+sorted((root/'tests/compilation/python/static/joins/negative').glob('*.py'))
negative+=sorted((root/'tests/compilation/python/static/actions/negative').glob('*.py'))
negative+=sorted((root/'tests/compilation/python/static/search/negative').glob('*.py'))
negative+=sorted((root/'tests/compilation/python/static/models/negative').glob('*.py'))
positive=[root/'tests/compilation/python/static/actions/positive.py',generated/'commerce',root/'tests/compilation/python/static/joins/positive.py',root/'tests/compilation/python/static/joins/aggregate_positive.py',root/'tests/compilation/python/static/joins/alias_positive.py',generated/'refinement_shop',root/'tests/compilation/python/static/joins/refinement_positive.py',root/'tests/compilation/python/static/joins/refinement_matrix.py',root/'tests/compilation/python/static/queries/positive/runtime_types.py',root/'tests/compilation/python/static/queries/positive/terminals.py']
search=str(generated) if args.installed_runtime else f'{runtime}:{generated}'
env=dict(os.environ,PYTHONPATH=search,MYPYPATH=search)
positive += [generated/'native_sales',root/'tests/compilation/python/static/native-actions/positive.py',generated/'search_docs',root/'tests/compilation/python/static/search/positive.py']
for file in (generated/'commerce').glob('*.py'):
 text=file.read_text()
 assert not any(s in text for s in ('type: ignore','pyright: ignore','ty: ignore')),file
expectations=json.loads((root/"tests/compilation/python/static/reporting-negative-sites.json").read_text())
report={}
for tool in ('mypy','pyright','ty'):
 version=subprocess.check_output([str(envdir/'bin'/tool),'--version'],text=True).strip()
 if version.split()[1]!=expectations['checkers'][tool]:raise RuntimeError('Pinned checker version mismatch: '+version)
 report[tool]={}
 for phase,files in [('positive',positive),('negative',negative)]:
  cmd=[str(envdir/'bin'/tool)]
  if tool=='mypy':cmd+=['--python-executable',str(envdir/'bin/python'),'--python-version','3.11','--check-untyped-defs','--namespace-packages','--explicit-package-bases','--follow-imports=silent','--cache-dir',str(out/'mypy-cache')]+list(map(str,files))
  elif tool=='ty':cmd+=['check','--python-version','3.11','--python',str(envdir),'--extra-search-path',str(runtime),'--extra-search-path',str(generated),'--output-format','concise']+list(map(str,files))
  else:
   config=out/f'pyright-{phase}.json';config.write_text(json.dumps({'include':[os.path.relpath(p,out) for p in files],'extraPaths':[str(runtime),str(generated)],'typeCheckingMode':'basic','pythonVersion':'3.11'}));cmd+=['--project',str(config),'--pythonpath',str(envdir/'bin/python'),'--outputjson']
  result=subprocess.run(cmd,env=env,capture_output=True,text=True,cwd=root);text=result.stdout+result.stderr;(out/f'{tool}-{phase}.log').write_text(text)
  found=[];diagnostics=[];failure=None
  if phase=='positive':
   ok=result.returncode==0
  else:
   try:
    diagnostics=validate_negative(tool,text,expectations,root,returncode=result.returncode,files=negative)
    found=sorted({item.path for item in diagnostics});ok=True
   except (DiagnosticMismatch,KeyError,ValueError) as error:
    ok=False;failure=str(error)
  report[tool][phase]={'passed':ok,'checkerVersion':version,'exitCode':result.returncode,'covered':found,'count':len(found),'diagnostics':[asdict(item)for item in diagnostics],'failure':failure}
  print(tool,phase,ok,len(found),flush=True)
(out/'typing-results.json').write_text(json.dumps(report,indent=2))
assert all(x['passed'] for checker in report.values() for x in checker.values()),report
