#!/usr/bin/env python3
import hashlib, json, os, pathlib, re, selectors, signal, subprocess, sys, time
SOURCE='/source'; WORK='/work'; EVIDENCE=pathlib.Path(WORK)/'evidence'; OUTPUT=pathlib.Path(WORK)/'output/umf-pr-fast'
EXPECTED_COMMIT='e4299aff8e87e9d211f9d86df2f2013ab9c95945'; EXPECTED_TREE='8b98c0d895983ba2b7637dd3aea567dab0943883'
EXPECTED_PACKAGE='c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b'; EXPECTED_LOCK='5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4'
IMAGE='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
LOG_LIMIT=983040; STEP_LIMIT=180; TOTAL_LIMIT=float(os.environ.get('PRFAST_REMAINING_SECONDS','600'))

def digest_file(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()
def write_json(path,obj): pathlib.Path(path).write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n')
def tree_fingerprint(root):
 root=pathlib.Path(root); h=hashlib.sha256(); count=0; total=0
 for base,dirs,files in os.walk(root,topdown=True,followlinks=False):
  symlink_dirs=[n for n in dirs if (pathlib.Path(base)/n).is_symlink()]
  dirs[:]=sorted(n for n in dirs if n not in symlink_dirs)
  for name in sorted(dirs+files+symlink_dirs):
   p=pathlib.Path(base)/name; rel=p.relative_to(root).as_posix(); count+=1
   if p.is_symlink(): row={'path':rel,'kind':'symlink','target':os.readlink(p)}
   elif p.is_dir(): row={'path':rel,'kind':'directory'}
   elif p.is_file():
    size=p.stat().st_size; total+=size; row={'path':rel,'kind':'file','sizeBytes':size,'sha256':digest_file(p)}
   else: row={'path':rel,'kind':'special'}
   h.update(json.dumps(row,sort_keys=True,separators=(',',':')).encode()+b'\n')
 return {'root':str(root),'entries':count,'regularFileBytes':total,'sha256':h.hexdigest()}
def source_identity():
 def git(*args): return subprocess.check_output(['git','-c','safe.directory=/source','-C',SOURCE,*args],env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'},text=True).strip()
 commit=git('rev-parse','HEAD'); tree=git('rev-parse','HEAD^{tree}'); status=git('status','--porcelain=v1','--untracked-files=all')
 package=digest_file(pathlib.Path(SOURCE)/'package.json'); lock=digest_file(pathlib.Path(SOURCE)/'bun.lock')
 if (commit,tree,status,package,lock)!=(EXPECTED_COMMIT,EXPECTED_TREE,'',EXPECTED_PACKAGE,EXPECTED_LOCK): raise RuntimeError('source P/tree/clean or package/lock identity mismatch')
 return {'commit':commit,'tree':tree,'porcelainStatus':status,'packageJsonSha256':package,'bunLockSha256':lock}
def check_direct_packages():
 package=json.load(open(SOURCE+'/package.json',encoding='utf-8'))
 lock_text=open(SOURCE+'/bun.lock',encoding='utf-8').read(); lock_text=re.sub(r',(\s*[}\]])',r'\1',lock_text)
 locked=json.loads(lock_text)['workspaces']['']; rows=[]
 for section in ('dependencies','devDependencies'):
  for name,spec in package.get(section,{}).items():
   lock_spec=locked.get(section,{}).get(name); path=pathlib.Path(SOURCE)/'node_modules'/name/'package.json'
   if not path.is_file(): actual=None
   else: actual=json.loads(path.read_text(encoding='utf-8')).get('version')
   resolved=lock_spec.rsplit('@',1)[-1] if lock_spec and lock_spec.startswith('npm:') else lock_spec
   rows.append({'section':section,'name':name,'packageSpec':spec,'lockSpec':lock_spec,'installedVersion':actual,'match':bool(lock_spec==spec and actual==resolved)})
 if not rows or not all(x['match'] for x in rows): raise RuntimeError('direct dependency versions do not match package.json and bun.lock')
 canon=json.dumps(rows,sort_keys=True,separators=(',',':')).encode()
 return {'count':len(rows),'allMatch':True,'rowsSha256':hashlib.sha256(canon).hexdigest(),'rows':rows}
def run_command(name,argv,env,started,deadline,total_logs):
 remaining=min(STEP_LIMIT,deadline-time.monotonic())
 if remaining<=0: raise TimeoutError('600-second aggregate deadline reached before '+name)
 outp=EVIDENCE/(name+'.stdout.log'); errp=EVIDENCE/(name+'.stderr.log'); t0=time.monotonic()
 proc=subprocess.Popen(argv,cwd=SOURCE,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 sel=selectors.DefaultSelector(); out=outp.open('wb'); err=errp.open('wb'); sel.register(proc.stdout,selectors.EVENT_READ,out); sel.register(proc.stderr,selectors.EVENT_READ,err)
 sizes={out:0,err:0}; timed=False; truncated=False
 while sel.get_map():
  rem=min(remaining-(time.monotonic()-t0),deadline-time.monotonic())
  if rem<=0: timed=True; break
  for key,_ in sel.select(min(.25,rem)):
   data=os.read(key.fileobj.fileno(),65536)
   if not data: sel.unregister(key.fileobj); key.fileobj.close(); continue
   take=min(len(data),max(0,LOG_LIMIT-total_logs[0]))
   if take: key.data.write(data[:take]); sizes[key.data]+=take; total_logs[0]+=take
   if take<len(data): truncated=True; break
  if truncated: break
 if timed or truncated:
  try: os.killpg(proc.pid,signal.SIGTERM)
  except ProcessLookupError: pass
  try: proc.wait(timeout=10)
  except subprocess.TimeoutExpired:
   try: os.killpg(proc.pid,signal.SIGKILL)
   except ProcessLookupError: pass
   proc.wait()
 else: proc.wait()
 for f in (out,err): f.flush(); f.close()
 row={'name':name,'argv':argv,'durationSeconds':round(time.monotonic()-t0,3),'exitCode':proc.returncode,'timedOut':timed,'truncated':truncated,'stdout':{'path':str(outp),'sizeBytes':sizes[out],'sha256':digest_file(outp)},'stderr':{'path':str(errp),'sizeBytes':sizes[err],'sha256':digest_file(errp)}}
 if timed or truncated or proc.returncode!=0: raise CommandFailure(row)
 return row
class CommandFailure(Exception):
 def __init__(self,row): self.row=row; super().__init__(row['name']+' did not complete successfully')
def main():
 EVIDENCE.mkdir(parents=True,exist_ok=True); (pathlib.Path(WORK)/'home').mkdir(exist_ok=True); pathlib.Path('/tmp/bun-runtime-cache').mkdir(exist_ok=True)
 started=time.monotonic(); deadline=started+TOTAL_LIMIT; logs=[0]; receipt={'profile':'umf.pr-fast-bun-local-existing-tree/1','status':'FAIL_OR_UNKNOWN','executionKind':'local_linux_diagnostic','sourceVolume':'umf-migration-source-267675510','expectedSourceCommit':EXPECTED_COMMIT,'expectedSourceTree':EXPECTED_TREE,'runtimeImage':IMAGE,'network':'none for both candidate commands','aggregateTimeLimitSeconds':600,'perCandidateCommandLimitSeconds':STEP_LIMIT,'aggregateCapturedLogLimitBytes':LOG_LIMIT,'commands':[],'cleanup':'container-removal-verified-by-host'}
 try:
  identity=source_identity(); bun=subprocess.check_output(['bun','--version'],cwd=SOURCE,text=True).strip()
  if bun!='1.4.3': raise RuntimeError('unexpected Bun version '+bun)
  deps=tree_fingerprint(pathlib.Path(SOURCE)/'node_modules'); direct=check_direct_packages()
  receipt.update({'source':identity,'bunVersion':bun,'availableDependencySnapshot':deps,'directDependencyConsistency':direct})
  env={**os.environ,'HOME':'/tmp/home','BUN_RUNTIME_TRANSPILER_CACHE_PATH':'/tmp/bun-runtime-cache','PYTHONDONTWRITEBYTECODE':'1','RUNNER_TEMP':WORK+'/output'}
  tests=['bun','test','tests/core/cardinality-ideals.test.ts','tests/core/nullability-ideals.test.ts','tests/core/field-ideals.test.ts']
  try: test=run_command('portable-core-unit',tests,env,started,deadline,logs)
  except CommandFailure as exc: receipt['commands'].append(exc.row); raise
  receipt['commands'].append(test)
  text=(pathlib.Path(test['stdout']['path']).read_text(errors='replace')+'\n'+pathlib.Path(test['stderr']['path']).read_text(errors='replace'))
  passes=[int(x) for x in re.findall(r'(?m)^\s*(\d+)\s+pass\b',text)]; fails=[int(x) for x in re.findall(r'(?m)^\s*(\d+)\s+fail\b',text)]
  receipt['unitTestSummary']={'passCountReported':sum(passes),'failCountReported':sum(fails),'capturedStdoutSha256':test['stdout']['sha256'],'capturedStderrSha256':test['stderr']['sha256']}
  if sum(passes)!=14 or sum(fails)!=0: raise RuntimeError('Bun output did not report exactly 14 passing and 0 failing tests')
  build=['bun','build','src/model/document.ts','src/validation/document.ts','--target=browser','--outdir',WORK+'/output/umf-pr-fast']
  try: built=run_command('browser-targeted-build',build,env,started,deadline,logs)
  except CommandFailure as exc: receipt['commands'].append(exc.row); raise
  receipt['commands'].append(built)
  files=[]; total=0
  for p in sorted(OUTPUT.rglob('*')):
   if p.is_file() and not p.is_symlink():
    size=p.stat().st_size; total+=size; files.append({'path':p.relative_to(OUTPUT).as_posix(),'sizeBytes':size,'sha256':digest_file(p)})
  if not files or total>16*1024*1024: raise RuntimeError('browser output is empty or exceeds 16MiB')
  receipt['browserBundle']={'files':files,'totalBytes':total}
  after_identity=source_identity(); after_deps=tree_fingerprint(pathlib.Path(SOURCE)/'node_modules')
  if after_identity!=identity or after_deps!=deps: raise RuntimeError('source or available dependency snapshot changed during read-only checks')
  receipt['dependencyAfter']=after_deps; receipt['sourceAfter']=after_identity
  if time.monotonic()-started> TOTAL_LIMIT: raise TimeoutError('600-second aggregate deadline exceeded during final verification')
  receipt['aggregateCapturedLogBytes']=logs[0]; receipt['elapsedSeconds']=round(time.monotonic()-started,3); receipt['status']='LOCAL_LINUX_BUN_TEST_AND_BROWSER_BUILD_PASS'
 except Exception as exc:
  receipt['failure']=f'{type(exc).__name__}: {str(exc)[:300]}'; receipt['aggregateCapturedLogBytes']=logs[0]; receipt['elapsedSeconds']=round(time.monotonic()-started,3)
 write_json(EVIDENCE/'guest-receipt.json',receipt); print(json.dumps(receipt,sort_keys=True,indent=2))
 return 0 if receipt['status']=='LOCAL_LINUX_BUN_TEST_AND_BROWSER_BUILD_PASS' else 1
if __name__=='__main__': raise SystemExit(main())
