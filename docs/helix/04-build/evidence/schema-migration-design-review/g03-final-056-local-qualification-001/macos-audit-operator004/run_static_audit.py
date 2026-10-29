#!/usr/bin/env python3
"""One-shot bounded static-only audit of the exact frozen build002 wheel."""
from __future__ import annotations
import datetime,hashlib,json,os,pathlib,selectors,signal,stat,subprocess,sys,time,uuid
OUT=pathlib.Path('/private/tmp/g03-weft-macos-arm64-audit-004')
ORIGINAL=pathlib.Path('/private/tmp/g03-weft-macos-arm64-build-002')
WHEEL=ORIGINAL/'dist/umf_weft-0.4.56-cp39-abi3-macosx_11_0_arm64.whl'; RESULT=ORIGINAL/'result.json'
PLAN=pathlib.Path('/private/tmp/g03-macos-build002-static-oracle-sol-actual-plan001.md')
SOURCE=pathlib.Path('/private/tmp/weft-g03-ordinary-module')
SOURCE_CUSTODY=pathlib.Path('/private/tmp/g03-macos-source-custody-for-audit003-001')
SOURCE_ROWS=SOURCE_CUSTODY/'source-inputs.rows.json'; CUSTODY=SOURCE_CUSTODY/'custody.json'
SOURCE_ASSETS={'source-inputs.rows.json':('6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2',512*1024),'git-stage-roster.txt':('bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b',1024*1024),'custody.json':('e936a962be023654bd045cafa1f02d664e06e4c6bd6f686e4441f8558e027621',16*1024)}
PYTHON=pathlib.Path('/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9')
PYTHON_SHA256='6e7ae61f68a3838094fc56590f84c52069a97d7816f6bb79e0e85995b340e464'; PYTHON_BYTES=53200
EXPECTED={'result.json':('2aaa9dbe418cae86db3cac1f3c688a60d8b75746e31ec02badb1456941b663f0',1000000),'wheel':('68f9297b4b55df483b86d3041040991c4dadfb9b4d63afcff1420c43f93ae41d',33554432),'plan':('cad229b19abb5b61423aa37065d2de751e9e3ba417dbab484baa00e70629af24',1024*1024),'oldHelper':('fbfbf1c0214e98d26987cc625084a1429ab578d9f48f546a5d4a4002803dbe0b',256*1024)}
OLD_HELPER=pathlib.Path('/private/tmp/g03-macos-build-only-operator-002/static_audit.py')
HELPER_SHA256='ff38aded4a48b285a7c0c6f1bc02def7b24fcd7890dd896a440ea38ebf833fb6'; HELPER_BYTES=15878
WHEEL_BYTES=11190603; LOG_CAP=1024*1024; META_CAP=16*1024*1024; AUDIT_LIMIT=120; AGGREGATE=180; TERMINAL=60; GRACE=10; PUBLISH_MARGIN=10; RECEIPT_VERIFY_MARGIN=5
EXEC=str(uuid.uuid4()); OUT_OWNED=False; LOG_USED=0; START=time.monotonic(); AGGREGATE_END=START+AGGREGATE; WORK_DEADLINE=AGGREGATE_END-TERMINAL; FINAL_DEADLINE=None; FINALIZING=False

def sha(b):return hashlib.sha256(b).hexdigest()
def active_deadline():return FINAL_DEADLINE if FINALIZING else WORK_DEADLINE
def hash_file(p,cap,deadline=None):
 end=deadline if deadline is not None else active_deadline()
 st=p.lstat()
 if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size>cap:raise ValueError('unsafe or oversized input: '+str(p))
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  while True:
   if time.monotonic()>=end:raise TimeoutError('bounded hash deadline reached: '+str(p))
   b=f.read(min(1024*1024,cap+1-n))
   if not b:break
   n+=len(b)
   if n>cap:raise ValueError('input exceeds cap: '+str(p))
   h.update(b)
 st2=p.lstat()
 if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns) or n!=st.st_size:raise ValueError('input changed while hashing: '+str(p))
 return n,h.hexdigest()
def read_capped(p,cap,deadline=None):
 end=deadline if deadline is not None else active_deadline();st=p.lstat()
 if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size>cap:raise ValueError('unsafe or oversized metadata input: '+str(p))
 out=bytearray()
 with p.open('rb') as f:
  while True:
   if time.monotonic()>=end:raise TimeoutError('bounded read deadline reached: '+str(p))
   b=f.read(min(65536,cap+1-len(out)))
   if not b:break
   out.extend(b)
   if len(out)>cap:raise ValueError('metadata input grew past cap')
 after=p.lstat()
 if len(out)!=st.st_size or (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise ValueError('metadata input changed while reading')
 return bytes(out)
def source_snapshot(rows):
 root_stat=SOURCE.lstat()
 if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):raise RuntimeError('producer source root is not a direct directory')
 if sha((json.dumps(rows,sort_keys=True)+'\n').encode())!='6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2' or len(rows)!=1459:raise RuntimeError('closed source rows do not match original build002 Q roster')
 result=[]
 for row in rows:
  rel=row.get('path');size=row.get('bytes');digest=row.get('sha256')
  if not isinstance(rel,str) or not isinstance(size,int) or size<0 or size>32*1024*1024 or not isinstance(digest,str) or len(digest)!=64:raise RuntimeError('source row has invalid path/size/hash')
  pp=pathlib.PurePosixPath(rel)
  if pp.is_absolute() or '..' in pp.parts or '\\' in rel or not rel:raise RuntimeError('unsafe source row path')
  path=SOURCE
  for part in pp.parts:
   path=path/part
   if path.is_symlink():raise RuntimeError('source row traverses a symlink: '+rel)
  n,d=hash_file(path,32*1024*1024)
  if (n,d)!=(size,digest):raise RuntimeError('source input differs from frozen P56 row: '+rel)
  result.append({'path':rel,'bytes':n,'sha256':d})
 return {'count':len(result),'totalBytes':sum(x['bytes'] for x in result),'rosterSha256':sha((json.dumps(result,sort_keys=True)+'\n').encode()),'rows':result}
def write_seed(path,obj):
 raw=(json.dumps(obj,sort_keys=True,indent=2)+'\n').encode()
 if len(raw)>META_CAP:raise ValueError('seed metadata cap exceeded')
 with path.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 fd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
 return len(raw),sha(raw)
def atomic_json_replace(path,obj):
 raw=(json.dumps(obj,sort_keys=True,indent=2)+'\n').encode()
 if len(raw)>META_CAP:raise ValueError('terminal metadata cap exceeded')
 end=active_deadline()
 if time.monotonic()>=end:raise TimeoutError('terminal deadline reached before atomic receipt write')
 tmp=path.with_name(path.name+'.tmp-'+uuid.uuid4().hex)
 with tmp.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 if time.monotonic()>=end:raise TimeoutError('terminal deadline reached before receipt replacement')
 os.replace(tmp,path);fd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
 if time.monotonic()>=end:raise TimeoutError('terminal deadline reached after receipt replacement')
 return len(raw),sha(raw)
def bounded_run(argv,limit,logdir):
 global LOG_USED
 allotted=min(limit,WORK_DEADLINE-time.monotonic())
 if allotted<=0:raise TimeoutError('bounded audit work deadline exhausted')
 names=['static-audit.stdout.log','static-audit.stderr.log'];paths=[logdir/n for n in names];left=max(0,LOG_CAP-LOG_USED);per=left//2
 fs=[p.open('xb') for p in paths];proc=subprocess.Popen(argv,cwd=SOURCE,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/bin:/bin','LC_ALL':'C','LANG':'C'},start_new_session=True)
 sel=selectors.DefaultSelector();raw_hashes=[hashlib.sha256(),hashlib.sha256()];kept_hashes=[hashlib.sha256(),hashlib.sha256()];retained=[0,0];truncated=[False,False];streams=(proc.stdout,proc.stderr)
 for i,s in enumerate(streams):os.set_blocking(s.fileno(),False);sel.register(s,selectors.EVENT_READ,i)
 mono_start=time.monotonic();utc_start=datetime.datetime.now(datetime.timezone.utc).isoformat();end=mono_start+allotted;term=None;timed=False;drain=False;capture_errors=[]
 try:
  while sel.get_map() or proc.poll() is None:
   now=time.monotonic()
   if now>=end and term is None:
    timed=True;term=now
    try:os.killpg(proc.pid,signal.SIGTERM)
    except ProcessLookupError:pass
   if term is not None and now>=term+GRACE:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    if sel.get_map():drain=True
    for key in list(sel.get_map().values()):
     try:sel.unregister(key.fileobj);key.fileobj.close()
     except OSError as exc:capture_errors.append('stream-close '+type(exc).__name__)
    break
   for key,_ in sel.select(.1):
    i=key.data
    try:data=os.read(key.fileobj.fileno(),65536)
    except BlockingIOError:continue
    except OSError as exc:capture_errors.append('stream-read '+type(exc).__name__);continue
    if not data:
     try:sel.unregister(key.fileobj)
     except KeyError:pass
     continue
    raw_hashes[i].update(data);allow=max(0,per-retained[i]);part=data[:allow]
    if part:
     try:fs[i].write(part);kept_hashes[i].update(part);retained[i]+=len(part)
     except OSError as exc:capture_errors.append('log-write '+type(exc).__name__)
    if len(part)<len(data):truncated[i]=True
  if proc.poll() is None:
   try:proc.wait(timeout=1)
   except subprocess.TimeoutExpired:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:proc.wait(timeout=1)
    except subprocess.TimeoutExpired:capture_errors.append('process wait after kill timed out')
 finally:
  try:sel.close()
  except BaseException as exc:capture_errors.append('selector-close '+type(exc).__name__)
  for i,f in enumerate(fs):
   for op in ('flush','fsync','close'):
    try:
     if op=='flush':f.flush()
     elif op=='fsync':os.fsync(f.fileno())
     else:f.close()
    except BaseException as exc:capture_errors.append(op+'['+str(i)+'] '+type(exc).__name__)
 LOG_USED+=sum(retained)
 return {'name':'static-audit','argv':argv,'cwd':str(SOURCE),'startUtc':utc_start,'endUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'monotonicStart':mono_start,'monotonicEnd':time.monotonic(),'durationSeconds':round(time.monotonic()-mono_start,3),'limitSeconds':limit,'effectiveDeadlineSeconds':round(allotted,3),'exitCode':proc.returncode,'timedOut':timed,'drainExpired':drain,'truncated':truncated,'retainedBytes':retained,'rawSha256':[h.hexdigest() for h in raw_hashes],'retainedSha256':[h.hexdigest() for h in kept_hashes],'paths':[str(p) for p in paths],'physical':[],'captureErrors':capture_errors,'captureVerified':False,'ok':not(timed or drain or any(truncated) or capture_errors or proc.returncode!=0)}
def main():
 global OUT_OWNED,FINALIZING,FINAL_DEADLINE
 status='FAIL_OR_UNKNOWN';failure=None;capture=None;source_before=None;source_after=None;report=None;helper=None;helper_after=None;runner_before=None;runner_after=None;wheel_before=None;wheel_after=None;python_identity=None;python_after=None;asset_before={};asset_after={};source_rows=None;result_before=None;result_after=None;static_data=None
 try:
  if OUT.exists() or OUT.is_symlink():raise RuntimeError('audit004 output must be fresh')
  OUT.mkdir(mode=0o700);OUT_OWNED=True;(OUT/'logs').mkdir(mode=0o700)
  write_seed(OUT/'result.json',{'profile':'weft-local-macos-static-audit-only/1','status':'FAIL_OR_UNKNOWN','executionId':EXEC,'failure':'preflight incomplete'})
  if pathlib.Path(sys.executable).resolve()!=PYTHON.resolve():raise RuntimeError('must run under pinned CLT Python 3.9')
  python_identity=hash_file(PYTHON,256*1024)
  if python_identity!=(PYTHON_BYTES,PYTHON_SHA256):raise RuntimeError('pinned stdlib Python identity mismatch')
  for label,(digest,cap) in EXPECTED.items():
   path={'result.json':RESULT,'wheel':WHEEL,'plan':PLAN,'oldHelper':OLD_HELPER}[label];n,actual=hash_file(path,cap)
   if actual!=digest:raise RuntimeError(label+' identity mismatch')
   if label=='result.json':result_before=(n,actual)
  if result_before!=(376450,EXPECTED['result.json'][0]):raise RuntimeError('original002 result size mismatch')
  result_bytes=read_capped(RESULT,1000000)
  if sha(result_bytes)!=result_before[1] or len(result_bytes)!=result_before[0]:raise RuntimeError('original002 result read/hash closure mismatch')
  prior=json.loads(result_bytes)
  if prior.get('profile')!='weft-local-macos-arm64-build-static/1' or prior.get('status')!='FAIL_OR_UNKNOWN' or prior.get('candidate') is not None:raise RuntimeError('original002 failure receipt/profile changed')
  if prior.get('source',{}).get('commit')!='973d864c8d26b2bc173a411eac8368da5efc1ab3' or prior.get('source',{}).get('tree')!='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff' or prior.get('source',{}).get('selectedInputRosterSha256')!='6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2':raise RuntimeError('original002 source identity summary changed')
  for name,(digest,cap) in SOURCE_ASSETS.items():
   p=SOURCE_CUSTODY/name;n,d=hash_file(p,cap)
   if d!=digest:raise RuntimeError('source custody asset identity mismatch: '+name)
   asset_before[name]={'path':str(p),'bytes':n,'sha256':d}
  custody=json.loads(read_capped(CUSTODY,16*1024))
  if (custody.get('producerCommit'),custody.get('producerTree'),custody.get('selectedInputCount'),custody.get('selectedInputRosterSha256'),custody.get('gitStageRosterSha256'),custody.get('sourceRoot'))!=('973d864c8d26b2bc173a411eac8368da5efc1ab3','8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff',1459,'6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2','bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b',str(SOURCE)):raise RuntimeError('source custody metadata does not close over original P56/Q identity')
  source_rows=json.loads(read_capped(SOURCE_ROWS,512*1024));source_before=source_snapshot(source_rows)
  wheel_before=hash_file(WHEEL,33554432)
  if wheel_before!=(WHEEL_BYTES,EXPECTED['wheel'][0]):raise RuntimeError('wheel identity mismatch')
  helper_path=pathlib.Path(__file__).with_name('static_audit.py');hn,hh=hash_file(helper_path,256*1024)
  if (hn,hh)!=(HELPER_BYTES,HELPER_SHA256):raise RuntimeError('successor helper differs from reviewed pinned source')
  helper={'path':str(helper_path),'bytes':hn,'sha256':hh}
  runner_path=pathlib.Path(__file__);runner_before=hash_file(runner_path,512*1024)
  cap_start=time.monotonic();capture=bounded_run([str(PYTHON),str(helper_path),str(WHEEL),str(OUT/'static-audit.json'),str(SOURCE)],AUDIT_LIMIT,OUT/'logs')
  if not capture['ok']:raise RuntimeError('bounded static audit failed')
  if time.monotonic()-cap_start>AUDIT_LIMIT:raise TimeoutError('audit plus closure exceeded 120-second cap')
  report_bytes=read_capped(OUT/'static-audit.json',META_CAP)
  report={'path':str(OUT/'static-audit.json'),'bytes':len(report_bytes),'sha256':sha(report_bytes)}
  static_data=json.loads(report_bytes)
  if static_data.get('status')!='STATIC_WHEEL_PASS' or static_data.get('wheel',{}).get('sha256')!=EXPECTED['wheel'][0] or static_data.get('nativeSha256')!='7f746042c88dde86b0a096b831a4243d40e2448255c1146cf515787b22c30225':raise RuntimeError('static report does not close over pinned wheel/member')
  status='LOCAL_MACOS_STATIC_AUDIT_ONLY_PASS'
 except BaseException as exc:
  failure=f'{type(exc).__name__}: {str(exc)[:400]}';status='FAIL_OR_UNKNOWN'
 finally:
  FINALIZING=True;FINAL_DEADLINE=min(AGGREGATE_END-PUBLISH_MARGIN,time.monotonic()+TERMINAL)
  try:
   closure_errors=[];evidence=[]
   try:wheel_after=hash_file(WHEEL,33554432)
   except BaseException as exc:closure_errors.append('wheel terminal hash: '+type(exc).__name__)
   try:source_after=source_snapshot(source_rows) if source_rows is not None else None
   except BaseException as exc:source_after={'error':f'{type(exc).__name__}: {str(exc)[:160]}'};closure_errors.append('source terminal hash: '+type(exc).__name__)
   for name,(digest,cap) in SOURCE_ASSETS.items():
    try:
     p=SOURCE_CUSTODY/name;n,d=hash_file(p,cap);asset_after[name]={'path':str(p),'bytes':n,'sha256':d}
     if d!=digest:closure_errors.append('source custody asset mismatch: '+name)
    except BaseException as exc:asset_after[name]={'error':type(exc).__name__};closure_errors.append('source custody asset hash: '+name)
   try:helper_after=hash_file(pathlib.Path(helper['path']),256*1024) if helper else None
   except BaseException as exc:helper_after={'error':type(exc).__name__};closure_errors.append('helper terminal hash: '+type(exc).__name__)
   try:runner_after=hash_file(pathlib.Path(__file__),512*1024) if runner_before else None
   except BaseException as exc:runner_after={'error':type(exc).__name__};closure_errors.append('runner terminal hash: '+type(exc).__name__)
   try:python_after=hash_file(PYTHON,256*1024) if python_identity else None
   except BaseException as exc:python_after={'error':type(exc).__name__};closure_errors.append('Python terminal hash: '+type(exc).__name__)
   try:result_after=hash_file(RESULT,1000000) if result_before else None
   except BaseException as exc:result_after={'error':type(exc).__name__};closure_errors.append('original receipt terminal hash: '+type(exc).__name__)
   if wheel_before and wheel_after!=wheel_before:closure_errors.append('original wheel changed')
   if result_before and result_after!=result_before:closure_errors.append('original002 receipt changed')
   if python_identity and python_after!=python_identity:closure_errors.append('pinned Python changed')
   if source_before!=source_after:closure_errors.append('producer P56 source roster changed')
   if asset_before!=asset_after:closure_errors.append('source custody asset changed')
   if helper and helper_after!=(helper['bytes'],helper['sha256']):closure_errors.append('static helper changed')
   if runner_before and runner_after!=runner_before:closure_errors.append('audit driver changed')
   physical_log_rows={}
   if capture:
    for i,name in enumerate(('static-audit.stdout.log','static-audit.stderr.log')):
     p=OUT/'logs'/name
     try:
      n,d=hash_file(p,LOG_CAP);physical={'path':str(p),'bytes':n,'sha256':d};capture['physical'].append(physical);physical_log_rows[name]=(n,d)
      if n!=capture['retainedBytes'][i] or d!=capture['retainedSha256'][i]:closure_errors.append('physical log capture mismatch: '+name)
     except BaseException as exc:closure_errors.append('physical log hash '+name+': '+type(exc).__name__)
    expected_names=['static-audit.stdout.log','static-audit.stderr.log']
    actual_names=[pathlib.Path(x['path']).name for x in capture['physical']]
    capture['captureVerified']=actual_names==expected_names and not any('physical log' in x for x in closure_errors)
    capture['ok']=capture['ok'] and capture['captureVerified']
   for rel,cap in (('static-audit.json',META_CAP),('logs/static-audit.stdout.log',LOG_CAP),('logs/static-audit.stderr.log',LOG_CAP)):
    p=OUT/rel
    try:
     n,d=hash_file(p,cap);evidence.append({'path':rel,'bytes':n,'sha256':d})
     if rel=='static-audit.json' and report and (n,d)!=(report['bytes'],report['sha256']):closure_errors.append('static report changed after bounded read')
     if rel.startswith('logs/') and (n,d)!=physical_log_rows.get(p.name):closure_errors.append('selected evidence log differs from captured physical log: '+rel)
    except BaseException as exc:closure_errors.append('selected evidence hash '+rel+': '+type(exc).__name__)
   if len(evidence)!=3:closure_errors.append('complete static report and two log files are required')
   if capture is None or not capture.get('ok'):closure_errors.append('capture incomplete or nonzero')
   if status=='LOCAL_MACOS_STATIC_AUDIT_ONLY_PASS' and FINAL_DEADLINE-time.monotonic()<RECEIPT_VERIFY_MARGIN:closure_errors.append('insufficient terminal time remains for durable success receipt verification/fallback')
   if closure_errors:
    status='FAIL_OR_UNKNOWN'
    joined='; '.join(closure_errors)
    failure=(failure+'; ' if failure else '')+joined[:1000]
   family=sum(x['bytes'] for x in evidence)
   record={'profile':'weft-local-macos-static-audit-only/1','status':status,'executionKind':'local-static-audit-only','executionId':EXEC,'acceptedPlan':{'path':str(PLAN),'sha256':EXPECTED['plan'][0]},'originalInputs':{'result':{'path':str(RESULT),'bytes':376450,'sha256':EXPECTED['result.json'][0],'before':result_before,'after':result_after},'wheel':{'path':str(WHEEL),'bytes':WHEEL_BYTES,'sha256':EXPECTED['wheel'][0]},'source':{'commit':'973d864c8d26b2bc173a411eac8368da5efc1ab3','tree':'8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff','selectedInputCount':1459,'selectedInputRosterSha256':'6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2','custodyAssetsBefore':asset_before,'custodyAssetsAfter':asset_after,'sourceInputsBefore':{k:source_before.get(k) for k in ('count','totalBytes','rosterSha256')} if isinstance(source_before,dict) else source_before,'sourceInputsAfter':{k:source_after.get(k) for k in ('count','totalBytes','rosterSha256')} if isinstance(source_after,dict) else source_after}},'operator':{'helper':helper,'helperAfter':helper_after,'runnerPath':str(runner_path) if 'runner_path' in locals() else str(__file__),'runnerBefore':runner_before,'runnerAfter':runner_after,'pythonPath':str(PYTHON),'pythonBefore':python_identity,'pythonAfter':python_after},'wheelBefore':wheel_before,'wheelAfter':wheel_after,'staticReport':report,'capture':capture,'selectedEvidenceFiles':evidence,'selectedEvidenceBytes':family,'limits':{'aggregateSeconds':AGGREGATE,'auditSeconds':AUDIT_LIMIT,'terminalReserveSeconds':TERMINAL,'terminalDeadlineMonotonic':FINAL_DEADLINE,'killGraceSeconds':GRACE,'publicationMarginSeconds':PUBLISH_MARGIN,'receiptVerifyFallbackMarginSeconds':RECEIPT_VERIFY_MARGIN,'aggregateLogBytes':LOG_CAP,'metadataBytes':META_CAP,'wheelCompressedBytes':33554432,'wheelExpandedBytes':134217728,'memberBytes':134217728,'memberCount':160},'cleanupErrors':[],'closureErrors':closure_errors,'functionalQualification':'NOT_RUN','installed':False,'imported':False,'nativeExecuted':False,'compilerParity':False,'browserParity':False,'hosted':False,'failure':failure}
   raw=(json.dumps(record,sort_keys=True,indent=2)+'\n').encode()
   if len(raw)+family>META_CAP:raise RuntimeError('complete evidence family exceeds metadata cap')
   if OUT_OWNED:
    if time.monotonic()>=FINAL_DEADLINE:raise TimeoutError('terminal deadline reached before receipt publication')
    result_size,result_digest=atomic_json_replace(OUT/'result.json',record)
    verified=hash_file(OUT/'result.json',META_CAP)
    if verified!=(result_size,result_digest):raise RuntimeError('terminal receipt bytes/hash do not verify')
    if status=='LOCAL_MACOS_STATIC_AUDIT_ONLY_PASS' and (closure_errors or capture is None or not capture.get('ok') or len(evidence)!=3):raise RuntimeError('success predicates did not close')
  except BaseException as exc:
   status='FAIL_OR_UNKNOWN';fallback={'profile':'weft-local-macos-static-audit-only/1','status':status,'executionId':EXEC,'failure':(failure+'; ' if failure else '')+'terminal closure: '+type(exc).__name__+': '+str(exc)[:300],'capture':capture,'wheelBefore':wheel_before,'wheelAfter':wheel_after,'sourceInputsBefore':{k:source_before.get(k) for k in ('count','totalBytes','rosterSha256')} if isinstance(source_before,dict) else source_before,'sourceInputsAfter':{k:source_after.get(k) for k in ('count','totalBytes','rosterSha256')} if isinstance(source_after,dict) else source_after}
   try:
    if OUT_OWNED:atomic_json_replace(OUT/'result.json',fallback)
   except BaseException:pass
 print(json.dumps({'status':status,'failure':failure,'output':str(OUT)},sort_keys=True));return 0 if status=='LOCAL_MACOS_STATIC_AUDIT_ONLY_PASS' else 1
if __name__=='__main__':raise SystemExit(main())
