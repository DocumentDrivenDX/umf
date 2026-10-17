from pathlib import Path
import json,os,sys,subprocess,hashlib
from dataclasses import asdict
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');sys.path.insert(0,str(root/'scripts'))
from access_type_diagnostics import validate_negative
out=Path('/private/tmp/sdk-bulk-list-r22-20261017/cli');envdir=Path('/private/tmp/sdk-r22-314-env');proof=out/'typing-proof';proof.mkdir(exist_ok=True)
runtime=Path(subprocess.check_output([str(envdir/'bin/python'),'-I','-c','import sysconfig; print(sysconfig.get_path("purelib"))'],text=True).strip())
negative=sorted(out.glob('*_negative.py'));assert len(negative)==4
versions={'mypy':'2.4.0','pyright':'1.1.414','ty':'0.0.88'}
expected={'version':'umf-static-negative-sites/0.1','checkers':versions,'cases':[]}
for file in negative:
 expected['cases'].append({'path':file.name,'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sites':[{'line':4,'source':file.read_text().splitlines()[3].strip(),'rules':{'mypy':['list-item' if file.name=='element_negative.py' else 'call-overload'],'pyright':['reportCallIssue','reportArgumentType'],'ty':['no-matching-overload']}}]})
(proof/'reviewed-sites.json').write_text(json.dumps(expected,indent=2))
report={};env={**os.environ,'MYPYPATH':str(out),'PYTHONPATH':str(out)}
for tool in versions:
 version=subprocess.check_output([str(envdir/'bin'/tool),'--version'],text=True).strip();assert version.split()[1]==versions[tool]
 report[tool]={}
 for phase,files in [('positive',[out/'native_sales',out/'positive.py']),('negative',negative)]:
  cmd=[str(envdir/'bin'/tool)]
  if tool=='mypy':cmd+=['--python-executable',str(envdir/'bin/python'),'--python-version','3.11','--check-untyped-defs','--namespace-packages','--explicit-package-bases','--follow-imports=silent','--cache-dir',str(proof/'mypy-cache')]+list(map(str,files))
  elif tool=='ty':cmd+=['check','--python-version','3.11','--python',str(envdir),'--extra-search-path',str(runtime),'--extra-search-path',str(out),'--output-format','concise']+list(map(str,files))
  else:
   config=proof/('pyright-'+phase+'.json');config.write_text(json.dumps({'include':[os.path.relpath(p,proof) for p in files],'extraPaths':[str(runtime),str(out)],'typeCheckingMode':'basic','pythonVersion':'3.11'}));cmd+=['--project',str(config),'--pythonpath',str(envdir/'bin/python'),'--outputjson']
  run=subprocess.run(cmd,env=env,capture_output=True,text=True,cwd=root);text=run.stdout+run.stderr;(proof/(tool+'-'+phase+'.log')).write_text(text)
  if phase=='positive':
   ok=run.returncode==0;diagnostics=[]
   if tool=='pyright':ok=ok and json.loads(run.stdout)['summary']['filesAnalyzed']>=len(files)
  else:
   diagnostics=validate_negative(tool,text,expected,out,returncode=run.returncode,files=negative);ok=True
  report[tool][phase]={'passed':ok,'version':version,'exitCode':run.returncode,'diagnostics':[asdict(d) for d in diagnostics]};print(tool,phase,ok,flush=True)
  (proof/'results.json').write_text(json.dumps(report,indent=2))
  assert ok,(tool,phase,text)
