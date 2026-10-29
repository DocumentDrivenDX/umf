#!/usr/bin/env python3
"""Guest command plan for the inherited Truss compiler lane; invoked only by root after review."""
from __future__ import annotations
import hashlib, json, os, pathlib, shutil, stat, subprocess, tarfile, time, selectors, signal, resource, re

ARCHIVE=pathlib.Path('/inputs/source-p56.tar'); WORK=pathlib.Path('/owned/source/p56'); OUT=pathlib.Path('/out'); COHORT=pathlib.Path('/cohort')
TOOLCHAIN='1.90.0-x86_64-unknown-linux-gnu'; PY='/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11'
BINDGEN='/wasm-tools/wasm-bindgen'; TOTAL=1800
CAP=512*1024; LOG_TOTAL=0; GRACE=10
# Darwin and Docker-Linux monotonic epochs are unrelated. The host passes only
# remaining durations; the guest anchors both once to its own clock. The host
# process watchdog still enforces its original absolute deadlines.
GUEST_CLOCK_ANCHOR=time.monotonic()
WORK_REMAINING=float(os.environ['G03_GUEST_WORK_REMAINING_SECONDS'])
TERMINAL_REMAINING=float(os.environ['G03_GUEST_TERMINAL_REMAINING_SECONDS'])
if not (0 <= WORK_REMAINING <= TOTAL and 0 <= TERMINAL_REMAINING <= TOTAL and WORK_REMAINING <= TERMINAL_REMAINING):
    raise RuntimeError('invalid finite remaining-duration clock handoff')
END=GUEST_CLOCK_ANCHOR+WORK_REMAINING
TERMINAL_DEADLINE=GUEST_CLOCK_ANCHOR+TERMINAL_REMAINING
HOST_CLOCK_DOMAIN=os.environ['G03_HOST_CLOCK_DOMAIN']

def check_time(label):
    if time.monotonic() >= END: raise TimeoutError('lane deadline reached during '+label)
def digest(p,limit,deadline=None):
    deadline=END if deadline is None else deadline
    if time.monotonic()>=deadline:raise TimeoutError('deadline while hashing '+str(p))
    st=p.lstat()
    if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>limit: raise RuntimeError('unsafe or over-cap file '+str(p))
    fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0));h=hashlib.sha256();n=0
    try:
        opened=os.fstat(fd);identity=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)
        if (opened.st_dev,opened.st_ino,opened.st_size)!=(st.st_dev,st.st_ino,st.st_size):raise RuntimeError('file changed before hash '+str(p))
        while True:
            if time.monotonic()>=deadline:raise TimeoutError('deadline while hashing '+str(p))
            b=os.read(fd,65536)
            if not b: break
            n+=len(b)
            if n>limit: raise RuntimeError('growing file exceeds cap')
            h.update(b)
        after=os.fstat(fd);now=p.lstat()
        if n!=st.st_size or identity(st)!=identity(after) or identity(after)!=identity(now): raise RuntimeError('file changed during hash')
    finally:os.close(fd)
    return h.hexdigest(),n
def extract_archive():
    WORK.mkdir(parents=True,exist_ok=True)
    if any(WORK.iterdir()): raise RuntimeError('owned source-copy directory is not empty')
    with tarfile.open(ARCHIVE,'r:') as tf:
        members=tf.getmembers()
        if len(members)!=6794: raise RuntimeError('flat P56 archive member count differs from captured exact metadata')
        seen=set();expanded=0;file_members=0
        for m in members:
            check_time('safe source extraction')
            rel=pathlib.PurePosixPath(m.name)
            if rel.is_absolute() or any(x in ('','.','..') for x in rel.parts) or '\\' in m.name or m.name in seen: raise RuntimeError('unsafe or duplicate archive member')
            seen.add(m.name)
            if not (m.isfile() or m.isdir()): raise RuntimeError('source archive contains link/special member')
            if m.isfile():
                file_members+=1;expanded+=m.size
                if m.size>64*1024*1024 or expanded>1024*1024*1024: raise RuntimeError('expanded source archive exceeds local source bound')
        if (file_members,expanded)!=(5901,860543639):raise RuntimeError('source archive expanded file inventory differs from pinned P56 measurement')
        tf.extractall(WORK, members=members, filter='data')
    roots={pathlib.PurePosixPath(m.name).parts[0] for m in members if pathlib.PurePosixPath(m.name).parts}
    if len(roots)!=26 or len(list(WORK.iterdir()))!=26: raise RuntimeError('flat P56 archive top-level entry roster differs from pinned 26-entry layout')
    return WORK
def read_bounded(path,limit,deadline=None):
    deadline=END if deadline is None else deadline;p=pathlib.Path(path);before=p.lstat()
    if p.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_size>limit:raise RuntimeError('unsafe/oversize bounded input '+str(p))
    fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0));parts=[];n=0;h=hashlib.sha256()
    try:
        opened=os.fstat(fd)
        if (opened.st_dev,opened.st_ino,opened.st_size)!=(before.st_dev,before.st_ino,before.st_size):raise RuntimeError('bounded input changed before read')
        while True:
            if time.monotonic()>=deadline:raise TimeoutError('deadline during bounded read '+str(p))
            block=os.read(fd,min(65536,limit-n+1))
            if not block:break
            n+=len(block)
            if n>limit:raise RuntimeError('bounded input grew past cap '+str(p))
            h.update(block);parts.append(block)
        after=os.fstat(fd);now=p.lstat()
        identity=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)
        if n!=before.st_size or identity(before)!=identity(after) or identity(after)!=identity(now):raise RuntimeError('bounded input changed during read')
    finally:os.close(fd)
    return b''.join(parts),h.hexdigest(),n

def read_text_bounded(path,limit,deadline=None):
    data,_,_=read_bounded(path,limit,deadline);return data.decode('utf-8')

def check_until(label,deadline):
    if time.monotonic()>=deadline:raise TimeoutError('deadline reached during '+label)

def write_bounded(path,data,limit,deadline=None):
    deadline=END if deadline is None else deadline
    check_until('before bounded write '+str(path),deadline)
    if len(data)>limit:raise RuntimeError('metadata file exceeds its local per-file cap: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:
        for off in range(0,len(data),65536):
            check_until('writing '+str(path),deadline);f.write(data[off:off+65536])
        f.flush();os.fsync(f.fileno())
    check_until('after bounded write '+str(path),deadline)
    if digest(path,limit,deadline)!=(hashlib.sha256(data).hexdigest(),len(data)):raise RuntimeError('bounded output physical closure mismatch: '+str(path))

def write_json_bounded(path,value,limit,deadline=None):
    write_bounded(path,(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode(),limit,deadline)

def inventory(root,limit):
    rows=[]; total=0
    for base,dirs,files in os.walk(root,followlinks=False):
        dirs.sort()
        check_time('source inventory')
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs): raise RuntimeError('source symlink directory')
        for name in sorted(files):
            p=pathlib.Path(base)/name
            h,n=digest(p,64*1024*1024,END); total+=n
            if total>limit: raise RuntimeError('source total exceeds explicit 1GiB local source allowance')
            rows.append([p.relative_to(root).as_posix(),n,h,stat.S_IMODE(p.lstat().st_mode)])
    return rows,total
def verify_stage_roster(root, expected_rows, deadline):
    roster=pathlib.Path('/operator-inputs/evidence/p56-git-stage-roster.txt')
    roster_raw,h,n=read_bounded(roster,1024*1024,deadline)
    if roster_raw.endswith(b'\n'): raise RuntimeError('captured stage roster final-LF provenance differs')
    if (h,n)!=('bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b',780359):
        raise RuntimeError('immutable P56 git-stage roster pin mismatch')
    records={}
    for line_no,line in enumerate(roster_raw.splitlines(),1):
        check_time('P56 stage roster parse')
        try:
            header,path=line.rstrip(b'\n').split(b'\t',1)
            mode,blob,index=header.decode('ascii').split(' ')
            rel=path.decode('utf-8')
        except (ValueError,UnicodeDecodeError):
            raise RuntimeError('malformed P56 stage roster row '+str(line_no))
        pp=pathlib.PurePosixPath(rel)
        if pp.is_absolute() or any(part in ('','.','..') for part in pp.parts) or rel in records or index!='0' or mode not in ('100644','100755') or len(blob)!=40 or any(ch not in '0123456789abcdef' for ch in blob.lower()) or '\\' in rel:
            raise RuntimeError('unsafe/duplicate P56 stage roster row '+str(line_no))
        records[rel]=(mode,blob)
    if len(records)!=5901 or set(records)!={row[0] for row in expected_rows}:
        raise RuntimeError('physical P56 path roster differs from immutable stage roster')
    for rel,size,sha256,mode in expected_rows:
        check_time('P56 git-blob verification')
        p=root/rel; blob=hashlib.sha1(); blob.update(('blob '+str(size)+'\0').encode())
        with p.open('rb') as stream:
            while True:
                check_time('P56 git-blob hashing')
                block=stream.read(65536)
                if not block: break
                blob.update(block)
        git_mode='100755' if mode & 0o111 else '100644'
        if records[rel]!=(git_mode,blob.hexdigest()):
            raise RuntimeError('physical P56 content/mode differs from immutable stage roster: '+rel)
    return {'sha256':h,'bytes':n,'entries':len(records),'matchingPhysicalFiles':len(expected_rows),'basis':'captured git-stage index mode + Git blob SHA-1; no guest Git metadata or Git command'}

def command(name,argv,env=None,timeout=180,file_limit=None):
    global LOG_TOTAL
    check_time('before '+name);start=time.monotonic();hard=min(start+timeout,END);term_at=max(start,hard-GRACE);kill_deadline=hard
    def set_file_limit():
        if file_limit is not None:resource.setrlimit(resource.RLIMIT_FSIZE,(file_limit,file_limit))
    effective=env or os.environ.copy()
    p=subprocess.Popen(argv,cwd=WORK,env=effective,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,preexec_fn=set_file_limit)
    streams=[p.stdout,p.stderr];sel=selectors.DefaultSelector();hashes=[hashlib.sha256(),hashlib.sha256()];raw=[0,0];kept=[0,0];chunks=[bytearray(),bytearray()];eof=[False,False];truncated=[False,False];timed=False;errors=[];term_sent=False;drain_expired=False
    for i,stream in enumerate(streams):os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ,i)
    def terminate(now):
        nonlocal term_sent,timed,kill_deadline
        if not term_sent:
            term_sent=True;timed=True;kill_deadline=min(hard,now+GRACE)
            try:os.killpg(p.pid,signal.SIGTERM)
            except ProcessLookupError:pass
    try:
        while sel.get_map() or p.poll() is None:
            now=time.monotonic()
            if now>=term_at and not term_sent and p.poll() is None:terminate(now)
            if now>=kill_deadline:
                if not all(eof):drain_expired=True
                try:os.killpg(p.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                for key in list(sel.get_map().values()):
                    try:sel.unregister(key.fileobj);key.fileobj.close()
                    except OSError as exc:errors.append('pipe-close '+type(exc).__name__)
                break
            for key,_ in sel.select(min(.1,max(.001,kill_deadline-now))):
                i=key.data
                try:data=os.read(key.fileobj.fileno(),65536)
                except BlockingIOError:continue
                except OSError as exc:errors.append('pipe-read '+type(exc).__name__);continue
                if not data:eof[i]=True;sel.unregister(key.fileobj);key.fileobj.close();continue
                raw[i]+=len(data);hashes[i].update(data)
                room=max(0,min(CAP-kept[i],CAP-LOG_TOTAL-sum(kept)))
                if room:chunks[i].extend(data[:room]);kept[i]+=min(room,len(data))
                if len(data)>room:
                    truncated[i]=True;terminate(time.monotonic())
        if p.poll() is None or not all(eof):
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
        try:p.wait(timeout=max(0.001,min(1,TERMINAL_DEADLINE-time.monotonic())))
        except subprocess.TimeoutExpired:drain_expired=True;errors.append('reap timeout')
    except BaseException as exc:
        errors.append('capture '+type(exc).__name__+': '+str(exc)[:160])
        try:os.killpg(p.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        try:p.wait(timeout=1)
        except subprocess.TimeoutExpired:drain_expired=True
    finally:
        sel.close()
        for stream in streams:
            try:stream.close()
            except OSError as exc:errors.append('stream-close '+type(exc).__name__)
    LOG_TOTAL+=sum(kept);(OUT/'logs').mkdir(parents=True,exist_ok=True)
    selected_env={k:effective.get(k) for k in ('RUSTUP_TOOLCHAIN','CARGO_HOME','CARGO_TARGET_DIR','CARGO_NET_OFFLINE','CARGO_BUILD_JOBS','CARGO_PROFILE_TEST_OPT_LEVEL','PATH') if effective.get(k) is not None}
    record={'name':name,'argv':list(argv),'environment':selected_env,'exitCode':p.returncode,'startedMonotonic':start,'deadlineMonotonic':hard,'elapsedSeconds':round(time.monotonic()-start,3),'timeoutSeconds':round(hard-start,3),'timedOut':timed,'truncated':any(truncated),'drainExpired':drain_expired,'streamsEOF':eof,'captureErrors':errors,'streams':[]}
    for i,label in enumerate(('stdout','stderr')):
        data=bytes(chunks[i]);path=OUT/'logs'/f'{name}.{label}.log'
        write_bounded(path,data,CAP,TERMINAL_DEADLINE)
        record['streams'].append({'path':str(path),'bytes':len(data),'rawBytes':raw[i],'sha256':hashlib.sha256(data).hexdigest(),'rawSha256':hashes[i].hexdigest(),'truncated':truncated[i],'physicalClosed':path.stat().st_size==len(data)})
    row_bytes=(json.dumps(record,sort_keys=True)+'\n').encode();commands_path=OUT/'commands.jsonl'
    current=commands_path.stat().st_size if commands_path.exists() else 0
    if current+len(row_bytes)>1024*1024:raise RuntimeError('guest command custody exceeds 1MiB local per-file cap')
    check_until('before command custody append',TERMINAL_DEADLINE)
    with commands_path.open('ab') as f:f.write(row_bytes);f.flush();os.fsync(f.fileno())
    check_until('after command custody append',TERMINAL_DEADLINE)
    if timed or any(truncated) or errors or drain_expired or p.returncode!=0 or not all(eof):raise RuntimeError(name+' failed, timed out, or exceeded bounded capture')
    return record

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    seed={'profile':'umf.g03-truss-guest-phase/1','status':'FAIL_OR_UNKNOWN','commands':[]}
    write_json_bounded(OUT/'guest-phase-seed.json',seed,1024*1024,TERMINAL_DEADLINE)
    try:
        h,n=digest(ARCHIVE,1024*1024*1024)
        if h!='8291da1e97ceb5ebd9cd29f0dab1ce233b14cd20651b1e840f7e3e59802ce77f' or n!=865597440: raise RuntimeError('source archive pin mismatch')
        root=extract_archive()
        global_work=globals(); global_work['WORK']=root
        before,total=inventory(root,1024*1024*1024)
        if (len(before),total)!=(5901,860543639): raise RuntimeError('P56 complete source physical inventory differs from measured input')
        stage_roster=verify_stage_roster(root,before,END)
        
        if digest(root/'.github/workflows/truss-facts.yml',4*1024*1024,END)[0]!='4305777176d5ed20596692422e9749bf991fcb0e1db4f37da926eacbdba9fd15': raise RuntimeError('workflow bytes differ')
        env={**os.environ,'RUSTUP_TOOLCHAIN':TOOLCHAIN,'CARGO_HOME':'/owned/cargo','CARGO_TARGET_DIR':'/owned/target','CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'4','CARGO_PROFILE_TEST_OPT_LEVEL':'1','PATH':'/opt/rustup/toolchains/'+TOOLCHAIN+'/bin:/usr/local/bun/bin:/usr/local/bin:'+os.environ.get('PATH','')}
        for name,argv,expected in [('python-version',[PY,'--version'],'Python 3.11.17'),('rustc-version',['rustc','--version'],'rustc 1.90.0 (1159e78c4 2025-09-14)'),('cargo-version',['cargo','--version'],'cargo 1.90.0 (840b83a10 2025-07-30)'),('bun-version',['bun','--version'],'1.4.3'),('node-version',['node','--version'],'v26.12.1'),('wasm-bindgen-version',[BINDGEN,'--version'],'wasm-bindgen 0.2.105')]:
            r=command(name,argv,env,30)
            data=read_text_bounded(OUT/'logs'/(name+'.stdout.log'),CAP,END).strip()
            if data!=expected: raise RuntimeError('runtime identity mismatch '+name)
        command('rust-verbose',['rustc','-vV'],env,30)
        command('rust-targets',['rustup','target','list','--installed','--toolchain',TOOLCHAIN],env,30)
        verbose=read_text_bounded(OUT/'logs/rust-verbose.stdout.log',CAP,END).splitlines()
        if [line.split(': ',1)[1] for line in verbose if line.startswith('host: ')]!=['x86_64-unknown-linux-gnu']:raise RuntimeError('Rust host differs from pinned Linux amd64 toolchain')
        targets=set(read_text_bounded(OUT/'logs/rust-targets.stdout.log',CAP,END).splitlines())
        if not {'x86_64-unknown-linux-gnu','wasm32-unknown-unknown'}<=targets:raise RuntimeError('required Rust targets are not installed')
        packet_raw,packet_hash,packet_size=read_bounded(pathlib.Path('/operator-inputs/truss-packet.json'),128*1024,END)
        if packet_hash!=os.environ.get('G03_TRUSS_PACKET_SHA256') or packet_size>128*1024:raise RuntimeError('read-only Truss packet physical hash differs from host pin')
        packet=json.loads(packet_raw);cache=packet.get('cargoCache',{})
        if packet.get('status')!='FROZEN_SOURCE_CACHE_AVAILABLE_NOT_EXECUTED' or cache.get('executionAllowed') is not True or cache.get('status')!='SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE':raise RuntimeError('accepted cache binding is absent from Truss packet')
        (OUT/'reports').mkdir(parents=True,exist_ok=True)
        command('cargo-cache-extract',[PY,'-B','-I','/operator/cargo_cache_extract.py','--evidence','/cargo-cache-input/evidence',
            '--archive','/cargo-cache-input/software/cargo-registry.tar','--destination','/owned/cargo/registry',
            '--archive-sha256',cache['archiveSha256'],'--archive-bytes',str(cache['archiveBytes']),
            '--acquisition-packet-sha256',cache['acquisitionPacketSha256'],'--index-sha256',cache['inventoryIndexSha256'],
            '--rows-sha256',cache['inventoryRowsSha256'],'--chunk-bytes',str(cache['inventoryChunkBytes']),
            '--row-count',str(cache['inventoryRowCount']),'--receipt','/out/reports/cargo-cache.json'],env,180)
        cache_install=json.loads(read_text_bounded(OUT/'reports/cargo-cache.json',1024*1024,END))
        if (cache_install.get('profile')!='umf.g03-cargo-cache-extraction/1' or cache_install.get('status')!='PASS' or
            cache_install.get('archiveSha256')!=cache['archiveSha256'] or cache_install.get('archiveBytes')!=cache['archiveBytes'] or
            cache_install.get('inventoryIndexSha256')!=cache['inventoryIndexSha256'] or cache_install.get('inventoryRowsSha256')!=cache['inventoryRowsSha256'] or
            cache_install.get('inventoryChunkBytes')!=cache['inventoryChunkBytes'] or cache_install.get('inventoryRowCount')!=cache['inventoryRowCount'] or
            cache_install.get('cacheContentBytes')!=cache['cacheContentBytes'] or cache_install.get('inventoryFileCount')<=0 or
            cache_install.get('lockedCrateCount')!=115 or cache_install.get('sparseIndexWitnessCount')!=115):raise RuntimeError('extracted Cargo cache differs from accepted physical acquisition closure')
        cache_rows=cache_install['inventoryRowCount'];cache_bytes=cache_install['cacheContentBytes'];cache_roster=cache_install['inventoryRowsSha256']
        command('create-venv',[PY,'-B','-m','venv','--copies','/owned/venv'],env,60)
        command('offline-install',['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','install','--disable-pip-version-check','--no-cache-dir','--no-compile','--only-binary=:all:','--require-hashes','--index-url','file:///cohort/aggregate/mirror/simple','-r','/cohort/aggregate/mirror/requirements.lock'],env,600)
        command('pip-check',['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','check'],env,60)
        command('wheel-members',['/owned/venv/bin/python','-B','-I','/operator-inputs/verify_weft_wheel.py','--wheel','/cohort/aggregate/mirror/files/umf_weft-0.4.56-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl','--wheel-sha256','32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd','--wheel-size','14358901'],env,60)
        wheel_members=json.loads(read_text_bounded(OUT/'logs/wheel-members.stdout.log',CAP,END))
        if wheel_members.get('wheelSha256')!='32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd' or wheel_members.get('wheelSizeBytes')!=14358901 or wheel_members.get('memberRosterExact') is not True:raise RuntimeError('installed package does not physically correspond to selected final wheel')
        write_json_bounded(OUT/'reports/installed-wheel-correspondence.json',wheel_members,1024*1024)
        command('distribution-snapshot',['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','list','--format=json'],env,30)
        snapshot=json.loads(read_text_bounded(OUT/'logs/distribution-snapshot.stdout.log',CAP,END))
        canonical=lambda name: re.sub(r'[-_.]+','-',name).lower()
        expected={}
        for line in read_text_bounded(COHORT/'aggregate/mirror/requirements.lock',1024*1024,END).splitlines():
            line=line.split('\\',1)[0].strip()
            if line and not line.startswith('#') and '==' in line:
                name,version=line.split('==',1); key=canonical(name)
                if key in expected: raise RuntimeError('duplicate PEP503 name in exact locked cohort')
                expected[key]=version.split()[0].split(';')[0]
        observed={}
        for row in snapshot:
            key=canonical(row['name'])
            if key in observed: raise RuntimeError('duplicate canonical name in installed distribution snapshot')
            observed[key]=row['version']
        if len(expected)!=18 or any(observed.get(k)!=v for k,v in expected.items()) or set(observed)-set(expected)-{'pip','setuptools'}:
            raise RuntimeError('fresh installed distribution snapshot differs from exact final18 lock plus pip/setuptools bootstrap')
        (OUT/'reports').mkdir(parents=True,exist_ok=True)
        write_json_bounded(OUT/'reports/installed-distributions.json',{'status':'verified','lockedDistributions':expected,'installedDistributions':observed,'bootstrapAllowance':['pip','setuptools']},1024*1024)
        (OUT/'reports').mkdir(parents=True,exist_ok=True)
        (OUT/'artifacts').mkdir(parents=True,exist_ok=True)
        command('facts-python',['/owned/venv/bin/python','-B','-I','tests/truss-facts/check.py','--reports','/out/reports/facts.json'],env,180,16*1024*1024)
        command('entity-python',['/owned/venv/bin/python','-B','-I','tests/truss-entity-selection/check.py','--reports','/out/reports/entity.json'],env,180,16*1024*1024)
        command('truss-wasm-build',['cargo','build','--locked','--offline','-p','weft-wasm','--features','truss-postgresql-pg18','--target','wasm32-unknown-unknown'],env,600)
        (OUT/'artifacts/truss-web').mkdir(parents=True,exist_ok=True)
        command('truss-wasm-bindgen',[BINDGEN,'--target','web','--out-dir','/out/artifacts/truss-web','/owned/target/wasm32-unknown-unknown/debug/weft_wasm.wasm'],env,180)
        (OUT/'artifacts/browser-wrapper').mkdir(parents=True,exist_ok=True)
        command('browser-wrapper',['bun','build','packages/weft-browser/src/index.ts','--target','browser','--outdir','/out/artifacts/browser-wrapper'],env,120)
        command('distribution-snapshot-post',['/owned/venv/bin/python','-B','-I','-m','pip','--isolated','list','--format=json'],env,30)
        post_snapshot=json.loads(read_text_bounded(OUT/'logs/distribution-snapshot-post.stdout.log',CAP,END))
        if post_snapshot!=snapshot:raise RuntimeError('installed distribution snapshot changed during Python/WASM checks')
        after,after_total=inventory(root,1024*1024*1024)
        if after!=before or after_total!=total: raise RuntimeError('P56 source changed during checks')
        (OUT/'reports').mkdir(exist_ok=True)
        source_report={'profile':'umf.g03-p56-physical-inventory/1','commit':'973d864c8d26b2bc173a411eac8368da5efc1ab3','tree':'8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff','archiveSha256':h,'fileCount':len(before),'totalBytes':total,'stageRoster':stage_roster,'columns':['path','sizeBytes','sha256','mode'],'rows':before}
        write_json_bounded(OUT/'reports/source-inventory.json',source_report,1024*1024)
        # Explicitly separate selected software artifacts from bounded logs/reports/evidence.
        metadata=0; software=0; rawlogs=0
        for base,dirs,names in os.walk(OUT,followlinks=False):
            dirs.sort()
            for filename in names:
                fp=pathlib.Path(base)/filename; size=fp.lstat().st_size
                if 'artifacts' in fp.parts: software+=size
                else: metadata+=size
                if 'logs' in fp.parts: rawlogs+=size
        command_rows=[json.loads(line) for line in read_text_bounded(OUT/'commands.jsonl',1024*1024,TERMINAL_DEADLINE).splitlines()]
        expected_names=['python-version','rustc-version','cargo-version','bun-version','node-version','wasm-bindgen-version','rust-verbose','rust-targets','cargo-cache-extract','create-venv','offline-install','pip-check','wheel-members','distribution-snapshot','facts-python','entity-python','truss-wasm-build','truss-wasm-bindgen','browser-wrapper','distribution-snapshot-post']
        if [x['name'] for x in command_rows]!=expected_names:raise RuntimeError('guest command roster is incomplete or reordered')
        if any(x.get('exitCode')!=0 or x.get('timedOut') or x.get('truncated') or not all(x.get('streamsEOF',[])) or any(not q.get('physicalClosed') or q.get('truncated') or q.get('rawBytes')!=q.get('bytes') or q.get('rawSha256')!=q.get('sha256') for q in x.get('streams',[])) for x in command_rows):raise RuntimeError('guest command raw capture/exit custody is not closed')
        phase={'profile':'umf.g03-truss-guest-phase/1','status':'PASS','clock':{'guestClockDomain':'Linux guest time.monotonic','guestAnchorMonotonic':GUEST_CLOCK_ANCHOR,'guestWorkDeadlineMonotonic':END,'guestTerminalDeadlineMonotonic':TERMINAL_DEADLINE,'hostClockDomain':HOST_CLOCK_DOMAIN,'hostWorkRemainingSecondsAtHandoff':WORK_REMAINING,'hostTerminalRemainingSecondsAtHandoff':TERMINAL_REMAINING,'mapping':'remaining durations passed from the original host lane; one guest-local monotonic anchor; parent host deadlines remain authoritative'},'sourceCommit':'973d864c8d26b2bc173a411eac8368da5efc1ab3','sourceTree':'8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff','sourceArchiveSha256':'8291da1e97ceb5ebd9cd29f0dab1ce233b14cd20651b1e840f7e3e59802ce77f','sourceFileCount':len(before),'sourceBytes':total,'sourceRootName':root.name,'sourceRosterSha256':hashlib.sha256(json.dumps(before,separators=(',',':')).encode()).hexdigest(),'gitStageRoster':stage_roster,'installedDistributionSnapshotSha256':hashlib.sha256(json.dumps(snapshot,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'postSnapshotEqual':True,'cargoCacheFileCount':cache_install['inventoryFileCount'],'cargoCacheEntryCount':cache_rows,'cargoCacheBytes':cache_bytes,'cargoCacheRosterSha256':cache_roster,'cargoCacheArchiveSha256':cache_install['archiveSha256'],'cargoCacheArchiveBytes':cache_install['archiveBytes'],'cargoCacheInventoryIndexSha256':cache_install['inventoryIndexSha256'],'cargoCacheInventoryChunkBytes':cache_install['inventoryChunkBytes'],'wheelMembers':len(wheel_members.get('members',[])),'wasmFeatureProfile':['truss-postgresql-pg18'],'commands':command_rows}
        phase_raw=json.dumps(phase,sort_keys=True,separators=(',',':')).encode()
        write_bounded(OUT/'reports/guest-phase-result.json',phase_raw,1024*1024)
        if rawlogs>512*1024 or metadata>16*1024*1024 or software>256*1024*1024: raise RuntimeError('inclusive guest logs/evidence/software local cap exceeded')
    except BaseException as exc:
        seed.update(failure=type(exc).__name__+': '+str(exc)[:500],commands=[json.loads(line) for line in read_text_bounded(OUT/'commands.jsonl',1024*1024,TERMINAL_DEADLINE).splitlines()] if (OUT/'commands.jsonl').exists() else [])
        try:write_json_bounded(OUT/'failure-phase.json',seed,1024*1024,TERMINAL_DEADLINE)
        except BaseException:pass
        raise
if __name__=='__main__': main()
