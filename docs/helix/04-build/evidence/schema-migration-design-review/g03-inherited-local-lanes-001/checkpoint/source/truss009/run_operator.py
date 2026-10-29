#!/usr/bin/env python3
"""Explicit-opt-in local Linux adapter for inherited Truss facts/entity browser parity."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, selectors, signal, stat, subprocess, sys, time, uuid, urllib.parse, re, math
ROOT=pathlib.Path('/private/tmp/g03-final-truss-operator-009'); PACKET=ROOT/'inputs/truss-packet.json'; FROZEN=ROOT/'integrity-manifest.json'; OUTPUT_ROOT=pathlib.Path('/private/tmp/g03-final-truss-operator-009-runs'); SOURCE_TAR=pathlib.Path('/private/tmp/g03-local-source-package-guards-operator-003/inputs/source-p56.tar')
COHORT=pathlib.Path('/private/tmp/g03-final-cohort-056-linux311-001'); WASM=pathlib.Path('/private/tmp/g03-linux-wasm-tool-02105-001/files/wasm-bindgen-0.2.105-x86_64-unknown-linux-musl/wasm-bindgen')
JS_ROOTS={'playwright':pathlib.Path('/Users/erik/Projects/weft/node_modules/playwright'),'playwright-core':pathlib.Path('/Users/erik/Projects/weft/node_modules/playwright-core')}
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
    now=time.monotonic();record={'name':name,'argv':list(argv),'startedMonotonic':start,'deadlineMonotonic':hard,'timeoutSeconds':round(hard-start,3),'requestedTimeoutSeconds':timeout,'elapsedSeconds':round(now-start,3),'exitCode':proc.returncode,'timedOut':timed,'truncated':any(truncated),'streamsEOF':eof,'drainExpired':drain_expired,'captureErrors':errors,'streams':rows}
    remaining=raw_left-saved_bytes;ACTIVE_CAP_LEFT=remaining
    if ACTIVE_RECEIPT is not None:ACTIVE_RECEIPT['commands'].append({'name':name,'record':record})
    if any(truncated) or timed or drain_expired or errors or proc.returncode!=0 or not all(eof) or remaining<0 or any(not x['physicalClosed'] for x in rows):raise BoundedChildFailure(name,record,remaining)
    return record,remaining

def verify_frozen(expected,deadline):
    h,n=digest(FROZEN,4*1024*1024,deadline)
    if h!=expected:raise RuntimeError('source manifest pin mismatch')
    manifest_raw,manifest_hash,manifest_size=read_bounded(FROZEN,4*1024*1024,deadline)
    if (manifest_hash,manifest_size)!=(h,n):raise RuntimeError('frozen manifest changed between hash and parse')
    doc=json.loads(manifest_raw);seen=set();total=0
    if doc.get('profile')!='umf.g03-truss-source-freeze/1' or doc.get('status')!='FROZEN_SOURCE_ONLY_NOT_EXECUTED' or doc.get('executionPerformed') is not False or doc.get('testsPerformed') is not False or doc.get('gitMutation') is not False:raise RuntimeError('frozen source manifest profile/status is not source-only')
    for row in doc['files']:
        rel=row['path'];pp=pathlib.PurePosixPath(rel)
        if pp.is_absolute() or any(part in ('','.','..') for part in pp.parts) or rel in seen:raise RuntimeError('unsafe/duplicate frozen source path')
        seen.add(rel);actual=digest(ROOT/rel,int(row['sizeBytes']),deadline);total+=actual[1]
        if actual!=(row['sha256'],row['sizeBytes']):raise RuntimeError('frozen source/input changed '+rel)
    actual_files=[]
    for base,dirs,files in os.walk(ROOT,followlinks=False):
        dirs.sort()
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs):raise RuntimeError('frozen package has symlink directory')
        for filename in sorted(files):
            fp=pathlib.Path(base)/filename
            if fp.is_symlink() or not stat.S_ISREG(fp.lstat().st_mode):raise RuntimeError('frozen package has unsafe file')
            if fp!=FROZEN:actual_files.append(fp.relative_to(ROOT).as_posix())
    actual_files.sort()
    if sorted(seen)!=actual_files or total!=doc['totalBytes']:raise RuntimeError('frozen source package missing/unlisted file or bad byte total')
    return {'sha256':h,'fileCount':len(seen),'totalBytes':total}

def verify_cohort(packet,deadline):
    custody_path=COHORT/'custody.json'
    if digest(custody_path,1024*1024,deadline)[0]!=packet['cohort']['custodySha256']:raise RuntimeError('cohort custody bytes differ')
    custody_raw,custody_hash,custody_size=read_bounded(custody_path,1024*1024,deadline)
    if custody_hash!=packet['cohort']['custodySha256']:raise RuntimeError('cohort custody changed between hash and parse')
    doc=json.loads(custody_raw)
    if doc.get('status')!='HELD_UNPUBLISHED_NOT_RUNTIME_QUALIFIED' or len(doc.get('files',[]))!=42:raise RuntimeError('cohort custody status/roster differs')
    total=0
    for row in doc['files']:
        rel=pathlib.PurePosixPath(row['path'])
        if rel.is_absolute() or any(part in ('','.','..') for part in rel.parts):raise RuntimeError('unsafe cohort custody path')
        h,n=digest(COHORT/row['path'],64*1024*1024,deadline)
        if (h,n)!=(row['sha256'],row['bytes']):raise RuntimeError('cohort file differs '+row['path'])
        total+=n
        if total>512*1024*1024:raise RuntimeError('cohort custody exceeds 512MiB local bound')
    if doc.get('candidateWheelSha256')!=packet['cohort']['wheel']['sha256']:raise RuntimeError('cohort selected wheel differs')
    wheel=COHORT/packet['cohort']['wheel']['path']
    if digest(wheel,64*1024*1024,deadline)!=(packet['cohort']['wheel']['sha256'],packet['cohort']['wheel']['sizeBytes']):raise RuntimeError('final wheel bytes differ from exact selected input')
    return {'fileCount':len(doc['files']),'totalBytes':total,'custodySha256':packet['cohort']['custodySha256']}

def tree_hash(root,manifest,deadline):
    package=next(x for x in manifest['packages'] if x['name']==root.name)
    rows=[];total=0
    for base,dirs,files in os.walk(root,followlinks=False):
        dirs.sort()
        if time.monotonic()>=deadline:raise TimeoutError('lane deadline while hashing portable JS tree')
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs):raise RuntimeError('JS dependency symlink directory')
        for name in sorted(files):
            p=pathlib.Path(base)/name;h,n=digest(p,64*1024*1024,deadline);total+=n
            if p.is_symlink():raise RuntimeError('JS dependency symlink')
            rows.append({'bytes':n,'mode':stat.S_IMODE(p.lstat().st_mode),'path':p.relative_to(root).as_posix(),'sha256':h})
    ent=package['entries'];dirs=[]
    for base,subs,_ in os.walk(root,followlinks=False):
        for d in subs:
            p=pathlib.Path(base)/d;dirs.append({'mode':stat.S_IMODE(p.lstat().st_mode),'path':p.relative_to(root).as_posix()})
    rows.sort(key=lambda x:x['path'])
    if rows!=ent['files'] or sorted(dirs,key=lambda x:x['path'])!=ent['directories'] or total!=package['fileBytes'] or package['version']!='1.62.1':raise RuntimeError('portable Playwright tree does not match complete read-only manifest')
    return package['rosterSha256'],total

def inventory_outputs(root,deadline):
    rows=[];total=0
    for base,dirs,files in os.walk(root,followlinks=False):
        dirs.sort()
        if time.monotonic()>=deadline:raise TimeoutError('deadline during selected software artifact inventory')
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs):raise RuntimeError('selected output contains symlink directory')
        for name in sorted(files):
            p=pathlib.Path(base)/name
            if p.is_symlink() or not stat.S_ISREG(p.lstat().st_mode):raise RuntimeError('selected output contains nonregular file')
            h,n=digest(p,ARTIFACT_CAP,deadline);total+=n
            if total>ARTIFACT_CAP:raise RuntimeError('selected software artifact total exceeds 256MiB local cap')
            rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
    return rows,total

def verify_guest_commands(rows,commands_raw,source_root,out_root,deadline,expected_tool,cargo_cache):
    expected={
      'python-version':([expected_tool['pythonPath'],'--version'],30),
      'rustc-version':(['rustc','--version'],30),'cargo-version':(['cargo','--version'],30),
      'bun-version':(['bun','--version'],30),'node-version':(['node','--version'],30),
      'wasm-bindgen-version':([expected_tool['wasmBindgenPath'],'--version'],30),
      'rust-verbose':(['rustc','-vV'],30),
      'rust-targets':(['rustup','target','list','--installed','--toolchain',expected_tool['rustupToolchain']],30),
      'cargo-cache-extract':([expected_tool['pythonPath'],'-B','-I','/operator/cargo_cache_extract.py','--evidence','/cargo-cache-input/evidence','--archive','/cargo-cache-input/software/cargo-registry.tar','--destination','/owned/cargo/registry','--archive-sha256',cargo_cache['archiveSha256'],'--archive-bytes',str(cargo_cache['archiveBytes']),'--acquisition-packet-sha256',cargo_cache['acquisitionPacketSha256'],'--index-sha256',cargo_cache['inventoryIndexSha256'],'--rows-sha256',cargo_cache['inventoryRowsSha256'],'--chunk-bytes',str(cargo_cache['inventoryChunkBytes']),'--row-count',str(cargo_cache['inventoryRowCount']),'--receipt','/out/reports/cargo-cache.json'],180),
      'create-venv':([expected_tool['pythonPath'],'-B','-m','venv','--copies','/owned/venv'],60),
      'offline-install':(['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','install','--disable-pip-version-check','--no-cache-dir','--no-compile','--only-binary=:all:','--require-hashes','--index-url','file:///cohort/aggregate/mirror/simple','-r','/cohort/aggregate/mirror/requirements.lock'],600),
      'pip-check':(['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','check'],60),
      'wheel-members':(['/owned/venv/bin/python','-B','-I','/operator-inputs/verify_weft_wheel.py','--wheel','/cohort/aggregate/mirror/files/umf_weft-0.4.56-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl','--wheel-sha256','32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd','--wheel-size','14358901'],60),
      'distribution-snapshot':(['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','list','--format=json'],30),
      'facts-python':(['/owned/venv/bin/python','-B','-I','tests/truss-facts/check.py','--reports','/out/reports/facts.json'],180),
      'entity-python':(['/owned/venv/bin/python','-B','-I','tests/truss-entity-selection/check.py','--reports','/out/reports/entity.json'],180),
      'truss-wasm-build':(['cargo','build','--locked','--offline','-p','weft-wasm','--features','truss-postgresql-pg18','--target','wasm32-unknown-unknown'],600),
      'truss-wasm-bindgen':([expected_tool['wasmBindgenPath'],'--target','web','--out-dir','/out/artifacts/truss-web','/owned/target/wasm32-unknown-unknown/debug/weft_wasm.wasm'],180),
      'browser-wrapper':(['bun','build','packages/weft-browser/src/index.ts','--target','browser','--outdir','/out/artifacts/browser-wrapper'],120),
      'distribution-snapshot-post':(['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','list','--format=json'],30)}
    names=list(expected)
    if [r.get('name') for r in rows]!=names or commands_raw!=rows:raise RuntimeError('guest command stream and phase command records differ')
    fixed_env={'RUSTUP_TOOLCHAIN':expected_tool['rustupToolchain'],'CARGO_HOME':'/owned/cargo','CARGO_TARGET_DIR':'/owned/target','CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'4','CARGO_PROFILE_TEST_OPT_LEVEL':'1'}
    total=0
    for row in rows:
        name=row['name'];record=row;argv,limit=expected[name]
        if record.get('argv')!=argv:raise RuntimeError('guest command argv differs from exact admitted command: '+name)
        env=record.get('environment')
        if not isinstance(env,dict) or {k:v for k,v in env.items() if k!='PATH'}!=fixed_env or set(env)!=(set(fixed_env)|{'PATH'}) or not env['PATH'].startswith('/opt/rustup/toolchains/'+expected_tool['rustupToolchain']+'/bin:/usr/local/bun/bin:/usr/local/bin:'):
            raise RuntimeError('guest command environment differs from offline pinned toolchain: '+name)
        started=record.get('startedMonotonic');dur=record.get('elapsedSeconds');timeout=record.get('timeoutSeconds');hard=record.get('deadlineMonotonic')
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (started,dur,timeout,hard)) or dur<0 or timeout<=0 or timeout>limit or dur>timeout+.02 or abs((started+timeout)-hard)>.02:
            raise RuntimeError('guest command timer/deadline record is malformed or exceeds its cap: '+name)
        if record.get('exitCode')!=0 or record.get('timedOut') or record.get('truncated') or record.get('drainExpired') or record.get('captureErrors')!=[] or record.get('streamsEOF')!=[True,True]:
            raise RuntimeError('guest command did not close successfully: '+name)
        streams=record.get('streams')
        if not isinstance(streams,list) or len(streams)!=2:raise RuntimeError('guest command must retain exactly stdout and stderr: '+name)
        for label,stream in zip(('stdout','stderr'),streams):
            expected_path=out_root/'logs'/f'{name}.{label}.log'
            if pathlib.Path(stream.get('path',''))!=pathlib.Path('/out/logs')/f'{name}.{label}.log' or stream.get('truncated') or not stream.get('physicalClosed') or stream.get('rawBytes')!=stream.get('bytes') or stream.get('rawSha256')!=stream.get('sha256'):
                raise RuntimeError('guest command raw/retained stream custody mismatch: '+name+'/'+label)
            h,n=digest(expected_path,RAW_CAP,deadline)
            if (h,n)!=(stream.get('sha256'),stream.get('bytes')):raise RuntimeError('guest command log changed before host admission: '+name+'/'+label)
            bind_physical(expected_path,h,n);total+=n
    if total>512*1024:raise RuntimeError('guest command logs exceed their preallocated half of shared1MiB cap')
    return total

def verify_source_copy(source_copy, report_path, deadline):
    raw,_,_=read_bounded(report_path,1024*1024,deadline)
    if len(raw)>1024*1024:raise RuntimeError('complete source roster exceeds local per-file metadata limit')
    h=hashlib.sha256(raw).hexdigest();bind_physical(report_path,h,len(raw))
    manifest=json.loads(raw); expected=manifest.get('rows')
    if manifest.get('profile')!='umf.g03-p56-physical-inventory/1' or manifest.get('commit')!='973d864c8d26b2bc173a411eac8368da5efc1ab3' or manifest.get('tree')!='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff' or manifest.get('archiveSha256')!='8291da1e97ceb5ebd9cd29f0dab1ce233b14cd20651b1e840f7e3e59802ce77f':raise RuntimeError('source roster does not identify pinned P56')
    expected_stage={'sha256':'bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b','bytes':780359,'entries':5901,'matchingPhysicalFiles':5901,'basis':'captured git-stage index mode + Git blob SHA-1; no guest Git metadata or Git command'}
    if manifest.get('stageRoster')!=expected_stage:raise RuntimeError('physical source report lacks exact captured stage-roster validation')
    actual=[];total=0
    for base,dirs,names in os.walk(source_copy,followlinks=False):
        dirs.sort()
        if time.monotonic()>=deadline:raise TimeoutError('deadline during complete P56 source rehash')
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs):raise RuntimeError('source copy contains symlink directory')
        for filename in sorted(names):
            fp=pathlib.Path(base)/filename
            if fp.is_symlink() or not stat.S_ISREG(fp.lstat().st_mode):raise RuntimeError('source copy contains nonregular/symlink file')
            fh,fn=digest(fp,64*1024*1024,deadline);total+=fn
            actual.append([fp.relative_to(source_copy).as_posix(),fn,fh,stat.S_IMODE(fp.lstat().st_mode)])
    if actual!=expected or manifest.get('fileCount')!=5901 or manifest.get('totalBytes')!=860543639 or len(actual)!=5901 or total!=860543639:raise RuntimeError('physical source files/hash/modes differ from exact P56 source roster')
    return {'fileCount':len(actual),'totalBytes':total,'rosterSha256':hashlib.sha256(json.dumps(actual,separators=(',',':')).encode()).hexdigest(),'gitStageRoster':manifest['stageRoster']}

def inspect_container(name, expected_image, kind, deadline, logdir, cap_left, mounts, *, cpus, memory, pids, tmpfs_options):
    role_tmpfs={'builder':'rw,nosuid,nodev,size=512m','identity':'rw,nosuid,nodev,size=64m','browser':'rw,nosuid,nodev,exec,size=256m'}
    if kind not in role_tmpfs or tmpfs_options!=role_tmpfs[kind]:raise RuntimeError('tmpfs expectation differs from closed container role: '+kind)
    tag=hashlib.sha256(name.encode()).hexdigest()[:12]
    argv=['docker','inspect','--format','{{.Id}}|{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}|{{.State.Status}}|{{.State.ExitCode}}|{{json .Mounts}}|{{json .HostConfig.Tmpfs}}',name]
    rec,remaining=bounded(argv,None,os.environ,deadline,logdir,'inspect-'+kind+'-'+tag,cap_left,timeout=20)
    raw=read_text_bounded(logdir/('inspect-'+kind+'-'+tag+'.stdout.log'),RAW_CAP,deadline).strip()
    parts=raw.split('|',10)
    if len(parts)!=11:raise RuntimeError('container inspect record incomplete: '+name)
    container_id,image,network,readonly,pids_seen,nanocpus,mem,status,exit_code,mount_data,tmpfs_data=parts
    if (image,network,readonly,int(pids_seen),int(nanocpus),int(mem),status,int(exit_code))!=(expected_image,'none','true',pids,int(cpus*1_000_000_000),memory,'exited',0):
        raise RuntimeError('owned container execution limits/image/status differ: '+name)
    actual=json.loads(mount_data)
    normalized=sorted((m.get('Type'),m.get('Source'),m.get('Destination'),bool(m.get('RW'))) for m in actual)
    if normalized!=sorted(mounts):raise RuntimeError('owned container bind-mount custody differs: '+name)
    actual_tmpfs=json.loads(tmpfs_data)
    if not isinstance(actual_tmpfs,dict) or actual_tmpfs!={'/tmp':tmpfs_options}:
        raise RuntimeError('owned container tmpfs custody differs: '+name)
    return {'containerName':name,'containerId':container_id,'imageId':image,'network':'none','readonlyRootfs':True,'pids':pids,'nanoCpus':int(nanocpus),'memoryBytes':int(mem),'mounts':actual,'tmpfs':actual_tmpfs,'exitCode':int(exit_code),'status':status},remaining

def verify_acquired_cache(packet,deadline):
    cache=packet.get('cargoCache',{})
    if cache.get('executionAllowed') is not True or cache.get('status')!='SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE':raise RuntimeError('locked Cargo cache is not Sol-accepted and execution-enabled')
    root=pathlib.Path(cache.get('acquisitionOperatorRoot',''))
    expected_root=pathlib.Path('/private/tmp/g03-linux-locked-cargo-cache-operator-007')
    if root!=expected_root:raise RuntimeError('acquisition root differs from exact approved path')
    manifest=root/'integrity-manifest.json';acq_packet=root/'inputs/cache-acquisition-packet.json'
    if digest(manifest,4*1024*1024,deadline)[0]!=cache.get('acquisitionOperatorManifestSha256'):raise RuntimeError('acquisition source manifest hash differs')
    if digest(acq_packet,128*1024,deadline)[0]!=cache.get('acquisitionPacketSha256'):raise RuntimeError('acquisition packet hash differs')
    ap_raw,_,_=read_bounded(acq_packet,128*1024,deadline);ap=json.loads(ap_raw)
    if (ap.get('profile')!='g03.locked-cargo-cache-inputs/1' or ap.get('status')!='FROZEN_LOCAL_INPUTS' or
        ap.get('source',{}).get('commit')!='973d864c8d26b2bc173a411eac8368da5efc1ab3' or ap.get('source',{}).get('tree')!='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff' or
        ap.get('cargoLock',{}).get('registryPackageCount')!=115 or ap.get('runtime',{}).get('imageId')!='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10' or
        ap.get('softwareOutput',{}).get('archivePath')!='software/cargo-registry.tar' or ap.get('softwareOutput',{}).get('containsOnly')!=['registry/cache','registry/index']):
        raise RuntimeError('acquisition packet differs from exact P56 offline-cache contract')
    review=pathlib.Path(cache.get('acquisitionSolReviewPath') or '')
    review_sha,_=digest(review,1024*1024,deadline)
    if review_sha!=cache.get('acquisitionSolReviewSha256'):raise RuntimeError('Sol acceptance review hash differs')
    runid=cache.get('acquisitionRunId')
    if not isinstance(runid,str) or not re.fullmatch('[0-9a-f]{32}',runid):raise RuntimeError('acquisition run id is malformed')
    out=root/'runs'/runid;result_path=out/'operator-result.json';guest=out/'guest'
    result_raw,rhash,rsize=read_bounded(result_path,1024*1024,deadline);result=json.loads(result_raw)
    if rhash!=cache.get('acquisitionOperatorResultSha256'):raise RuntimeError('acquisition result SHA differs')
    source=result.get('source',{});before=source.get('before',{});cleanup=result.get('cleanup',{})
    # Keep the producer's stale top-level failure string intact; require its positive finalization/capture conjunction instead.
    command=result.get('containerCommand',{});capture=command.get('capture',{});raw_capture=capture.get('rawBytes');retained_capture=capture.get('retainedBytes')
    pass_capture=(command.get('exitCode')==0 and command.get('captureAttempted') is True and capture.get('exitCode')==0 and capture.get('timedOut') is False and capture.get('drainExpired') is False and capture.get('captureErrors')==[] and capture.get('streamsEOF')==[True,True] and capture.get('truncated')==[False,False] and isinstance(raw_capture,list) and isinstance(retained_capture,list) and raw_capture==retained_capture and capture.get('totalRetainedBytes')==sum(raw_capture) and capture.get('captureFailed') is False and result.get('captureAudit',{}).get('verified') is True and result.get('captureAudit',{}).get('errors')==[] and command.get('physicalClosure',{}).get('verified') is True and command.get('physicalClosure',{}).get('errors')==[])
    if (result.get('profile')!='g03.locked-cargo-cache-local-operator/1' or result.get('executionId')!=runid or result.get('status')!='LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS' or
        result.get('executionPerformed') is not True or result.get('evidenceClosureVerified') is not True or cleanup.get('verified') is not True or cleanup.get('errors')!=[] or cleanup.get('containerAbsent') is not True or cleanup.get('volumeAbsent') is not True or pass_capture is not True or
        result.get('captureAudit',{}).get('verified') is not True or result.get('sourceFreezeManifest',{}).get('sha256')!=cache.get('acquisitionOperatorManifestSha256') or
        result.get('packet',{}).get('path')!=str(acq_packet) or result.get('packet',{}).get('sha256')!=cache.get('acquisitionPacketSha256') or
        source.get('after')!=before or before.get('commit')!='973d864c8d26b2bc173a411eac8368da5efc1ab3' or before.get('tree')!='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff' or before.get('fileCount')!=5901 or before.get('totalBytes')!=860543639):
        raise RuntimeError('acquisition result is not closed, cleaned, or bound to P56')
    if (result.get('image',{}).get('id')!='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10' or result.get('image',{}).get('platform')!='linux/amd64' or
        result.get('scope',{}).get('onlyCargoFetch') is not True or result.get('scope',{}).get('compile') is not False or result.get('scope',{}).get('tests') is not False or result.get('scope',{}).get('productImports') is not False or result.get('scope',{}).get('wheelBuild') is not False):
        raise RuntimeError('acquisition result scope/image differs')
    report_path=guest/'evidence/acquisition-guest-report.json';raw,report_hash,report_size=read_bounded(report_path,1024*1024,deadline);report=json.loads(raw)
    gr=result.get('guestReport',{})
    if (report_hash!=cache.get('acquisitionGuestReportSha256') or gr.get('path')!='guest/evidence/acquisition-guest-report.json' or gr.get('sha256')!=report_hash or gr.get('sizeBytes')!=report_size or gr.get('raw')!=report or
        report.get('status')!='LOCKED_CARGO_FETCH_PASS' or report.get('executionPerformed') is not True or report.get('packetSha256')!=cache.get('acquisitionPacketSha256') or report.get('sourceBefore')!=before or report.get('sourceAfter')!=before or
        report.get('lockedCrateCount')!=115 or len(report.get('lockedCrateChecks',[]))!=115 or report.get('sparseIndexWitnessCount')!=115 or len(report.get('sparseIndexWitnesses',[]))!=115):
        raise RuntimeError('physical acquisition guest report is not closed and source-bound')
    idx_raw,idx_hash,idx_size=read_bounded(guest/'evidence/inventory-index.json',1024*1024,deadline);idx=json.loads(idx_raw);inv=report.get('inventory',{})
    if (idx_hash!=cache.get('inventoryIndexSha256') or idx_hash!=inv.get('indexSha256') or inv.get('indexPath')!='evidence/inventory-index.json' or
        idx.get('profile')!='g03.locked-cargo-cache-inventory-index/1' or idx.get('encoding')!='chunked-compact-json-v1' or idx.get('chunkRows')!=1000):raise RuntimeError('physical cache inventory index differs')
    chunks=idx.get('chunks');rows=[];chunk_bytes=0
    if not isinstance(chunks,list) or not chunks or len(chunks)>100:raise RuntimeError('cache inventory chunk count outside bound')
    for i,ch in enumerate(chunks):
        if set(ch)!={'path','rowCount','sizeBytes','sha256'} or ch.get('path')!=f'evidence/inventory-chunks/inventory-{i:04d}.json' or type(ch.get('sizeBytes')) is not int or not 0<ch['sizeBytes']<=1024*1024:raise RuntimeError('inventory chunk descriptor malformed')
        raw,h,n=read_bounded(guest/ch['path'],1024*1024,deadline)
        if (n,h)!=(ch['sizeBytes'],ch['sha256']):raise RuntimeError('physical inventory chunk digest differs')
        doc=json.loads(raw);batch=doc.get('rows')
        if doc.get('profile')!='g03.locked-cargo-cache-inventory-chunk/1' or doc.get('chunkIndex')!=i or not isinstance(batch,list) or len(batch)!=ch['rowCount'] or not batch or doc.get('firstPath')!=batch[0].get('path') or doc.get('lastPath')!=batch[-1].get('path'):raise RuntimeError('inventory chunk schema mismatch')
        rows.extend(batch);chunk_bytes+=n
        if chunk_bytes>5*1024*1024:raise RuntimeError('inventory chunks exceed cap')
    row_hash=hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    if (inv.get('fileContentBytes',-1)>64*1024*1024 or len(rows)!=cache.get('inventoryRowCount') or row_hash!=cache.get('inventoryRowsSha256') or row_hash!=idx.get('rowsSha256') or row_hash!=inv.get('rowsSha256') or chunk_bytes!=cache.get('inventoryChunkBytes') or chunk_bytes!=idx.get('totalChunkBytes')):raise RuntimeError('complete inventory rows/hash differ')
    archive=inv.get('archive',{});archive_path=guest/'software/cargo-registry.tar';archive_hash,archive_size=digest(archive_path,cache['archiveMaxBytes'],deadline)
    if (archive.get('path')!='software/cargo-registry.tar' or archive_hash!=cache.get('archiveSha256') or archive_size!=cache.get('archiveBytes') or (archive_hash,archive_size)!=(archive.get('sha256'),archive.get('sizeBytes'))):raise RuntimeError('physical acquired archive differs from exact pin')
    closure={'runId':runid,'operatorResultSha256':rhash,'guestReportSha256':report_hash,'inventoryIndexSha256':idx_hash,'inventoryRowsSha256':row_hash,'inventoryChunkBytes':chunk_bytes,'inventoryRowCount':len(rows),'archiveSha256':archive_hash,'archiveBytes':archive_size,'cacheContentBytes':inv.get('fileContentBytes')}
    return {'guestRoot':guest,'closure':closure}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--execute',action='store_true',help='required explicit execution opt-in; parent is sole executor');ap.add_argument('--packet-sha256',required=True);ap.add_argument('--manifest-sha256',required=True);args=ap.parse_args()
    if not args.execute:raise SystemExit('source packet only; pass --execute after independent review')
    lane_start=time.monotonic(); deadline=lane_start+TOTAL; work_deadline=deadline-RESERVE; rid=str(uuid.uuid4()); out=OUTPUT_ROOT/rid;OUTPUT_ROOT.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=False); logs=out/'outer'; logs.mkdir()
    cap_left=RAW_CAP; receipt={'profile':'umf.g03-truss-local-lane/1','executionId':rid,'status':'FAIL_OR_UNKNOWN','scope':'installed final18 + Truss facts/entity selection + truss-postgresql-pg18 WASM + Linux ARM64 Chromium','startedMonotonic':lane_start,'deadlineMonotonic':deadline,'clockDomains':{'hostClockDomain':f'{sys.platform} host time.monotonic','hostLaneStartMonotonic':lane_start,'hostWorkDeadlineMonotonic':work_deadline,'hostTerminalDeadlineMonotonic':deadline,'hostClockIsAuthoritative':True},'commands':[],'failures':[]}
    resources=[]; owned=[];owned_specs={}
    global ACTIVE_RECEIPT,ACTIVE_CAP_LEFT,ACTIVE_TERMINAL_DEADLINE
    ACTIVE_RECEIPT=receipt;ACTIVE_CAP_LEFT=RAW_CAP;ACTIVE_TERMINAL_DEADLINE=deadline
    write_bounded(out/'operator-result.seed.json',(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode(),1024*1024,deadline)
    try:
        manifest_info=verify_frozen(args.manifest_sha256,work_deadline)
        ph,pn=digest(PACKET,128*1024,work_deadline);packet_raw,packet_hash,packet_size=read_bounded(PACKET,128*1024,work_deadline)
        if (packet_hash,packet_size)!=(ph,pn):raise RuntimeError('input packet changed between hash and parse')
        packet=json.loads(packet_raw)
        if ph!=args.packet_sha256:raise RuntimeError('input packet pin mismatch')
        pins=packet['inputs']
        for rel,key in [('truss-facts.workflow.yml','workflowSha256'),('Cargo.lock','cargoLockSha256'),('bun.lock','bunLockSha256'),('package.json','packageJsonSha256'),('truss-facts/check.py','factsCheckSha256'),('truss-facts/cases.json','factsCasesSha256'),('truss-entity-selection/check.py','entityCheckSha256'),('truss-entity-selection/cases.json','entityCasesSha256'),('compile/browser-check.mjs','browserCheckSha256'),('browser-deps/manifest.json','portableDepsManifestSha256'),('evidence/inherited-boundary-plan.md','inheritedPlanSha256'),('evidence/table-operator-findings-reference.md','tableFindingsSha256'),('evidence/browser-tool-preflight.json','browserPreflightSha256'),('evidence/wasm-bindgen-acquisition.json','wasmAcquisitionSha256'),('evidence/wasm-bindgen-version-preflight.json','wasmPreflightSha256'),('evidence/builder-tool-feasibility.json','builderFeasibilitySha256'),('evidence/builder-tool-versions-failed-optional-probe.json','builderOptionalFailureSha256'),('evidence/final-cohort-construction-result.json','cohortConstructionSha256'),('evidence/final-cohort-data-review.md','cohortDataReviewSha256'),('evidence/locked-cargo-cache-acquisition-plan.md','cargoCachePlanSha256'),('cargo-cache/HELD.json','cargoCacheMarkerSha256'),('verify_weft_wheel.py','wheelVerifierSha256')]:
            if digest(ROOT/'inputs'/rel if not rel.startswith('runtime/') else ROOT/rel,4*1024*1024,work_deadline)[0]!=pins[key]:raise RuntimeError('pinned source input mismatch: '+rel)
        if packet['profile']!='umf.g03-truss-facts-entity-selection/1' or packet['status']!='FROZEN_SOURCE_CACHE_AVAILABLE_NOT_EXECUTED' or packet.get('source',{}).get('archiveMembers')!=6794 or packet.get('source',{}).get('topLevelEntries')!=26 or packet.get('source',{}).get('stageRosterHasFinalLf') is not False:raise RuntimeError('closed packet identity/status mismatch')
        cache=packet.get('cargoCache',{})
        expected_cache_keys={'profile','executionAllowed','status','acquisitionOperatorRoot','acquisitionOperatorManifestSha256','acquisitionPacketSha256','acquisitionSolReviewSha256','acquisitionSolReviewPath','acquisitionRunId','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveRelativePath','archiveSha256','archiveBytes','inventoryIndexSha256','inventoryRowsSha256','inventoryChunkBytes','inventoryRowCount','cacheContentBytes','lockedCrateCount','sparseIndexWitnessCount','archiveMaxBytes','sourceImageId','mountDestination'}
        if set(cache)!=expected_cache_keys or cache.get('profile')!='umf.g03-locked-cargo-cache-consumer/1' or cache.get('acquisitionOperatorRoot')!='/private/tmp/g03-linux-locked-cargo-cache-operator-007' or cache.get('archiveRelativePath')!='guest/software/cargo-registry.tar' or cache.get('lockedCrateCount')!=115 or cache.get('sparseIndexWitnessCount')!=115 or cache.get('archiveMaxBytes')!=64*1024*1024 or cache.get('sourceImageId')!='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10' or cache.get('mountDestination')!='/cargo-cache-input':raise RuntimeError('closed locked-cache packet identity differs')
        if cache.get('executionAllowed') is not True or cache.get('status')!='SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE' or not all(cache.get(k) for k in ('acquisitionOperatorManifestSha256','acquisitionPacketSha256','acquisitionSolReviewSha256','acquisitionSolReviewPath','acquisitionRunId','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveSha256','inventoryIndexSha256','inventoryRowsSha256')) or any(type(cache.get(k)) is not int for k in ('archiveBytes','inventoryChunkBytes','inventoryRowCount','cacheContentBytes')) or cache.get('cacheContentBytes',64*1024*1024+1)>64*1024*1024:
            raise RuntimeError('lane held: accepted locked offline Cargo cache evidence/pins are not available')
        cache_before=verify_acquired_cache(packet,work_deadline)
        cache_guest_root=cache_before['guestRoot']
        receipt['lockedCargoCacheInputBefore']=cache_before['closure']
        archive_before=digest(SOURCE_TAR,1024*1024*1024,work_deadline)
        if archive_before!=(packet['source']['archiveSha256'],packet['source']['archiveBytes']):raise RuntimeError('source P56 archive pin mismatch')
        receipt['sourceArchiveBefore']={'sha256':archive_before[0],'sizeBytes':archive_before[1]}
        dep_raw,dep_hash,_=read_bounded(ROOT/'inputs/browser-deps/manifest.json',4*1024*1024,work_deadline); dep=json.loads(dep_raw)
        if dep_hash!=packet['inputs']['portableDepsManifestSha256']:raise RuntimeError('portable JS manifest pin mismatch')
        if dep.get('profile')!='umf.g03-table-operations-portable-js-dependencies/1' or dep.get('packages') is None or any(x.get('nativeMagicPaths')!=[] for x in dep['packages']):raise RuntimeError('portable JavaScript dependency evidence lists native payloads')
        before={name:tree_hash(path,dep,work_deadline) for name,path in JS_ROOTS.items()}
        cohort_info=verify_cohort(packet,work_deadline)
        for image,expected in [(packet['tools']['builderImage'],'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10|linux/amd64'),(packet['browser']['image'],'sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27|linux/arm64')]:
            ident,cap_left=bounded(['docker','image','inspect','--format','{{.Id}}|{{.Os}}/{{.Architecture}}',image],None,os.environ,work_deadline,logs,'image-'+('builder' if 'amd64' in expected else 'browser'),cap_left,timeout=30)
            got=read_text_bounded(logs/('image-'+('builder' if 'amd64' in expected else 'browser')+'.stdout.log'),RAW_CAP,work_deadline).strip()
            if got!=expected:raise RuntimeError('pinned container image digest/platform mismatch: '+image)
        for p,sha in [(COHORT/'aggregate/index.json',packet['cohort']['indexSha256']),(COHORT/'aggregate/mirror/manifest.json',packet['cohort']['mirrorManifestSha256']),(COHORT/'aggregate/mirror/requirements.lock',packet['cohort']['requirementsSha256']),(WASM,packet['tools']['wasmBindgen']['sha256'])]:
            if digest(p,64*1024*1024,work_deadline)[0]!=sha:raise RuntimeError('pinned cohort/tool input mismatch: '+str(p))
        # All roots are fresh per-attempt bind mounts. They are the only writable mounts.
        owned_root=out/'owned';owned_root.mkdir(); (owned_root/'source').mkdir();(owned_root/'cargo').mkdir();(owned_root/'target').mkdir();(owned_root/'out').mkdir()
        builder_name='g03-truss-builder-'+rid;owned.append(builder_name);owned_specs[builder_name]={'kind':'truss-facts-entity-selection','image':packet['tools']['builderImage'],'containerId':None}
        # Only durations cross the host/guest boundary. Darwin and Linux monotonic
        # epochs are unrelated; this handoff never restarts the parent deadline.
        guest_handoff_host_monotonic=time.monotonic()
        guest_work_remaining=max(0.0,work_deadline-guest_handoff_host_monotonic)
        guest_terminal_remaining=max(0.0,min(deadline,work_deadline+20.0)-guest_handoff_host_monotonic)
        guest_clock_domain=f'{sys.platform} host time.monotonic'
        receipt['clockDomains']['guestHandoffPreparedHostMonotonic']=guest_handoff_host_monotonic
        receipt['clockDomains']['guestWorkRemainingSecondsAtHandoff']=guest_work_remaining
        receipt['clockDomains']['guestTerminalRemainingSecondsAtHandoff']=guest_terminal_remaining
        receipt['clockDomains']['guestClockDomain']='Linux guest time.monotonic'
        receipt['clockDomains']['mapping']='remaining durations anchored once in guest; original host work and terminal deadlines remain authoritative'
        builder_argv=['docker','run','--pull=never','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--name',builder_name,'--label','codex.g03.execution-id='+rid,'--label','codex.g03.kind=truss-facts-entity-selection','--network=none','--platform=linux/amd64','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=4','--memory=8g','--pids-limit=8192','--mount',f'type=bind,source={SOURCE_TAR},target=/inputs/source-p56.tar,readonly','--mount',f'type=bind,source={COHORT},target=/cohort,readonly','--mount',f'type=bind,source={ROOT}/runtime/guest.py,target=/operator/guest.py,readonly','--mount',f'type=bind,source={ROOT}/runtime/cargo_cache_extract.py,target=/operator/cargo_cache_extract.py,readonly','--mount',f'type=bind,source={ROOT}/inputs,target=/operator-inputs,readonly','--mount',f'type=bind,source={cache_guest_root},target=/cargo-cache-input,readonly','--mount',f'type=bind,source={WASM},target=/wasm-tools/wasm-bindgen,readonly','--mount',f'type=bind,source={owned_root},target=/owned','--mount',f'type=bind,source={owned_root}/out,target=/out','--mount',f'type=bind,source={ROOT}/inputs/browser-deps,target=/browser-deps,readonly','--env','PYTHONDONTWRITEBYTECODE=1','--env','CARGO_HOME=/owned/cargo','--env','CARGO_TARGET_DIR=/owned/target','--env','G03_TRUSS_PACKET_SHA256='+packet_hash,'--env','RUSTUP_TOOLCHAIN=1.90.0-x86_64-unknown-linux-gnu','--env','G03_GUEST_WORK_REMAINING_SECONDS='+repr(guest_work_remaining),'--env','G03_GUEST_TERMINAL_REMAINING_SECONDS='+repr(guest_terminal_remaining),'--env','G03_HOST_CLOCK_DOMAIN='+guest_clock_domain,packet['tools']['builderImage'],'/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','-B','-I','/operator/guest.py']
        r,cap_left=bounded(builder_argv,None,os.environ,deadline,logs,'builder',cap_left,timeout=max(.1,deadline-time.monotonic()));resources.append(builder_name)
        builder_mounts=[('bind',str(SOURCE_TAR),'/inputs/source-p56.tar',False),('bind',str(COHORT),'/cohort',False),('bind',str(ROOT/'runtime/guest.py'),'/operator/guest.py',False),('bind',str(ROOT/'runtime/cargo_cache_extract.py'),'/operator/cargo_cache_extract.py',False),('bind',str(ROOT/'inputs'),'/operator-inputs',False),('bind',str(cache_guest_root),'/cargo-cache-input',False),('bind',str(WASM),'/wasm-tools/wasm-bindgen',False),('bind',str(owned_root),'/owned',True),('bind',str(owned_root/'out'),'/out',True),('bind',str(ROOT/'inputs/browser-deps'),'/browser-deps',False),]
        container_info,cap_left=inspect_container(builder_name,packet['tools']['builderImage'],'builder',work_deadline,logs,cap_left,builder_mounts,cpus=4,memory=8*1024**3,pids=8192,tmpfs_options='rw,nosuid,nodev,size=512m');owned_specs[builder_name]['containerId']=container_info['containerId'];receipt['commands'].append({'name':'builder-container-identity','record':container_info})
        phase_path=owned_root/'out/reports/guest-phase-result.json';phase_raw,phase_sha,phase_size=read_bounded(phase_path,1024*1024,work_deadline);bind_physical(phase_path,phase_sha,phase_size);phase=json.loads(phase_raw)
        cache_receipt_path=owned_root/'out/reports/cargo-cache.json';cache_receipt_raw,cache_receipt_sha,cache_receipt_size=read_bounded(cache_receipt_path,1024*1024,work_deadline);bind_physical(cache_receipt_path,cache_receipt_sha,cache_receipt_size);cache_receipt=json.loads(cache_receipt_raw)
        if (cache_receipt.get('profile')!='umf.g03-cargo-cache-extraction/1' or cache_receipt.get('status')!='PASS' or cache_receipt.get('archiveSha256')!=packet['cargoCache']['archiveSha256'] or cache_receipt.get('archiveBytes')!=packet['cargoCache']['archiveBytes'] or cache_receipt.get('inventoryRowsSha256')!=packet['cargoCache']['inventoryRowsSha256'] or cache_receipt.get('inventoryIndexSha256')!=packet['cargoCache']['inventoryIndexSha256'] or cache_receipt.get('inventoryChunkBytes')!=packet['cargoCache']['inventoryChunkBytes'] or cache_receipt.get('inventoryRowCount')!=packet['cargoCache']['inventoryRowCount'] or cache_receipt.get('cacheContentBytes')!=packet['cargoCache']['cacheContentBytes'] or type(cache_receipt.get('inventoryFileCount')) is not int or cache_receipt.get('inventoryFileCount')<=0):raise RuntimeError('physical Cargo-cache extraction receipt differs from accepted packet')
        command_log_path=owned_root/'out/commands.jsonl';command_log_raw,command_log_sha,command_log_size=read_bounded(command_log_path,1024*1024,work_deadline);bind_physical(command_log_path,command_log_sha,command_log_size)
        guest_clock=phase.get('clock',{});guest_anchor=guest_clock.get('guestAnchorMonotonic');guest_work_end=guest_clock.get('guestWorkDeadlineMonotonic');guest_terminal_end=guest_clock.get('guestTerminalDeadlineMonotonic')
        if guest_clock.get('guestClockDomain')!='Linux guest time.monotonic' or guest_clock.get('hostClockDomain')!=guest_clock_domain or guest_clock.get('mapping')!='remaining durations passed from the original host lane; one guest-local monotonic anchor; parent host deadlines remain authoritative' or any(type(x) not in (int,float) or not math.isfinite(x) for x in (guest_anchor,guest_work_end,guest_terminal_end)) or guest_clock.get('hostWorkRemainingSecondsAtHandoff')!=guest_work_remaining or guest_clock.get('hostTerminalRemainingSecondsAtHandoff')!=guest_terminal_remaining or abs((guest_anchor+guest_work_remaining)-guest_work_end)>.001 or abs((guest_anchor+guest_terminal_remaining)-guest_terminal_end)>.001:
            raise RuntimeError('guest-local monotonic anchor/deadlines do not match the finite host remaining-duration handoff')
        receipt['clockDomains']['guestAnchorMonotonic']=guest_anchor
        receipt['clockDomains']['guestWorkDeadlineMonotonic']=guest_work_end
        receipt['clockDomains']['guestTerminalDeadlineMonotonic']=guest_terminal_end
        source_name='p56'
        if phase.get('sourceRootName')!=source_name:raise RuntimeError('guest did not retain the declared flat-P56 directory layout')
        source_copy=owned_root/'source'/source_name
        if not source_copy.is_dir() or source_copy.is_symlink():raise RuntimeError('builder did not retain exact writable source copy for browser checks')
        expected_guest=['python-version','rustc-version','cargo-version','bun-version','node-version','wasm-bindgen-version','rust-verbose','rust-targets','cargo-cache-extract','create-venv','offline-install','pip-check','wheel-members','distribution-snapshot','facts-python','entity-python','truss-wasm-build','truss-wasm-bindgen','browser-wrapper','distribution-snapshot-post']
        if phase.get('profile')!='umf.g03-truss-guest-phase/1' or phase.get('status')!='PASS' or phase.get('sourceCommit')!='973d864c8d26b2bc173a411eac8368da5efc1ab3' or phase.get('sourceTree')!='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff' or phase.get('sourceRootName')!=source_name or phase.get('sourceFileCount')!=5901 or phase.get('sourceBytes')!=860543639 or phase.get('gitStageRoster')!={'sha256':'bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b','bytes':780359,'entries':5901,'matchingPhysicalFiles':5901,'basis':'captured git-stage index mode + Git blob SHA-1; no guest Git metadata or Git command'} or [x.get('name') for x in phase.get('commands',[])]!=expected_guest:raise RuntimeError('guest receipt status/complete exact command roster/source custody mismatch')
        if (phase.get('cargoCacheArchiveSha256')!=packet['cargoCache']['archiveSha256'] or phase.get('cargoCacheArchiveBytes')!=packet['cargoCache']['archiveBytes'] or phase.get('cargoCacheInventoryIndexSha256')!=packet['cargoCache']['inventoryIndexSha256'] or phase.get('cargoCacheInventoryChunkBytes')!=packet['cargoCache']['inventoryChunkBytes'] or phase.get('cargoCacheEntryCount')!=packet['cargoCache']['inventoryRowCount'] or phase.get('cargoCacheBytes')!=packet['cargoCache']['cacheContentBytes'] or phase.get('cargoCacheFileCount')<=0):raise RuntimeError('guest Cargo-cache extraction receipt differs from accepted packet pins')
        guest_commands=[json.loads(line) for line in command_log_raw.decode('utf-8').splitlines()]
        guest_tools={**packet['tools'],'pythonPath':'/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','wasmBindgenPath':'/wasm-tools/wasm-bindgen'}
        guest_logs=verify_guest_commands(phase.get('commands',[]),guest_commands,source_copy,owned_root/'out',work_deadline,guest_tools,packet['cargoCache'])
        artifact_before,artifact_bytes=inventory_outputs(owned_root/'out/artifacts',work_deadline)
        wasm_names={x['path'] for x in artifact_before if x['path'].startswith('truss-web/')}
        if wasm_names!={'truss-web/weft_wasm.js','truss-web/weft_wasm_bg.wasm','truss-web/weft_wasm.d.ts','truss-web/weft_wasm_bg.wasm.d.ts'}:raise RuntimeError('truss WASM-bindgen output file roster differs')
        if 'browser-wrapper/index.js' not in {x['path'] for x in artifact_before}:raise RuntimeError('browser wrapper build output is missing index.js')
        receipt['selectedSoftwareArtifactsBeforeBrowser']={'files':artifact_before,'totalBytes':artifact_bytes}
        receipt['guestPhase']={'commandLogSha256':command_log_sha,'commandLogBytes':command_log_size,'clock':guest_clock,'commands':phase['commands'],'status':phase['status'],'sourceFileCount':phase['sourceFileCount'],'sourceBytes':phase['sourceBytes'],'sourceRosterSha256':phase['sourceRosterSha256'],'gitStageRoster':phase['gitStageRoster'],'installedDistributionSnapshotSha256':phase['installedDistributionSnapshotSha256'],'postSnapshotEqual':phase['postSnapshotEqual'],'cargoCacheFileCount':phase['cargoCacheFileCount'],'cargoCacheEntryCount':phase['cargoCacheEntryCount'],'cargoCacheBytes':phase['cargoCacheBytes'],'cargoCacheRosterSha256':phase['cargoCacheRosterSha256'],'cargoCacheArchiveSha256':phase['cargoCacheArchiveSha256'],'cargoCacheArchiveBytes':phase['cargoCacheArchiveBytes'],'cargoCacheInventoryIndexSha256':phase['cargoCacheInventoryIndexSha256'],'cargoCacheInventoryChunkBytes':phase['cargoCacheInventoryChunkBytes'],'cargoCacheInstallReceiptSha256':cache_receipt_sha,'cargoCacheInstallReceiptBytes':cache_receipt_size,'wasmFeatureProfile':phase['wasmFeatureProfile'],'commandCount':len(phase['commands'])}
        for name,expected in [('facts-python',len(json.loads(read_text_bounded(ROOT/'inputs/truss-facts/cases.json',4*1024*1024,work_deadline)))),('entity-python',len(json.loads(read_text_bounded(ROOT/'inputs/truss-entity-selection/cases.json',4*1024*1024,work_deadline))))]:
            lines=read_text_bounded(owned_root/'out/logs'/(name+'.stdout.log'),RAW_CAP,work_deadline).splitlines()
            if len(lines)!=1:raise RuntimeError(name+' did not emit its single summary record')
            summary=json.loads(lines[0])
            if summary.get('status')!='passed' or summary.get('version')!='0.4.56' or summary.get('cases')!=expected:raise RuntimeError(name+' report does not match the source corpus and installed release')
        for rel in ['reports/facts.json','reports/entity.json','reports/installed-wheel-correspondence.json','reports/installed-distributions.json','reports/source-inventory.json','artifacts/truss-web/weft_wasm.js','artifacts/truss-web/weft_wasm_bg.wasm','artifacts/browser-wrapper/index.js']:
            if not (owned_root/'out'/rel).is_file():raise RuntimeError('required Truss lane output missing: '+rel)
        lock_text=read_text_bounded(COHORT/'aggregate/mirror/requirements.lock',1024*1024,work_deadline)
        canonical=lambda name:re.sub(r'[-_.]+','-',name).lower()
        locked={}
        for line in lock_text.splitlines():
            line=line.split('\\',1)[0].strip()
            if line and not line.startswith('#') and '==' in line:
                raw_name,version=line.split('==',1);key=canonical(raw_name)
                if key in locked:raise RuntimeError('duplicate PEP503 package name in frozen final18 lock')
                locked[key]=version.split()[0].split(';')[0]
        dist_path=owned_root/'out/reports/installed-distributions.json';dist_raw,dist_hash,dist_size=read_bounded(dist_path,1024*1024,work_deadline);bind_physical(dist_path,dist_hash,dist_size);dist_report=json.loads(dist_raw)
        snapshot_path=owned_root/'out/logs/distribution-snapshot.stdout.log';snap_raw,snap_sha,snap_size=read_bounded(snapshot_path,RAW_CAP,work_deadline);bind_physical(snapshot_path,snap_sha,snap_size);snapshot=json.loads(snap_raw)
        post_path=owned_root/'out/logs/distribution-snapshot-post.stdout.log';post_raw,post_sha,post_size=read_bounded(post_path,RAW_CAP,work_deadline);bind_physical(post_path,post_sha,post_size);post_snapshot=json.loads(post_raw)
        installed={}
        for row in snapshot:
            key=canonical(row['name'])
            if key in installed:raise RuntimeError('duplicate PEP503 installed distribution name')
            installed[key]=row['version']
        if len(locked)!=18 or dist_report.get('status')!='verified' or dist_report.get('lockedDistributions')!=locked or dist_report.get('installedDistributions')!=installed or dist_report.get('bootstrapAllowance')!=['pip','setuptools'] or any(installed.get(k)!=v for k,v in locked.items()) or set(installed)-set(locked)-{'pip','setuptools'} or post_snapshot!=snapshot:
            raise RuntimeError('fresh installed18 snapshot/report differs from exact PEP503 locked cohort')
        if hashlib.sha256(json.dumps(snapshot,sort_keys=True,separators=(',',':')).encode()).hexdigest()!=phase.get('installedDistributionSnapshotSha256') or phase.get('postSnapshotEqual') is not True:
            raise RuntimeError('fresh package snapshot digest or post-snapshot equality is not closed')
        wheel_path=owned_root/'out/reports/installed-wheel-correspondence.json';wheel_raw,wheel_sha,wheel_size=read_bounded(wheel_path,1024*1024,work_deadline);bind_physical(wheel_path,wheel_sha,wheel_size);wheel_report=json.loads(wheel_raw)
        members=wheel_report.get('members')
        wheel_log=json.loads(read_text_bounded(owned_root/'out/logs/wheel-members.stdout.log',RAW_CAP,work_deadline))
        if wheel_report!=wheel_log or not str(wheel_report.get('installedPackagePath','')).startswith('/owned/venv/') or wheel_report.get('wheelSha256')!=packet['cohort']['wheel']['sha256'] or wheel_report.get('wheelSizeBytes')!=packet['cohort']['wheel']['sizeBytes'] or wheel_report.get('memberRosterExact') is not True or type(wheel_report.get('memberCount')) is not int or not isinstance(members,list) or len(members)!=wheel_report['memberCount'] or not members or [r.get('wheelPath') for r in members]!=sorted({r.get('wheelPath') for r in members}) or any(not isinstance(r.get('sha256'),str) or len(r['sha256'])!=64 or type(r.get('sizeBytes')) is not int or r['sizeBytes']<0 or not r.get('wheelPath','').startswith('weft/') for r in members):
            raise RuntimeError('installed Weft member correspondence does not bind every exact final-wheel member')
        identity_argv=['/bin/sh','-eu','-c','node --version; /ms-playwright/chromium-1243/chrome-linux-arm64/chrome --version; sha256sum /ms-playwright/chromium-1243/chrome-linux-arm64/chrome']
        def browser_identity(label):
            nonlocal cap_left
            nm='g03-truss-browser-identity-'+label+'-'+rid;owned.append(nm);owned_specs[nm]={'kind':'truss-browser-identity','image':packet['browser']['image'],'containerId':None}
            argv=['docker','run','--pull=never','--name',nm,'--label','codex.g03.execution-id='+rid,'--label','codex.g03.kind=truss-browser-identity','--network=none','--platform=linux/arm64','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=64m','--cpus=1','--memory=1g','--pids-limit=128',packet['browser']['image']]+identity_argv
            rr,cap_left=bounded(argv,None,os.environ,work_deadline,logs,'browser-identity-'+label,cap_left,timeout=30)
            
            identity_mounts=[]
            observed,cap_left=inspect_container(nm,packet['browser']['image'],'identity',work_deadline,logs,cap_left,identity_mounts,cpus=1,memory=1024**3,pids=128,tmpfs_options='rw,nosuid,nodev,size=64m');owned_specs[nm]['containerId']=observed['containerId']
            receipt['commands'].append({'name':'browser-container-identity-'+label,'record':observed})
            lines=read_text_bounded(logs/('browser-identity-'+label+'.stdout.log'),RAW_CAP,work_deadline).splitlines()
            if len(lines)!=3 or lines[0].strip()!='v24.20.0' or lines[1].strip()!='Google Chrome for Testing 153.0.8010.12' or lines[2].split()[0]!=packet['browser']['chromiumSha256']:
                raise RuntimeError('actual Linux ARM64 Node/Chromium identity differs from pin')
            return lines
        browser_before=browser_identity('before')
        input_custody={}
        def js_json(value):
            return json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False)
        for lane,corpus,reports,api in [('facts','truss-facts/cases.json','reports/facts.json','compile_truss_runtime_json'),('entity','truss-entity-selection/cases.json','reports/entity.json','compile_truss_runtime_entity_selection')]:
            name='g03-truss-browser-'+lane+'-'+rid;owned.append(name);owned_specs[name]={'kind':'truss-browser','image':packet['browser']['image'],'containerId':None};brout=out/('browser-'+lane);brout.mkdir()
            corpus_path=source_copy/'tests'/corpus
            native_report_path=owned_root/'out'/reports
            corpus_bytes,corpus_sha,corpus_size=read_bounded(corpus_path,4*1024*1024,work_deadline)
            native_bytes,native_sha,native_size=read_bounded(native_report_path,EVIDENCE_CAP,work_deadline)
            cases=json.loads(corpus_bytes);native_rows=json.loads(native_bytes)
            if not isinstance(cases,list) or not isinstance(native_rows,list) or len(cases)!=len(native_rows) or len(cases)!=(5 if lane=='facts' else 33):raise RuntimeError('browser input corpus/native report shape/count mismatch: '+lane)
            ids=[c.get('id') for c in cases]
            if any(not isinstance(i,str) for i in ids) or [r.get('id') for r in native_rows]!=ids or any(not isinstance(r.get('raw'),str) for r in native_rows):raise RuntimeError('native report ids/order/raw values do not correspond to admitted corpus: '+lane)
            bind_physical(native_report_path,native_sha,native_size)
            input_custody[lane]={'corpusPath':'tests/'+corpus,'corpusSha256':corpus_sha,'corpusBytes':corpus_size,'nativeReportPath':'reports/'+pathlib.Path(reports).name,'nativeReportSha256':native_sha,'nativeReportBytes':native_size,'caseIds':ids}
            node_cmd=['node','tests/compile/browser-check.mjs']
            env={'WEFT_PROBE_JS':'/truss-web/weft_wasm.js','WEFT_PROBE_WASM':'/truss-web/weft_wasm_bg.wasm','WEFT_BROWSER_WRAPPER':'/wrapper/index.js','WEFT_FRONTEND_CORPUS':'/workspace/tests/'+corpus,'WEFT_FRONTEND_REPORTS':'/reports/native.json','WEFT_PROBE_API':api,'WEFT_FRONTEND_BROWSER_SUMMARY':'/browser-out/summary.json','WEFT_BROWSER_RECEIPTS':'/browser-out/receipts.json','WEFT_PLAYWRIGHT_MODULE':'/deps/node_modules/playwright/index.mjs','WEFT_CHROMIUM_EXECUTABLE':packet['browser']['chromium'],'HOME':'/tmp/home'}
            report_host=str(native_report_path)
            argv=['docker','run','--pull=never','--name',name,'--label','codex.g03.execution-id='+rid,'--label','codex.g03.kind=truss-browser','--network=none','--platform=linux/arm64','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus=4','--memory=8g','--pids-limit=8192','--shm-size=1g','--ulimit','fsize=16777216:16777216','--tmpfs','/tmp:rw,nosuid,nodev,exec,size=256m','--workdir','/workspace','--mount',f'type=bind,source={source_copy},target=/workspace,readonly','--mount',f'type=bind,source={report_host},target=/reports/native.json,readonly','--mount',f'type=bind,source={brout},target=/browser-out','--mount',f'type=bind,source={owned_root}/out/artifacts/truss-web,target=/truss-web,readonly','--mount',f'type=bind,source={owned_root}/out/artifacts/browser-wrapper,target=/wrapper,readonly','--mount',f"type=bind,source={JS_ROOTS['playwright']},target=/deps/node_modules/playwright,readonly",'--mount',f"type=bind,source={JS_ROOTS['playwright-core']},target=/deps/node_modules/playwright-core,readonly"]
            for k,v in env.items():argv.extend(['--env',k+'='+v])
            argv += [packet['browser']['image'],'node','tests/compile/browser-check.mjs']
            r,cap_left=bounded(argv,None,os.environ,work_deadline,logs,'browser-'+lane,cap_left,timeout=600);resources.append(name)
            browser_mounts=[('bind',str(source_copy),'/workspace',False),('bind',report_host,'/reports/native.json',False),('bind',str(brout),'/browser-out',True),('bind',str(owned_root/'out/artifacts/truss-web'),'/truss-web',False),('bind',str(owned_root/'out/artifacts/browser-wrapper'),'/wrapper',False),('bind',str(JS_ROOTS['playwright']),'/deps/node_modules/playwright',False),('bind',str(JS_ROOTS['playwright-core']),'/deps/node_modules/playwright-core',False),]
            browser_info,cap_left=inspect_container(name,packet['browser']['image'],'browser',work_deadline,logs,cap_left,browser_mounts,cpus=4,memory=8*1024**3,pids=8192,tmpfs_options='rw,nosuid,nodev,exec,size=256m');owned_specs[name]['containerId']=browser_info['containerId'];receipt['commands'].append({'name':'browser-container-identity-'+lane,'record':browser_info})
            summary_path=brout/'summary.json';receipts_path=brout/'receipts.json'
            summary=json.loads(read_text_bounded(summary_path,1024*1024,work_deadline));browser_receipts=json.loads(read_text_bounded(receipts_path,EVIDENCE_CAP,work_deadline))
            case_count=len(cases);wasm_hash=digest(owned_root/'out/artifacts/truss-web/weft_wasm_bg.wasm',ARTIFACT_CAP,work_deadline)[0]
            allowed_routes={'/','/spike.js','/spike.wasm','/wrapper.js'}
            request_urls=summary.get('networkRequests')
            if not isinstance(request_urls,list) or not request_urls or any(not isinstance(u,str) for u in request_urls):raise RuntimeError('browser did not retain actual virtual request list: '+lane)
            parsed=[urllib.parse.urlsplit(u) for u in request_urls]
            if any(u.scheme!='http' or u.netloc!='weft.spike.test' or u.path not in allowed_routes or u.query or u.fragment for u in parsed) or {u.path for u in parsed}!=allowed_routes:raise RuntimeError('browser request list escaped exact source-owned same-origin routes: '+lane)
            if summary.get('cases')!=case_count or summary.get('byteParity') is not True or summary.get('nodeGlobals') is not False or summary.get('playwrightVersion')!='1.62.1' or summary.get('browser')!=packet['browser']['chromiumVersion'].rsplit(' ',1)[-1] or summary.get('wasmSha256')!=wasm_hash:raise RuntimeError('browser summary failed exact parity/import/runtime/corpus/browser closure: '+lane)
            if browser_receipts.get('summary')!=summary or [r.get('id') for r in browser_receipts.get('cases',[])]!=ids:raise RuntimeError('browser receipt corpus/summary id/order differs from admitted corpus: '+lane)
            receipt_cases=browser_receipts['cases']
            for case,native,observed in zip(cases,native_rows,receipt_cases):
                request_hash=hashlib.sha256(js_json(case['request']).encode('utf-8')).hexdigest()
                expected_hash=hashlib.sha256(native['raw'].encode('utf-8')).hexdigest()
                if observed.get('requestSha256')!=request_hash or observed.get('expectedSha256')!=expected_hash or observed.get('actualSha256')!=expected_hash:raise RuntimeError('browser receipt request/output hashes do not match source corpus and native report: '+str(case.get('id')))
            summary_raw,summary_sha,summary_n=read_bounded(summary_path,1024*1024,work_deadline);receipts_raw,receipts_sha,receipts_n=read_bounded(receipts_path,EVIDENCE_CAP,work_deadline)
            bind_physical(summary_path,summary_sha,summary_n);bind_physical(receipts_path,receipts_sha,receipts_n)
            input_custody[lane]['browserSummarySha256']=summary_sha;input_custody[lane]['browserReceiptsSha256']=receipts_sha
        for lane,corpus,reports,api in [('facts','truss-facts/cases.json','reports/facts.json','compile_truss_runtime_json'),('entity','truss-entity-selection/cases.json','reports/entity.json','compile_truss_runtime_entity_selection')]:
            before_row=input_custody[lane]
            corpus_now=digest(source_copy/'tests'/corpus,4*1024*1024,work_deadline)
            report_now=digest(owned_root/'out'/reports,EVIDENCE_CAP,work_deadline)
            summary_now=digest(out/('browser-'+lane)/'summary.json',1024*1024,work_deadline)
            receipts_now=digest(out/('browser-'+lane)/'receipts.json',EVIDENCE_CAP,work_deadline)
            if corpus_now!=(before_row['corpusSha256'],before_row['corpusBytes']) or report_now!=(before_row['nativeReportSha256'],before_row['nativeReportBytes']) or summary_now[0]!=before_row['browserSummarySha256'] or receipts_now[0]!=before_row['browserReceiptsSha256']:
                raise RuntimeError('browser consumed or emitted input/receipt bytes changed after their original hashes: '+lane)
            before_row['postBrowserCorpusSha256']=corpus_now[0];before_row['postBrowserNativeReportSha256']=report_now[0];before_row['postBrowserSummarySha256']=summary_now[0];before_row['postBrowserReceiptsSha256']=receipts_now[0]
        receipt['browserInputCustodyBeforeAfter']=input_custody
        browser_after=browser_identity('after')
        if browser_after!=browser_before:raise RuntimeError('browser runtime identity changed during actual browser checks')
        if time.monotonic()>=work_deadline:raise TimeoutError('work deadline reached with terminal cleanup reserve preserved')
        receipt['frozenSourceManifest']=manifest_info;receipt['cohortCustody']=cohort_info;receipt['portableJsBefore']=before
        after={name:tree_hash(path,dep,work_deadline) for name,path in JS_ROOTS.items()}
        manifest_after=verify_frozen(args.manifest_sha256,work_deadline)
        if manifest_after!=manifest_info:raise RuntimeError('frozen source/input package changed after lane')
        if after!=before:raise RuntimeError('portable JS dependency tree changed during lane')
        artifact_after,artifact_bytes_after=inventory_outputs(owned_root/'out/artifacts',work_deadline)
        if artifact_after!=artifact_before or artifact_bytes_after!=artifact_bytes:raise RuntimeError('selected WASM/wrapper artifacts changed during browser use')
        for row in artifact_after:bind_physical(owned_root/'out/artifacts'/row['path'],row['sha256'],row['sizeBytes'])
        source_post=verify_source_copy(source_copy,owned_root/'out/reports/source-inventory.json',work_deadline)
        if digest(SOURCE_TAR,1024*1024*1024,work_deadline)!=(packet['source']['archiveSha256'],packet['source']['archiveBytes']):raise RuntimeError('read-only P56 archive changed during lane')
        receipt['frozenSourceManifestAfter']=manifest_after;receipt['sourcePost']=source_post;receipt['selectedSoftwareArtifactsAfterBrowser']={'files':artifact_after,'totalBytes':artifact_bytes_after};receipt['portableJsAfter']=after;receipt['browserIdentityBefore']=browser_before;receipt['browserIdentityAfter']=browser_after;receipt['status']='PASS_PENDING_PHYSICAL_FINALIZATION'
    except BaseException as exc:
        cap_left=ACTIVE_CAP_LEFT
        if 'owned_root' in locals() and (owned_root/'out/commands.jsonl').exists():
            try:
                fail_raw,fail_sha,fail_size=read_bounded(owned_root/'out/commands.jsonl',1024*1024,deadline);bind_physical(owned_root/'out/commands.jsonl',fail_sha,fail_size)
                receipt['guestFailureCommands']=[json.loads(line) for line in fail_raw.decode('utf-8').splitlines()]
            except BaseException as detail:receipt['failures'].append('guest failure capture '+type(detail).__name__+': '+str(detail)[:120])
        if 'owned_root' in locals() and (owned_root/'out/failure-phase.json').exists():
            try:
                raw_failure,failure_sha,failure_size=read_bounded(owned_root/'out/failure-phase.json',1024*1024,deadline);bind_physical(owned_root/'out/failure-phase.json',failure_sha,failure_size);receipt['guestFailurePhase']=json.loads(raw_failure)
            except BaseException as detail:receipt['failures'].append('guest failure phase '+type(detail).__name__+': '+str(detail)[:120])
        receipt['failures'].append(type(exc).__name__+': '+str(exc)[:400])
    finally:
        # Execution owner must stop/remove only these exact run-labeled containers and verify absence.
        # A failed or unavailable cleanup remains FAIL_OR_UNKNOWN; no global prune is issued.
        absent=[]
        for cleanup_index,name in enumerate(owned):
            try:
                q,cap_left=bounded(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],None,os.environ,min(deadline,time.monotonic()+15),logs,'cleanup-list-'+str(cleanup_index),cap_left,timeout=15,allow_cleanup_reserve=True)
                exists=read_text_bounded(logs/(f'cleanup-list-{cleanup_index}.stdout.log'),RAW_CAP,deadline).strip().splitlines()
                if name in exists:
                    ix=logs/(f'cleanup-inspect-{cleanup_index}.stdout.log')
                    cap_left=bounded(['docker','inspect','--format','{{.Id}}|{{.Image}}|{{index .Config.Labels "codex.g03.execution-id"}}|{{index .Config.Labels "codex.g03.kind"}}',name],None,os.environ,min(deadline,time.monotonic()+15),logs,'cleanup-inspect-'+str(cleanup_index),cap_left,timeout=15,allow_cleanup_reserve=True)[1]
                    fields=read_text_bounded(ix,RAW_CAP,deadline).strip().split('|');spec=owned_specs[name]
                    if len(fields)!=4 or fields[1:]!=[spec['image'],rid,spec['kind']] or (spec['containerId'] is not None and fields[0]!=spec['containerId']):raise RuntimeError('refusing cleanup because exact container ID/image/owner labels differ: '+name)
                    if spec['containerId'] is None:spec['containerId']=fields[0]
                    cap_left=bounded(['docker','stop','--time','10',name],None,os.environ,min(deadline,time.monotonic()+15),logs,'cleanup-stop-'+str(cleanup_index),cap_left,timeout=15,allow_cleanup_reserve=True)[1]
                    cap_left=bounded(['docker','rm','--force',name],None,os.environ,min(deadline,time.monotonic()+15),logs,'cleanup-rm-'+str(cleanup_index),cap_left,timeout=15,allow_cleanup_reserve=True)[1]
                cap_left=bounded(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],None,os.environ,min(deadline,time.monotonic()+15),logs,'cleanup-final-'+str(cleanup_index),cap_left,timeout=15,allow_cleanup_reserve=True)[1]
                absent.append(name not in read_text_bounded(logs/(f'cleanup-final-{cleanup_index}.stdout.log'),RAW_CAP,deadline).strip().splitlines())
            except BaseException as exc:cap_left=ACTIVE_CAP_LEFT;receipt['failures'].append('cleanup '+name+': '+type(exc).__name__+': '+str(exc)[:160])
        receipt['ownedContainersAbsent']=len(absent)==len(owned) and all(absent)
        try:
            final_archive=digest(SOURCE_TAR,1024*1024*1024,deadline)
            receipt['sourceArchiveAfter']={'sha256':final_archive[0],'sizeBytes':final_archive[1]}
            if final_archive!=(packet.get('source',{}).get('archiveSha256'),packet.get('source',{}).get('archiveBytes')):receipt['failures'].append('source archive changed during lane')
            if 'cache_before' in locals():
                cache_after=verify_acquired_cache(packet,deadline)
                receipt['lockedCargoCacheInputAfter']=cache_after['closure']
                if cache_after['closure']!=cache_before['closure']:receipt['failures'].append('accepted Cargo cache input changed during lane')
        except BaseException as exc:receipt['failures'].append('source/cache archive postclosure '+type(exc).__name__)
        if 'sourcePost' not in receipt and 'source_copy' in locals() and source_copy.is_dir():
            try:receipt['sourcePost']=verify_source_copy(source_copy,owned_root/'out/reports/source-inventory.json',deadline)
            except BaseException as exc:receipt['failures'].append('source copy postclosure '+type(exc).__name__)
        scratch_removed=True
        for scratch in (out/'owned/source',out/'owned/cargo',out/'owned/target',out/'owned/venv'):
            allow_links=scratch.name=='venv';removed_count=0
            try:
                if scratch.exists() or scratch.is_symlink():
                    if scratch.parent!=(out/'owned') or (scratch.is_symlink() and not allow_links):raise RuntimeError('scratch cleanup path is not an exact owned child')
                    if scratch.is_symlink():scratch.unlink()
                    else:
                        for base,dirs,files in os.walk(scratch,topdown=False,followlinks=False):
                            if time.monotonic()>=deadline:raise TimeoutError('terminal reserve ended during scratch cleanup')
                            bp=pathlib.Path(base)
                            for filename in files:
                                fp=bp/filename;st=fp.lstat();removed_count+=1
                                if removed_count>1000000:raise RuntimeError('scratch cleanup entry ceiling exceeded')
                                if stat.S_ISLNK(st.st_mode) and allow_links:fp.unlink()
                                elif stat.S_ISREG(st.st_mode) and not fp.is_symlink():fp.unlink()
                                else:raise RuntimeError('scratch cleanup encountered unsafe nonregular file')
                            for d in dirs:
                                dp=bp/d;st=dp.lstat();removed_count+=1
                                if removed_count>1000000:raise RuntimeError('scratch cleanup entry ceiling exceeded')
                                if stat.S_ISLNK(st.st_mode) and allow_links:dp.unlink()
                                elif stat.S_ISDIR(st.st_mode) and not dp.is_symlink():dp.rmdir()
                                else:raise RuntimeError('scratch cleanup encountered unsafe directory')
                        scratch.rmdir()
                if scratch.exists() or scratch.is_symlink():raise RuntimeError('owned scratch remains after exact cleanup')
            except BaseException as exc:receipt['failures'].append('scratch cleanup '+scratch.name+': '+type(exc).__name__+': '+str(exc)[:120]);scratch_removed=False
        receipt['ownedScratchAbsent']=scratch_removed
        if not receipt['ownedContainersAbsent'] or not receipt['ownedScratchAbsent']:receipt['status']='FAIL_OR_UNKNOWN'
        receipt['elapsedSeconds']=round(time.monotonic()-lane_start,3)
    # Final artifact inventories are closed before the final receipt can claim success.
    try:
        files=[];total=0;physical_paths=set()
        for base,dirs,names in os.walk(out,followlinks=False):
            if pathlib.Path(base)==out/'owned' and any((out/'owned'/x).exists() for x in ('source','cargo','target')):raise RuntimeError('owned scratch was not removed')
            if time.monotonic()>=deadline:raise TimeoutError('deadline during output inventory')
            if any((pathlib.Path(base)/d).is_symlink() for d in dirs):raise RuntimeError('output symlink')
            for name in sorted(names):
                p=pathlib.Path(base)/name
                if p.name=='operator-result.json':continue
                rel=p.relative_to(out).as_posix()
                per_file=512*1024 if '/logs/' in '/'+rel or rel.startswith('outer/') else (ARTIFACT_CAP if '/artifacts/' in '/'+rel else EVIDENCE_CAP)
                h,n=digest(p,per_file,deadline)
                admitted=EXPECTED_PHYSICAL.get(str(p))
                if admitted is not None and admitted!={'sha256':h,'sizeBytes':n}:raise RuntimeError('captured evidence changed after original admission: '+rel)
                total+=n
                if total>EVIDENCE_CAP+ARTIFACT_CAP:raise RuntimeError('inclusive output evidence/artifact bytes exceed local aggregate bound')
                files.append({'path':rel,'sizeBytes':n,'sha256':h});physical_paths.add(str(p))
        expected_persisted={k for k in EXPECTED_PHYSICAL if k==str(out) or k.startswith(str(out)+os.sep)}
        if expected_persisted-physical_paths:raise RuntimeError('previously admitted output evidence disappeared before finalization')
        receipt['physicalEvidenceBindings']=[{'path':k,'sha256':v['sha256'],'sizeBytes':v['sizeBytes']} for k,v in sorted(EXPECTED_PHYSICAL.items()) if k in expected_persisted]
        receipt['outputFiles']=files;receipt['outputBytes']=total
        logs_total=sum(x['sizeBytes'] for x in files if '/logs/' in x['path'] or x['path'].startswith('outer/'))
        if logs_total>1024*1024:raise RuntimeError('1MiB local aggregate raw log cap exceeded')
        raw=(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode()
        if len(raw)>1024*1024:raise RuntimeError('final operator receipt exceeds 1MiB public-file cap')
        metadata=sum(x['sizeBytes'] for x in files if '/artifacts/' not in x['path'])
        software=sum(x['sizeBytes'] for x in files if '/artifacts/' in x['path'])
        if metadata+len(raw)>EVIDENCE_CAP:raise RuntimeError('inclusive metadata/log evidence exceeds 16MiB local operator cap')
        if software>ARTIFACT_CAP:raise RuntimeError('selected software artifact cap exceeded')
        if receipt['status']=='PASS_PENDING_PHYSICAL_FINALIZATION' and not receipt.get('failures') and receipt.get('ownedContainersAbsent') and receipt.get('ownedScratchAbsent') and receipt.get('sourceArchiveBefore')==receipt.get('sourceArchiveAfter') and receipt.get('sourcePost') and time.monotonic()<deadline:receipt['status']='PASS'
        outp=out/'operator-result.json';raw=(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode()
        if len(raw)>1024*1024:raise RuntimeError('operator receipt exceeds 1MiB cap')
        temp=out/'operator-result.tmp';h,n=write_bounded(temp,raw,1024*1024,deadline);os.replace(temp,outp)
        h,n=digest(outp,1024*1024,min(deadline,time.monotonic()+5))
        if n!=len(raw) or h!=hashlib.sha256(raw).hexdigest():raise RuntimeError('final receipt physical closure mismatch')
    except BaseException as exc:
        receipt['status']='FAIL_OR_UNKNOWN';receipt['failures'].append('finalization '+type(exc).__name__+': '+str(exc)[:250])
        try:write_bounded(out/'failure-receipt.json',(json.dumps(receipt,sort_keys=True,indent=2)+'\n').encode(),1024*1024,deadline)
        except BaseException:pass
    print(json.dumps({'executionId':rid,'status':receipt['status'],'output':str(out),'operatorResultSha256':h if 'h' in locals() else None},sort_keys=True));raise SystemExit(0 if receipt['status']=='PASS' else 1)
if __name__=='__main__':main()
