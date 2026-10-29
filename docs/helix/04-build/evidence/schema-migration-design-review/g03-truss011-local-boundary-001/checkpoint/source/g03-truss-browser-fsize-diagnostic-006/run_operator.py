#!/usr/bin/env python3
"""Explicit-opt-in local Linux adapter for inherited Truss facts/entity browser parity."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, selectors, signal, stat, subprocess, sys, time, uuid, urllib.parse, re, math
ROOT=pathlib.Path('/private/tmp/g03-truss-browser-fsize-diagnostic-006'); PACKET=ROOT/'inputs/diagnostic-packet.json'; FROZEN=ROOT/'source-manifest.json'; OUTPUT_ROOT=ROOT/'runs'; P56=pathlib.Path('/private/tmp/weft-g03-ordinary-module');
RECEIPT009=pathlib.Path('/private/tmp/g03-final-truss-operator-009-runs/938487b5-7353-4879-aa26-ee034e629718'); JS_ROOTS={'playwright':pathlib.Path('/Users/erik/Projects/weft/node_modules/playwright'),'playwright-core':pathlib.Path('/Users/erik/Projects/weft/node_modules/playwright-core')};
TOTAL=1800; RESERVE=60; GRACE=10; RAW_CAP=512*1024; EVIDENCE_CAP=16*1024*1024; ARTIFACT_CAP=256*1024*1024

def digest(p,cap,deadline):
    if time.monotonic()>=deadline: raise TimeoutError('lane deadline while hashing '+str(p))
    st=p.lstat()
    if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>cap: raise RuntimeError('unsafe/oversize file '+str(p))
    fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0));h=hashlib.sha256();n=0
    try:
        opened=os.fstat(fd);identity=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)
        if (opened.st_dev,opened.st_ino,opened.st_size)!=(st.st_dev,st.st_ino,st.st_size):raise RuntimeError('file changed before hash '+str(p))
        while True:
            if time.monotonic()>=deadline: raise TimeoutError('lane deadline while hashing '+str(p))
            b=os.read(fd,65536)
            if not b:break
            n+=len(b)
            if n>cap: raise RuntimeError('file grew past cap '+str(p))
            h.update(b)
        after=os.fstat(fd);now=p.lstat()
        if n!=st.st_size or identity(st)!=identity(after) or identity(after)!=identity(now):raise RuntimeError('file changed while hashing '+str(p))
    finally:os.close(fd)
    return h.hexdigest(),n

def read_bounded(path,cap,deadline):
    p=pathlib.Path(path)
    before=p.lstat()
    if not stat.S_ISREG(before.st_mode) or p.is_symlink() or before.st_size>cap:raise RuntimeError('bounded input is unsafe or over cap: '+str(p))
    fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0)); chunks=[];total=0;h=hashlib.sha256()
    try:
        opened=os.fstat(fd)
        if (opened.st_dev,opened.st_ino,opened.st_size)!=(before.st_dev,before.st_ino,before.st_size):raise RuntimeError('bounded input changed before read')
        while True:
            if time.monotonic()>=deadline:raise TimeoutError('deadline while bounded-reading '+str(p))
            block=os.read(fd,min(65536,cap-total+1))
            if not block:break
            total+=len(block)
            if total>cap:raise RuntimeError('bounded input grew past cap: '+str(p))
            h.update(block);chunks.append(block)
        after=os.fstat(fd);now=p.lstat()
        identity=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)
        if total!=before.st_size or identity(before)!=identity(after) or identity(after)!=identity(now):raise RuntimeError('bounded input changed during read')
    finally:os.close(fd)
    return b''.join(chunks),h.hexdigest(),total

def read_text_bounded(path,cap,deadline):
    data,_,_=read_bounded(path,cap,deadline)
    return data.decode('utf-8')

def write_bounded(path,data,cap,deadline,*,exclusive=True):
    if time.monotonic()>=deadline:raise TimeoutError('deadline before output write: '+str(path))
    if len(data)>cap:raise RuntimeError('output exceeds per-file cap: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True);mode='xb' if exclusive else 'wb'
    with path.open(mode) as f:
        for off in range(0,len(data),65536):
            if time.monotonic()>=deadline:raise TimeoutError('deadline during output write: '+str(path))
            f.write(data[off:off+65536])
        f.flush();os.fsync(f.fileno())
    h,n=digest(path,cap,deadline)
    if (h,n)!=(hashlib.sha256(data).hexdigest(),len(data)):raise RuntimeError('output physical close mismatch: '+str(path))
    return h,n

class BoundedChildFailure(RuntimeError):
    def __init__(self,name,record,remaining):
        super().__init__('bounded child failed or capture incomplete: '+name)
        self.name=name;self.record=record;self.remaining=remaining

ACTIVE_RECEIPT=None
ACTIVE_CAP_LEFT=RAW_CAP
ACTIVE_TERMINAL_DEADLINE=None
CAPTURE_REGISTRY={}
OUTER_CLEANUP_RESERVE=64*1024
EXPECTED_PHYSICAL={}

def bind_physical(path,sha,size):
    key=str(pathlib.Path(path))
    value={'sha256':sha,'sizeBytes':size}
    if key in EXPECTED_PHYSICAL and EXPECTED_PHYSICAL[key]!=value:raise RuntimeError('conflicting original physical identity for '+key)
    EXPECTED_PHYSICAL[key]=value

def close_physical(path,deadline):
    expected=EXPECTED_PHYSICAL.get(str(pathlib.Path(path)))
    if expected is None:return
    if digest(path,max(expected['sizeBytes'],1),deadline)!=(expected['sha256'],expected['sizeBytes']):raise RuntimeError('file differs from original admitted physical identity: '+str(path))

def bounded(argv,cwd,env,deadline,logdir,name,raw_left,timeout=None,*,allow_cleanup_reserve=False):
    global ACTIVE_CAP_LEFT
    start=time.monotonic();hard=min(deadline,start+(timeout if timeout is not None else deadline-start));stop_at=max(start,hard-GRACE);kill_deadline=hard
    cap=max(0,raw_left if allow_cleanup_reserve else raw_left-OUTER_CLEANUP_RESERVE)
    try:proc=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    except BaseException as exc:
        record={'name':name,'argv':list(argv),'startedMonotonic':start,'deadlineMonotonic':hard,'timeoutSeconds':round(hard-start,3),'elapsedSeconds':round(time.monotonic()-start,3),'exitCode':None,'timedOut':False,'truncated':False,'drainExpired':False,'streamsEOF':[False,False],'captureErrors':['process-start '+type(exc).__name__+': '+str(exc)[:160]],'streams':[]}
        if ACTIVE_RECEIPT is not None:ACTIVE_RECEIPT['commands'].append({'name':name,'record':record})
        raise BoundedChildFailure(name,record,raw_left) from exc
    streams=[proc.stdout,proc.stderr];sel=selectors.DefaultSelector();hashes=[hashlib.sha256(),hashlib.sha256()];raw=[0,0];saved=[bytearray(),bytearray()];eof=[False,False];truncated=[False,False];timed=False;drain_expired=False;errors=[];term_sent=False
    for i,stream in enumerate(streams):os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ,i)
    def terminate(now):
        nonlocal term_sent,timed,kill_deadline
        if not term_sent:
            term_sent=True;timed=True;kill_deadline=min(hard,now+GRACE)
            try:os.killpg(proc.pid,signal.SIGTERM)
            except ProcessLookupError:pass
    try:
        while sel.get_map() or proc.poll() is None:
            now=time.monotonic()
            if now>=stop_at and not term_sent and proc.poll() is None:terminate(now)
            if now>=kill_deadline:
                if not all(eof):drain_expired=True
                try:os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                for key in list(sel.get_map().values()):
                    try:sel.unregister(key.fileobj);key.fileobj.close()
                    except OSError as exc:errors.append('pipe-close '+type(exc).__name__)
                break
            for key,_ in sel.select(min(.1,max(.001,kill_deadline-now))):
                i=key.data
                try:block=os.read(key.fileobj.fileno(),65536)
                except BlockingIOError:continue
                except OSError as exc:errors.append('pipe-read '+type(exc).__name__);continue
                if not block:eof[i]=True;sel.unregister(key.fileobj);key.fileobj.close();continue
                raw[i]+=len(block);hashes[i].update(block)
                used=sum(map(len,saved));room=max(0,min(RAW_CAP-len(saved[i]),cap-used))
                if room:saved[i].extend(block[:room])
                if len(block)>room:
                    truncated[i]=True;terminate(time.monotonic())
        if proc.poll() is None or not all(eof):
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
        try:proc.wait(timeout=max(.001,min(1,(ACTIVE_TERMINAL_DEADLINE or deadline)-time.monotonic())))
        except subprocess.TimeoutExpired:drain_expired=True;errors.append('reap timeout')
    except BaseException as exc:
        errors.append('capture '+type(exc).__name__+': '+str(exc)[:160])
        try:os.killpg(proc.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        try:proc.wait(timeout=max(.001,min(1,(ACTIVE_TERMINAL_DEADLINE or deadline)-time.monotonic())))
        except subprocess.TimeoutExpired:drain_expired=True
    finally:
        sel.close()
        for stream in streams:
            try:stream.close()
            except OSError as exc:errors.append('stream-close '+type(exc).__name__)
    publish=ACTIVE_TERMINAL_DEADLINE if ACTIVE_TERMINAL_DEADLINE is not None else deadline
    logdir.mkdir(parents=True,exist_ok=True);rows=[];saved_bytes=sum(map(len,saved))
    for i,label in enumerate(('stdout','stderr')):
        path=logdir/(name+'.'+label+'.log')
        try:ph,pn=write_bounded(path,bytes(saved[i]),RAW_CAP,publish)
        except BaseException as exc:ph='';pn=0;errors.append('log-publication '+type(exc).__name__+': '+str(exc)[:120])
        closed=pn==len(saved[i]) and bool(ph)
        row={'path':str(path),'bytes':pn,'sha256':ph,'rawBytes':raw[i],'rawSha256':hashes[i].hexdigest(),'physicalClosed':closed,'truncated':truncated[i]}
        rows.append(row)
        if closed:CAPTURE_REGISTRY[str(path)]=(ph,pn);bind_physical(path,ph,pn)
    now=time.monotonic();record={'name':name,'argv':list(argv),'startedMonotonic':start,'deadlineMonotonic':hard,'timeoutSeconds':round(hard-start,3),'requestedTimeoutSeconds':timeout,'elapsedSeconds':round(now-start,3),'exitCode':proc.returncode,'signal':(-proc.returncode if isinstance(proc.returncode,int) and proc.returncode<0 else None),'timedOut':timed,'truncated':any(truncated),'streamsEOF':eof,'drainExpired':drain_expired,'captureErrors':errors,'streams':rows}
    remaining=raw_left-saved_bytes;ACTIVE_CAP_LEFT=remaining
    if ACTIVE_RECEIPT is not None:ACTIVE_RECEIPT['commands'].append({'name':name,'record':record})
    if any(truncated) or timed or drain_expired or errors or proc.returncode!=0 or not all(eof) or remaining<0 or any(not x['physicalClosed'] for x in rows):raise BoundedChildFailure(name,record,remaining)
    return record,remaining


def inspect_browser(name, image, deadline, logs, cap_left, mounts):
    tag=hashlib.sha256(name.encode()).hexdigest()[:12]
    fmt='{{.Id}}|{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}|{{.State.Status}}|{{.State.ExitCode}}|{{json .Mounts}}|{{json .HostConfig.Tmpfs}}|{{json .HostConfig.Ulimits}}|{{json .Config.Labels}}|{{json .HostConfig.SecurityOpt}}|{{json .HostConfig.CapDrop}}|{{.HostConfig.ShmSize}}'
    rec,remaining=bounded(['docker','inspect','--format',fmt,name],None,os.environ,deadline,logs,'inspect-browser-'+tag,cap_left,timeout=20)
    raw=read_text_bounded(logs/('inspect-browser-'+tag+'.stdout.log'),RAW_CAP,deadline).strip();parts=raw.split('|',15)
    if len(parts)!=16:raise RuntimeError('incomplete Docker inspect')
    cid,img,network,readonly,pids,ncpu,mem,status,code,mountdata,tmpfsdata,ulimits,labels,secopt,capdrop,shm=parts
    if (img,network,readonly,int(pids),int(ncpu),int(mem),status)!=(image,'none','true',8192,4_000_000_000,8*1024**3,'exited') or int(code)<0:raise RuntimeError('browser container identity/resource policy mismatch')
    actual=sorted((m.get('Type'),m.get('Source'),m.get('Destination'),bool(m.get('RW'))) for m in json.loads(mountdata))
    if actual!=sorted(mounts):raise RuntimeError('browser mount ownership/mode mismatch')
    if json.loads(tmpfsdata)!={'/tmp':'rw,nosuid,nodev,exec,size=256m'}:raise RuntimeError('browser tmpfs differs')
    labeldoc=json.loads(labels); secdoc=json.loads(secopt); capdoc=json.loads(capdrop)
    if labeldoc.get('codex.g03.execution-id')!=name[-36:] or labeldoc.get('codex.g03.kind')!='truss-browser-fsize-diagnostic':raise RuntimeError('browser ownership labels differ')
    if secdoc!=['no-new-privileges'] or capdoc!=['ALL'] or int(shm)!=1024**3:raise RuntimeError('browser security or shm profile differs')
    got=[u for u in json.loads(ulimits) if u.get('Name')=='fsize']
    if got!=[{'Name':'fsize','Hard':268435456,'Soft':268435456}]:raise RuntimeError('Docker HostConfig.Ulimits fsize differs')
    return {'containerName':name,'containerId':cid,'imageId':img,'network':'none','readonlyRootfs':True,'cpus':4,'memoryBytes':int(mem),'pids':8192,'tmpfs':json.loads(tmpfsdata),'ulimits':json.loads(ulimits),'labels':labeldoc,'securityOpt':secdoc,'capDrop':capdoc,'shmBytes':int(shm),'mounts':json.loads(mountdata),'exitCode':int(code)},remaining

def check_manifest(packet_hash, manifest_hash, deadline):
    if digest(PACKET,2*1024*1024,deadline)[0]!=packet_hash:raise RuntimeError('packet SHA-256 pin mismatch')
    if digest(FROZEN,2*1024*1024,deadline)[0]!=manifest_hash:raise RuntimeError('source manifest SHA-256 pin mismatch')
    m=json.loads(read_text_bounded(FROZEN,2*1024*1024,deadline))
    if m.get('profile')!='umf.g03-truss-browser-fsize-diagnostic-source/1' or m.get('executionPerformed') is not False or m.get('sourceOnly') is not True or len(m.get('files',[]))!=23:raise RuntimeError('wrong 23-row source-only manifest profile')
    if len({r.get('path') for r in m['files']})!=23:raise RuntimeError('duplicate full-source manifest path')
    expected={r['path']:r for r in m['files']}; actual={}
    for base,dirs,files in os.walk(ROOT,followlinks=False):
        dirs[:] = sorted(d for d in dirs if d!='runs')
        for f in sorted(files):
            q=pathlib.Path(base)/f
            if q==FROZEN:continue
            if q.is_symlink() or not stat.S_ISREG(q.lstat().st_mode):raise RuntimeError('unsafe frozen source file')
            actual[q.relative_to(ROOT).as_posix()]=q
    if set(expected)!=set(actual):raise RuntimeError('source manifest file roster mismatch')
    total=0
    for rel,q in actual.items():
        row=expected[rel];h,n=digest(q,row['sizeBytes'],deadline)
        if (h,n)!=(row['sha256'],row['sizeBytes']):raise RuntimeError('frozen input changed: '+rel)
        total+=n
    if total!=sum(r['sizeBytes'] for r in expected.values()) or total!=m.get('totalBytes'):raise RuntimeError('source manifest byte total mismatch')
    return {'sha256':manifest_hash,'fileCount':len(expected),'totalBytes':total}

def verify_005_admission(deadline):
    admission=ROOT/'admission'; doc=json.loads(read_text_bounded(admission/'diagnostic005-evidence.json',64*1024,deadline))
    if doc.get('profile')!='umf.g03-truss-browser-fsize-diagnostic005-admission/1' or doc.get('executionPerformed') is not False or doc.get('status')!='FAIL_OR_UNKNOWN':raise RuntimeError('005 admission evidence profile/status differs')
    expected_names={'diagnostic005-operator-result.json','diagnostic005-browser-facts-inspect.stdout.log','diagnostic005-facts-summary.json','diagnostic005-facts-receipts.json'}
    if {r.get('path') for r in doc.get('files',[])}!=expected_names:raise RuntimeError('005 admission evidence file roster differs')
    admitted={}
    for row in doc['files']:
        if pathlib.PurePosixPath(row['path']).name!=row['path']:raise RuntimeError('unsafe 005 evidence path')
        q=admission/row['path'];h,n=digest(q,row['sizeBytes'],deadline)
        if (h,n)!=(row['sha256'],row['sizeBytes']):raise RuntimeError('005 evidence bytes differ: '+row['path'])
        admitted[row['path']]=q
    prior=json.loads(read_text_bounded(admitted['diagnostic005-operator-result.json'],256*1024,deadline))
    if prior.get('status')!='FAIL_OR_UNKNOWN' or prior.get('executionPerformed') is not True or abs(prior.get('elapsedSeconds',0)-20.022)>.01:raise RuntimeError('005 actual receipt identity/status differs')
    if any('browser-entity' in x.get('name','') for x in prior.get('commands',[])):raise RuntimeError('005 unexpectedly ran entity after facts')
    browser=[x['record'] for x in prior.get('commands',[]) if x.get('name')=='browser-facts']
    if len(browser)!=1 or browser[0].get('exitCode')!=0 or browser[0].get('timedOut') is not False:raise RuntimeError('005 facts browser child evidence differs')
    summary=json.loads(read_text_bounded(admitted['diagnostic005-facts-summary.json'],1024*1024,deadline))
    cases=json.loads(read_text_bounded(admitted['diagnostic005-facts-receipts.json'],EVIDENCE_CAP,deadline))
    if summary.get('cases')!=5 or summary.get('byteParity') is not True or summary.get('nodeGlobals') is not False or cases.get('summary')!=summary or len(cases.get('cases',[]))!=5:raise RuntimeError('005 facts summary/receipts evidence differs')
    facts=doc.get('facts',{})
    if (facts.get('cases'),facts.get('byteParity'),facts.get('nodeGlobals'),facts.get('browser'),facts.get('playwrightVersion'),facts.get('wasmSha256'),facts.get('entityExecuted'))!=(5,True,False,summary.get('browser'),summary.get('playwrightVersion'),summary.get('wasmSha256'),False):raise RuntimeError('005 admission facts do not match retained summary')
    inspect=read_text_bounded(admitted['diagnostic005-browser-facts-inspect.stdout.log'],64*1024,deadline).strip().split('|',15)
    if len(inspect)!=16:raise RuntimeError('005 actual Docker inspect serialization is malformed')
    cid,image,network,readonly,pids,ncpu,memory,status,code,mounts,tmpfs,ulimits,labels,security,capdrop,shm=inspect
    if (image,network,readonly,int(pids),int(ncpu),int(memory),status,int(code))!=('sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27','none','true',8192,4_000_000_000,8*1024**3,'exited',0):raise RuntimeError('005 actual browser container limits differ')
    if json.loads(tmpfs)!={'/tmp':'rw,nosuid,nodev,exec,size=256m'} or json.loads(ulimits)!=[{'Hard':268435456,'Name':'fsize','Soft':268435456}]:raise RuntimeError('005 actual tmpfs or fsize profile differs')
    if json.loads(security)!=['no-new-privileges'] or json.loads(capdrop)!=['ALL'] or int(shm)!=1024**3:raise RuntimeError('005 actual security serialization evidence differs')
    labeldoc=json.loads(labels)
    if labeldoc.get('codex.g03.kind')!='truss-browser-fsize-diagnostic' or labeldoc.get('codex.g03.execution-id')!='8de99e4a-cd92-444f-847e-5965c8e36651':raise RuntimeError('005 ownership evidence differs')
    mount_rows=json.loads(mounts)
    if not any(x.get('Destination')=='/workspace' and x.get('Source')==str(P56) and not x.get('RW') for x in mount_rows):raise RuntimeError('005 P56 mount evidence differs')
    if facts.get('observedSecurityOpt')!=['no-new-privileges'] or facts.get('sourceExpectedSecurityOpt')!=['no-new-privileges:true']:raise RuntimeError('005 exact serialization diagnosis differs')
    return {'priorReceiptSha256':'90b0705f1366639ba19f7ffae3a92b60748c471d0aa916f5d445d823bd0f5725','inspectSha256':'c5f6aab64855f04329d30dfe0824b167b4d5250a447c6b083470022b6b4107ee','factsSummarySha256':next(r['sha256'] for r in doc['files'] if r['path']=='diagnostic005-facts-summary.json'),'status':'FAIL_OR_UNKNOWN','factsCases':5,'entityExecuted':False,'observedSecurityOpt':['no-new-privileges']}

def source_inventory(deadline):
    inv=json.loads(read_text_bounded(ROOT/'inputs/evidence/source-inventory.json',2*1024*1024,deadline))
    if inv.get('profile')!='umf.g03-p56-physical-inventory/1' or inv.get('fileCount')!=5901 or inv.get('totalBytes')!=860543639 or inv.get('archiveSha256')!='8291da1e97ceb5ebd9cd29f0dab1ce233b14cd20651b1e840f7e3e59802ce77f' or inv.get('commit')!='973d864c8d26b2bc173a411eac8368da5efc1ab3':raise RuntimeError('P56 retained source inventory identity differs')
    rows=inv['rows'];actual=[];total=0;expected_paths=set()
    for rel,size,sha,mode in rows:
        relpath=pathlib.PurePosixPath(rel)
        if relpath.is_absolute() or any(part in ('','.','..') for part in relpath.parts):raise RuntimeError('unsafe source inventory path')
        expected_paths.add(rel)
        q=P56/rel
        h,n=digest(q,64*1024*1024,deadline)
        if (h,n,stat.S_IMODE(q.stat().st_mode))!=(sha,size,mode):raise RuntimeError('P56 physical source differs: '+rel)
        actual.append([rel,n,h,mode]);total+=n
    physical_paths=set()
    for base,dirs,files in os.walk(P56,followlinks=False):
        dirs.sort()
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs):raise RuntimeError('P56 source has symlink directory')
        for fn in sorted(files):
            q=pathlib.Path(base)/fn
            if q.is_symlink() or not stat.S_ISREG(q.lstat().st_mode):raise RuntimeError('P56 source has nonregular file')
            rel=q.relative_to(P56).as_posix()
            if rel!='.git':physical_paths.add(rel)
    if physical_paths!=expected_paths:raise RuntimeError('P56 physical path roster differs from retained inventory')
    roster_raw,roster,roster_size=read_bounded(ROOT/'inputs/evidence/p56-git-stage-roster.txt',1024*1024,deadline)
    if roster_size!=780359:raise RuntimeError('P56 stage roster byte size differs')
    if len(actual)!=5901 or total!=860543639 or roster!='bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b':raise RuntimeError('P56 physical inventory/roster differs from accepted Truss009')
    return {'fileCount':len(actual),'totalBytes':total,'inventorySha256':hashlib.sha256(json.dumps(actual,separators=(',',':')).encode()).hexdigest(),'stageRosterSha256':roster}

def verify_js_dependencies(manifest,deadline):
    results={}
    packages={x['name']:x for x in manifest['packages']}
    if set(packages)!=set(JS_ROOTS):raise RuntimeError('portable dependency package roster differs')
    for name,root in JS_ROOTS.items():
        pkg=packages[name]; expected={x['path']:x for x in pkg['entries']['files']}; expected_dirs={x['path']:x for x in pkg['entries']['directories']}; actual={}; dirs={}; total=0
        if root.is_symlink() or not root.is_dir():raise RuntimeError('portable JS dependency root missing or symlink')
        for base,subs,files in os.walk(root,followlinks=False):
            subs.sort(); files.sort(); bp=pathlib.Path(base)
            for d in subs:
                q=bp/d
                if q.is_symlink():raise RuntimeError('portable JS dependency symlink directory')
                dirs[q.relative_to(root).as_posix()]=stat.S_IMODE(q.lstat().st_mode)
            for fn in files:
                q=bp/fn; rel=q.relative_to(root).as_posix()
                h,n=digest(q,64*1024*1024,deadline); actual[rel]={'bytes':n,'mode':stat.S_IMODE(q.lstat().st_mode),'sha256':h}; total+=n
        if set(actual)!=set(expected) or set(dirs)!=set(expected_dirs):raise RuntimeError('portable JS dependency tree path roster differs: '+name)
        for rel,row in expected.items():
            if actual[rel]!={'bytes':row['bytes'],'mode':row['mode'],'sha256':row['sha256']}:raise RuntimeError('portable JS dependency file differs: '+name+'/'+rel)
        if dirs!={k:v['mode'] for k,v in expected_dirs.items()} or total!=pkg['fileBytes'] or len(actual)!=pkg['fileCount']:raise RuntimeError('portable JS dependency modes/count/bytes differ: '+name)
        results[name]={'fileCount':len(actual),'totalBytes':total,'rosterSha256':pkg['rosterSha256']}
    return results

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--execute',action='store_true',help='explicitly execute this bounded local browser diagnostic');ap.add_argument('--packet-sha256',required=True);ap.add_argument('--manifest-sha256',required=True);ap.add_argument('--source-sha256',required=True,help='pin this exact operator source before execution');a=ap.parse_args()
    if not a.execute:raise SystemExit('frozen source only; review then pass --execute')
    if digest(pathlib.Path(__file__),2*1024*1024,time.monotonic()+30)[0]!=a.source_sha256:raise SystemExit('operator source pin mismatch')
    started=time.monotonic();work=started+TOTAL-RESERVE;terminal=started+TOTAL
    receipt={'profile':'umf.g03-truss-browser-fsize-diagnostic/1','status':'FAIL_OR_UNKNOWN','executionPerformed':True,'startedMonotonic':started,'commands':[],'failures':[],'scope':'retained Truss009 browser-only facts/entity diagnostic; no rebuild/install'}
    global ACTIVE_RECEIPT, ACTIVE_CAP_LEFT, ACTIVE_TERMINAL_DEADLINE
    rid=str(uuid.uuid4());run=OUTPUT_ROOT/rid;run.mkdir();logs=run/'outer';owned=run/'owned';out=owned/'out';logs.mkdir();out.mkdir(parents=True)
    ACTIVE_RECEIPT=receipt;ACTIVE_CAP_LEFT=RAW_CAP;ACTIVE_TERMINAL_DEADLINE=terminal;left=RAW_CAP;containers=[]
    def save():
        receipt['finishedMonotonic']=time.monotonic();receipt['elapsedSeconds']=round(receipt['finishedMonotonic']-started,3);receipt['rawCaptureBudgetRemaining']=ACTIVE_CAP_LEFT
        result_path=run/'operator-result.json'; inventory_path=run/'terminal-inventory.json'
        def publish(path,data):
            if time.monotonic()>=terminal or len(data)>EVIDENCE_CAP:raise RuntimeError('terminal evidence deadline or per-file cap exceeded')
            with path.open('wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
            h,n=digest(path,EVIDENCE_CAP,terminal)
            if (h,n)!=(hashlib.sha256(data).hexdigest(),len(data)):raise RuntimeError('terminal evidence readback mismatch')
            return h,n
        try:
            result_raw=json.dumps(receipt,sort_keys=True,indent=2).encode()+b'\n'
            publish(result_path,result_raw)
            rows=[];total=0
            for base,dirs,files in os.walk(run,followlinks=False):
                dirs.sort()
                for fn in sorted(files):
                    q=pathlib.Path(base)/fn
                    if q==inventory_path:continue
                    h,n=digest(q,EVIDENCE_CAP,terminal);total+=n
                    if total>EVIDENCE_CAP:raise RuntimeError('terminal physical evidence exceeds 16 MiB')
                    rows.append({'path':q.relative_to(run).as_posix(),'sizeBytes':n,'sha256':h})
            inv={'profile':'umf.g03-truss-browser-fsize-terminal-inventory/1','fileCountExcludingInventory':len(rows),'bytesExcludingInventory':total,'fileCountIncludingInventory':len(rows)+1,'bytesIncludingInventory':0,'inventorySelfBytes':0,'files':rows}
            for _ in range(4):
                invraw=json.dumps(inv,sort_keys=True,indent=2).encode()+b'\n'
                inv['inventorySelfBytes']=len(invraw);inv['bytesIncludingInventory']=total+len(invraw)
            invraw=json.dumps(inv,sort_keys=True,indent=2).encode()+b'\n'
            if len(invraw)!=inv['inventorySelfBytes'] or inv['bytesIncludingInventory']!=total+len(invraw):raise RuntimeError('terminal inventory self-byte closure failed')
            if total+len(invraw)>EVIDENCE_CAP:raise RuntimeError('terminal inventory would exceed 16 MiB aggregate evidence')
            invhash,invsize=publish(inventory_path,invraw)
            final_rows=[];final_total=0
            for base,dirs,files in os.walk(run,followlinks=False):
                dirs.sort()
                for fn in sorted(files):
                    q=pathlib.Path(base)/fn
                    h,n=digest(q,EVIDENCE_CAP,terminal);final_total+=n
                    if final_total>EVIDENCE_CAP:raise RuntimeError('terminal files plus inventory exceed 16 MiB')
                    final_rows.append((q.relative_to(run).as_posix(),h,n))
            if (inventory_path.relative_to(run).as_posix(),invhash,invsize) not in final_rows:raise RuntimeError('terminal inventory missing from final physical closure')
            if digest(result_path,EVIDENCE_CAP,terminal)!=(hashlib.sha256(result_raw).hexdigest(),len(result_raw)):raise RuntimeError('terminal receipt failed final readback')
            if digest(inventory_path,EVIDENCE_CAP,terminal)!=(invhash,invsize):raise RuntimeError('terminal inventory failed final readback')
            return {'sha256':invhash,'sizeBytes':invsize,'aggregateBytes':final_total,'fileCount':len(final_rows)}
        except BaseException as exc:
            receipt['status']='FAIL_OR_UNKNOWN';receipt['failures'].append('terminal evidence closure: '+type(exc).__name__+': '+str(exc)[:200])
            try:inventory_path.unlink()
            except FileNotFoundError:pass
            fallback=json.dumps({'profile':receipt['profile'],'status':'FAIL_OR_UNKNOWN','executionPerformed':True,'closureFailure':str(exc)[:200],'runId':rid},sort_keys=True,indent=2).encode()+b'\n'
            if len(fallback)<=EVIDENCE_CAP and time.monotonic()<terminal:
                try:publish(result_path,fallback)
                except BaseException:pass
            return None
    try:
        if time.monotonic()>=work:raise TimeoutError('work deadline expired')
        receipt['frozenInputs']=check_manifest(a.packet_sha256,a.manifest_sha256,work)
        packet=json.loads(read_text_bounded(PACKET,2*1024*1024,work))
        receipt['diagnostic005Admission']=verify_005_admission(work)
        receipt['sourceInventoryBefore']=source_inventory(work)
        deps=json.loads(read_text_bounded(ROOT/'inputs/evidence/browser-deps-manifest.json',1024*1024,work))
        receipt['portableJsBefore']=verify_js_dependencies(deps,work)
        # Verify immutable Truss009 terminal receipt and exact selected software/native rows.
        old=RECEIPT009/'operator-result.json'; oldhash='af524fd45a8f01998dc02a540ec6d84e81bf51c4fc745cb1417513a791fef40e'
        if digest(old,256*1024,work)!=(oldhash,173838):raise RuntimeError('actual009 receipt bytes changed')
        olddoc=json.loads(read_text_bounded(old,256*1024,work))
        if olddoc.get('status')!='FAIL_OR_UNKNOWN' or olddoc.get('executionId')!='938487b5-7353-4879-aa26-ee034e629718':raise RuntimeError('unexpected009 receipt identity/status')
        artifacts=packet['selectedSoftware']; total=0
        for x in artifacts:
            h,n=digest(pathlib.Path(x['path']),ARTIFACT_CAP,work)
            if (h,n)!=(x['sha256'],x['sizeBytes']):raise RuntimeError('retained software bytes changed: '+x['relativePath'])
            total+=n
        if len(artifacts)!=5 or total!=28366524:raise RuntimeError('selected software roster/size differs')
        report_paths={}
        for x in packet['nativeReports']:
            p=pathlib.Path(x['path']);h,n=digest(p,EVIDENCE_CAP,work)
            if (h,n)!=(x['sha256'],x['sizeBytes']):raise RuntimeError('retained native report changed')
            report_paths[x['name']]=p
        if len(report_paths)!=2:raise RuntimeError('native report roster incomplete')
        for f in artifacts: pass
        wasm=pathlib.Path(next(x['path'] for x in artifacts if x['relativePath'].endswith('.wasm')))
        wrapper=pathlib.Path(next(x['path'] for x in artifacts if x['relativePath']=='artifacts/browser-wrapper/index.js'))
        webdir=wasm.parent; wrapdir=wrapper.parent
        browser=packet['browser']; image=browser['image']; image_rec,left=bounded(['docker','image','inspect','--format','{{.Id}}|{{.Os}}/{{.Architecture}}',image],None,os.environ,work,logs,'image-browser',left,timeout=30)
        if read_text_bounded(logs/'image-browser.stdout.log',RAW_CAP,work).strip()!=image+'|linux/arm64':raise RuntimeError('pinned browser image identity unavailable')
        mounts_common=[('bind',str(P56),'/workspace',False),('bind',None,'/reports/native.json',False),('bind',None,'/browser-out',True),('bind',str(webdir),'/truss-web',False),('bind',str(wrapdir),'/wrapper',False),('bind',str(JS_ROOTS['playwright']),'/deps/node_modules/playwright',False),('bind',str(JS_ROOTS['playwright-core']),'/deps/node_modules/playwright-core',False)]
        inputs={}
        for lane,corpus,reports,api in [('facts','truss-facts/cases.json','facts','compile_truss_runtime_json'),('entity','truss-entity-selection/cases.json','entity','compile_truss_runtime_entity_selection')]:
            if time.monotonic()>=work:raise TimeoutError('diagnostic work deadline expired')
            corpus_rel='tests/'+corpus; corpus_path=P56/corpus_rel; corpus_raw,ch,cn=read_bounded(corpus_path,4*1024*1024,work)
            native=report_paths[reports]; native_raw,nh,nn=read_bounded(native,EVIDENCE_CAP,work)
            cases=json.loads(corpus_raw); expected=json.loads(native_raw)
            if len(cases)!=(5 if lane=='facts' else 33) or len(expected)!=len(cases):raise RuntimeError('corpus/native row count differs')
            ids=[x.get('id') for x in cases]
            if [x.get('id') for x in expected]!=ids or any(not isinstance(x.get('raw'),str) for x in expected):raise RuntimeError('corpus/native IDs or raw outputs differ')
            inputs[lane]={'corpusSha256':ch,'corpusBytes':cn,'nativeSha256':nh,'nativeBytes':nn,'ids':ids}
            result_dir=out/('browser-'+lane);result_dir.mkdir()
            name='g03-truss-fsize-'+lane+'-'+rid;containers.append(name)
            env={'WEFT_PROBE_JS':'/truss-web/weft_wasm.js','WEFT_PROBE_WASM':'/truss-web/weft_wasm_bg.wasm','WEFT_BROWSER_WRAPPER':'/wrapper/index.js','WEFT_FRONTEND_CORPUS':'/workspace/tests/'+corpus,'WEFT_FRONTEND_REPORTS':'/reports/native.json','WEFT_PROBE_API':api,'WEFT_FRONTEND_BROWSER_SUMMARY':'/browser-out/summary.json','WEFT_BROWSER_RECEIPTS':'/browser-out/receipts.json','WEFT_PLAYWRIGHT_MODULE':'/deps/node_modules/playwright/index.mjs','WEFT_CHROMIUM_EXECUTABLE':browser['chromiumPath'],'HOME':'/tmp/home','DEBUG':'pw:browser'}
            argv=['docker','run','--pull=never','--name',name,'--label','codex.g03.execution-id='+rid,'--label','codex.g03.kind=truss-browser-fsize-diagnostic','--network=none','--platform=linux/arm64','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=4','--memory=8g','--pids-limit=8192','--shm-size=1g','--ulimit','fsize=268435456:268435456','--tmpfs','/tmp:rw,nosuid,nodev,exec,size=256m','--workdir','/workspace','--mount',f'type=bind,source={P56},target=/workspace,readonly','--mount',f'type=bind,source={native},target=/reports/native.json,readonly','--mount',f'type=bind,source={result_dir},target=/browser-out','--mount',f'type=bind,source={webdir},target=/truss-web,readonly','--mount',f'type=bind,source={wrapdir},target=/wrapper,readonly','--mount',f"type=bind,source={JS_ROOTS['playwright']},target=/deps/node_modules/playwright,readonly",'--mount',f"type=bind,source={JS_ROOTS['playwright-core']},target=/deps/node_modules/playwright-core,readonly"]
            for k,v in env.items():argv.extend(['--env',k+'='+v])
            shell="set -eu; node --version; \"$WEFT_CHROMIUM_EXECUTABLE\" --version; sha256sum \"$WEFT_CHROMIUM_EXECUTABLE\"; cat /proc/self/limits; df -Pk /tmp; awk '$1==\"Max\" && $2==\"file\" && $3==\"size\" { if ($4 != \"268435456\" || $5 != \"268435456\") exit 21; found=1 } END { if (!found) exit 22 }' /proc/self/limits; exec node tests/compile/browser-check.mjs"
            argv += [image,'sh','-eu','-c',shell]
            def observe_runtime_and_hostconfig():
                nonlocal left
                try:
                    metadata=read_text_bounded(logs/('browser-'+lane+'.stdout.log'),RAW_CAP,terminal)
                    limit_lines=[line.split() for line in metadata.splitlines() if line.startswith('Max file size')]
                    df_lines=[line.split() for line in metadata.splitlines() if not line.startswith('Filesystem') and len(line.split())>=6 and line.split()[-1]=='/tmp']
                    node_lines=[line.strip() for line in metadata.splitlines() if re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',line.strip())]
                    chrome_lines=[line.strip() for line in metadata.splitlines() if line.startswith('Google Chrome for Testing ')]
                    sha_lines=[line.split() for line in metadata.splitlines() if re.fullmatch(r'[0-9a-f]{64}\s+\S+',line.strip())]
                    if len(limit_lines)!=1 or len(limit_lines[0])<5 or len(df_lines)!=1 or len(node_lines)!=1 or len(chrome_lines)!=1 or len(sha_lines)!=1:raise RuntimeError('fixed process, browser identity or df facts incomplete')
                    row={'nodeVersion':node_lines[0],'chromiumVersion':chrome_lines[0],'chromiumSha256':sha_lines[0][0],'maxFileSizeSoftBytes':int(limit_lines[0][3]),'maxFileSizeHardBytes':int(limit_lines[0][4]),'dfTmpLine':' '.join(df_lines[0]),'source':'captured Node/Chromium identity, /proc/self/limits and df -Pk /tmp'}
                    receipt.setdefault('runtimeMetadata',{})[lane]=row
                    if (row['nodeVersion'],row['chromiumVersion'],row['chromiumSha256'])!=(packet['browser']['nodeVersion'],packet['browser']['chromiumVersion'],packet['browser']['chromiumSha256']):raise RuntimeError('pinned Node/Chromium identity differs')
                    if (row['maxFileSizeSoftBytes'],row['maxFileSizeHardBytes'])!=(268435456,268435456):raise RuntimeError('effective process file limits differ from exact target')
                except BaseException as exc:
                    receipt.setdefault('runtimeMetadataUnavailable',{})[lane]=type(exc).__name__+': '+str(exc)[:160]
                try:
                    mounts=list(mounts_common);mounts[1]=('bind',str(native),'/reports/native.json',False);mounts[2]=('bind',str(result_dir),'/browser-out',True)
                    info,newleft=inspect_browser(name,image,terminal,logs,left,mounts);left=newleft
                    receipt['commands'].append({'name':'browser-inspect-'+lane,'record':info})
                    receipt.setdefault('effectiveContainerProfiles',{})[lane]=info
                    return info
                except BaseException as exc:
                    receipt.setdefault('effectiveContainerProfileUnavailable',{})[lane]=type(exc).__name__+': '+str(exc)[:160]
                    return None
            try:
                rec,left=bounded(argv,None,os.environ,work,logs,'browser-'+lane,left,timeout=600)
            except BoundedChildFailure as child:
                stderr_path=logs/('browser-'+lane+'.stderr.log')
                signal_rows=[]
                try:
                    stderr_text=read_text_bounded(stderr_path,RAW_CAP,terminal)
                    signal_rows=re.findall(r'\b(?:signal\s*[:=]?\s*(?:SIG[A-Z0-9]+|[0-9]+)|SIG(?:ABRT|BUS|KILL|SEGV|TERM|XCPU))\b',stderr_text)
                except BaseException:pass
                receipt.setdefault('browserFailureObservations',{})[lane]={'exitCode':child.record.get('exitCode'),'processSignal':child.record.get('signal'),'browserSignalReported':signal_rows[0] if signal_rows else None,'browserSignalObservation':'reported-in-fixed-playwright-capture' if signal_rows else 'unobserved','timedOut':child.record.get('timedOut'),'captureErrors':child.record.get('captureErrors',[])}
                observe_runtime_and_hostconfig()
                raise child
            info=observe_runtime_and_hostconfig()
            if info is None or info.get('exitCode')!=0 or lane not in receipt.get('runtimeMetadata',{}) or lane in receipt.get('runtimeMetadataUnavailable',{}):raise RuntimeError('successful browser child lacks verified effective process/container profile')
            summary=json.loads(read_text_bounded(result_dir/'summary.json',1024*1024,work));receipts=json.loads(read_text_bounded(result_dir/'receipts.json',EVIDENCE_CAP,work))
            allowed={'/','/spike.js','/spike.wasm','/wrapper.js'};urls=summary.get('networkRequests')
            if not isinstance(urls,list) or {urllib.parse.urlsplit(x).path for x in urls if isinstance(x,str)}!=allowed or any(not isinstance(x,str) or (urllib.parse.urlsplit(x).scheme,urllib.parse.urlsplit(x).netloc,urllib.parse.urlsplit(x).query,urllib.parse.urlsplit(x).fragment)!=('http','weft.spike.test','','') for x in urls):raise RuntimeError('browser route closure differs')
            wasmsha=next(x['sha256'] for x in artifacts if x['relativePath'].endswith('.wasm'))
            if summary.get('cases')!=len(cases) or summary.get('byteParity') is not True or summary.get('nodeGlobals') is not False or summary.get('playwrightVersion')!='1.62.1' or summary.get('browser')!=browser['chromiumVersion'].rsplit(' ',1)[-1] or summary.get('wasmSha256')!=wasmsha:raise RuntimeError('browser summary parity/runtime checks failed')
            if receipts.get('summary')!=summary or [x.get('id') for x in receipts.get('cases',[])]!=ids:raise RuntimeError('browser receipt order differs')
            for case,native_row,observed in zip(cases,expected,receipts['cases']):
                req=json.dumps(case['request'],separators=(',',':'),ensure_ascii=False,allow_nan=False).encode(); exp=native_row['raw'].encode()
                if observed.get('requestSha256')!=hashlib.sha256(req).hexdigest() or observed.get('expectedSha256')!=hashlib.sha256(exp).hexdigest() or observed.get('actualSha256')!=hashlib.sha256(exp).hexdigest():raise RuntimeError('per-case browser parity receipt differs: '+str(case['id']))
            inputs[lane]['summarySha256']=digest(result_dir/'summary.json',1024*1024,work)[0];inputs[lane]['receiptsSha256']=digest(result_dir/'receipts.json',EVIDENCE_CAP,work)[0]
        receipt['browserInputCustody']=inputs
        for x in artifacts:
            if digest(pathlib.Path(x['path']),ARTIFACT_CAP,work)!=(x['sha256'],x['sizeBytes']):raise RuntimeError('selected software changed after browser execution')
        receipt['selectedSoftwareAfter']=[{'path':x['relativePath'],'sha256':x['sha256'],'sizeBytes':x['sizeBytes']} for x in artifacts]
        if digest(old,256*1024,work)!=(oldhash,173838):raise RuntimeError('actual009 receipt changed during diagnostic')
        for x in packet['nativeReports']:
            if digest(pathlib.Path(x['path']),EVIDENCE_CAP,work)!=(x['sha256'],x['sizeBytes']):raise RuntimeError('native report changed during browser diagnostic')
        receipt['nativeReportsAfter']=[{'name':x['name'],'sha256':x['sha256'],'sizeBytes':x['sizeBytes']} for x in packet['nativeReports']]
        receipt['portableJsAfter']=verify_js_dependencies(deps,work)
        if receipt['portableJsAfter']!=receipt['portableJsBefore']:raise RuntimeError('portable JS dependencies changed during diagnostic')
        receipt['sourceInventoryAfter']=source_inventory(work)
        receipt['frozenInputsAfter']=check_manifest(a.packet_sha256,a.manifest_sha256,work)
        if receipt['frozenInputsAfter']!=receipt['frozenInputs']:raise RuntimeError('frozen source package changed during diagnostic')
        if receipt['sourceInventoryAfter']!=receipt['sourceInventoryBefore']:raise RuntimeError('P56 source changed during diagnostic')
        receipt['postChecks']={
            'P56-source-inventory':{'status':'verified','value':receipt['sourceInventoryAfter']},
            'full-source-manifest':{'status':'verified','value':receipt['frozenInputsAfter']},
            'Truss009-receipt':{'status':'verified','value':{'sha256':oldhash,'sizeBytes':173838}},
            'selected-software':{'status':'verified','value':receipt['selectedSoftwareAfter']},
            'native-reports':{'status':'verified','value':receipt['nativeReportsAfter']},
            'portable-JS-dependencies':{'status':'verified','value':receipt['portableJsAfter']},
        }
        receipt['status']='PASS_BROWSER_PROFILE_DIAGNOSTIC_ONLY'
    except BaseException as exc:
        receipt['failures'].append(type(exc).__name__+': '+str(exc)[:400])
    finally:
        # Recheck admitted external inputs even after browser failure; unavailable is explicit.
        post=receipt.setdefault('postChecks',{})
        def postcheck(name,fn):
            if name in post:return
            if time.monotonic()>=work:
                post[name]={'status':'unavailable','reason':'original work deadline reached'};return
            try:post[name]={'status':'verified','value':fn()}
            except BaseException as exc:post[name]={'status':'unavailable','reason':type(exc).__name__+': '+str(exc)[:160]}
        def p56_after():
            value=source_inventory(work)
            if 'sourceInventoryBefore' in receipt and value!=receipt['sourceInventoryBefore']:raise RuntimeError('P56 source inventory changed after browser')
            return value
        def manifest_after():
            value=check_manifest(a.packet_sha256,a.manifest_sha256,work)
            if 'frozenInputs' in receipt and value!=receipt['frozenInputs']:raise RuntimeError('frozen source roster changed after browser')
            return value
        postcheck('P56-source-inventory',p56_after)
        postcheck('full-source-manifest',manifest_after)
        def retained_009():
            q=RECEIPT009/'operator-result.json';h,n=digest(q,256*1024,work)
            if (h,n)!=('af524fd45a8f01998dc02a540ec6d84e81bf51c4fc745cb1417513a791fef40e',173838):raise RuntimeError('009 receipt bytes differ')
            return {'sha256':h,'sizeBytes':n}
        postcheck('Truss009-receipt',retained_009)
        if 'packet' in locals():
            def software_after():
                rows=[]
                for x in packet['selectedSoftware']:
                    if digest(pathlib.Path(x['path']),ARTIFACT_CAP,work)!=(x['sha256'],x['sizeBytes']):raise RuntimeError('retained software differs: '+x['relativePath'])
                    rows.append({'path':x['relativePath'],'sizeBytes':x['sizeBytes'],'sha256':x['sha256']})
                return rows
            postcheck('selected-software',software_after)
            def reports_after():
                rows=[]
                for x in packet['nativeReports']:
                    if digest(pathlib.Path(x['path']),EVIDENCE_CAP,work)!=(x['sha256'],x['sizeBytes']):raise RuntimeError('native report differs: '+x['name'])
                    rows.append({'name':x['name'],'sizeBytes':x['sizeBytes'],'sha256':x['sha256']})
                return rows
            postcheck('native-reports',reports_after)
            if 'deps' in locals():
                def js_after():
                    value=verify_js_dependencies(deps,work)
                    if 'portableJsBefore' in receipt and value!=receipt['portableJsBefore']:raise RuntimeError('portable JS dependencies changed after browser')
                    return value
                postcheck('portable-JS-dependencies',js_after)
        if any(v.get('status')!='verified' for v in post.values()):
            if receipt['status']=='PASS_BROWSER_PROFILE_DIAGNOSTIC_ONLY':receipt['status']='FAIL_OR_UNKNOWN'
            receipt['failures'].append('one or more retained-input postchecks are unavailable')
        # Remove only containers whose exact run labels prove ownership.
        cleanup_deadline=terminal-15
        left=ACTIVE_CAP_LEFT
        for name in reversed(containers):
            if not name.startswith('g03-truss-fsize-'):continue
            try:
                tag=hashlib.sha256(name.encode()).hexdigest()[:12]
                probe,left=bounded(['docker','inspect','--format','{{json .Config.Labels}}',name],None,os.environ,cleanup_deadline,logs,'cleanup-owner-'+tag,left,timeout=15,allow_cleanup_reserve=True)
                labels=json.loads(read_text_bounded(logs/('cleanup-owner-'+tag+'.stdout.log'),RAW_CAP,cleanup_deadline))
                if labels.get('codex.g03.execution-id')!=rid or labels.get('codex.g03.kind')!='truss-browser-fsize-diagnostic':
                    receipt['failures'].append('container ownership label mismatch; left untouched: '+name);continue
                rec,left=bounded(['docker','rm','-f',name],None,os.environ,cleanup_deadline,logs,'cleanup-'+tag,left,timeout=20,allow_cleanup_reserve=True)
                receipt['commands'].append({'name':'cleanup-'+name,'record':rec})
            except BaseException as exc:receipt['failures'].append('cleanup '+name+': '+type(exc).__name__)
        try:
            if time.monotonic()<cleanup_deadline:
                check,left=bounded(['docker','ps','-a','--filter','label=codex.g03.execution-id='+rid,'--filter','label=codex.g03.kind=truss-browser-fsize-diagnostic','--format','{{.Names}}'],None,os.environ,cleanup_deadline,logs,'owned-container-absence',left,timeout=15,allow_cleanup_reserve=True)
                remaining=read_text_bounded(logs/'owned-container-absence.stdout.log',RAW_CAP,cleanup_deadline).splitlines()
                if any(line.strip().startswith('g03-truss-fsize-') for line in remaining):receipt['failures'].append('owned browser container remains after cleanup')
            else:receipt['failures'].append('cleanup absence verification skipped after cleanup deadline')
        except BaseException as exc:receipt['failures'].append('cleanup absence verification: '+type(exc).__name__)
        if receipt['failures'] and receipt['status']=='PASS_BROWSER_PROFILE_DIAGNOSTIC_ONLY':receipt['status']='FAIL_OR_UNKNOWN'
        try:save()
        except BaseException as exc:
            receipt['status']='FAIL_OR_UNKNOWN';receipt['failures'].append('terminal closure exception: '+type(exc).__name__)
            try:save()
            except BaseException:pass
    print(str(run/'operator-result.json'));print(str(run/'terminal-inventory.json'))
    if receipt['status']!='PASS_BROWSER_PROFILE_DIAGNOSTIC_ONLY':raise SystemExit(1)

if __name__=='__main__':main()
