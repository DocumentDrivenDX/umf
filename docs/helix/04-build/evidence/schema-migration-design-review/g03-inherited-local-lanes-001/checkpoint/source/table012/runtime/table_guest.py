#!/usr/bin/env python3
"""Three-phase guest for the bounded local table-operations lane."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, selectors, signal, shutil, stat, subprocess, time, re
from pathlib import Path

WORK=pathlib.Path('/workspace'); COHORT=pathlib.Path('/cohort'); OUT=pathlib.Path('/out')
PREP=pathlib.Path('/prepared'); NATIVE_WASM=pathlib.Path('/native-wasm')
PYTHON=pathlib.Path('/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11')
WASM_BINDGEN=pathlib.Path('/wasm-tools/wasm-bindgen')
TOTAL=2700; LOG_CAP=1024*1024; PER_FILE=1024*1024; PUBLIC_CAP=8*1024*1024; GRACE=10
SELECTED_ARTIFACT_FILE_CAP=128*1024*1024
NATIVE_CLI_CAP=256*1024*1024
SOURCE_COUNT=5901; SOURCE_TOTAL_BYTES=860543639; SOURCE_TOTAL_CAP=1024*1024*1024; SOURCE_FILE_CAP=64*1024*1024; SOURCE_STAGE_BYTES=780359
SOURCE_STAGE_SHA='bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b'; SOURCE_STAGE_CUSTODY_SHA='e936a962be023654bd045cafa1f02d664e06e4c6bd6f686e4441f8558e027621'
SOURCE_ROSTER_PROFILE='umf.g03-table-operations-source-roster/3'; SOURCE_ROSTER_COLUMNS=['path','sizeBytes','sha256','mode']
STAGE_OFFSETS={'setup':180,'build':900,'bindings':1380,'native':1680,'browser':2280,'evidence':2400,'upload':2520}
COMMAND_CAPS={'tool-identity':30,'source-identity':30,'cohort-identity':30,'create-venv':60,
 'offline-install':720,'pip-check':60,'wheel-members':60,'distribution-versions':30,
 'cargo-cache-extract':180,'native-compiler':480,'installed-bindings':480,'native-oracle':300,'wasm-build':600,'wasm-bindgen':600}


def digest_file(p: pathlib.Path, cap: int):
    if p.is_symlink() or not p.is_file(): raise RuntimeError('not a regular file: '+str(p))
    before=p.stat()
    if before.st_size>cap: raise RuntimeError('file exceeds cap: '+str(p))
    h=hashlib.sha256(); n=0
    with p.open('rb') as f:
        for b in iter(lambda:f.read(65536),b''):
            n+=len(b)
            if n>cap: raise RuntimeError('file grew past cap: '+str(p))
            h.update(b)
    after=p.stat()
    if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode))!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)) or n!=before.st_size:
        raise RuntimeError('file changed while hashing: '+str(p))
    return h.hexdigest(),n

def read_capped(p: pathlib.Path, cap: int):
    if p.is_symlink() or not p.is_file(): raise RuntimeError('not a regular file: '+str(p))
    before=p.stat()
    if before.st_size>cap: raise RuntimeError('file exceeds read cap: '+str(p))
    out=bytearray()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(min(65536,cap+1-len(out))),b''):
            out.extend(b)
            if len(out)>cap: raise RuntimeError('file grew past read cap: '+str(p))
    after=p.stat()
    if len(out)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
        raise RuntimeError('file changed during bounded read: '+str(p))
    return bytes(out)

def inventory(root: pathlib.Path, cap: int, *, include_large=False):
    if root.is_symlink() or not root.is_dir(): raise RuntimeError('inventory root is not a real directory: '+str(root))
    rows=[]; total=0
    for base,dirs,files in os.walk(root,followlinks=False):
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs): raise RuntimeError('symlink directory in output')
        for name in sorted(files):
            p=pathlib.Path(base)/name; h,n=digest_file(p,64*1024*1024 if include_large else PER_FILE)
            total+=n
            if total>cap: raise RuntimeError('output inventory exceeds cap')
            rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
    return sorted(rows,key=lambda r:r['path']),total

def write_json(path, value, cap=PER_FILE):
    raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
    if len(raw)>cap: raise RuntimeError('JSON exceeds per-file cap')
    with path.open('xb') as f: f.write(raw); f.flush(); os.fsync(f.fileno())
    h,n=digest_file(path,cap)
    if (h,n)!=(hashlib.sha256(raw).hexdigest(),len(raw)): raise RuntimeError('durable JSON closure mismatch')
    return h,n

def atomic_json(path, value, cap=PER_FILE):
    raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
    if len(raw)>cap: raise RuntimeError('atomic JSON exceeds per-file cap')
    tmp=path.with_name(path.name+'.tmp-'+__import__('uuid').uuid4().hex)
    try:
        with tmp.open('xb') as f: f.write(raw); f.flush(); os.fsync(f.fileno())
        os.replace(tmp,path)
        fd=os.open(str(path.parent),os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
        h,n=digest_file(path,cap)
        if (h,n)!=(hashlib.sha256(raw).hexdigest(),len(raw)): raise RuntimeError('atomic phase receipt physical closure mismatch')
    finally:
        try: tmp.unlink()
        except FileNotFoundError: pass
    return h,n

def observe_native_cli(path: pathlib.Path, phase: str, rec: dict):
    # Persist bounded lstat facts before any size-cap refusal; never read the binary here.
    st=path.lstat()
    observation={'path':str(path),'stage':phase,'sizeBytes':st.st_size,
                 'mode':stat.S_IMODE(st.st_mode),'fileType':stat.S_IFMT(st.st_mode)}
    rec.setdefault('nativeCliObservations',[]).append(observation)
    atomic_json(OUT/'phase-result.json',rec)
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
        raise RuntimeError('native CLI target is not a regular non-symlink file: '+str(path))
    if st.st_size<0 or st.st_size>NATIVE_CLI_CAP:
        raise RuntimeError('native CLI exceeds selected software artifact cap: '+str(path))
    return digest_file(path,NATIVE_CLI_CAP)

def write_compact_json(path, value, cap=PER_FILE):
    raw=json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')+b'\n'
    if len(raw)>cap: raise RuntimeError('compact JSON exceeds per-file cap')
    with path.open('xb') as f: f.write(raw); f.flush(); os.fsync(f.fileno())
    h,n=digest_file(path,cap)
    if (h,n)!=(hashlib.sha256(raw).hexdigest(),len(raw)): raise RuntimeError('durable compact JSON closure mismatch')
    return h,n

def parse_stage_roster(raw:bytes):
    if len(raw)!=SOURCE_STAGE_BYTES or hashlib.sha256(raw).hexdigest()!=SOURCE_STAGE_SHA:raise RuntimeError('retained Git stage-roster bytes/hash differ')
    # Exact original root capture has no final LF; require 5900 LFs and one final row to EOF.
    if raw.endswith(b'\n') or b'\r' in raw or b'\x00' in raw:raise RuntimeError('retained stage-roster line-ending shape differs')
    lines=raw.split(b'\n')
    if len(lines)!=SOURCE_COUNT or any(not line for line in lines):raise RuntimeError('retained stage-roster row count/empty-line shape differs')
    rows={};prev=None
    for line in lines:
        m=re.fullmatch(rb'(100644|100755) ([0-9a-f]{40}) 0\t([^\t\\\x00-\x1f\x7f]+)',line)
        if not m:raise RuntimeError('retained stage-roster row is outside closed stage-0 grammar')
        mode,blob,path_b=m.groups()
        try:rel=path_b.decode('utf-8','strict')
        except UnicodeDecodeError:raise RuntimeError('retained stage path is not UTF-8')
        pp=pathlib.PurePosixPath(rel)
        if not rel or pp.is_absolute() or pp.as_posix()!=rel or any(x in ('','.','..') for x in pp.parts) or '\\' in rel or any(ord(c)<32 or ord(c)==127 for c in rel):
            raise RuntimeError('retained stage path is not a canonical safe relative path')
        if prev is not None and path_b<=prev:raise RuntimeError('retained stage paths are not sorted/unique')
        prev=path_b;rows[rel]={'gitMode':mode.decode(),'gitBlobSha1':blob.decode()}
    if len(rows)!=SOURCE_COUNT:raise RuntimeError('retained stage roster does not contain every tracked file')
    return rows

def source_basis(packet):
    raw=read_capped(pathlib.Path('/input-git-stage-roster.txt'),SOURCE_STAGE_BYTES)
    stage=parse_stage_roster(raw)
    custody_raw=read_capped(pathlib.Path('/input-source-custody.json'),4096)
    if hashlib.sha256(custody_raw).hexdigest()!=SOURCE_STAGE_CUSTODY_SHA:raise RuntimeError('retained root custody metadata hash differs')
    custody=json.loads(custody_raw)
    expected={'gitStageRosterSha256':SOURCE_STAGE_SHA,'producerCommit':packet['source']['commit'],'producerTree':packet['source']['tree'],
      'profile':'g03.macos-source-roster-custody/1','scope':'Root readonly metadata capture; exact original build002 source digest closure, no product/tool execution.',
      'selectedInputCount':1459,'selectedInputRosterSha256':'6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2',
      'sourceRoot':'/private/tmp/weft-g03-ordinary-module','status':'','trackedCount':SOURCE_COUNT}
    if custody!=expected:raise RuntimeError('retained root custody metadata identity differs')
    return stage,{'profile':'g03.git-stage-roster-custody/1','sha256':SOURCE_STAGE_SHA,'bytes':SOURCE_STAGE_BYTES,'fileCount':SOURCE_COUNT,'terminalLf':False,
      'custodySha256':SOURCE_STAGE_CUSTODY_SHA,'producerCommit':packet['source']['commit'],'producerTree':packet['source']['tree'],'producerStatusAtCapture':''}

def physical_source_hash(p:pathlib.Path,cap:int):
    if p.is_symlink() or not p.is_file():raise RuntimeError('source is not a regular physical file: '+str(p))
    before=p.lstat()
    if before.st_size>cap:raise RuntimeError('source file exceeds per-file cap: '+str(p))
    sha=hashlib.sha256(); blob=hashlib.sha1();blob.update(b'blob '+str(before.st_size).encode('ascii')+b'\0');n=0
    with p.open('rb') as f:
        for block in iter(lambda:f.read(65536),b''):
            n+=len(block)
            if n>cap:raise RuntimeError('source file grew beyond per-file cap')
            sha.update(block);blob.update(block)
    after=p.lstat()
    if n!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise RuntimeError('source changed during SHA256/Git blob hash')
    return sha.hexdigest(),blob.hexdigest(),n,before.st_mode

def source_roster(packet):
    stage,basis=source_basis(packet);rows=[];total=0;previous=''
    if len(stage)!=SOURCE_COUNT:raise RuntimeError('stage basis count differs from complete source scope')
    for rel,st in stage.items():
        pp=pathlib.PurePosixPath(rel)
        if rel<=previous or pp.is_absolute() or pp.as_posix()!=rel or any(x in ('','.','..') for x in pp.parts) or '\\' in rel:raise RuntimeError('unsafe or unordered retained path')
        previous=rel;p=WORK/rel;q=p.parent
        while q!=WORK:
            if q.is_symlink() or not q.is_dir():raise RuntimeError('source ancestor is not a real directory: '+rel)
            q=q.parent
        sha,blob,n,mode_bits=physical_source_hash(p,SOURCE_FILE_CAP);total+=n
        mode=stat.S_IMODE(mode_bits);expected_mode={'100644':0o644,'100755':0o755}.get(st['gitMode'])
        if expected_mode is None or mode!=expected_mode or blob!=st['gitBlobSha1'] or total>SOURCE_TOTAL_CAP:
            raise RuntimeError('physical source SHA256/Git blob/mode differs from retained stage roster: '+rel)
        rows.append([rel,n,sha,mode])
    if len(rows)!=SOURCE_COUNT or total!=SOURCE_TOTAL_BYTES:raise RuntimeError('full tracked source count/bytes differ from captured P56 stage basis')
    roster={'profile':SOURCE_ROSTER_PROFILE,'encoding':'compact-json-array-v1','columns':SOURCE_ROSTER_COLUMNS,
      'sourceCommit':packet['source']['commit'],'sourceTree':packet['source']['tree'],'files':rows,'fileCount':len(rows),'totalBytes':total,
      'sourceBytesCap':SOURCE_TOTAL_CAP,'maximumFileBytes':SOURCE_FILE_CAP,'sourceReportBytesCap':PER_FILE,'stageBasis':basis}
    roster['rosterSha256']=hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode('utf-8')).hexdigest()
    (OUT/'reports').mkdir(parents=True,exist_ok=True)
    report_sha,report_bytes=write_compact_json(OUT/'reports/source-inputs.rows.json',roster,PER_FILE)
    if report_bytes>=PER_FILE:raise RuntimeError('complete source roster report is not below 1 MiB')
    return {k:roster[k] for k in ('profile','fileCount','totalBytes','rosterSha256','stageBasis')}

class Commands:
    def __init__(self, packet, phase):
        self.packet=packet; self.phase=phase; self.start=time.monotonic()-float(os.environ['G03_LANE_ELAPSED_AT_PHASE_START']); self.records=[]; self.log_bytes=0
        self.log_cap=int(os.environ['G03_PHASE_LOG_CAP'])
        (OUT/'logs').mkdir(parents=True,exist_ok=True)
    def run(self,name,argv,stage,cap=None,env=None,cwd=WORK):
        elapsed=time.monotonic()-self.start
        offset=int(self.packet['stageOffsetsSeconds'][stage]); deadline=offset-2
        avail=min(deadline-elapsed, int(self.packet['aggregateSeconds'])-60-elapsed)
        limit=min(cap or COMMAND_CAPS[name],avail)-GRACE
        if limit<=0: raise TimeoutError(f'{name} cannot begin before its original stage deadline')
        env_values=(os.environ.copy() if env is None else dict(env))
        if name=='native-oracle': env_values['WEFT_NATIVE_TIMEOUT_SECONDS']=str(max(1,int(limit)))
        start=time.monotonic(); proc=subprocess.Popen(argv,cwd=cwd,env=env_values,stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        paths=[OUT/'logs'/(name+'.stdout.log'),OUT/'logs'/(name+'.stderr.log')]
        streams=[proc.stdout,proc.stderr]; sel=selectors.DefaultSelector(); hashes=[hashlib.sha256(),hashlib.sha256()]
        raw=[0,0]; kept=[0,0]; trunc=[False,False]; handles=[p.open('xb') for p in paths]
        for i,s in enumerate(streams): os.set_blocking(s.fileno(),False); sel.register(s,selectors.EVENT_READ,i)
        cmd_deadline=start+limit; kill_at=cmd_deadline+GRACE; timed=False; failure=None
        try:
            while sel.get_map() or proc.poll() is None:
                now=time.monotonic()
                if now>=cmd_deadline and not timed:
                    timed=True; failure='timeout'
                    try: os.killpg(proc.pid,signal.SIGTERM)
                    except ProcessLookupError: pass
                if timed and now>=kill_at:
                    failure='termination-grace-expired'
                    try: os.killpg(proc.pid,signal.SIGKILL)
                    except ProcessLookupError: pass
                    for k in list(sel.get_map().values()):
                        sel.unregister(k.fileobj); k.fileobj.close()
                    break
                for key,_ in sel.select(.1):
                    i=key.data
                    try: b=os.read(key.fileobj.fileno(),65536)
                    except BlockingIOError: continue
                    if not b: sel.unregister(key.fileobj); continue
                    raw[i]+=len(b); hashes[i].update(b)
                    room=max(0,min(PER_FILE-kept[i],self.log_cap-self.log_bytes))
                    if room:
                        chunk=b[:room]; handles[i].write(chunk); kept[i]+=len(chunk); self.log_bytes+=len(chunk)
                    if len(b)>room:
                        trunc[i]=True; failure=failure or 'log-cap'
                        if proc.poll() is None:
                            try: os.killpg(proc.pid,signal.SIGTERM)
                            except ProcessLookupError: pass
                        timed=True; cmd_deadline=min(cmd_deadline,time.monotonic())
                        kill_at=min(kill_at,time.monotonic()+GRACE,self.start+offset-2)
            if proc.poll() is None:
                try: proc.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    try: os.killpg(proc.pid,signal.SIGKILL)
                    except ProcessLookupError: pass
                    try: proc.wait(timeout=1)
                    except subprocess.TimeoutExpired: failure='child-reap-failed'
        finally:
            sel.close()
            for f in handles: f.flush(); os.fsync(f.fileno()); f.close()
        rows=[]
        for i,p in enumerate(paths):
            h,n=digest_file(p,PER_FILE)
            rows.append({'path':p.relative_to(OUT).as_posix(),'bytes':n,'sha256':h,'rawBytes':raw[i],
                'rawSha256':hashes[i].hexdigest(),'truncated':trunc[i],
                'physicalClosed':n==kept[i] and (trunc[i] or h==hashes[i].hexdigest())})
        ended=time.monotonic()
        row={'name':name,'argv':argv,'cwd':str(cwd),'startMonotonic':start,'endMonotonic':ended,'limitSeconds':round(limit,3),
             'terminationGraceIncludedInOriginalCap':GRACE,'environment':{k:env_values[k] for k in ('RUSTUP_TOOLCHAIN','CARGO_HOME','CARGO_TARGET_DIR','CARGO_NET_OFFLINE','WEFT_NATIVE_DSN','WEFT_NATIVE_TIMEOUT_SECONDS') if k in env_values},
             'elapsedSeconds':round(ended-start,6),'exitCode':proc.returncode,'timedOut':timed,
             'failure':failure,'streams':rows}
        self.records.append(row)
        if failure or proc.returncode!=0 or any(r['truncated'] or not r['physicalClosed'] for r in rows):
            raise RuntimeError(f'{name} failed or its bounded capture did not close')
        return row

def read_packet():
    p=pathlib.Path('/input-packet.json'); want=os.environ['G03_INPUT_PACKET_SHA256']
    h,n=digest_file(p,128*1024)
    if h!=want: raise RuntimeError('input packet digest mismatch')
    x=json.loads(read_capped(p,128*1024))
    if set(x)!={'profile','status','source','cohort','runtime','browser','stageOffsetsSeconds','aggregateSeconds','wasmBindgen','provenance','limits','cargoCache'} or x['profile']!='umf.g03-table-operations-inputs/9' or x['status']!='FROZEN_LOCAL_INPUTS': raise RuntimeError('closed packet schema mismatch')
    cache=x['cargoCache']
    if set(cache)!={'profile','executionAllowed','status','acquisitionOperatorRoot','acquisitionOperatorManifestSha256','acquisitionPacketSha256','acquisitionSolReviewSha256','acquisitionSolReviewPath','acquisitionRunId','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveRelativePath','archiveSha256','archiveBytes','inventoryIndexSha256','inventoryRowsSha256','inventoryChunkBytes','inventoryRowCount','cacheContentBytes','lockedCrateCount','sparseIndexWitnessCount','archiveMaxBytes','sourceImageId','mountDestination'}: raise RuntimeError('closed Cargo-cache packet schema mismatch')
    if cache.get('profile')!='umf.g03-locked-cargo-cache-consumer/1' or cache.get('executionAllowed') is not True or cache.get('status')!='SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE' or cache.get('archiveRelativePath')!='guest/software/cargo-registry.tar' or cache.get('acquisitionOperatorRoot')!='/private/tmp/g03-linux-locked-cargo-cache-operator-007' or not re.fullmatch('[0-9a-f]{64}',cache.get('acquisitionPacketSha256','')) or not re.fullmatch('[0-9a-f]{64}',cache.get('acquisitionOperatorManifestSha256','')): raise RuntimeError('locked Cargo cache is held or unbound')
    if not all(cache.get(k) for k in ('acquisitionRunId','acquisitionSolReviewSha256','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveSha256','inventoryIndexSha256','inventoryRowsSha256')) or any(type(cache.get(k)) is not int for k in ('archiveBytes','inventoryChunkBytes','inventoryRowCount','cacheContentBytes')): raise RuntimeError('accepted cache physical identity fields are incomplete')
    if set(x['source'])!={'commit','tree','workflowSha256'} or set(x['cohort'])!={'root','custodySha256','lockSha256','indexSha256','mirrorManifestSha256','requirementsSha256','wheel'}: raise RuntimeError('closed source/cohort fields mismatch')
    if set(x['cohort']['wheel'])!={'path','sha256','sizeBytes','version'}: raise RuntimeError('closed wheel fields mismatch')
    if x['source']!={'commit':'973d864c8d26b2bc173a411eac8368da5efc1ab3','tree':'8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff','workflowSha256':x['source']['workflowSha256']} or len(x['source']['workflowSha256'])!=64: raise RuntimeError('P56 source pin mismatch')
    if x['source']['workflowSha256']!='62a1c09eab8568c12d91f3047ecf41edbba81bbcfe9c103a53846d2bb3ebe610': raise RuntimeError('P56 workflow bytes are not the frozen packet identity')
    if (x['cohort']['root']!='/cohort' or x['cohort']['wheel']!={'path':'aggregate/mirror/files/umf_weft-0.4.56-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl','sha256':'32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd','sizeBytes':14358901,'version':'0.4.56'}): raise RuntimeError('final wheel identity mismatch')
    if (x['cohort']['custodySha256'],x['cohort']['lockSha256'],x['cohort']['indexSha256'],x['cohort']['mirrorManifestSha256'],x['cohort']['requirementsSha256'])!=('95e9493f06adefb323193f9d8fbe5577ebfa335140a9841f549d2caf098df8ed','cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274','78026c05d3824613f0e2a3bf30cf24bd32af24de1d560f0b7fa555a1e75f8d60','809a418b9f6f97e403e3fbcc7066d23657347d1323efb6baf2d4d3bb3f17bd36','4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51'): raise RuntimeError('final 18-wheel cohort metadata pins mismatch')
    if set(x['runtime'])!={'builderImageId','platform','python','rustc','cargo','bun','node'} or x['runtime']!={'builderImageId':'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10','platform':'linux/amd64','python':'Python 3.11.17','rustc':'rustc 1.90.0 (1159e78c4 2025-09-14)','cargo':'cargo 1.90.0 (840b83a10 2025-07-30)','bun':'1.4.3','node':'v26.12.1'}: raise RuntimeError('runtime packet identity mismatch')
    if set(x['wasmBindgen'])!={'path','sha256','sizeBytes','version'} or x['wasmBindgen']!={'path':'/wasm-tools/wasm-bindgen','sha256':'9deaf07387ad50e9166d69c46247a5a7c4bdf315bc45e95a5990ce85ef5a9741','sizeBytes':7401992,'version':'wasm-bindgen 0.2.105'}: raise RuntimeError('wasm-bindgen packet identity mismatch')
    if x['stageOffsetsSeconds']!=STAGE_OFFSETS or x['aggregateSeconds']!=TOTAL: raise RuntimeError('inherited table lane clock changed')
    if x['limits']!={'nativeCommandTotalSeconds':300,'nativeTerminationGraceSeconds':10,'localAggregateLogBytes':1048576,'inheritedLogLimitMeaning':'1 MiB per public file/log; local 1 MiB aggregate is a stricter operator choice','publicEvidenceBytes':8388608,'selectedSoftwareArtifactBytes':268435456}: raise RuntimeError('lane/log/evidence bound differs from frozen packet')
    provenance=x['provenance']
    if provenance.get('scope')!={'lane':'table-operations','wasmFeatureProfile':['raw-postgresql-reads'],'includesTrussFactsOrEntitySelection':False,'includesTrussWasmProfile':False,'reusedRustAndWheelEvidence':'no duplicate green Rust suite or wheel rebuild'}: raise RuntimeError('table-only scope differs from frozen input packet')
    if provenance.get('rustupToolchain')!='1.90.0-x86_64-unknown-linux-gnu' or provenance.get('installedRustTargets')!=['wasm32-unknown-unknown','x86_64-unknown-linux-gnu']: raise RuntimeError('pinned Rust toolchain/target facts differ from packet')
    if provenance.get('sourceCustody')!={'profile':SOURCE_ROSTER_PROFILE,'encoding':'compact-json-array-v1','columns':SOURCE_ROSTER_COLUMNS,'fileCount':SOURCE_COUNT,'totalBytes':SOURCE_TOTAL_BYTES,'sourceBytesCap':SOURCE_TOTAL_CAP,'maximumFileBytes':SOURCE_FILE_CAP,'sourceReportBytesCap':PER_FILE,'stageRosterProfile':'g03.git-stage-roster-custody/1','stageRosterPath':'/input-git-stage-roster.txt','stageRosterBytes':SOURCE_STAGE_BYTES,'stageRosterSha256':SOURCE_STAGE_SHA,'stageCustodyPath':'/input-source-custody.json','stageCustodySha256':SOURCE_STAGE_CUSTODY_SHA,'terminalLf':False,'producerCommit':x['source']['commit'],'producerTree':x['source']['tree'],'producerStatusAtCapture':''}: raise RuntimeError('complete physical source-roster/stage policy differs from frozen packet')
    if provenance.get('installedSnapshot')!={'profile':'umf.g03-fresh-installed-distribution-snapshot/1','lockedDistributionCount':18,'bootstrapAllowlist':['pip','setuptools'],'wheelSha256':'32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd','wheelSizeBytes':14358901,'requirementsSha256':'4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51'}: raise RuntimeError('fresh installed18 snapshot policy differs from frozen packet')
    if provenance.get('postgresShortVersion')!='18.6 (Debian 18.6-1.pgdg13+2)' or provenance.get('postgresFullVersion')!='PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit': raise RuntimeError('exact PostgreSQL image version identity differs from packet')
    return x

def tool_versions(cmd):
    return {'python':(str(PYTHON),'--version'),'rustc':(cmd.packet['provenance']['rustcPath'],'--version'),
            'cargo':(cmd.packet['provenance']['cargoPath'],'--version'),
            'bun':('/usr/local/bun/bin/bun','--version'),'node':('/usr/local/bin/node','--version'),
            'wasm-bindgen':(str(WASM_BINDGEN),'--version')}

def run_phase(phase):
    start=time.monotonic(); c=None
    rec={'profile':'umf.g03-table-operations-phase/1','phase':phase,'status':'FAIL_OR_UNKNOWN','commands':[],'failure':'phase has not closed'}
    atomic_json(OUT/'phase-result.json',rec)
    try:
        packet=read_packet(); c=Commands(packet,phase)
        if phase=='prepare':
            versions={}
            toolchain=packet['provenance']['rustupToolchain']
            cargo_env={**os.environ,'RUSTUP_TOOLCHAIN':toolchain,'CARGO_HOME':'/cargo','CARGO_TARGET_DIR':'/target',
                       'CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'4',
                       'PATH':str(Path(packet['provenance']['cargoPath']).parent)+os.pathsep+os.environ.get('PATH','')}
            for key,argv in tool_versions(c).items():
                r=c.run('tool-identity-'+key,list(argv),'setup',30,env=cargo_env); versions[key]=r
            c.run('tool-identity-rust-verbose',[packet['provenance']['rustcPath'],'-vV'],'setup',30,env=cargo_env)
            c.run('tool-identity-rust-targets',['rustup','target','list','--installed','--toolchain',toolchain],'setup',30,env=cargo_env)
            expected={'python':'Python 3.11.17','rustc':'rustc 1.90.0 (1159e78c4 2025-09-14)','cargo':'cargo 1.90.0 (840b83a10 2025-07-30)','bun':'1.4.3','node':'v26.12.1','wasm-bindgen':'wasm-bindgen 0.2.105'}
            for k,w in expected.items():
                t=read_capped(OUT/'logs'/('tool-identity-'+k+'.stdout.log'),PER_FILE).decode('utf-8','strict').strip()
                if t!=w: raise RuntimeError('runtime tool identity mismatch: '+k)
            verbose=read_capped(OUT/'logs/tool-identity-rust-verbose.stdout.log',PER_FILE).decode('utf-8','strict').splitlines()
            hosts=[line.split(': ',1)[1] for line in verbose if line.startswith('host: ')]
            if hosts!=['x86_64-unknown-linux-gnu']: raise RuntimeError('Rust compiler host identity mismatch')
            targets=read_capped(OUT/'logs/tool-identity-rust-targets.stdout.log',PER_FILE).decode('utf-8','strict').splitlines()
            if set(targets)!=set(packet['provenance']['installedRustTargets']): raise RuntimeError('Rust target installation differs from frozen tool packet')
            source_custody=source_roster(packet)
            ident={'commit':packet['source']['commit'],'tree':packet['source']['tree'],'identityBasis':'guest_physical_stage_roster'}
            custody_hash,custody_bytes=digest_file(COHORT/'custody.json',1024*1024)
            if custody_hash!=packet['cohort']['custodySha256']: raise RuntimeError('cohort custody digest mismatch')
            custody=json.loads(read_capped(COHORT/'custody.json',PER_FILE))
            if custody.get('status')!='HELD_UNPUBLISHED_NOT_RUNTIME_QUALIFIED' or len(custody.get('files',[]))!=42: raise RuntimeError('cohort custody roster/status mismatch')
            custody_rows=[]; custody_bytes_total=0
            for row in custody['files']:
                if set(row)!={'bytes','path','sha256'}: raise RuntimeError('cohort custody row schema mismatch')
                rel=pathlib.PurePosixPath(row['path'])
                if rel.is_absolute() or any(part in ('','.','..') for part in rel.parts) or '\\' in row['path']: raise RuntimeError('unsafe cohort custody path')
                actual_hash,actual_size=digest_file(COHORT/row['path'],64*1024*1024)
                if (actual_size,actual_hash)!=(row['bytes'],row['sha256']): raise RuntimeError('cohort file custody mismatch: '+row['path'])
                custody_bytes_total+=actual_size; custody_rows.append(row)
                if custody_bytes_total>512*1024*1024: raise RuntimeError('cohort byte cap exceeded')
            wh,wn=digest_file(COHORT/packet['cohort']['wheel']['path'],64*1024*1024)
            if (wh,wn)!=(packet['cohort']['wheel']['sha256'],packet['cohort']['wheel']['sizeBytes']): raise RuntimeError('wheel hash/size differs')
            pathlib.Path('/out/reports').mkdir(exist_ok=True)
            cache=packet['cargoCache']
            c.run('cargo-cache-extract',[str(PYTHON),'-B','-I','/operator/cargo_cache_extract.py','--evidence','/cargo-cache-input/evidence',
                '--archive','/cargo-cache-input/software/cargo-registry.tar','--destination','/cargo/registry',
                '--archive-sha256',cache['archiveSha256'],'--archive-bytes',str(cache['archiveBytes']),
                '--acquisition-packet-sha256',cache['acquisitionPacketSha256'],'--index-sha256',cache['inventoryIndexSha256'],
                '--rows-sha256',cache['inventoryRowsSha256'],'--chunk-bytes',str(cache['inventoryChunkBytes']),
                '--row-count',str(cache['inventoryRowCount']),'--receipt','/out/reports/cargo-cache-install.json'],'setup',180,env=cargo_env)
            cache_raw=read_capped(OUT/'reports/cargo-cache-install.json',PER_FILE)
            cache_install=json.loads(cache_raw)
            if (cache_install.get('profile')!='umf.g03-cargo-cache-extraction/1' or cache_install.get('status')!='PASS' or
                cache_install.get('archiveSha256')!=cache['archiveSha256'] or cache_install.get('archiveBytes')!=cache['archiveBytes'] or
                cache_install.get('inventoryIndexSha256')!=cache['inventoryIndexSha256'] or cache_install.get('inventoryRowsSha256')!=cache['inventoryRowsSha256'] or
                cache_install.get('inventoryChunkBytes')!=cache['inventoryChunkBytes'] or cache_install.get('inventoryRowCount')!=cache['inventoryRowCount'] or
                cache_install.get('cacheContentBytes')!=cache['cacheContentBytes'] or cache_install.get('lockedCrateCount')!=115 or cache_install.get('sparseIndexWitnessCount')!=115):
                raise RuntimeError('physical extracted Cargo cache does not match accepted acquisition closure')
            r=c.run('create-venv',[str(PYTHON),'-B','-m','venv','/venv'],'setup',60)
            r=c.run('offline-install',['/venv/bin/python','-B','-I','-m','pip','--isolated','install','--disable-pip-version-check','--no-cache-dir','--no-compile','--only-binary=:all:','--require-hashes','--index-url','file:///cohort/aggregate/mirror/simple','-r','/cohort/aggregate/mirror/requirements.lock'],'build',720)
            c.run('pip-check',['/venv/bin/python','-B','-I','-m','pip','--isolated','check'],'build',60)
            c.run('wheel-members',['/venv/bin/python','-B','-I','/operator/verify_weft_wheel.py','--wheel','/cohort/'+packet['cohort']['wheel']['path'],'--wheel-sha256',packet['cohort']['wheel']['sha256'],'--wheel-size',str(packet['cohort']['wheel']['sizeBytes'])],'build',60)
            c.run('distribution-versions',['/venv/bin/python','-B','-I','/operator/distribution_snapshot.py','--requirements','/cohort/aggregate/mirror/requirements.lock','--site-packages','/venv/lib/python3.11/site-packages','--output','/out/reports/installed-distribution-snapshot.json','--wheel-sha256',packet['cohort']['wheel']['sha256'],'--wheel-size',str(packet['cohort']['wheel']['sizeBytes'])],'build',30)
            snapshot_raw=read_capped(OUT/'reports/installed-distribution-snapshot.json',PER_FILE)
            snapshot=json.loads(snapshot_raw)
            if snapshot.get('profile')!='umf.g03-fresh-installed-distribution-snapshot/1' or snapshot.get('matching') is not True or snapshot.get('lockedDistributionCount')!=18 or snapshot.get('requirements',{}).get('sha256')!=packet['provenance']['installedSnapshot']['requirementsSha256'] or snapshot.get('wheel')!={'sha256':packet['cohort']['wheel']['sha256'],'sizeBytes':packet['cohort']['wheel']['sizeBytes']}:
                raise RuntimeError('fresh installed18 snapshot does not bind exact lock and wheel')
            cargo_env.update({'CARGO_NET_OFFLINE':'true'})
            c.run('native-compiler',['cargo','build','--locked','--offline','-p','weft-postgresql','--example','compile_table_operation'],'bindings',480,env=cargo_env)
            pathlib.Path('/out/reports').mkdir(exist_ok=True); pathlib.Path('/out/artifacts').mkdir(exist_ok=True)
            c.run('installed-bindings',['/venv/bin/python','-B','-I','tests/raw-postgresql/table-operation-bindings.py','/target/debug/examples/compile_table_operation','/out/reports/operation-bindings.json','/out/artifacts/operation-browser-cases.json'],'bindings',480,env=cargo_env)
            cli_path=pathlib.Path('/target/debug/examples/compile_table_operation')
            cli_sha,cli_size=observe_native_cli(cli_path,'prepare-post-build',rec)
            rec.update(status='PREPARE_PASS',cargoCache={'archiveSha256':cache['archiveSha256'],'archiveBytes':cache['archiveBytes'],'inventoryIndexSha256':cache['inventoryIndexSha256'],'inventoryRowsSha256':cache['inventoryRowsSha256'],'inventoryChunkBytes':cache['inventoryChunkBytes'],'inventoryRowCount':cache['inventoryRowCount'],'cacheContentBytes':cache['cacheContentBytes'],'lockedCrateCount':cache_install['lockedCrateCount'],'sparseIndexWitnessCount':cache_install['sparseIndexWitnessCount'],'installReceiptSha256':hashlib.sha256(cache_raw).hexdigest(),'installReceiptBytes':len(cache_raw)},toolVersions={k:read_capped(OUT/'logs'/('tool-identity-'+k+'.stdout.log'),PER_FILE).decode('utf-8','strict').strip() for k in expected},sourceIdentity={**ident,'custody':source_custody},
                       wheel={'path':packet['cohort']['wheel']['path'],'sha256':wh,'sizeBytes':wn},
                       installedSnapshot={'path':'reports/installed-distribution-snapshot.json','sha256':hashlib.sha256(snapshot_raw).hexdigest(),'sizeBytes':len(snapshot_raw),'profile':snapshot['profile'],'lockedDistributionCount':18},
                       nativeCli={'path':'/target/debug/examples/compile_table_operation','sha256':cli_sha,'sizeBytes':cli_size,'sourceCommit':packet['source']['commit'],'sourceTree':packet['source']['tree'],'featureProfile':'weft-postgresql --example compile_table_operation'})
        elif phase=='native-wasm':
            p=json.loads(read_capped(PREP/'phase-result.json',PER_FILE))
            if p.get('status')!='PREPARE_PASS': raise RuntimeError('prior prepare phase not qualified')
            native_custody=source_roster(packet)
            if native_custody!=p.get('sourceIdentity',{}).get('custody'): raise RuntimeError('physical source/stage correspondence changed before native/WASM phase')
            cases_hash,cases_size=digest_file(PREP/'artifacts/operation-browser-cases.json',SELECTED_ARTIFACT_FILE_CAP)
            pathlib.Path('/out/reports').mkdir(exist_ok=True)
            cli_before_sha,cli_before_size=observe_native_cli(pathlib.Path('/target/debug/examples/compile_table_operation'),'native-wasm-pre-build',rec)
            if (cli_before_sha,cli_before_size)!=(p.get('nativeCli',{}).get('sha256'),p.get('nativeCli',{}).get('sizeBytes')): raise RuntimeError('native CLI comparator differs from sealed preparation artifact')
            c.run('native-oracle',['/venv/bin/python','-B','-I','/workspace/tests/raw-postgresql/table-operation-native.py','--dsn-env','WEFT_NATIVE_DSN','--report','/out/reports/native.json'],'native',300,
                  env={**os.environ,'WEFT_NATIVE_DSN':'host=table-pg dbname=postgres user=postgres connect_timeout=5'})
            native_json=json.loads(read_capped(OUT/'reports/native.json',PER_FILE))
            leases=native_json.get('perCallLeases',{})
            if (native_json.get('status')!='passed' or native_json.get('postgresql')!=180006 or
                native_json.get('postgresqlVersion')!=packet['provenance']['postgresFullVersion'] or native_json.get('weft')!='0.4.56' or
                native_json.get('nativeExecutionQualified') is not False or native_json.get('cleanupStatus')!='complete' or
                native_json.get('cleanupFailureType') is not None or native_json.get('failedAssertion') is not None or
                leases.get('acquired')!=leases.get('released') or leases.get('acquired',0)<=30):
                raise RuntimeError('native assertion/status/cleanup report does not close')
            native_hash,native_size=digest_file(OUT/'reports/native.json',PER_FILE)
            c.run('wasm-build',['cargo','build','--locked','--offline','-p','weft-wasm','--target','wasm32-unknown-unknown','--features','raw-postgresql-reads'],'browser',600,
                  env={**os.environ,'CARGO_HOME':'/cargo','CARGO_TARGET_DIR':'/target','CARGO_NET_OFFLINE':'true','RUSTUP_TOOLCHAIN':packet['provenance']['rustupToolchain'],'PATH':str(Path(packet['provenance']['cargoPath']).parent)+os.pathsep+os.environ.get('PATH','')})
            web=OUT/'artifacts/table-web';web.mkdir(parents=True,exist_ok=True)
            wasm_bindgen=pathlib.Path('/wasm-tools/wasm-bindgen')
            c.run('wasm-bindgen',[str(wasm_bindgen),'--target','web','--out-dir',str(web),'/target/wasm32-unknown-unknown/debug/weft_wasm.wasm'],'browser',600)
            cli_after_sha,cli_after_size=observe_native_cli(pathlib.Path('/target/debug/examples/compile_table_operation'),'native-wasm-post-build',rec)
            if (cli_after_sha,cli_after_size)!=(cli_before_sha,cli_before_size): raise RuntimeError('native CLI comparator changed during the WASM build')
            table_rows,table_size=inventory(web,64*1024*1024,include_large=True)
            if {r['path'] for r in table_rows}!={'weft_wasm.js','weft_wasm_bg.wasm','weft_wasm.d.ts','weft_wasm_bg.wasm.d.ts'}: raise RuntimeError('WASM output file roster mismatch')
            rec.update(status='NATIVE_WASM_PASS',browserCases={'sha256':cases_hash,'sizeBytes':cases_size},native={'sha256':native_hash,'sizeBytes':native_size},tableWasm={'files':table_rows,'sizeBytes':table_size,'featureProfile':['raw-postgresql-reads']},nativeCli={'path':'/target/debug/examples/compile_table_operation','sha256':cli_after_sha,'sizeBytes':cli_after_size,'sourceCommit':packet['source']['commit'],'sourceTree':packet['source']['tree']},nativeAssertions=len(native_json.get('observations',[])),nativeLeases=native_json.get('perCallLeases'))
        else: raise RuntimeError('unknown phase; browser runs directly in the pinned ARM64 image')
    except BaseException as e: rec.update(status='FAIL_OR_UNKNOWN',failure=type(e).__name__+': '+str(e)[:350])
    rec['commands']=[] if c is None else c.records; rec['logBytes']=0 if c is None else c.log_bytes; rec['elapsedSeconds']=round(time.monotonic()-start,3)
    if c is not None and time.monotonic()-c.start > TOTAL-60 and rec.get('status','').endswith('_PASS'): rec.update(status='FAIL_OR_UNKNOWN',failure='absolute lane deadline reserve crossed')
    candidate_status=rec.get('status','FAIL_OR_UNKNOWN')
    rec.update(status='FAIL_OR_UNKNOWN',failure=rec.get('failure') or 'phase evidence closure pending',candidateStatus=candidate_status,evidenceClosureVerified=False)
    atomic_json(OUT/'phase-result.json',rec)
    public_root=OUT
    public_rows=[]; public_total=0
    for sub in ('logs','reports'):
        d=OUT/sub
        if d.exists():
            rows,n=inventory(d,PUBLIC_CAP,include_large=False)
            public_rows.extend({'path':sub+'/'+r['path'],'sizeBytes':r['sizeBytes'],'sha256':r['sha256']} for r in rows); public_total+=n
    if public_total>PUBLIC_CAP: raise RuntimeError('public log/report evidence exceeds 8 MiB')
    rec['publicFiles']=sorted(public_rows,key=lambda r:r['path']);rec['publicBytes']=public_total
    rec['status']=candidate_status
    rec['failure']=None if candidate_status.endswith('_PASS') else rec.get('failure')
    rec['evidenceClosureVerified']=True
    atomic_json(OUT/'phase-result.json',rec)
    return rec

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--phase',choices=['prepare','native-wasm'],required=True); args=ap.parse_args()
    result=run_phase(args.phase); print(json.dumps({'status':result['status'],'phase':args.phase},sort_keys=True)); raise SystemExit(0 if result['status'].endswith('_PASS') else 1)
