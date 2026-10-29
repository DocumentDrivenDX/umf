#!/usr/bin/env python3
"""Held local Linux Docker launcher for the SDK public-H reader; never dispatches Actions."""
from __future__ import annotations
import hashlib, json, os, pathlib, re, selectors, stat, subprocess, sys, time

IMAGE = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PLATFORM = 'linux/amd64'
READER = pathlib.Path('/private/tmp/sdk-057-local3600-public-h-v6-r2/run-local3600-public-h.py')
READER_SHA256 = '94f944788ac2724935c3685d7f05c6f6952425916e73872896e0071a839bc4c8'
HOST_ROOT = pathlib.Path('/private/tmp')
H_METADATA_LIMIT = 16 * 1024 * 1024
H_LOG_LIMIT = 1024 * 1024
H_SECONDS = 1800
H_CHILD_SECONDS = 180
H_RESERVE_SECONDS = 60
STOP_GRACE_SECONDS = 10
OUTER_STREAM_LIMIT = 128 * 1024
OUTER_CAPTURE_LIMIT = 256 * 1024
OUTER_METADATA_LIMIT = 1024 * 1024
CPU_LIMIT, MEMORY_LIMIT, PIDS_LIMIT = '4', '8g', 8192
SOURCE_VOLUME = 'umf-migration-source-267675510'
SOURCE_ROOT = pathlib.Path('/private/tmp/migration-linux-candidate-267675510')
SOURCE_GIT_CONFIG = pathlib.Path('/private/tmp/sdk-057-local3600-public-h-operator-proposal009/producer-safe.gitconfig')
SOURCE_GIT_CONFIG_SHA256 = '64600e84d3d6245e37d4095564a12e6a112afa33c61820b0f107a9b867a16672'
EVIDENCE_VOLUME_PREFIX = 'umf-public-h-evidence-'
EVIDENCE_MOUNT = pathlib.Path('/h-evidence')
EXPECTED_LOGS = {
    'toolchain-identity.log', 'verify-source-tag-and-tree.log',
    'acquire-and-verify-public-and-qualified-archives.log',
    'bun-install-locked-source-dependencies.log', 'sdk-public-install-consumer-smoke.log',
    'python-public-install-and-migration-smoke.log', 'verify-final-probe-fields.log',
}
EXPECTED_REPORTS = {
    'toolchain.json', 'source-identity.json', 'public-byte-correspondence.json',
    'sdk-install.json', 'python-installed.json', 'packaging-bootstrap.json',
    'accepted-probe-fields.json',
}


def fail(message: str) -> None:
    raise RuntimeError(message)


def canonical_path(value: str | pathlib.Path, label: str, *, must_exist: bool = True) -> pathlib.Path:
    raw = pathlib.Path(value)
    if not raw.is_absolute(): fail(f'{label} must be absolute')
    absolute = raw.absolute()
    if absolute != raw: fail(f'{label} is not in canonical lexical form')
    if must_exist:
        resolved = raw.resolve(strict=True)
        if resolved != raw: fail(f'{label} has a symlink path component or noncanonical target')
        current = raw
        while current != current.parent:
            if current.is_symlink(): fail(f'{label} contains a symlink component: {current}')
            current = current.parent
        return raw
    parent = raw.parent.resolve(strict=True)
    if parent != raw.parent.absolute(): fail(f'{label} parent has a symlink path component')
    current = raw.parent
    while current != current.parent:
        if current.is_symlink(): fail(f'{label} contains a symlink parent component: {current}')
        current = current.parent
    if raw.exists() or raw.is_symlink(): fail(f'{label} already exists')
    return raw


def stat_regular(path: pathlib.Path, label: str, cap: int) -> os.stat_result:
    try: st = path.lstat()
    except OSError as exc: fail(f'{label} cannot be stated: {exc}')
    if not stat.S_ISREG(st.st_mode) or path.is_symlink(): fail(f'{label} must be a regular nonsymlink file')
    if st.st_size < 0 or st.st_size > cap: fail(f'{label} exceeds its {cap}-byte bound')
    return st


def read_bounded(path: pathlib.Path, label: str, cap: int) -> bytes:
    before = stat_regular(path, label, cap)
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
    fd = os.open(path, flags)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino, opened.st_size) != (before.st_dev, before.st_ino, before.st_size):
            fail(f'{label} changed between stat and open')
        chunks=[]; total=0
        while True:
            block=os.read(fd,min(65536,cap+1-total))
            if not block: break
            chunks.append(block); total+=len(block)
            if total>cap: fail(f'{label} exceeded its {cap}-byte bound while reading')
        after=os.fstat(fd)
        if (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)!=(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns) or total!=opened.st_size:
            fail(f'{label} changed during bounded read')
        return b''.join(chunks)
    finally: os.close(fd)


def sha_bounded(path: pathlib.Path, label: str, cap: int) -> str:
    before=stat_regular(path,label,cap)
    h=hashlib.sha256(); total=0
    flags=os.O_RDONLY|getattr(os,'O_NOFOLLOW',0); fd=os.open(path,flags)
    try:
        opened=os.fstat(fd)
        if (opened.st_dev,opened.st_ino,opened.st_size)!=(before.st_dev,before.st_ino,before.st_size): fail(f'{label} changed before hashing')
        while True:
            block=os.read(fd,65536)
            if not block: break
            total+=len(block)
            if total>cap: fail(f'{label} grew past its hash bound')
            h.update(block)
        after=os.fstat(fd)
        if (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)!=(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns) or total!=opened.st_size:
            fail(f'{label} changed during hashing')
        return h.hexdigest()
    finally: os.close(fd)


def durable_write(path: pathlib.Path, data: bytes) -> None:
    with path.open('wb') as f:
        f.write(data); f.flush(); os.fsync(f.fileno())


def run_checked(argv: list[str], timeout: int = 20) -> str:
    result=subprocess.run(argv,check=False,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=timeout)
    if result.returncode: fail(f'preflight command failed ({result.returncode}): {argv[0]}')
    return result.stdout.strip()


def has_held(value, where='input') -> None:
    if value == 'HELD' or value is None: fail(f'{where} contains a held or absent value; refusing container launch')
    if isinstance(value,dict):
        for k,v in value.items(): has_held(v,f'{where}.{k}')
    elif isinstance(value,list):
        for i,v in enumerate(value): has_held(v,f'{where}[{i}]')


def add_path_mount(mounts: set[pathlib.Path], value: str, label: str) -> None:
    p=canonical_path(value,label)
    if HOST_ROOT not in p.parents: fail(f'{label} must be below {HOST_ROOT}')
    mount=p if p.is_dir() else p.parent
    if mount==HOST_ROOT or HOST_ROOT not in mount.parents: fail(f'{label} resolves outside narrow evidence roots')
    mounts.add(mount)


def add_profile_relative_mount(mounts: set[pathlib.Path], profile_root_value: str, relative: object, label: str) -> None:
    if not isinstance(relative, str) or not relative or '\x00' in relative or '\\' in relative:
        fail(f'{label} relative path is malformed')
    if any(part in {'.', '..'} for part in relative.split('/')):
        fail(f'{label} relative path escapes its evidence root')
    pure = pathlib.PurePosixPath(relative)
    if pure.is_absolute() or '..' in pure.parts or '.' in pure.parts:
        fail(f'{label} relative path escapes its evidence root')
    profile_root = canonical_path(profile_root_value, 'D5 profile evidence root')
    candidate = profile_root.joinpath(*pure.parts)
    resolved_root = profile_root.resolve(strict=True)
    resolved = candidate.resolve(strict=True)
    if resolved != resolved_root and resolved_root not in resolved.parents:
        fail(f'{label} resolves outside its declared root')
    cursor = candidate
    while cursor != profile_root:
        if cursor.is_symlink(): fail(f'{label} traverses a symlink')
        cursor = cursor.parent
    if candidate.is_symlink(): fail(f'{label} is a symlink')
    add_path_mount(mounts, str(resolved), label)


def input_mounts(packet: dict, packet_path: pathlib.Path) -> list[pathlib.Path]:
    mounts={packet_path.parent,READER.parent}
    producer_root=canonical_path(packet['source']['producerRoot'],'producer checkout')
    if producer_root != SOURCE_ROOT:
        fail('producer checkout differs from the qualified Linux source-volume path')
    if sha_bounded(SOURCE_GIT_CONFIG,'producer safe-directory system config',4096)!=SOURCE_GIT_CONFIG_SHA256:
        fail('producer safe-directory system config differs from its operator pin')
    evidence=packet['evidence']; sdk=evidence['sdkProducer']; sdk_root=pathlib.Path(sdk['root'])
    if sdk_root!=HOST_ROOT: add_path_mount(mounts,sdk['root'],'SDK evidence root')
    for key in ('harnessPath','receiptPath','archivePath','manifestPath'):
        add_path_mount(mounts,str(sdk_root/sdk[key]),f'SDK evidence {key}')
    d5=evidence['d5']; add_path_mount(mounts,d5['root'],'D5 evidence root')
    profile=d5.get('resourceProfileEvidence',{})
    for key in ('root','profilePath','operatorManifestPath'):
        if key in profile: add_path_mount(mounts,profile[key],f'D5 profile {key}')
    for key in ('outerCapturePath','selectedEvidenceReceiptPath'):
        if key in profile: add_profile_relative_mount(mounts,profile['root'],profile[key],f'D5 profile {key}')
    for key,path in profile.get('roots',{}).items():
        candidate=canonical_path(path,f'D5 profile roots.{key}')
        if candidate != producer_root: add_path_mount(mounts,path,f'D5 profile roots.{key}')
    aggregate=evidence['aggregate']; add_path_mount(mounts,aggregate['root'],'full18 aggregate root')
    add_path_mount(mounts,aggregate['harnessPath'],'full18 harness')
    continuation=evidence['unionContinuation']; add_path_mount(mounts,continuation['root'],'union continuation root')
    add_path_mount(mounts,str(pathlib.Path(continuation['root'])/continuation['harnessRoot']),'union continuation harness')
    if any(p==producer_root or p in producer_root.parents or producer_root in p.parents for p in mounts):
        fail('a host bind would overlap the read-only producer volume path')
    return sorted(mounts,key=lambda p:(len(p.parts),str(p)))


def minimal_mounts(mounts: list[pathlib.Path]) -> list[pathlib.Path]:
    kept=[]
    for p in mounts:
        if not any(parent==p or parent in p.parents for parent in kept): kept.append(p)
    return kept


def reject_overlap(out: pathlib.Path, packet: pathlib.Path, roots: list[pathlib.Path]) -> None:
    targets=[packet,READER,*roots]
    for p in targets:
        if out==p or out in p.parents or p in out.parents:
            fail(f'output directory overlaps an input path: {p}')


def exact_name_listing(name: str) -> str:
    return run_checked(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'],timeout=20)


def stop_owned(name: str) -> None:
    try: subprocess.run(['docker','stop','--time',str(STOP_GRACE_SECONDS),name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=STOP_GRACE_SECONDS+15)
    except Exception: pass


def bounded_capture(proc: subprocess.Popen, log_dir: pathlib.Path, name: str, deadline: float, prefix: str='docker') -> dict:
    paths=[log_dir/f'{prefix}.stdout.log',log_dir/f'{prefix}.stderr.log']; streams=[proc.stdout,proc.stderr]
    files=[p.open('xb') for p in paths]; hashes=[hashlib.sha256(),hashlib.sha256()]
    retained=[0,0]; truncated=[False,False]; selector=selectors.DefaultSelector()
    for i,stream in enumerate(streams): os.set_blocking(stream.fileno(),False); selector.register(stream,selectors.EVENT_READ,i)
    timed_out=False; drain_expired=False; stop_sent=False; hard_deadline=deadline+STOP_GRACE_SECONDS+5
    try:
        while selector.get_map():
            now=time.monotonic()
            if now>=deadline and not stop_sent:
                if proc.poll() is None:
                    timed_out=True; stop_owned(name)
                stop_sent=True
            if now>=hard_deadline and selector.get_map():
                drain_expired=True
                for key in list(selector.get_map().values()):
                    selector.unregister(key.fileobj)
                    try: key.fileobj.close()
                    except OSError: pass
                break
            for key,_ in selector.select(0.2):
                idx=key.data
                try: data=os.read(key.fileobj.fileno(),65536)
                except BlockingIOError: continue
                if not data: selector.unregister(key.fileobj); continue
                hashes[idx].update(data); allowance=OUTER_STREAM_LIMIT-retained[idx]
                if allowance>0:
                    keep=data[:allowance]; files[idx].write(keep); retained[idx]+=len(keep)
                if len(data)>max(allowance,0): truncated[idx]=True
        if proc.poll() is None:
            stop_owned(name)
            try: proc.wait(timeout=STOP_GRACE_SECONDS+5)
            except subprocess.TimeoutExpired: proc.kill()
    finally:
        capture_errors=[]
        try: selector.close()
        except BaseException as exc: capture_errors.append('selector-close '+type(exc).__name__+': '+str(exc)[:160])
        for i,f in enumerate(files):
            for operation in ('flush','fsync','close'):
                try:
                    if operation=='flush': f.flush()
                    elif operation=='fsync': os.fsync(f.fileno())
                    else: f.close()
                except BaseException as exc:
                    capture_errors.append(f'{operation}[{i}] '+type(exc).__name__+': '+str(exc)[:160])
    return {'paths':[str(p) for p in paths],'retainedBytes':retained,'rawSha256':[h.hexdigest() for h in hashes],
            'truncated':truncated,'timedOut':timed_out,'drainExpired':drain_expired,'totalRetainedBytes':sum(retained),
            'captureFailed':bool(capture_errors),'captureErrors':capture_errors}


def verify_outer_capture(captured: dict) -> dict:
    paths=captured.get('paths',[]); retained=captured.get('retainedBytes',[]); raw_hashes=captured.get('rawSha256',[])
    truncated=captured.get('truncated',[]); rows=[]; errors=[]
    if not (len(paths)==len(retained)==len(raw_hashes)==len(truncated)==2):
        return {'verified':False,'files':[],'errors':['outer capture roster is incomplete']}
    for i,path_text in enumerate(paths):
        path=pathlib.Path(path_text)
        try:
            before=stat_regular(path,f'outer capture {path.name}',OUTER_STREAM_LIMIT)
            digest=sha_bounded(path,f'outer capture {path.name}',OUTER_STREAM_LIMIT)
            after=path.lstat()
            stable=(before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)
            row={'path':str(path),'sizeBytes':before.st_size,'sha256':digest}
            rows.append(row)
            if not stable: errors.append(f'{path.name} changed during physical closure')
            if before.st_size!=retained[i]: errors.append(f'{path.name} physical size differs from retained-byte count')
            if not truncated[i] and digest!=raw_hashes[i]: errors.append(f'{path.name} physical hash differs from complete-stream digest')
        except BaseException as exc: errors.append(f'{path.name} physical closure '+type(exc).__name__+': '+str(exc)[:180])
    return {'verified':not errors,'files':rows,'errors':errors}


def selected_evidence_inventory(root: pathlib.Path) -> list[dict]:
    allowed={'receipt.json','input-packet.json','command-records.jsonl','logs','reports','work'}
    if root.is_symlink() or not root.is_dir(): fail('reader evidence root missing or unsafe')
    receipt_path=root/'receipt.json'
    receipt=json.loads(read_bounded(receipt_path,'selected reader receipt',H_METADATA_LIMIT))
    reader_pass=receipt.get('status')=='LOCAL_DIAGNOSTIC_PASS'
    if receipt.get('status') not in {'LOCAL_DIAGNOSTIC_PASS','FAIL_OR_UNKNOWN'}: fail('reader receipt has an unknown terminal status')
    actual={p.name for p in root.iterdir()}
    if (actual!=allowed if reader_pass else (not {'receipt.json','logs','reports'}<=actual or actual-allowed)):
        fail('reader evidence root has an invalid terminal roster')
    work=root/'work'
    if work.exists() or work.is_symlink():
        if work.is_symlink() or not work.is_dir(): fail('reader disposable work path is unsafe')
    elif reader_pass: fail('reader disposable work directory missing')
    paths=[('receipt.json',receipt_path)]
    for name in ('input-packet.json','command-records.jsonl'):
        member=root/name
        if member.exists() or member.is_symlink(): paths.append((name,member))
        elif reader_pass: fail(f'successful reader evidence is missing {name}')
    for dirname in ('logs','reports'):
        sub=root/dirname
        if sub.is_symlink() or not sub.is_dir(): fail(f'unsafe reader evidence directory: {dirname}')
        direct_reports=set()
        for p in sorted(sub.iterdir()):
            relative=p.relative_to(root).as_posix()
            if p.is_symlink(): fail(f'unsafe selected evidence member: {relative}')
            if not p.is_file(): fail(f'unsafe selected evidence member: {relative}')
            if dirname=='logs' and p.name not in EXPECTED_LOGS: fail(f'unexpected H command log: {p.name}')
            if dirname=='reports' and (p.parent!=sub or p.name not in EXPECTED_REPORTS): fail(f'unexpected H report: {relative}')
            if dirname=='reports': direct_reports.add(p.name)
            paths.append((relative,p))
    log_names={p.name for p in (root/'logs').iterdir()}
    if log_names-EXPECTED_LOGS or (reader_pass and log_names!=EXPECTED_LOGS): fail('reader command logs differ from the fixed seven-command roster')
    if direct_reports-EXPECTED_REPORTS or (reader_pass and direct_reports!=EXPECTED_REPORTS): fail('reader reports differ from the fixed seven-report roster')
    # Stat the entire selected family before reading or hashing any member.
    total=0; stats=[]
    for rel,p in paths:
        st=stat_regular(p,f'selected evidence {rel}',H_METADATA_LIMIT)
        total+=st.st_size
        if total>H_METADATA_LIMIT: fail('selected evidence family exceeds the original 16 MiB metadata limit')
        stats.append((rel,p,st))
    rows=[]
    for rel,p,before in stats:
        digest=sha_bounded(p,f'selected evidence {rel}',H_METADATA_LIMIT)
        after=p.lstat()
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
            fail(f'selected evidence changed during closure: {rel}')
        rows.append({'path':rel,'sizeBytes':before.st_size,'sha256':digest})
    return rows


def exact_volume_listing(name: str) -> list[str]:
    text=run_checked(['docker','volume','ls','--filter',f'name=^{name}$','--format','{{.Name}}'],timeout=20)
    return [line for line in text.splitlines() if line]


def inspect_volume(name: str) -> dict:
    rows=json.loads(run_checked(['docker','volume','inspect',name,'--format','{{json .}}'],timeout=20))
    if not isinstance(rows,dict) or rows.get('Name')!=name: fail(f'volume inspect did not return the exact volume {name}')
    return rows


EXPORT_SCRIPT = r'''import hashlib,json,os,pathlib,re,stat,sys
SRC=pathlib.Path(sys.argv[1]); DST=pathlib.Path(sys.argv[2]); CAP=int(sys.argv[3])
LOGS={'toolchain-identity.log','verify-source-tag-and-tree.log','acquire-and-verify-public-and-qualified-archives.log','bun-install-locked-source-dependencies.log','sdk-public-install-consumer-smoke.log','python-public-install-and-migration-smoke.log','verify-final-probe-fields.log'}
BASE={'receipt.json','input-packet.json','command-records.jsonl'}
REPORTS={'toolchain.json','source-identity.json','public-byte-correspondence.json','sdk-install.json','python-installed.json','packaging-bootstrap.json','accepted-probe-fields.json'}
EXPECTED={'receipt.json','input-packet.json','command-records.jsonl','logs','reports','work'}
def emit(obj): print(json.dumps(obj,separators=(',',':'),sort_keys=True))
def lstat(p):
    st=p.lstat()
    if stat.S_ISLNK(st.st_mode): raise ValueError('symlink in selected evidence')
    return st
try:
    if not SRC.is_dir() or SRC.is_symlink(): raise ValueError('selected evidence root is missing or unsafe')
    actual={p.name for p in SRC.iterdir()}
    receipt_path=SRC/'receipt.json'; receipt_st=lstat(receipt_path)
    if not stat.S_ISREG(receipt_st.st_mode) or receipt_st.st_size>CAP: raise ValueError('selected receipt is unsafe or oversized')
    with receipt_path.open('rb') as stream: receipt=json.loads(stream.read(CAP+1))
    reader_pass=receipt.get('status')=='LOCAL_DIAGNOSTIC_PASS'
    if receipt.get('status') not in ('LOCAL_DIAGNOSTIC_PASS','FAIL_OR_UNKNOWN'): raise ValueError('unknown reader terminal status')
    if (actual!=EXPECTED if reader_pass else (not {'receipt.json','logs','reports'}<=actual or actual-EXPECTED)):
        raise ValueError('unexpected selected evidence root entries')
    files=[]; missing=[]
    for name in sorted(BASE):
        p=SRC/name
        if not p.exists():
            if name=='receipt.json' or reader_pass: missing.append(name)
            continue
        st=lstat(p)
        if not stat.S_ISREG(st.st_mode): raise ValueError('non-regular selected evidence file')
        files.append((name,p,st))
    for dirname,allowed in (('logs',LOGS),('reports',None)):
        d=SRC/dirname
        if not d.exists(): missing.append(dirname); continue
        st=lstat(d)
        if not stat.S_ISDIR(st.st_mode): raise ValueError('selected evidence child is not a directory')
        direct_names=set()
        for p in sorted(d.iterdir()):
            name=p.name; rel=dirname+'/'+name; st=lstat(p)
            if allowed is not None:
                if name not in allowed or not stat.S_ISREG(st.st_mode): raise ValueError('unexpected selected command log')
                direct_names.add(name); files.append((rel,p,st)); continue
            if not stat.S_ISREG(st.st_mode) or name not in REPORTS: raise ValueError('unexpected selected report type')
            direct_names.add(name); files.append((rel,p,st))
        if allowed is not None:
            names={p.name for p in d.iterdir()}
            if names-allowed or (reader_pass and names!=allowed): raise ValueError('reader command logs differ from the fixed seven-command roster')
        else:
            if direct_names-REPORTS or (reader_pass and direct_names!=REPORTS): raise ValueError('selected reports differ from the fixed seven-report roster')
    work=SRC/'work'
    if work.exists() or work.is_symlink():
        st=lstat(work)
        if not stat.S_ISDIR(st.st_mode): raise ValueError('disposable work path is not a directory')
    elif reader_pass: missing.append('work')
    total=sum(st.st_size for _,_,st in files)
    if total>CAP: raise ValueError('selected evidence exceeds the fixed metadata cap')
    if DST.exists() or DST.is_symlink(): raise ValueError('host export destination already exists')
    DST.mkdir(parents=False,exist_ok=False)
    (DST/'logs').mkdir(); (DST/'reports').mkdir(); (DST/'work').mkdir()
    rows=[]
    for rel,src,pre in files:
        dst=DST/rel; dst.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(src,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        out=os.open(dst,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        h=hashlib.sha256(); copied=0
        try:
            opened=os.fstat(fd)
            if not stat.S_ISREG(opened.st_mode) or (opened.st_dev,opened.st_ino,opened.st_size)!=(pre.st_dev,pre.st_ino,pre.st_size): raise ValueError('selected member changed before export')
            while True:
                b=os.read(fd,65536)
                if not b: break
                copied+=len(b)
                if copied>pre.st_size or copied>CAP: raise ValueError('selected member grew during export')
                h.update(b); view=memoryview(b)
                while view:
                    n=os.write(out,view); view=view[n:]
            after=os.fstat(fd)
            if copied!=pre.st_size or (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)!=(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns): raise ValueError('selected member changed during export')
            os.fsync(out)
        finally:
            os.close(fd); os.close(out)
        dest=DST/rel; dstst=dest.lstat()
        if not stat.S_ISREG(dstst.st_mode) or dstst.st_size!=copied: raise ValueError('exported member physical size mismatch')
        rows.append({'path':rel,'sizeBytes':copied,'sha256':h.hexdigest()})
    complete=(not missing and actual==EXPECTED and direct_names==REPORTS and {p.name for p in (SRC/'logs').iterdir()}==LOGS)
    emit({'status':'copied','safe':True,'readerStatus':receipt.get('status'),'files':rows,'selectedBytes':total,'missing':missing,'complete':complete})
except BaseException as exc:
    emit({'status':'failed','safe':False,'files':[],'selectedBytes':0,'missing':[],'complete':False,'reason':type(exc).__name__})
    raise SystemExit(0)
'''


def export_selected_volume(volume: str, out_root: pathlib.Path, operator: pathlib.Path,
                           name: str, deadline: float) -> tuple[dict, dict, int | None, bool, str | None]:
    capture={'paths':[],'retainedBytes':[0,0],'rawSha256':[None,None],'truncated':[False,False],
        'timedOut':False,'drainExpired':False,'totalRetainedBytes':0,'captureFailed':True,'captureErrors':['export did not complete']}
    manifest={}; exit_code=None; cleanup_ok=False; cleanup_error=None; owned=False
    export_name=name[:53]+'-export'
    try:
        if time.monotonic()>=deadline: fail('outer deadline expired before selected evidence export')
        if exact_name_listing(export_name): fail('unique export container name is already occupied')
        export_stage=out_root/'evidence-export'
        argv=['docker','run','--name',export_name,'--rm','--pull=never','--platform='+PLATFORM,
            '--network=none','--read-only','--mount',f'type=volume,source={volume},target=/h-evidence,readonly',
            '--mount',f'type=bind,src={export_stage},dst=/export','--entrypoint','python3',IMAGE,
            '-I','-c',EXPORT_SCRIPT,str(EVIDENCE_MOUNT/'evidence'),'/export/evidence',str(H_METADATA_LIMIT)]
        started=time.monotonic(); proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        owned=True
        capture=bounded_capture(proc,operator,export_name,deadline,prefix='evidence-export')
        try: exit_code=proc.wait(timeout=max(0,STOP_GRACE_SECONDS+5))
        except subprocess.TimeoutExpired: proc.kill(); exit_code=proc.wait(timeout=5)
    except BaseException as exc:
        cleanup_error=type(exc).__name__+': '+str(exc)[:180]
    finally:
        try:
            listing=exact_name_listing(export_name)
            if listing and owned:
                removed=subprocess.run(['docker','rm','--force',export_name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
                if removed.returncode: cleanup_error=cleanup_error or 'export container removal failed'
            elif listing and not owned:
                cleanup_error=cleanup_error or 'unowned exact export name appeared; left untouched'
            cleanup_ok=not exact_name_listing(export_name) and cleanup_error is None
        except BaseException as exc:
            cleanup_ok=False; cleanup_error=cleanup_error or type(exc).__name__+': '+str(exc)[:180]
    capture_check=verify_outer_capture(capture)
    try:
        stdout=operator/'evidence-export.stdout.log'
        data=read_bounded(stdout,'selected evidence exporter manifest',OUTER_STREAM_LIMIT)
        manifest=json.loads(data)
        if not isinstance(manifest,dict): fail('export manifest is not an object')
    except BaseException as exc:
        cleanup_error=cleanup_error or 'export manifest '+type(exc).__name__+': '+str(exc)[:160]
        manifest={}
    host_rows=[]; inventory_error=None; receipt_metadata_match=False; exported_reader_status=None
    try:
        export_evidence=out_root/'evidence-export'/'evidence'
        if export_evidence.is_dir():
            host_rows=selected_evidence_inventory(export_evidence)
            receipt=json.loads(read_bounded(export_evidence/'receipt.json','exported reader receipt',H_METADATA_LIMIT))
            exported_reader_status=receipt.get('status')
            receipt_metadata_match=(receipt.get('metadataArtifactBytes')==sum(r['sizeBytes'] for r in host_rows))
        else: inventory_error='exported evidence root is missing'
    except BaseException as exc: inventory_error=type(exc).__name__+': '+str(exc)[:180]
    normalized=[{'path':r['path'],'sizeBytes':r['sizeBytes'],'sha256':r['sha256']} for r in host_rows]
    helper_rows=manifest.get('files') if isinstance(manifest.get('files'),list) else []
    rows_match=sorted(normalized,key=lambda r:r['path'])==sorted(helper_rows,key=lambda r:r.get('path',''))
    inventory_complete=manifest.get('complete') is True
    valid=(exit_code==0 and not capture.get('timedOut') and not capture.get('drainExpired') and
        not capture.get('captureFailed') and not any(capture.get('truncated',[])) and capture_check.get('verified') and
        cleanup_ok and manifest.get('status')=='copied' and manifest.get('safe') is True and
        manifest.get('readerStatus')==exported_reader_status and
        exported_reader_status in {'LOCAL_DIAGNOSTIC_PASS','FAIL_OR_UNKNOWN'} and
        (exported_reader_status!='LOCAL_DIAGNOSTIC_PASS' or inventory_complete) and
        rows_match and inventory_error is None and receipt_metadata_match and isinstance(manifest.get('selectedBytes'),int) and
        sum(r['sizeBytes'] for r in host_rows)==manifest.get('selectedBytes') and manifest.get('selectedBytes')<=H_METADATA_LIMIT)
    if valid:
        try:
            os.replace(out_root/'evidence-export'/'evidence',out_root/'evidence')
            (out_root/'evidence-export').rmdir()
        except BaseException as exc:
            valid=False; cleanup_error=type(exc).__name__+': '+str(exc)[:160]
    detail={'exitCode':exit_code,'containerName':export_name,'manifest':manifest,'hostFiles':host_rows,
        'capture':capture,'capturePhysicalClosure':capture_check,'cleanup':{'exactOwnedNameAbsent':cleanup_ok,'error':cleanup_error},
        'hostInventoryError':inventory_error,'readerMetadataBytesMatchPhysicalFamily':receipt_metadata_match,
        'readerStatus':exported_reader_status,'fullSuccessRoster':inventory_complete,
        'rowsMatch':rows_match,'verified':valid}
    return detail,capture,exit_code,valid,cleanup_error


def main() -> int:
    if len(sys.argv)!=3:
        print('usage: run_public_h_docker.py READY_INPUT_PACKET.json NEW_RUN_DIRECTORY',file=sys.stderr); return 2
    packet_path=canonical_path(sys.argv[1],'input packet')
    if packet_path.name=='': fail('input packet path is empty')
    raw=read_bounded(packet_path,'input packet',H_METADATA_LIMIT)
    packet=json.loads(raw)
    if packet.get('status')!='READY': fail('public-H packet remains HELD; no Docker command was started')
    has_held(packet)
    if packet.get('executionKind')!='local_linux_diagnostic': fail('only local Linux diagnostic execution is accepted')
    execution=packet.get('execution',{})
    if execution.get('runtimeImageDigest')!=IMAGE: fail('packet runtime image differs from the pinned image')
    reader_path=canonical_path(READER,'pinned reader')
    if sha_bounded(reader_path,'pinned reader',2*1024*1024)!=READER_SHA256: fail('reader bytes differ from independent operator pin')
    if execution.get('localAdapterSha256')!=READER_SHA256: fail('packet reader hash differs from independent operator pin')
    execution_id=execution.get('executionId'); attempt=execution.get('attempt')
    if not isinstance(execution_id,str) or not re.fullmatch(r'local-[a-f0-9-]{16,64}',execution_id): fail('execution ID is not a local identifier')
    if type(attempt) is not int or attempt<1: fail('attempt is not a positive integer')
    out_root=canonical_path(sys.argv[2],'new output directory',must_exist=False)
    if HOST_ROOT not in out_root.parents: fail('output directory must be below /private/tmp')
    mounts=minimal_mounts(input_mounts(packet,packet_path)); reject_overlap(out_root,packet_path,[*mounts,SOURCE_ROOT,SOURCE_GIT_CONFIG])
    source_volume_info=inspect_volume(SOURCE_VOLUME)
    if exact_volume_listing(SOURCE_VOLUME)!=[SOURCE_VOLUME]: fail('the exact qualified producer source volume is unavailable')
    image=json.loads(run_checked(['docker','image','inspect',IMAGE,'--format','{{json .}}']))
    if image.get('Id')!=IMAGE or image.get('Os')!='linux' or image.get('Architecture')!='amd64': fail('inspected image is not the exact pinned linux/amd64 runtime')
    engine_text=run_checked(['docker','info','--format','{{json .}}'])
    if len(engine_text.encode())>65536: fail('Docker engine identity exceeds its metadata bound')
    engine=json.loads(engine_text)
    if engine.get('OSType')!='linux' or not isinstance(engine.get('Name'),str): fail('Docker engine identity is not a Linux server record')
    name='umf-public-h-'+execution_id.replace('_','-')[:38]+'-'+str(attempt)
    if exact_name_listing(name): fail('unique owned container name is already occupied; refusing to touch it')
    volume_slug=hashlib.sha256(execution_id.encode('ascii')).hexdigest()[:20]
    evidence_volume=EVIDENCE_VOLUME_PREFIX+volume_slug+'-'+str(attempt)
    if len(evidence_volume)>63: fail('derived evidence volume name exceeds Docker limit')
    if exact_volume_listing(evidence_volume): fail('unique evidence volume name is already occupied; refusing to touch it')
    out_root.parent.mkdir(parents=True,exist_ok=True)
    out_root.mkdir(exist_ok=False); operator=out_root/'operator'; operator.mkdir()
    export_stage=out_root/'evidence-export'; export_stage.mkdir(); evidence=out_root/'evidence'
    container_evidence=EVIDENCE_MOUNT/'evidence'
    source_gitconfig=canonical_path(SOURCE_GIT_CONFIG,'producer safe-directory system config')
    argv=['docker','run','--name',name,'--rm','--pull=never','--platform='+PLATFORM,
          '--cpus='+CPU_LIMIT,'--memory='+MEMORY_LIMIT,'--pids-limit='+str(PIDS_LIMIT),
          '--network=bridge','--cap-add=SYS_ADMIN','--security-opt=seccomp=unconfined','--read-only','--tmpfs','/tmp:rw,exec,size=1g',
          '--tmpfs','/private/tmp:rw,exec,size=64m',
          '--mount',f'type=volume,source={SOURCE_VOLUME},target={SOURCE_ROOT},readonly',
          '--mount',f'type=volume,source={evidence_volume},target={EVIDENCE_MOUNT}',
          '--mount',f'type=bind,src={source_gitconfig},dst=/etc/gitconfig,readonly']
    for path in mounts: argv.extend(['--mount',f'type=bind,src={path},dst={path},readonly'])
    argv.extend(['--env','LOCAL_RUNTIME_IMAGE_DIGEST='+IMAGE,'--env','GIT_OPTIONAL_LOCKS=0',IMAGE,
                 'python3','-I',str(READER),'run',str(packet_path),str(container_evidence)])
    record={'profile':'umf.sdk-057-public-h-docker-operator/3','status':'RUNNING','executionKind':'local_linux_diagnostic',
        'executionId':execution_id,'attempt':attempt,'driverSha256':sha_bounded(pathlib.Path(__file__).resolve(),'operator source',2*1024*1024),
        'inputPacketPath':str(packet_path),'inputPacketSha256':hashlib.sha256(raw).hexdigest(),
        'readerPath':str(READER),'readerSha256':READER_SHA256,'runtimeImage':IMAGE,'runtimePlatform':PLATFORM,
        'dockerEngineInfo':engine,'containerName':name,'network':'bridge enabled only for this seven-command H invocation; public GitHub reads plus lockfile dependency install',
        'containerSecurity':{'capAdd':['SYS_ADMIN'],'securityOpt':['seccomp=unconfined'],'privileged':False,'hostNamespaces':False,'dockerSocketMounted':False,'purpose':'permit unchanged package-mirror unshare --net isolation'},
        'forwardedEnvironment':['LOCAL_RUNTIME_IMAGE_DIGEST','GIT_OPTIONAL_LOCKS=0'],
        'readOnlyMounts':[str(p) for p in mounts],
        'producerSourceVolume':{'name':SOURCE_VOLUME,'target':str(SOURCE_ROOT),'readOnly':True,'inspect':source_volume_info},
        'producerSafeDirectoryConfig':{'hostPath':str(SOURCE_GIT_CONFIG),'sha256':SOURCE_GIT_CONFIG_SHA256,'containerPath':'/etc/gitconfig','readOnly':True},
        'evidenceVolume':{'name':evidence_volume,'target':str(EVIDENCE_MOUNT),'createdByThisRun':False,'exportTarget':str(evidence)},
        'readWriteExportBind':{'hostPath':str(export_stage),'helperContainerPath':'/export','network':'none'},
        'command':argv,
        'limits':{'readerAggregateSeconds':H_SECONDS,'readerEvidenceReserveSeconds':H_RESERVE_SECONDS,
          'readerChildSeconds':H_CHILD_SECONDS,'readerTermGraceSeconds':STOP_GRACE_SECONDS,
          'readerAggregateLogBytes':H_LOG_LIMIT,'readerMetadataArtifactBytes':H_METADATA_LIMIT,
          'outerWallSeconds':H_SECONDS,'outerStopGraceSeconds':STOP_GRACE_SECONDS,
          'outerStreamBytesEach':OUTER_STREAM_LIMIT,'outerCaptureBytes':OUTER_CAPTURE_LIMIT,
          'outerMetadataBytes':OUTER_METADATA_LIMIT,'cpu':CPU_LIMIT,'memory':MEMORY_LIMIT,'pids':PIDS_LIMIT}}
    run_record=operator/'operator-run.json'; durable_write(run_record,(json.dumps(record,sort_keys=True,indent=2)+'\n').encode())
    proc=None; owned=False; volume_created=False; exit_code=None; captured={'paths':[],'retainedBytes':[0,0],'rawSha256':[None,None],'truncated':[False,False],'timedOut':False,'drainExpired':False,'totalRetainedBytes':0,'captureFailed':True,'captureErrors':['capture did not complete']}
    failure=None; cleanup_ok=False; cleanup_error=None; cleanup_return=None
    outer_started=time.monotonic(); outer_deadline=outer_started+H_SECONDS
    try:
        created=subprocess.run(['docker','volume','create','--label','org.umf.public-h.operator=local-public-h-v7',
            '--label','org.umf.public-h.execution-id='+execution_id,'--label','org.umf.public-h.attempt='+str(attempt),evidence_volume],
            check=False,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=20)
        if created.returncode or created.stdout.strip()!=evidence_volume: fail('owned evidence volume creation did not return the exact requested name')
        volume_created=True; record['evidenceVolume']['createdByThisRun']=True
        durable_write(run_record,(json.dumps(record,sort_keys=True,indent=2)+'\n').encode())
        record['evidenceVolume']['inspect']=inspect_volume(evidence_volume)
        durable_write(run_record,(json.dumps(record,sort_keys=True,indent=2)+'\n').encode())
        proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        owned=True
        captured=bounded_capture(proc,operator,name,outer_deadline,prefix='reader-docker')
        try: exit_code=proc.wait(timeout=STOP_GRACE_SECONDS+5)
        except subprocess.TimeoutExpired: proc.kill(); exit_code=proc.wait()
    except BaseException as exc:
        failure=type(exc).__name__+': '+str(exc)[:240]
        if proc is not None and proc.poll() is None:
            stop_owned(name)
            try: proc.wait(timeout=STOP_GRACE_SECONDS+5)
            except Exception:
                try: proc.kill(); proc.wait(timeout=5)
                except Exception: pass
    finally:
        try:
            listing=exact_name_listing(name)
            if listing and owned:
                removed=subprocess.run(['docker','rm','--force',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=20)
                cleanup_return=removed.returncode
                if removed.returncode: fail('owned container removal returned nonzero')
            elif listing and not owned:
                cleanup_error='exact name appeared without successful owned launch; left untouched'
            after=exact_name_listing(name)
            cleanup_ok=(not after and cleanup_error is None)
        except BaseException as exc:
            cleanup_ok=False; cleanup_error=type(exc).__name__+': '+str(exc)[:200]
    export_detail=None; export_capture={'paths':[],'retainedBytes':[0,0],'rawSha256':[None,None],'truncated':[False,False],
        'timedOut':False,'drainExpired':False,'totalRetainedBytes':0,'captureFailed':False,'captureErrors':[]}
    export_valid=False; volume_cleanup_ok=not volume_created; volume_cleanup_error=None
    if volume_created:
        export_detail,export_capture,export_exit,export_valid,export_error=export_selected_volume(
            evidence_volume,out_root,operator,name,outer_deadline)
        if export_error: volume_cleanup_error=export_error
        if export_valid:
            try:
                detail=inspect_volume(evidence_volume)
                labels=detail.get('Labels') or {}
                if labels.get('org.umf.public-h.operator')!='local-public-h-v7' or labels.get('org.umf.public-h.execution-id')!=execution_id or labels.get('org.umf.public-h.attempt')!=str(attempt):
                    fail('evidence volume ownership labels do not match this run')
                removed=subprocess.run(['docker','volume','rm',evidence_volume],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=20)
                if removed.returncode or removed.stdout.strip()!=evidence_volume: fail('owned evidence volume removal failed')
                volume_cleanup_ok=not exact_volume_listing(evidence_volume)
                if not volume_cleanup_ok: fail('owned evidence volume remains after removal')
            except BaseException as exc:
                volume_cleanup_ok=False; volume_cleanup_error=type(exc).__name__+': '+str(exc)[:180]
        else:
            volume_cleanup_error=volume_cleanup_error or 'selected evidence export was not fully verified; owned volume retained'
    reader_result={}; evidence_rows=[]; inventory_error=None
    try:
        if evidence.is_dir():
            evidence_rows=selected_evidence_inventory(evidence)
            receipt=evidence/'receipt.json'; receipt_raw=read_bounded(receipt,'reader receipt',H_METADATA_LIMIT)
            reader_result=json.loads(receipt_raw)
    except BaseException as exc: inventory_error=type(exc).__name__+': '+str(exc)[:220]
    reader_status=reader_result.get('status'); selected_bytes=sum(x['sizeBytes'] for x in evidence_rows)
    metadata_match=reader_result.get('metadataArtifactBytes')==selected_bytes
    capture_closure=verify_outer_capture(captured); export_capture_closure=verify_outer_capture(export_capture) if export_capture.get('paths') else {'verified':not volume_created,'files':[],'errors':[]}
    outer_captured_bytes=captured.get('totalRetainedBytes',0)+export_capture.get('totalRetainedBytes',0)
    outer_duration_seconds=time.monotonic()-outer_started
    if exit_code not in (0,None): failure=failure or f'docker client exited {exit_code}'
    if captured.get('timedOut'): failure=failure or 'outer wall watchdog expired'
    if captured.get('drainExpired'): failure=failure or 'outer capture drain deadline expired'
    if captured.get('captureFailed'): failure=failure or 'outer capture flush/fsync/close failed: '+str(captured.get('captureErrors',[]))[:300]
    if not capture_closure.get('verified'): failure=failure or 'physical outer capture closure failed: '+str(capture_closure.get('errors',[]))[:300]
    if any(captured.get('truncated',[])): failure=failure or 'outer capture truncated'
    if not cleanup_ok: failure=failure or cleanup_error or 'owned container absence not verified'
    if volume_created and not volume_cleanup_ok: failure=failure or volume_cleanup_error or 'owned evidence volume cleanup was not verified'
    if not export_capture_closure.get('verified'): failure=failure or 'physical evidence-export capture closure failed: '+str(export_capture_closure.get('errors',[]))[:300]
    if export_capture.get('timedOut') or export_capture.get('drainExpired') or export_capture.get('captureFailed') or any(export_capture.get('truncated',[])):
        failure=failure or 'evidence-export helper capture was incomplete or truncated'
    if inventory_error: failure=failure or inventory_error
    if not metadata_match: failure=failure or 'physical selected-evidence byte total differs from reader receipt'
    if selected_bytes>H_METADATA_LIMIT: failure=failure or 'selected evidence exceeds reader metadata bound'
    if outer_captured_bytes>OUTER_CAPTURE_LIMIT: failure=failure or 'combined outer and export capture exceeds its wrapper bound'
    if outer_duration_seconds>H_SECONDS: failure=failure or 'outer aggregate deadline expired including evidence export and cleanup'
    if reader_status!='LOCAL_DIAGNOSTIC_PASS': failure=failure or 'reader did not report LOCAL_DIAGNOSTIC_PASS'
    status='LOCAL_DIAGNOSTIC_PASS' if failure is None and exit_code==0 else 'FAIL_OR_UNKNOWN'
    evidence_receipt=evidence/'receipt.json'
    result_path=operator/'operator-result.json'
    try:
        receipt_digest=sha_bounded(evidence_receipt,'reader receipt',H_METADATA_LIMIT) if evidence_receipt.is_file() else None
        result={'profile':'umf.sdk-057-public-h-docker-operator/3','status':status,'executionKind':'local_linux_diagnostic',
            'executionId':execution_id,'attempt':attempt,'dockerExitCode':exit_code,'readerStatus':reader_status,
            'outerDurationSeconds':outer_duration_seconds,
            'readerReceiptPath':str(evidence_receipt) if evidence_receipt.is_file() else None,
            'readerReceiptSha256':receipt_digest,'outerCapture':captured,'outerCapturePhysicalClosure':capture_closure,
            'evidenceExport':export_detail,'evidenceExportCapture':export_capture,'evidenceExportCapturePhysicalClosure':export_capture_closure,
            'cleanup':{'exactOwnedNameAbsent':cleanup_ok,'removeExitCode':cleanup_return,'error':cleanup_error,
                'evidenceVolumeAbsent':volume_cleanup_ok,'evidenceVolumeName':evidence_volume if volume_created else None,'evidenceVolumeError':volume_cleanup_error},
            'selectedEvidenceFiles':evidence_rows,'selectedEvidenceBytes':selected_bytes,
            'readerMetadataBytesMatchPhysicalFamily':metadata_match,'evidenceInventoryError':inventory_error,'failure':failure}
        durable_write(result_path,(json.dumps(result,sort_keys=True,indent=2)+'\n').encode())
    except BaseException as exc:
        status='FAIL_OR_UNKNOWN'
        result={'profile':'umf.sdk-057-public-h-docker-operator/3','status':status,'executionKind':'local_linux_diagnostic',
            'executionId':execution_id,'attempt':attempt,'dockerExitCode':exit_code,'outerCapture':captured,'outerCapturePhysicalClosure':capture_closure,
            'outerDurationSeconds':outer_duration_seconds,
            'evidenceExport':export_detail,'evidenceExportCapture':export_capture,'evidenceExportCapturePhysicalClosure':export_capture_closure,
            'cleanup':{'exactOwnedNameAbsent':cleanup_ok,'removeExitCode':cleanup_return,'error':cleanup_error,
                'evidenceVolumeAbsent':volume_cleanup_ok,'evidenceVolumeName':evidence_volume if volume_created else None,'evidenceVolumeError':volume_cleanup_error},
            'failure':'finalize-error '+type(exc).__name__+': '+str(exc)[:160]}
        durable_write(result_path,(json.dumps(result,sort_keys=True,indent=2)+'\n').encode())
    try:
        record['status']=status; record['resultPath']=str(result_path)
        record['outerDurationSeconds']=outer_duration_seconds
        record['evidenceExport']=export_detail
        record['evidenceVolumeCleanup']={'createdByThisRun':volume_created,'absentAfterRun':volume_cleanup_ok,
            'name':evidence_volume if volume_created else None,'error':volume_cleanup_error}
        record['resultSha256']=sha_bounded(result_path,'operator result',OUTER_METADATA_LIMIT)
        durable_write(run_record,(json.dumps(record,sort_keys=True,indent=2)+'\n').encode())
        # Recount only after the final operator-run rewrite so its added hashes/status are included.
        operator_total=sum(p.stat().st_size for p in operator.iterdir() if p.is_file())
        if operator_total>OUTER_METADATA_LIMIT:
            status='FAIL_OR_UNKNOWN'
            result={'profile':'umf.sdk-057-public-h-docker-operator/3','status':status,'executionKind':'local_linux_diagnostic',
                'executionId':execution_id,'attempt':attempt,'outerDurationSeconds':outer_duration_seconds,
                'failure':'outer-operator-metadata-cap-exceeded'}
            durable_write(result_path,(json.dumps(result,sort_keys=True,indent=2)+'\n').encode())
            record['status']=status; record['resultSha256']=sha_bounded(result_path,'operator result',OUTER_METADATA_LIMIT)
            durable_write(run_record,(json.dumps(record,sort_keys=True,indent=2)+'\n').encode())
            # Final cap check follows all terminal status and digest writes.
            if sum(p.stat().st_size for p in operator.iterdir() if p.is_file())>OUTER_METADATA_LIMIT:
                raise RuntimeError('outer operator metadata exceeds cap after final failure closure')
    except BaseException as exc:
        status='FAIL_OR_UNKNOWN'
        # Best-effort durable terminal marker if receipt closure itself raised.
        try:
            minimal={'profile':'umf.sdk-057-public-h-docker-operator/3','status':status,'executionKind':'local_linux_diagnostic',
                     'executionId':execution_id,'attempt':attempt,'outerDurationSeconds':outer_duration_seconds,
                     'failure':'terminal-closure-error '+type(exc).__name__+': '+str(exc)[:120]}
            durable_write(result_path,(json.dumps(minimal,sort_keys=True,indent=2)+'\n').encode())
            record['status']=status; record['failure']=minimal['failure']
            durable_write(run_record,(json.dumps(record,sort_keys=True,indent=2)+'\n').encode())
        except BaseException: pass
    return 0 if status=='LOCAL_DIAGNOSTIC_PASS' else 1


if __name__=='__main__':
    try:
        exit_code=main()
    except Exception as exc:
        print(f'operator refused or failed: {type(exc).__name__}: {exc}',file=sys.stderr)
        exit_code=1
    raise SystemExit(exit_code)
