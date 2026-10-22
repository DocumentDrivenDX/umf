# SPDX-License-Identifier: MIT OR Apache-2.0
from pathlib import Path
import json,subprocess,os
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--environment',type=Path,required=True);parser.add_argument('--work-dir',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent;work=args.work_dir.resolve();work.mkdir(parents=True,exist_ok=True);envdir=args.environment.resolve();runtime=root/'python/umf_access/src';generated=work/'generated';base=root/'tests/compilation/python/static/search'
subprocess.run(['bun',str(root/'scripts/generate-access-search-fixture.ts'),str(generated)],cwd=root,check=True)
report={}
for tool in ['mypy','pyright','ty']:
 report[tool]={}
 for phase in ['positive','negative']:
  files=[generated/'search_docs',base/'positive.py'] if phase=='positive' else sorted((base/'negative').glob('*.py'))
  env=dict(os.environ,MYPYPATH=str(runtime)+':'+str(generated),PYTHONPATH=str(runtime)+':'+str(generated))
  command=[str(envdir/'bin'/tool)]
  if tool=='mypy':command+=['--python-version','3.11','--check-untyped-defs','--follow-imports=silent','--cache-dir',str(work/'mypy-current-cache'),*map(str,files)]
  elif tool=='ty':command+=['check','--python-version','3.11','--python',str(envdir),'--extra-search-path',str(runtime),'--extra-search-path',str(generated),'--output-format','concise',*map(str,files)]
  else:
   config=work/('pyright-'+phase+'.json');config.write_text(json.dumps({'include':[os.path.relpath(p,work) for p in files],'extraPaths':[str(runtime),str(generated)],'typeCheckingMode':'basic','pythonVersion':'3.11'}));command+=['--project',str(config),'--pythonpath',str(envdir/'bin/python')]
  result=subprocess.run(command,env=env,capture_output=True,text=True,cwd=root);text=result.stdout+result.stderr;(work/(tool+'-'+phase+'.log')).write_text(text)
  covered=[p.name for p in files if p.name in text] if phase=='negative' else []
  passed=result.returncode==0 if phase=='positive' else result.returncode!=0 and len(covered)==len(files) and not any(v in text for v in ('unresolved-import','Cannot find','could not be resolved'))
  report[tool][phase]={'passed':passed,'exitCode':result.returncode,'covered':covered};print(tool,phase,passed,flush=True)
(work/'results.json').write_text(json.dumps(report,indent=2)+'\n')
assert all(case['passed'] for cases in report.values() for case in cases.values()),report
