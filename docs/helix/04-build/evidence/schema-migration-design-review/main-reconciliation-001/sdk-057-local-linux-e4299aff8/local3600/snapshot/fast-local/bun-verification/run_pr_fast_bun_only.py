#!/usr/bin/env python3
"""Bounded local Linux execution of the two remaining PR-fast Bun commands."""
import hashlib,json,os,pathlib,selectors,signal,subprocess,time
ROOT=pathlib.Path('/private/tmp/migration-pr-fast-bun-local-e4299aff8-001'); WORK=ROOT/'work'; EVIDENCE=ROOT/'evidence'
IMAGE='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'; SOURCE_VOLUME='umf-migration-source-267675510'
TOTAL=600; OUTER_CAP=65536; TERM_GRACE=10

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,obj): p.write_text(json.dumps(obj,sort_keys=True,indent=2)+'\n')
def main():
 EVIDENCE.mkdir(parents=True,exist_ok=True); (WORK/'output').mkdir(parents=True,exist_ok=True)
 guest=WORK/'harness/guest.py'; guest_sha=sha(guest)
 insp=subprocess.run(['docker','image','inspect','--format','{{.Id}} {{.Os}}/{{.Architecture}}',IMAGE],capture_output=True,text=True,timeout=20,check=True).stdout.strip()
 cidfile=EVIDENCE/'bun-local-owned.cid'
 if cidfile.exists(): raise RuntimeError('CID path already exists')
 argv=['docker','run','--rm','--pull=never','--platform=linux/amd64','--network=none','--read-only','--tmpfs','/tmp:rw,size=1g','--cpus=4','--memory=8g','--pids-limit=8192','--cidfile',str(cidfile),'--mount',f'type=volume,src={SOURCE_VOLUME},dst=/source,readonly','--mount',f'type=bind,src={WORK},dst=/work','--workdir','/source','--entrypoint','/bin/bash',IMAGE,'-lc','python3 /work/harness/guest.py']
 started=time.monotonic(); deadline=started+TOTAL; t0=time.monotonic()
 proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 sel=selectors.DefaultSelector(); op=EVIDENCE/'outer.stdout.log'; ep=EVIDENCE/'outer.stderr.log'; out=op.open('wb'); err=ep.open('wb')
 sel.register(proc.stdout,selectors.EVENT_READ,out); sel.register(proc.stderr,selectors.EVENT_READ,err); sizes={out:0,err:0}; trunc=False; timed=False
 while sel.get_map():
  rem=deadline-time.monotonic()
  if rem<=0: timed=True; break
  for key,_ in sel.select(min(.25,rem)):
   data=os.read(key.fileobj.fileno(),65536)
   if not data: sel.unregister(key.fileobj); key.fileobj.close(); continue
   take=min(len(data),max(0,OUTER_CAP-sizes[out]-sizes[err]))
   if take: key.data.write(data[:take]); sizes[key.data]+=take
   if take<len(data): trunc=True; break
  if trunc: break
 if timed or trunc:
  try: os.killpg(proc.pid,signal.SIGTERM)
  except ProcessLookupError: pass
  try: proc.wait(timeout=TERM_GRACE)
  except subprocess.TimeoutExpired:
   try: os.killpg(proc.pid,signal.SIGKILL)
   except ProcessLookupError: pass
   proc.wait()
 else: proc.wait()
 out.flush();err.flush();out.close();err.close()
 cid=cidfile.read_text().strip() if cidfile.exists() else ''
 cleanup='no-cidfile'
 if cid:
  chk=subprocess.run(['docker','inspect','--type=container',cid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15,check=False)
  if chk.returncode==0:
   subprocess.run(['docker','rm','--force',cid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15,check=False)
  verify=subprocess.run(['docker','inspect','--type=container',cid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15,check=False)
  cleanup='verified-absent' if verify.returncode!=0 else 'FAILED-still-present'
 guest_receipt=WORK/'evidence/guest-receipt.json'
 guest_data=json.loads(guest_receipt.read_text()) if guest_receipt.is_file() else None
 outer={'profile':'umf.pr-fast-bun-local-existing-tree/1','status':guest_data['status'] if guest_data else 'FAIL_OR_UNKNOWN','driverSha256':sha(pathlib.Path(__file__)),'guestHarnessSha256':guest_sha,'imageInspect':insp,'containerArgv':argv,'containerExitCode':proc.returncode,'containerTimedOut':timed,'outerOutputTruncated':trunc,'outerOutputBytes':sizes[out]+sizes[err],'outerLogs':{'stdout':{'path':str(op),'sizeBytes':sizes[out],'sha256':sha(op)},'stderr':{'path':str(ep),'sizeBytes':sizes[err],'sha256':sha(ep)}},'containerCleanup':cleanup,'elapsedSeconds':round(time.monotonic()-started,3),'aggregateTimeLimitSeconds':TOTAL,'aggregateCapturedLogLimitBytes':1048576,'guestReceiptPath':str(guest_receipt),'guestReceiptSha256':sha(guest_receipt) if guest_receipt.is_file() else None,'guest':guest_data}
 candidate_bytes=(guest_data or {}).get('aggregateCapturedLogBytes',0)
 outer['aggregateCapturedLogBytes']=candidate_bytes+sizes[out]+sizes[err]
 if outer['aggregateCapturedLogBytes']>1048576 or timed or trunc or cleanup!='verified-absent' or proc.returncode!=0 or not guest_data or guest_data['status']!='LOCAL_LINUX_BUN_TEST_AND_BROWSER_BUILD_PASS': outer['status']='FAIL_OR_UNKNOWN'
 write(EVIDENCE/'receipt.json',outer)
 print(json.dumps({k:v for k,v in outer.items() if k!='guest'},sort_keys=True,indent=2))
 return 0 if outer['status']=='LOCAL_LINUX_BUN_TEST_AND_BROWSER_BUILD_PASS' else 1
if __name__=='__main__': raise SystemExit(main())
