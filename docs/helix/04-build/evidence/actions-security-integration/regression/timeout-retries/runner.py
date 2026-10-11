from pathlib import Path
import subprocess,json,hashlib,time
r=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf')
semantic=json.loads((r/'.cache/actions-security-semantic-execution/record.json').read_text())
assert semantic.get('inputsHeldStable') is True, 'Semantic source seal must complete first'
files=json.loads(Path('/private/tmp/umf-security-regression-final-result.json').read_text())['ordinaryTimeoutRetryFiles']
out=r/'.cache/actions-security-timeout-retries';out.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for i,f in enumerate(files,1):
 before=sha(r/f);log=out/f'{i}.log';start=time.time();cmd=['bun','test',f]
 with log.open('wb') as stream: result=subprocess.run(cmd,cwd=r,stdout=stream,stderr=subprocess.STDOUT)
 assert sha(r/f)==before, f'Authored test changed: {f}'
 records.append({'command':cmd,'exitCode':result.returncode,'testFileSha256':before,'log':log.name,'logSha256':sha(log),'durationSeconds':time.time()-start})
 (out/'record.json').write_text(json.dumps({'scope':'Serial unchanged full-file retries of actual regression timeouts; original failures retained','records':records,'complete':len(records)==len(files),'allPassed':all(x['exitCode']==0 for x in records)},indent=2)+'\n')
 print(f'Retry {i}: {f}: exit {result.returncode}',flush=True)
 if result.returncode:raise SystemExit(result.returncode)
