#!/usr/bin/env python3
"""Bounded, source-bound Linux Cargo registry acquisition; no product build/test lane."""
from __future__ import annotations
import argparse, base64, hashlib, importlib.util, json, os, pathlib, re, shutil, signal, stat, subprocess, sys, tarfile, time, uuid

ROOT=pathlib.Path('/private/tmp/g03-linux-locked-cargo-cache-operator-007')
INPUTS=ROOT/'inputs'; PACKET=INPUTS/'cache-acquisition-packet.json'; MANIFEST=ROOT/'integrity-manifest.json'
SOURCE=pathlib.Path('/private/tmp/weft-g03-ordinary-module'); RUNTIME=ROOT/'runtime'
STAGE=INPUTS/'source-custody/git-stage-roster.txt'; CUSTODY=INPUTS/'source-custody/custody.json'
BASE_SIZE=INPUTS/'evidence/base-image-cache-size.json'; TABLE_FAIL=pathlib.Path('/private/tmp/g03-final-table-operations-operator-006/runs/8889e3fec54a40fabf65bab425a7d688/operator-result.json')
TABLE_FAIL_COPY=INPUTS/'evidence/table006-failure.json'; ACCEPTED_PLAN=INPUTS/'evidence/locked-cargo-cache-plan001.md'
ACQ003_RUN=pathlib.Path('/private/tmp/g03-linux-locked-cargo-cache-operator-003/runs/2c527cb8c89640ecb060291e62e07505')
ACQ003_FAIL_ORIGINAL=ACQ003_RUN/'operator-result.json'
ACQ003_FAIL_COPY=INPUTS/'evidence/acquisition003-failure.json'; ACQ003_FAIL_SHA='efed283137531214b65ba5f1923e78057065795cb52f884cd33ec305c075753d'
ACQ003_PUBLIC_FILES=INPUTS/'evidence/acquisition003-public-files'
SIZE_PROBE=INPUTS/'evidence/base-cache-size-probe-001'; SIZE_PROBE_RESULT=SIZE_PROBE/'result.json'; SIZE_PROBE_RESULT_SHA='ac6c83816ee2e1f121ca198954aaa1582359c773fda1f3fc2f20920fda7789a4'
SIZE_PROBE_PLAN=INPUTS/'evidence/locked-cargo-cache-measurement004-sol-plan001.md'; SIZE_PROBE_PLAN_SHA='5977fdf9add3b22061f46f96626ceb498fef5715e2d5aa01e8cbfc5bad5da8d4'
SIZE_PROBE_FILES={'probe.py':('94959758ac9bb3ae2651f7cff5e3b50903c788bddf6c82f1aaccf101f7af0189',1159),'stdout.log':('421056e6c0b0f80d44de3fef32c732cdae4864f310e3c7ce4cb6b9a0a5a2ccf2',617),'stderr.log':('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',0)}
ACQ004_RUN=pathlib.Path('/private/tmp/g03-linux-locked-cargo-cache-operator-004/runs/61e5dc7b24d74037ae9eedb337e8fdfa')
ACQ004_FAIL=ACQ004_RUN/'operator-result.json'; ACQ004_FAIL_COPY=INPUTS/'evidence/acquisition004-failure.json'
ACQ004_FAIL_SHA='8370d280127155d68a3afc500658c6603172b570b8eea8d5c601290c76f7da23'
ACQ004_PUBLIC_FILES=INPUTS/'evidence/acquisition004-public-files'
MARKER_PROBE=INPUTS/'evidence/registry-marker-probe-001'; MARKER_PLAN=INPUTS/'evidence/locked-cargo-cache-marker005-sol-plan001.md'
MARKER_SHA='6d9d1d216e0f83abc5e5662ca62c92b4f23009466b54fa27321a69acdb778bb2'; MARKER_SIZE=177; MARKER_MODE=0o644
MARKER_PROBE_FILES={'probe.py':('9e6e4993fc76db14dd7b022d4fab3d47536812066ec877f22f05b127a418c77b',634),'stdout.log':('e5a34b17a0eced564279292fb77b43717a4136c9b364660de3c5646eb6dbaa82',654),'stderr.log':('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',0)}
ACQ005_SOURCE=INPUTS/'evidence/acquisition005-source'; ACQ005_SOURCE_MANIFEST=ACQ005_SOURCE/'integrity-manifest.json'
ACQ005_FAIL_COPY=INPUTS/'evidence/acquisition005-failure.json'; ACQ005_FAIL_SHA='fcae012d41c551a46d3bae40518342b53844d2c7cc9091f2a9ee92d0d34d6f8e'
ACQ005_MANIFEST_SHA='90db5d0b3156fb2de64661d5f66bcc0e0125d016a9b13ee298e2bbd809099224'
BUILDER='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
SOURCE_COMMIT='973d864c8d26b2bc173a411eac8368da5efc1ab3'; SOURCE_TREE='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff'
STAGE_SHA='bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b'; STAGE_BYTES=780359
CUSTODY_SHA='e936a962be023654bd045cafa1f02d664e06e4c6bd6f686e4441f8558e027621'
TABLE_FAIL_SHA='16fcee1c1ee2c3c6071541614defdf551dec9259c083a0c8a6ef8be55d6b23b4'
BASE_SIZE_SHA='b1e9b93d3212493cd847d2c645efa5186417dde5eacbda8224e6f9b9c501dc16'
PLAN_SHA='a6d7e4c9003a0d5e6c5de898fe7db7f50d4994275f462d9a0c875d0c849b9737'
CAPTURE=RUNTIME/'bounded_capture.py'; CAPTURE_SHA='acc1a03387d2eeeac3b06b6d6cdb3c5a477073f6aa4eeea53c55c7996c38b1b0'
OUTPUT_ROOT=ROOT/'runs'; TOTAL=600; TERMINAL=60; WORK_DEADLINE_SECONDS=TOTAL-TERMINAL; FETCH_MAX=480; GRACE=10; FETCH_ACTIVE=FETCH_MAX-GRACE
LOG_CAP=1024*1024; EVIDENCE_CAP=8*1024*1024; PER_PUBLIC=1024*1024; OUTER_STREAM=128*1024; OUTER_TOTAL=256*1024
CACHE_CAP=240*1024*1024; SCRATCH_CAP=CACHE_CAP; SCRATCH_ENTRIES=100000; ARCHIVE_CAP=256*1024*1024; FILE_CAP=64*1024*1024; SOURCE_CAP=1024*1024*1024; SOURCE_FILE_CAP=64*1024*1024; INVENTORY_CAP=5*1024*1024; ARCHIVE_MEMBER_CAP=100000; INDEX_FILE_CAP=4*1024*1024
FETCH_COMMAND=['cargo','fetch','--locked','--manifest-path','/workspace/Cargo.toml']
RUNID=''; START=0.0; DEADLINE=0.0; OUTPUT=None; META=[]; LOG_BYTES=0; CAPTURE_HELPER=None; CLEANUP_MODE=False


def fail(s):raise RuntimeError(s)
def sha_bytes(b:bytes):return hashlib.sha256(b).hexdigest()
def compact(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def work_guard(finalizing=False):
    if START:
        limit=DEADLINE if finalizing or CLEANUP_MODE else START+WORK_DEADLINE_SECONDS
        if time.monotonic()>=limit:fail('original aggregate wall-clock bound reached')

def bounded_read(path:pathlib.Path,cap:int):
    work_guard(finalizing=CLEANUP_MODE)
    if path.is_symlink() or not path.is_file():fail('bounded read requires a regular nonsymlink file: '+str(path))
    before=path.lstat()
    if before.st_size>cap:fail('bounded input exceeds cap: '+str(path))
    with path.open('rb') as f:raw=f.read(cap+1)
    after=path.lstat()
    if len(raw)>cap or len(raw)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode))!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)):
        fail('bounded file changed or exceeded cap while reading: '+str(path))
    work_guard(finalizing=CLEANUP_MODE)
    return raw

def bounded_json(path:pathlib.Path,cap:int):
    try:return json.loads(bounded_read(path,cap))
    except (ValueError,UnicodeDecodeError) as exc:fail('bounded JSON input is invalid: '+str(path)+': '+str(exc))
def safe_rel(s):
    p=pathlib.PurePosixPath(s or '')
    return isinstance(s,str) and bool(s) and not p.is_absolute() and p.as_posix()==s and not any(x in ('','.','..') for x in p.parts) and '\\' not in s

def hash_stable(path:pathlib.Path,cap:int):
    work_guard(finalizing=CLEANUP_MODE)
    if path.is_symlink() or not path.is_file():fail('not a regular file: '+str(path))
    before=path.lstat()
    if before.st_size>cap:fail('file exceeds declared cap: '+str(path))
    sha=hashlib.sha256();blob=hashlib.sha1();blob.update(b'blob '+str(before.st_size).encode()+b'\0');n=0
    with path.open('rb') as f:
        for b in iter(lambda:f.read(65536),b''):
            work_guard(finalizing=CLEANUP_MODE)
            n+=len(b)
            if n>cap:fail('file grew beyond cap: '+str(path))
            sha.update(b);blob.update(b)
    after=path.lstat()
    if n!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode))!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)):
        fail('file changed during physical hash: '+str(path))
    work_guard(finalizing=CLEANUP_MODE)
    return sha.hexdigest(),blob.hexdigest(),n,stat.S_IMODE(before.st_mode)

def parse_stage(packet):
    raw=bounded_read(STAGE,STAGE_BYTES)
    if len(raw)!=STAGE_BYTES or sha_bytes(raw)!=STAGE_SHA:fail('retained P56 stage-roster input pin mismatch')
    if raw.endswith(b'\n') or b'\r' in raw or b'\x00' in raw:fail('retained stage-roster line-ending shape changed')
    lines=raw.split(b'\n')
    if len(lines)!=5901 or any(not line for line in lines):fail('retained stage-roster row count/empty line differs')
    rx=re.compile(rb'(100644|100755) ([0-9a-f]{40}) 0\t([^\t\\\x00-\x1f\x7f]+)')
    out={};previous=None
    for line in lines:
        work_guard()
        m=rx.fullmatch(line)
        if not m:fail('stage row outside closed stage-0 grammar')
        mode,blob,path=m.groups();rel=path.decode('utf-8','strict')
        if not safe_rel(rel) or any(ord(c)<32 or ord(c)==127 for c in rel):fail('noncanonical or unsafe stage path')
        if previous is not None and path<=previous:fail('stage path roster is not byte-sorted and unique')
        previous=path;out[rel]={'mode':mode.decode(),'blob':blob.decode()}
    if len(out)!=5901:fail('stage row count does not close')
    custody_raw=bounded_read(CUSTODY,1024)
    if len(custody_raw)!=619 or sha_bytes(custody_raw)!=CUSTODY_SHA:fail('root custody metadata pin mismatch')
    custody=json.loads(custody_raw)
    want={'gitStageRosterSha256':STAGE_SHA,'producerCommit':SOURCE_COMMIT,'producerTree':SOURCE_TREE,'profile':'g03.macos-source-roster-custody/1',
      'scope':'Root readonly metadata capture; exact original build002 source digest closure, no product/tool execution.','selectedInputCount':1459,
      'selectedInputRosterSha256':'6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2','sourceRoot':str(SOURCE),'status':'','trackedCount':5901}
    if custody!=want:fail('root source custody schema/identity differs')
    return out

def quoted_field(block,key):
    m=re.search(r'^'+re.escape(key)+r' = "([^"\\]*(?:\\.[^"\\]*)*)"$',block,re.M)
    return m.group(1) if m else None

def parse_lock(packet):
    p=SOURCE/'Cargo.lock';raw=bounded_read(p,28742);text=raw.decode('utf-8','strict')
    version=re.search(r'(?m)^version = ([0-9]+)$',text)
    if not version or int(version.group(1))!=4:fail('Cargo.lock format version mismatch')
    blocks=re.findall(r'(?ms)^\[\[package\]\]\n(.*?)(?=^\[\[package\]\]|\Z)',text)
    registry=[];local=[];seen=set()
    for block in blocks:
        name=quoted_field(block,'name');ver=quoted_field(block,'version');source=quoted_field(block,'source');checksum=quoted_field(block,'checksum')
        if not name or not ver:fail('Cargo.lock package row lacks name/version')
        if source is None:local.append({'name':name,'version':ver})
        elif source=='registry+https://github.com/rust-lang/crates.io-index' and checksum and re.fullmatch(r'[0-9a-f]{64}',checksum):
            if (name,ver) in seen:fail('duplicate registry package in lock')
            seen.add((name,ver));registry.append({'name':name,'version':ver,'checksumSha256':checksum,'source':source})
        else:fail('Cargo.lock has a nonstandard/unexplained Git/path/network source: '+str(source))
    registry.sort(key=lambda x:(x['name'],x['version']));local.sort(key=lambda x:(x['name'],x['version']))
    c=packet['cargoLock']
    if (registry!=c['registryPackages'] or len(registry)!=c['registryPackageCount'] or
      local!=sorted(c['localWorkspacePackages']+[{'name':x['name'],'version':x['version']} for x in c['pathPackages']],key=lambda x:(x['name'],x['version'])) or
      len(local)!=c['localWorkspacePackageCount']+c['pathPackageCount']):fail('physical Cargo.lock package/source roster differs from packet')
    if sha_bytes(compact(registry))!=c['registryPackageRosterSha256'] or sha_bytes(compact(c['localWorkspacePackages']))!=c['localWorkspaceRosterSha256'] or sha_bytes(compact(c['pathPackages']))!=c['pathPackageRosterSha256']:
        fail('Cargo.lock roster digest differs')
    return raw,registry,local

def verify_source(packet,stage):
    cfg=packet['source'];lock_cfg=cfg['cargoLock'];manifest_cfg=cfg['cargoManifest'];config_cfg=cfg['cargoConfig']
    for spec in (manifest_cfg,lock_cfg,config_cfg):
        if not safe_rel(spec['path']):fail('unsafe source metadata path')
        h,_,n,_=hash_stable(SOURCE/spec['path'],SOURCE_FILE_CAP)
        if (h,n)!=(spec['sha256'],spec['sizeBytes']):fail('Cargo source metadata hash/size mismatch: '+spec['path'])
    lock_raw,registry,local=parse_lock(packet)
    selected_spec=cfg['sourceInputs'];selected_path=INPUTS/selected_spec['path']
    selected_raw=bounded_read(selected_path,selected_spec['sizeBytes'])
    if len(selected_raw)!=selected_spec['sizeBytes'] or sha_bytes(selected_raw)!=selected_spec['sha256']:fail('original selected-source roster pin mismatch')
    selected=json.loads(selected_raw)
    if not isinstance(selected,list) or len(selected)!=selected_spec['rowCount'] or selected!=sorted(selected,key=lambda x:x.get('path','')):fail('selected-source roster schema/order differs')
    selected_by={}
    for item in selected:
        if set(item)!={'path','bytes','sha256'} or not safe_rel(item['path']) or type(item['bytes']) is not int or item['bytes']<0 or not re.fullmatch(r'[0-9a-f]{64}',item['sha256']):fail('selected-source row outside closed roster schema')
        if item['path'] not in stage or item['path'] in selected_by:fail('selected-source row not unique within tracked stage')
        selected_by[item['path']]=item
    rows=[];total=0;prev=''
    for rel,item in stage.items():
        if rel<=prev:fail('stage iteration order mismatch')
        prev=rel;p=SOURCE/rel;ancestor=p.parent
        while ancestor!=SOURCE:
            if ancestor.is_symlink() or not ancestor.is_dir():fail('source ancestor not a real directory: '+rel)
            ancestor=ancestor.parent
        h,blob,n,mode=hash_stable(p,SOURCE_FILE_CAP)
        if mode!={'100644':0o644,'100755':0o755}[item['mode']] or blob!=item['blob']:fail('physical source differs from stage mode/blob: '+rel)
        selected_item=selected_by.get(rel)
        if selected_item is not None and (selected_item['bytes']!=n or selected_item['sha256']!=h):fail('physical selected source differs from original 1459-row roster: '+rel)
        rows.append([rel,n,h,mode]);total+=n
        if total>SOURCE_CAP:fail('source bytes exceed original cap')
    if len(rows)!=5901 or total!=860543639:fail('P56 source count/total differs')
    return {'profile':'g03.locked-cargo-source-closure/1','commit':SOURCE_COMMIT,'tree':SOURCE_TREE,'stageRosterSha256':STAGE_SHA,
      'stageRosterBytes':STAGE_BYTES,'fileCount':len(rows),'totalBytes':total,'rosterSha256':sha_bytes(compact(rows)),
      'cargoManifestSha256':manifest_cfg['sha256'],'cargoLockSha256':lock_cfg['sha256'],'cargoConfigSha256':config_cfg['sha256'],
      'selectedSourceRosterSha256':selected_spec['sha256'],'selectedSourceRowCount':len(selected_by),
      'registryPackageCount':len(registry),'localPackageCount':len(local)}

def atomic_json(path:pathlib.Path,value,cap=PER_PUBLIC):
    work_guard(finalizing=CLEANUP_MODE)
    raw=json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()+b'\n'
    if len(raw)>cap:fail('JSON receipt exceeds declared per-file cap: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+'.tmp')
    fd=os.open(str(tmp),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'wb') as f:
            for at in range(0,len(raw),65536):work_guard(finalizing=CLEANUP_MODE);f.write(raw[at:at+65536])
            f.flush();os.fsync(f.fileno())
        work_guard(finalizing=CLEANUP_MODE)
        os.replace(tmp,path);dfd=os.open(str(path.parent),os.O_RDONLY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
    finally:
        try:tmp.unlink()
        except FileNotFoundError:pass
    work_guard(finalizing=CLEANUP_MODE)
    return sha_bytes(raw),len(raw)

def final_result_bytes(result,public_without_result):
    result['operatorResultBytes']=0;result['publicEvidenceBytes']=public_without_result
    for _ in range(8):
        work_guard(finalizing=True)
        raw=json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')+b'\n'
        if result['operatorResultBytes']==len(raw) and result['publicEvidenceBytes']==public_without_result+len(raw):return raw
        result['operatorResultBytes']=len(raw);result['publicEvidenceBytes']=public_without_result+len(raw)
    raw=json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')+b'\n'
    if result['operatorResultBytes']!=len(raw) or result['publicEvidenceBytes']!=public_without_result+len(raw):fail('terminal receipt size did not reach a stable fixed point')
    work_guard(finalizing=True)
    return raw

def promote_final_result(path,result,public_without_result):
    raw=final_result_bytes(result,public_without_result)
    if len(raw)>PER_PUBLIC or public_without_result+len(raw)>EVIDENCE_CAP:fail('inclusive public evidence/result cap exceeded')
    work_guard(finalizing=True)
    tmp=path.with_name(path.name+'.pending')
    if tmp.exists() or tmp.is_symlink():fail('terminal receipt promotion path is not fresh')
    fd=os.open(str(tmp),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'wb') as f:
            for at in range(0,len(raw),65536):work_guard(finalizing=True);f.write(raw[at:at+65536])
            f.flush();os.fsync(f.fileno())
        th,_,tn,_=hash_stable(tmp,PER_PUBLIC)
        if (tn,th)!=(len(raw),sha_bytes(raw)):fail('terminal receipt temporary physical hash mismatch')
        work_guard(finalizing=True)
        os.replace(tmp,path)
        dfd=os.open(str(path.parent),os.O_RDONLY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
        got=bounded_read(path,PER_PUBLIC);readback_hash=sha_bytes(got)
        if got!=raw or readback_hash!=sha_bytes(raw) or time.monotonic()>=DEADLINE:fail('terminal result physical hash/readback/deadline verification failed')
        return {'sizeBytes':len(raw),'sha256':readback_hash,'inclusivePublicBytes':public_without_result+len(raw)}
    finally:
        try:tmp.unlink()
        except FileNotFoundError:pass

def fail_result_receipt(path,result,public_without_result=0):
    result['status']='FAIL_OR_UNKNOWN'
    result.pop('operatorResultBytes',None)
    result['operatorResultBytes']=0;result['publicEvidenceBytes']=public_without_result
    for _ in range(8):
        raw=json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')+b'\n'
        if result['operatorResultBytes']==len(raw) and result['publicEvidenceBytes']==public_without_result+len(raw):break
        result['operatorResultBytes']=len(raw);result['publicEvidenceBytes']=public_without_result+len(raw)
    else:raw=b''
    if not raw or len(raw)>PER_PUBLIC or public_without_result+len(raw)>EVIDENCE_CAP:
        result={'profile':'g03.locked-cargo-cache-local-operator/1','executionId':RUNID,'status':'FAIL_OR_UNKNOWN',
          'executionPerformed':bool(result.get('executionPerformed')),'failure':'terminal fail receipt or inclusive public evidence cap closure failed',
          'operatorResultBytes':0,'publicEvidenceBytes':public_without_result}
        for _ in range(8):
            raw=json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')+b'\n'
            if result['operatorResultBytes']==len(raw) and result['publicEvidenceBytes']==public_without_result+len(raw):break
            result['operatorResultBytes']=len(raw);result['publicEvidenceBytes']=public_without_result+len(raw)
    if len(raw)>PER_PUBLIC:return
    tmp=path.with_name(path.name+'.failure')
    try:
        fd=os.open(str(tmp),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f:
            for at in range(0,len(raw),65536):f.write(raw[at:at+65536])
            f.flush();os.fsync(f.fileno())
        before=tmp.lstat();h=hashlib.sha256();n=0
        with tmp.open('rb') as f:
            while True:
                block=f.read(65536)
                if not block:break
                n+=len(block)
                if n>PER_PUBLIC:raise RuntimeError('failure receipt temporary exceeds cap')
                h.update(block)
        after=tmp.lstat()
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) or (h.hexdigest(),n)!=(sha_bytes(raw),len(raw)):raise RuntimeError('failure receipt temporary physical closure mismatch')
        os.replace(tmp,path);dfd=os.open(str(path.parent),os.O_RDONLY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
        before=path.lstat()
        if before.st_size>PER_PUBLIC:raise RuntimeError('failure receipt readback exceeds cap')
        with path.open('rb') as f:got=f.read(PER_PUBLIC+1)
        after=path.lstat()
        if got!=raw or len(got)!=len(raw) or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise RuntimeError('failure receipt readback mismatch')
    except BaseException:
        try:tmp.unlink()
        except BaseException:pass

def load_capture():
    global CAPTURE_HELPER
    h,_,_,_=hash_stable(CAPTURE,512*1024)
    if h!=CAPTURE_SHA:fail('pinned bounded-capture helper bytes mismatch')
    sys.dont_write_bytecode=True
    spec=importlib.util.spec_from_file_location('locked_cargo_bounded_capture',CAPTURE)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);CAPTURE_HELPER=mod

def append_log(path:pathlib.Path,data:bytes,cap:int):
    global LOG_BYTES
    if len(data)>cap or LOG_BYTES+len(data)>LOG_CAP:fail('raw command log cap exceeded')
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    h,_,n,_=hash_stable(path,cap);LOG_BYTES+=n
    return {'path':path.relative_to(OUTPUT).as_posix(),'sizeBytes':n,'sha256':h}

def control(argv,timeout=15,cap=64*1024):
    command_deadline=DEADLINE if CLEANUP_MODE else DEADLINE-TERMINAL
    if time.monotonic()>=command_deadline:fail('control command deadline reached')
    start=time.monotonic();effective_timeout=min(timeout,command_deadline-start);env={k:os.environ[k] for k in ('PATH','HOME','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CERT_PATH','DOCKER_TLS_VERIFY') if k in os.environ}
    timed_out=False;return_code=None
    try:
        cp=subprocess.run(argv,cwd=str(ROOT),env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=effective_timeout,check=False)
        out=cp.stdout or b'';err=cp.stderr or b'';return_code=cp.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out=True;out=exc.stdout or b'';err=exc.stderr or b''
        if isinstance(out,str):out=out.encode('utf-8','replace')
        if isinstance(err,str):err=err.encode('utf-8','replace')
    end=time.monotonic();raw_out=out;raw_err=err;remaining=max(0,LOG_CAP-LOG_BYTES)
    kept_out=out[:min(cap,remaining)];remaining-=len(kept_out);kept_err=err[:min(cap,remaining)]
    truncated=[len(kept_out)!=len(out),len(kept_err)!=len(err)]
    seq=len(META);stdout=append_log(OUTPUT/'logs'/f'metadata-{seq:04d}.stdout.log',kept_out,cap);stderr=append_log(OUTPUT/'logs'/f'metadata-{seq:04d}.stderr.log',kept_err,cap)
    row={'argv':argv,'cwd':str(ROOT),'environmentKeys':sorted(env),'startMonotonic':start,'endMonotonic':end,'elapsedSeconds':round(end-start,6),
      'timeoutSeconds':round(effective_timeout,3),'exitCode':return_code,'timedOut':timed_out,'captureComplete':not timed_out and not any(truncated),'streamsEOF':[not timed_out,not timed_out],
      'truncated':truncated,'stdout':kept_out.decode('utf-8','replace'),'stderr':kept_err.decode('utf-8','replace'),
      'stdoutBytes':len(kept_out),'stdoutRawBytes':len(raw_out),'stdoutSha256':sha_bytes(raw_out),'stderrBytes':len(kept_err),'stderrRawBytes':len(raw_err),'stderrSha256':sha_bytes(raw_err),
      'physicalCaptureFiles':[stdout,stderr]}
    META.append(row)
    if timed_out:fail('bounded host metadata command timed out: '+argv[0])
    if any(truncated):fail('bounded host metadata output exceeded per-stream cap: '+argv[0])
    if return_code!=0:fail('bounded host metadata command failed: '+argv[0])
    return raw_out.decode('utf-8','strict')

def host_source_identity():
    base=['git','-C',str(SOURCE)];v={}
    for key,args in [('commit',['rev-parse','HEAD']),('tree',['rev-parse','HEAD^{tree}']),('status',['status','--porcelain'])]:
        v[key]=control(base+args,12,1024).strip()
    if v!={'commit':SOURCE_COMMIT,'tree':SOURCE_TREE,'status':''}:fail('bounded host Git source identity/clean state differs from P56')
    return {'basis':'bounded_host_git_metadata','commit':v['commit'],'tree':v['tree'],'status':v['status']}

def verify_prior_acquisition004():
    if sha_bytes(bounded_read(ACQ004_FAIL,PER_PUBLIC))!=ACQ004_FAIL_SHA or sha_bytes(bounded_read(ACQ004_FAIL_COPY,PER_PUBLIC))!=ACQ004_FAIL_SHA:
        fail('preserved acquisition004 failure receipt changed')
    prior=bounded_json(ACQ004_FAIL_COPY,PER_PUBLIC)
    if prior.get('status')!='FAIL_OR_UNKNOWN' or prior.get('executionPerformed') is not True or prior.get('containerCommand',{}).get('exitCode')!=1 or prior.get('cleanup',{}).get('verified') is not True:
        fail('acquisition004 failure/fetch/cleanup provenance differs')
    rows=prior.get('publicFiles',[])
    if len(rows)!=41 or rows!=sorted(rows,key=lambda x:x.get('path','')):fail('acquisition004 public output roster is incomplete/noncanonical')
    seen=set(); total=0
    for row in rows:
        work_guard()
        if set(row)!={'class','mode','path','sha256','sizeBytes'} or not safe_rel(row.get('path')) or row['path'] in seen or type(row['sizeBytes']) is not int or not 0<=row['sizeBytes']<=PER_PUBLIC:
            fail('acquisition004 public output row is outside closed schema')
        seen.add(row['path']); original=ACQ004_RUN/row['path']; copy=ACQ004_PUBLIC_FILES/row['path']
        for path in (original,copy):
            h,_,n,mode=hash_stable(path,PER_PUBLIC)
            if (h,n,mode)!=(row['sha256'],row['sizeBytes'],row['mode']):fail('acquisition004 retained output differs: '+row['path'])
        total+=row['sizeBytes']
    if total!=prior.get('publicEvidenceBytesExcludingResult'):fail('acquisition004 public evidence byte total differs')
    return prior

def verify_prior_acquisition005_source():
    raw=bounded_read(ACQ005_SOURCE_MANIFEST,4*1024*1024)
    if sha_bytes(raw)!=ACQ005_MANIFEST_SHA:fail('preserved005 source manifest hash differs')
    m=json.loads(raw)
    if m.get('status')!='FROZEN_SOURCE_ONLY_NOT_EXECUTED' or m.get('executionPerformed') is not False or m.get('testsPerformed') is not False or m.get('gitMutation') is not False or m.get('fileCount')!=108 or m.get('totalBytes')!=1407151:
        fail('preserved005 manifest state/size differs')
    seen=set();total=0
    for row in m.get('files',[]):
        work_guard();rel=row.get('path')
        if not safe_rel(rel) or rel in seen or type(row.get('sizeBytes')) is not int:fail('preserved005 manifest row malformed')
        seen.add(rel);p=ACQ005_SOURCE/rel;h,_,n,mode=hash_stable(p,row['sizeBytes'])
        if (h,n,mode)!=(row.get('sha256'),row['sizeBytes'],row.get('mode')):fail('preserved005 source preimage differs: '+rel)
        total+=n
    if len(seen)!=108 or total!=1407151:fail('preserved005 source roster count/bytes differ')
    return {'manifestSha256':ACQ005_MANIFEST_SHA,'fileCount':len(seen),'totalBytes':total}

def verify_frozen_manifest(expected,owned):
    h,_,_,_=hash_stable(MANIFEST,4*1024*1024)
    if h!=expected:fail('source manifest caller pin mismatch')
    m=json.loads(bounded_read(MANIFEST,4*1024*1024))
    if (m.get('status')!='FROZEN_SOURCE_ONLY_NOT_EXECUTED' or m.get('executionPerformed') is not False or m.get('testsPerformed') is not False or m.get('gitMutation') is not False):fail('manifest state is not frozen source-only')
    seen=set();total=0
    for row in m.get('files',[]):
        work_guard()
        rel=row.get('path')
        if not safe_rel(rel) or rel in seen or rel=='integrity-manifest.json':fail('manifest has unsafe/duplicate path')
        seen.add(rel);p=ROOT/rel;f,_,n,mode=hash_stable(p,int(row.get('sizeBytes',-1)))
        if (f,n,mode)!=(row.get('sha256'),row.get('sizeBytes'),row.get('mode')):fail('frozen source file pin/mode mismatch: '+rel)
        total+=n
    actual=[]
    for base,dirs,files in os.walk(ROOT,followlinks=False):
        work_guard()
        bp=pathlib.Path(base)
        if bp==owned:dirs[:]=[];continue
        if any((bp/d).is_symlink() for d in dirs):fail('operator source tree has a symlink directory')
        for name in files:
            p=bp/name
            if p.is_symlink() or not stat.S_ISREG(p.lstat().st_mode):fail('operator package has unsafe file')
            if p!=MANIFEST:actual.append(p.relative_to(ROOT).as_posix())
    if sorted(actual)!=sorted(seen) or total!=m.get('totalBytes') or len(seen)!=m.get('fileCount'):fail('operator source freeze roster/count/total mismatch')
    return {'sha256':h,'fileCount':len(seen),'totalBytes':total,'status':m['status']}

def sparse_index_path(name):
    n=name.lower()
    if len(n)==1:return '1/'+n
    if len(n)==2:return '2/'+n
    if len(n)==3:return '3/'+n[0]+'/'+n
    return n[:2]+'/'+n[2:4]+'/'+n

def parse_sparse_index(raw,expected_name):
    if len(raw)>4*1024*1024 or not raw.startswith(b'\x03\x02\x00\x00\x00'):fail('sparse index cache entry header/size invalid')
    pos=5
    def field():
        nonlocal pos
        end=raw.find(b'\0',pos)
        if end<0:fail('sparse index cache has unterminated field')
        value=raw[pos:end];pos=end+1;return value
    tag=field()
    if not tag.startswith(b'etag: ') or len(tag)>4096:fail('sparse index cache etag field invalid')
    records={}
    while pos<len(raw):
        work_guard()
        version=field().decode('utf-8','strict');record_raw=field()
        try:record=json.loads(record_raw)
        except (ValueError,UnicodeDecodeError) as exc:fail('sparse index package record is invalid: '+str(exc))
        if not isinstance(record,dict) or record.get('name')!=expected_name or record.get('vers')!=version or not re.fullmatch(r'[0-9a-f]{64}',record.get('cksum','')):
            fail('sparse index version/name/checksum fields do not close')
        if version in records:fail('duplicate sparse index package version')
        records[version]={'checksumSha256':record['cksum'],'recordSha256':sha_bytes(record_raw),'recordBytes':len(record_raw)}
    return records

def verify_archive(packet,guest_report,out):
    work_guard()
    invinfo=guest_report['inventory'];idx_path=out/'evidence/inventory-index.json'
    idx_raw=bounded_read(idx_path,PER_PUBLIC);ih=sha_bytes(idx_raw);idx=json.loads(idx_raw)
    if ih!=invinfo['indexSha256'] or idx.get('profile')!='g03.locked-cargo-cache-inventory-index/1' or idx.get('chunkRows')!=1000:fail('inventory index pin/profile mismatch')
    if not isinstance(idx.get('chunks'),list) or len(idx['chunks'])>100:fail('inventory chunk count exceeds closed bound')
    rows=[];chunk_bytes=0
    for i,ch in enumerate(idx['chunks']):
        work_guard()
        want=f'evidence/inventory-chunks/inventory-{i:04d}.json'
        if ch.get('path')!=want:fail('inventory chunk path/order mismatch')
        raw=bounded_read(out/want,PER_PUBLIC);h=sha_bytes(raw);n=len(raw)
        if (h,n)!=(ch.get('sha256'),ch.get('sizeBytes')):fail('inventory chunk physical digest mismatch')
        doc=json.loads(raw);batch=doc.get('rows')
        if (doc.get('profile')!='g03.locked-cargo-cache-inventory-chunk/1' or doc.get('chunkIndex')!=i or not isinstance(batch,list) or len(batch)!=ch.get('rowCount') or len(batch)>1000):fail('inventory chunk schema/count mismatch')
        if not batch or doc.get('firstPath')!=batch[0]['path'] or doc.get('lastPath')!=batch[-1]['path']:fail('inventory chunk boundary mismatch')
        rows.extend(batch);chunk_bytes+=n
    if (chunk_bytes!=idx.get('totalChunkBytes') or chunk_bytes>INVENTORY_CAP or len(rows)!=idx.get('rowCount') or sha_bytes(compact(rows))!=idx.get('rowsSha256') or len(rows)>ARCHIVE_MEMBER_CAP):fail('complete cache inventory digest/count/cap mismatch')
    paths=[r.get('path') for r in rows]
    if paths!=sorted(paths) or len(paths)!=len(set(paths)):fail('cache inventory paths are not sorted and unique')
    expected_roots={'registry/cache','registry/index'}
    for row in rows:
        if set(row)!={'path','kind','sizeBytes','sha256','mode'} or not safe_rel(row['path']):fail('cache inventory row is outside closed schema')
        path=row['path'];root=path.split('/')[0:2];root_name='/'.join(root)
        is_root=path in expected_roots
        if root_name not in expected_roots or (not is_root and not path.startswith(root_name+'/')):fail('cache inventory path escapes the two closed roots')
        if row['kind']=='directory':
            if row['sizeBytes']!=0 or row['sha256'] is not None or type(row['mode']) is not int or row['mode']&0o022:fail('directory inventory row malformed/unsafe')
        elif row['kind']=='file':
            if is_root or type(row['sizeBytes']) is not int or row['sizeBytes']<0 or row['sizeBytes']>FILE_CAP or not re.fullmatch(r'[0-9a-f]{64}',row['sha256'] or '') or type(row['mode']) is not int or row['mode']&0o022:fail('file inventory row malformed/unsafe')
        else:fail('unknown cache inventory entry kind')
    root_rows={r['path']:r for r in rows if r['path'] in expected_roots}
    if set(root_rows)!=expected_roots or any(r['kind']!='directory' for r in root_rows.values()):fail('the exact cache/index root directory rows are required')
    file_rows=[r for r in rows if r['kind']=='file'];total=sum(r['sizeBytes'] for r in file_rows)
    if total!=invinfo['fileContentBytes'] or total>CACHE_CAP:fail('registry file content exceeds declared cache cap')
    roots={r['path'].split('/')[2] for r in rows if r['path'].startswith('registry/index/')}
    if len(roots)!=1:fail('registry index root count is not exactly one crates.io registry')
    index_root=next(iter(roots))
    if not index_root.startswith('index.crates.io-'):fail('sparse index directory is not Cargo crates.io identity')
    config_path=f'registry/index/{index_root}/config.json';configs=[r for r in file_rows if r['path']==config_path]
    if len(configs)!=1:fail('public sparse registry config.json is absent/duplicated')
    for row in file_rows:
        p=row['path']
        if p.startswith('registry/cache/') and not p.endswith('.crate'):fail('registry cache contains a non-.crate file')
        if p.startswith(f'registry/index/{index_root}/'):
            rel=p[len(f'registry/index/{index_root}/'):]
            if rel!='config.json' and not rel.startswith('.cache/'):fail('registry index contains a file outside public sparse metadata')
    archive_info=invinfo.get('archive',{})
    if set(archive_info)!={'path','sizeBytes','sha256','mode'} or archive_info.get('path')!='software/cargo-registry.tar' or type(archive_info.get('sizeBytes')) is not int or not (0<archive_info['sizeBytes']<=ARCHIVE_CAP) or not re.fullmatch(r'[0-9a-f]{64}',archive_info.get('sha256','')) or type(archive_info.get('mode')) is not int or archive_info['mode']&0o022:fail('archive path/declared cap/schema/mode differs')
    arch=out/'software/cargo-registry.tar';ah,_,an,archive_mode=hash_stable(arch,ARCHIVE_CAP)
    if archive_mode!=archive_info['mode']:fail('archive physical mode differs from guest receipt')
    if (ah,an)!=(archive_info['sha256'],archive_info['sizeBytes']):fail('archive pre-open hash/size mismatch')
    registry=packet['cargoLock']['registryPackages'];lock_archives={x['name']+'-'+x['version']+'.crate':x for x in registry}
    cache_files={pathlib.PurePosixPath(r['path']).name:r for r in file_rows if r['path'].startswith('registry/cache/')}
    base_roster=guest_report['baseImageSeed']['baseCrateArchiveRoster'];base_by={pathlib.PurePosixPath(x['path']).name:x for x in base_roster}
    if sha_bytes(compact(base_roster))!=guest_report['baseImageSeed']['baseCrateArchiveRosterSha256']:fail('base crate seed roster digest mismatch')
    checks=[]
    for filename,pkg in lock_archives.items():
        row=cache_files.get(filename)
        if not row or row['sha256']!=pkg['checksumSha256']:fail('locked .crate bytes absent or checksum mismatch: '+filename)
        checks.append({'name':pkg['name'],'version':pkg['version'],'archivePath':row['path'],'sizeBytes':row['sizeBytes'],'sha256':row['sha256']})
    if checks!=guest_report.get('lockedCrateChecks') or len(checks)!=len(registry):fail('guest locked crate verification receipt differs')
    expected_index_paths={f'registry/index/{index_root}/.cache/{sparse_index_path(x["name"])}' for x in registry}
    index_file_rows={r['path']:r for r in file_rows if r['path'].startswith(f'registry/index/{index_root}/.cache/')}
    if not expected_index_paths.issubset(index_file_rows):fail('one or more canonical sparse index cache files are absent')
    witnesses=[];config_raw=None;seen_index={}
    with tarfile.open(arch,'r:') as tf:
        members=[]
        for member in tf:
            work_guard();members.append(member)
            if len(members)>ARCHIVE_MEMBER_CAP:fail('archive member count exceeds hard bound')
        if len(members)>ARCHIVE_MEMBER_CAP or [m.name.rstrip('/') for m in members]!=paths:fail('software archive member count/order/path roster differs')
        member_map={m.name.rstrip('/'):m for m in members}
        if len(member_map)!=len(members):fail('software archive has duplicate members')
        expanded=0
        for row in rows:
            work_guard();m=member_map[row['path']]
            if m.name not in (row['path'],row['path']+'/') or (m.uid,m.gid,m.mtime)!=(0,0,0) or m.uname not in ('',None) or m.gname not in ('',None) or stat.S_IMODE(m.mode)!=row['mode']:fail('archive metadata is not deterministic/normalized: '+row['path'])
            if row['kind']=='directory':
                if not m.isdir() or m.size not in (0,None):fail('archive directory type/size mismatch')
                continue
            if not m.isfile() or m.size!=row['sizeBytes'] or m.size>FILE_CAP:fail('archive member type/size mismatch')
            expanded+=m.size
            if expanded>CACHE_CAP:fail('archive expanded file content exceeds cache cap')
            f=tf.extractfile(m)
            if f is None:fail('archive file has no data: '+m.name)
            capture_cap=1024*1024 if row['path']==config_path else (4*1024*1024 if row['path'] in expected_index_paths else 0)
            captured=bytearray() if capture_cap else None
            h=hashlib.sha256();n=0
            while True:
                work_guard();b=f.read(65536)
                if not b:break
                n+=len(b)
                if n>row['sizeBytes']:fail('archive member streamed beyond its declared size')
                h.update(b)
                if captured is not None:
                    if len(captured)+len(b)>capture_cap:fail('sparse-index/config witness file exceeds bounded parser cap')
                    captured.extend(b)
            if (h.hexdigest(),n)!=(row['sha256'],row['sizeBytes']):fail('archive member content differs from inventory: '+m.name)
            if row['path']==config_path:config_raw=bytes(captured)
            elif row['path'] in expected_index_paths:seen_index[row['path']]=parse_sparse_index(bytes(captured),next(x['name'] for x in registry if row['path']==f'registry/index/{index_root}/.cache/{sparse_index_path(x["name"])}'))
    if config_raw is None:fail('sparse registry config bytes were not read')
    cfg=json.loads(config_raw)
    if set(cfg)-{'dl','api','auth-required'} or cfg.get('auth-required',False):fail('registry index config has auth/unknown fields')
    dl=cfg.get('dl','');u=re.match(r'^https://static\.crates\.io/crates(?:/|$)',dl)
    if not u:fail('registry download host is outside static.crates.io')
    lock_by_name={}
    for pkg in registry:lock_by_name.setdefault(pkg['name'],[]).append(pkg)
    for name,packages in sorted(lock_by_name.items()):
        ipath=f'registry/index/{index_root}/.cache/{sparse_index_path(name)}';records=seen_index.get(ipath)
        if records is None:fail('locked package sparse-index witness absent: '+name)
        for pkg in sorted(packages,key=lambda x:x['version']):
            item=records.get(pkg['version'])
            if not item or item['checksumSha256']!=pkg['checksumSha256']:fail('sparse-index witness version/checksum mismatch: '+name+' '+pkg['version'])
            witnesses.append({'name':name,'version':pkg['version'],'path':ipath,'checksumSha256':item['checksumSha256'],'recordSha256':item['recordSha256'],'recordBytes':item['recordBytes'],'cacheFileSha256':index_file_rows[ipath]['sha256']})
    if len(witnesses)!=len(registry) or witnesses!=guest_report.get('sparseIndexWitnesses'):fail('115 guest sparse-index witnesses differ from archived cache bytes')
    for filename,row in cache_files.items():
        if filename not in lock_archives and base_by.get(filename)!=row:fail('unlocked extra registry crate was not part of pinned base image seed: '+filename)
    if guest_report.get('networkSources',{}).get('registryConfig',{}).get('dl')!=dl:fail('captured registry source metadata differs from archive config')
    ah_after,_,an_after,_=hash_stable(arch,ARCHIVE_CAP)
    if (ah_after,an_after)!=(ah,an):fail('archive bytes changed during bounded member verification')
    return {'archiveSha256':ah,'archiveBytes':an,'inventoryRows':len(rows),'cacheContentBytes':total,
      'lockedCrateCount':len(checks),'sparseIndexWitnessCount':len(witnesses),'registryIndexConfig':cfg,'inventoryIndexSha256':ih,'inventoryChunkBytes':chunk_bytes}

def public_inventory(out):
    rows=[];public_total=0;software_total=0;log_total=0
    for base,dirs,files in os.walk(out,followlinks=False):
        bp=pathlib.Path(base)
        if any((bp/d).is_symlink() for d in dirs):fail('operator output contains symlink directory')
        for name in sorted(files):
            p=bp/name
            if p.is_symlink() or not stat.S_ISREG(p.lstat().st_mode):fail('operator output contains unsafe file')
            rel=p.relative_to(out).as_posix()
            if rel=='operator-result.json':continue
            archive_path='guest/software/cargo-registry.tar'
            if rel.startswith('guest/software/') and rel!=archive_path:fail('guest software subtree contains an unexpected file: '+rel)
            is_archive=rel==archive_path
            h,_,n,mode=hash_stable(p,ARCHIVE_CAP if is_archive else PER_PUBLIC)
            row={'path':rel,'sizeBytes':n,'sha256':h,'mode':mode}
            if is_archive:software_total+=n;row['class']='software-input'
            else:
                public_total+=n
                if '/logs/' in '/'+rel or rel.startswith('logs/'):log_total+=n;row['class']='raw-log'
                else:row['class']='public-evidence'
                if n>PER_PUBLIC:fail('public evidence file exceeds 1 MiB: '+rel)
            rows.append(row)
    if public_total>EVIDENCE_CAP:fail('public evidence exceeds inherited 8 MiB cap')
    if log_total>LOG_CAP:fail('raw logs exceed inherited aggregate 1 MiB cap')
    if software_total>ARCHIVE_CAP:fail('software archive output exceeds 256 MiB cap')
    if sum(1 for row in rows if row['class']=='software-input')>1:fail('more than one exact software archive file is present')
    return sorted(rows,key=lambda x:x['path']),public_total,software_total,log_total

def verify_capture_logs(capture_row,capture_attempted):
    errors=[];physical_total=0
    for row in META:
        work_guard(finalizing=True)
        captures=row.get('physicalCaptureFiles',[])
        if len(captures)!=2:errors.append('metadata capture lacks both physical stream files')
        for i,item in enumerate(captures):
            work_guard(finalizing=True)
            rel=item.get('path');p=OUTPUT/rel if isinstance(rel,str) and safe_rel(rel) else None
            if p is None or not re.fullmatch(r'logs/metadata-[0-9]{4}\.(stdout|stderr)\.log',rel or ''):errors.append('metadata capture has unsafe/unexpected physical path');continue
            try:
                cap=OUTER_STREAM if item.get('sizeBytes',0)>64*1024 else 64*1024
                h,_,n,_=hash_stable(p,cap)
                if (h,n)!=(item.get('sha256'),item.get('sizeBytes')):errors.append('metadata physical capture mismatch: '+rel)
                stream='stdout' if i==0 else 'stderr'
                if row.get('captureComplete') and (n!=row.get(stream+'Bytes') or h!=row.get(stream+'Sha256')):errors.append('metadata stream receipt differs from complete physical capture: '+rel)
                physical_total+=n
            except BaseException as exc:errors.append('metadata physical capture '+type(exc).__name__)
        if not row.get('captureComplete') or row.get('streamsEOF')!=[True,True] or any(row.get('truncated',[])):
            errors.append('metadata command capture incomplete: '+str(row.get('argv',['?'])[0]))
    outer_files=[]
    if capture_row:
        cap=capture_row.get('capture')
        if not isinstance(cap,dict):errors.append('outer process start capture attempt lacks capture record')
        else:
            try:
                expected_outer=[str(OUTPUT/'logs/cargo-fetch.stdout.log'),str(OUTPUT/'logs/cargo-fetch.stderr.log')]
                if cap.get('paths')!=expected_outer:errors.append('outer capture paths differ from the sole declared stream pair')
                retained=cap.get('retainedBytes');raw_counts=cap.get('rawBytes');raw_hashes=cap.get('rawSha256')
                if (not isinstance(retained,list) or len(retained)!=2 or any(type(x) is not int or x<0 or x>OUTER_STREAM for x in retained) or
                    sum(retained)>OUTER_TOTAL or cap.get('totalRetainedBytes')!=sum(retained)):
                    errors.append('outer retained byte accounting exceeds or differs from declared caps')
                if (not isinstance(raw_counts,list) or len(raw_counts)!=2 or not isinstance(raw_hashes,list) or len(raw_hashes)!=2 or
                    not isinstance(cap.get('truncated'),list) or len(cap['truncated'])!=2):
                    errors.append('outer raw stream accounting schema is incomplete')
                elif any(type(raw_counts[i]) is not int or raw_counts[i]<retained[i] or (not cap['truncated'][i] and raw_counts[i]!=retained[i]) for i in range(2)):
                    errors.append('outer raw and retained byte counts differ without declared truncation')
                current=CAPTURE_HELPER.verify_outer_capture(cap)
                if current!=capture_row.get('physicalClosure'):errors.append('outer physical closure changed after capture')
                if len(current.get('files',[]))!=2 or any(current.get('files',[])[i].get('sizeBytes')!=retained[i] for i in range(min(2,len(current.get('files',[]))))):
                    errors.append('outer physical files differ from retained stream records')
                for item in current.get('files',[]):
                    p=pathlib.Path(item['path']);h,_,n,_=hash_stable(p,OUTER_STREAM)
                    if (h,n)!=(item['sha256'],item['sizeBytes']):errors.append('outer capture physical hash changed')
                    physical_total+=n;outer_files.append(item)
                if not current.get('verified') or any(cap.get('truncated',[])) or cap.get('timedOut') or cap.get('drainExpired') or cap.get('captureFailed') or cap.get('streamsEOF')!=[True,True]:errors.append('outer process capture is incomplete')
            except BaseException as exc:errors.append('outer capture verification '+type(exc).__name__)
    elif not capture_attempted:
        pass
    else:errors.append('outer capture was attempted but has no durable record')
    if physical_total!=LOG_BYTES:errors.append('physical raw-log total differs from capture accounting')
    if physical_total>LOG_CAP:errors.append('physical raw-log aggregate exceeds cap')
    return {'verified':not errors,'physicalBytes':physical_total,'recordedLogBytes':LOG_BYTES,'outerFiles':outer_files,'errors':errors}

def main():
    global RUNID,START,DEADLINE,OUTPUT,LOG_BYTES,CLEANUP_MODE
    ap=argparse.ArgumentParser();ap.add_argument('--packet',type=pathlib.Path,required=True);ap.add_argument('--packet-sha256',required=True);ap.add_argument('--manifest-sha256',required=True);ap.add_argument('--execute',action='store_true');args=ap.parse_args()
    if os.environ.get('G03_LOCKED_CARGO_ACQUIRE')!='1' or not args.execute:fail('explicit root execution guard is absent')
    if args.packet!=PACKET:fail('only the exact frozen packet path is accepted')
    START=time.monotonic();DEADLINE=START+TOTAL
    if OUTPUT_ROOT.exists() and OUTPUT_ROOT.is_symlink():fail('runs output root is a symlink')
    OUTPUT_ROOT.mkdir(exist_ok=True)
    RUNID=uuid.uuid4().hex;OUTPUT=OUTPUT_ROOT/RUNID
    if OUTPUT.exists() or OUTPUT.is_symlink():fail('fresh UUID output path collision')
    OUTPUT.mkdir(mode=0o700);(OUTPUT/'logs').mkdir();guest_output=OUTPUT/'guest';guest_output.mkdir(mode=0o700);(guest_output/'evidence').mkdir();(guest_output/'software').mkdir()
    result={'profile':'g03.locked-cargo-cache-local-operator/1','executionId':RUNID,'status':'FAIL_OR_UNKNOWN','executionKind':'bounded_local_locked_cargo_registry_acquisition',
      'executionPerformed':False,'limits':{'aggregateSeconds':TOTAL,'terminalReserveSeconds':TERMINAL,'fetchCommandMaximumSeconds':FETCH_MAX,
      'fetchActiveSeconds':FETCH_ACTIVE,'terminationGraceSeconds':GRACE,'cpuCores':2,'memoryBytes':2147483648,'pids':256,'tmpfsBytes':268435456,
      'cacheContentBytes':CACHE_CAP,'scratchContentBytes':SCRATCH_CAP,'scratchEntries':SCRATCH_ENTRIES,'scratchFileBytes':FILE_CAP,
      'archiveMemberCount':ARCHIVE_MEMBER_CAP,'archiveExpandedBytes':SCRATCH_CAP,'sparseIndexWitnessFileBytes':INDEX_FILE_CAP,'guestWallSeconds':510,'guestFinalReserveSeconds':15,
      'softwareArchiveBytes':ARCHIVE_CAP,'publicEvidenceBytes':EVIDENCE_CAP,'publicAggregateLogBytes':LOG_CAP,
      'outerStreamBytes':OUTER_STREAM,'outerAggregateCaptureBytes':OUTER_TOTAL,'sourceFileBytes':SOURCE_FILE_CAP,'sourceTotalBytes':SOURCE_CAP,
      'inventoryChunkRows':1000,'inventoryChunkTotalBytes':INVENTORY_CAP},'scope':{'onlyCargoFetch':True,'compile':False,'tests':False,'productImports':False,'wheelBuild':False,
      'sourceCommit':SOURCE_COMMIT,'sourceTree':SOURCE_TREE,'registrySource':'crates.io only','status':'FAIL_OR_UNKNOWN'},
      'failure':'terminal acquisition receipt is pending','operatorResultBytesCap':PER_PUBLIC}
    atomic_json(OUTPUT/'operator-result.json',result)
    container_name=f'g03-cargo-acquire-{RUNID}';volume_name=f'g03-cargo-registry-{RUNID}';container_id=None;volume_created=False;container_created=False;volume_create_attempted=False;container_create_attempted=False;failure=None
    source_before=None;source_after=None;host_identity_before=None;host_identity_after=None;capture_row=None;container_start_attempted=False;public_bytes=0;cleanup={'verified':False,'containerAbsent':False,'volumeAbsent':False,'errors':[]}
    try:
        if not OUTPUT_ROOT.resolve().is_dir():fail('output root is not a real directory')
        manifest=verify_frozen_manifest(args.manifest_sha256,OUTPUT)
        load_capture()
        packet_raw=bounded_read(PACKET,128*1024);packet_sha=sha_bytes(packet_raw)
        if packet_sha!=args.packet_sha256:fail('packet hash does not match caller pin')
        packet=json.loads(packet_raw)
        if set(packet)!={'profile','status','source','cargoLock','runtime','network','cacheSeed','limits','softwareOutput','evidence'} or packet.get('profile')!='g03.locked-cargo-cache-inputs/1' or packet.get('status')!='FROZEN_LOCAL_INPUTS':fail('packet closed schema/profile/status mismatch')
        if packet['runtime']!={'imageId':BUILDER,'platform':'linux/amd64','rustupToolchain':'1.90.0-x86_64-unknown-linux-gnu','rustc':'rustc 1.90.0 (1159e78c4 2025-09-14)','cargo':'cargo 1.90.0 (840b83a10 2025-07-30)','cargoPath':'/opt/rustup/toolchains/1.90.0-x86_64-unknown-linux-gnu/bin/cargo','rustupHome':'/opt/rustup','pythonPath':'/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','pythonVersion':'3.11.17'}:fail('runtime image/toolchain/Python packet schema differs')
        if packet['source']!={'root':str(SOURCE),'commit':SOURCE_COMMIT,'tree':SOURCE_TREE,
          'cargoManifest':{'path':'Cargo.toml','sizeBytes':1037,'sha256':'c665649cd622f7422c96241231db69e454de4b5c69adfe4ddfb62576fea01928'},
          'cargoLock':{'path':'Cargo.lock','sizeBytes':28742,'sha256':'0a7dbe0788f4c8ac0f5752b5e9600e83fa0de74ff0dcd8a2039370ee752c95c4'},
          'cargoConfig':{'path':'.cargo/config.toml','sizeBytes':250,'sha256':'6e87ded1a3f6228bb0aee5f62f89e72f87c1f9281d882ef7ac1dd8844315a64f'},
          'stageRoster':{'path':'inputs/source-custody/git-stage-roster.txt','sizeBytes':STAGE_BYTES,'sha256':STAGE_SHA,'fileCount':5901,'terminalLf':False},
          'custody':{'path':'inputs/source-custody/custody.json','sizeBytes':619,'sha256':CUSTODY_SHA},
          'sourceInputs':{'path':'source-custody/source-inputs.rows.json','sizeBytes':235442,'sha256':'6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2','rowCount':1459},
          'stageBasisProfile':'g03.git-stage-roster-custody/1','trackedCount':5901,'totalBytes':860543639}:fail('P56 full-source/Cargo metadata packet pins differ')
        if packet['cargoLock'].get('registrySource')!='registry+https://github.com/rust-lang/crates.io-index' or packet['cargoLock'].get('registryPackageCount')!=115 or packet['cargoLock'].get('localWorkspacePackageCount')!=11 or packet['cargoLock'].get('pathPackageCount')!=1 or packet['cargoLock'].get('registryPackageRosterSha256')!='4d2783d27f77d329a6367866b973255224993f54c830edcc78f554a5f52a2346' or packet['cargoLock'].get('localWorkspaceRosterSha256')!='54612ff481013ce325739b6692b6f35d4fa16eb532c4624fa76662e0fea78a80' or packet['cargoLock'].get('pathPackageRosterSha256')!='cb0f3a365f629fe35a1261deea890953342fb8721a3f3a267ed6f2431c975dd4':fail('Cargo.lock allowlist counts/digests differ from inspected source')
        if packet['network']!={'mode':'bridge','onlyNetworkUsingCommand':FETCH_COMMAND,'cargoRegistryProtocol':'sparse','expectedIndexUrl':'https://index.crates.io/','allowedDownloadHost':'static.crates.io','proxyEnvironmentVariables':[],'cargoConfigSource':'read-only source .cargo/config.toml plus fresh /cargo with no user config/credentials'}:fail('network/source allowlist packet differs')
        if packet['limits']!={'aggregateSeconds':600,'terminalReserveSeconds':60,'fetchCommandMaximumSeconds':480,'fetchActiveSeconds':470,'terminationGraceSeconds':10,'metadataCommandSeconds':15,'dockerImageInspectSeconds':20,'dockerCreateSeconds':30,'dockerStartSeconds':530,'cleanupReserveSeconds':60,'cpuCores':2,'memoryBytes':2147483648,'pids':256,'tmpfsBytes':268435456,'cacheContentBytes':251658240,'scratchContentBytes':251658240,'scratchEntries':100000,'scratchFileBytes':67108864,'archiveBytes':268435456,'archiveMemberCount':100000,'archiveExpandedBytes':251658240,'sparseIndexWitnessFileBytes':4194304,'guestWallSeconds':510,'guestFinalReserveSeconds':15,'sourceFileBytes':67108864,'sourceTotalBytes':1073741824,'metadataFileBytes':1048576,'publicEvidenceBytes':8388608,'publicAggregateLogBytes':1048576,'outerStreamBytes':131072,'outerAggregateCaptureBytes':262144,'maxInventoryRows':100000,'inventoryChunkRows':1000}:fail('acquisition bounds differ from reviewed packet')
        measurement_basis='Exact-image observation: the guarded inventory sum of regular-file apparent sizes (st_size) matches the pinned /usr/bin/du -sb output on this image; directory inode sizes are excluded.'
        measurement_probe={'profile':'g03.base-cache-size-semantics-probe/1','resultPath':'inputs/evidence/base-cache-size-probe-001/result.json','resultSha256':SIZE_PROBE_RESULT_SHA,'imageId':BUILDER,'platform':'linux/amd64','network':'none','status':'PASS_METADATA_ONLY','ownedContainerAbsent':True,'files':[{'path':'inputs/evidence/base-cache-size-probe-001/probe.py','sizeBytes':1159,'sha256':SIZE_PROBE_FILES['probe.py'][0]},{'path':'inputs/evidence/base-cache-size-probe-001/stdout.log','sizeBytes':617,'sha256':SIZE_PROBE_FILES['stdout.log'][0]},{'path':'inputs/evidence/base-cache-size-probe-001/stderr.log','sizeBytes':0,'sha256':SIZE_PROBE_FILES['stderr.log'][0]}],'regularFileBytes':{'cache':17410143,'index':13154725},'fileCount':{'cache':161,'index':214},'directories':{'cache':2,'index':216},'hardlinkedFiles':0,'naiveIncludingDirectoryBytes':{'cache':17417537,'index':13160387}}
        if packet['cacheSeed']!={'imagePaths':['/opt/cargo/registry/cache','/opt/cargo/registry/index'],'imageSizeMetadataPath':'inputs/evidence/base-image-cache-size.json','imageSizeMetadataSha256':BASE_SIZE_SHA,'reportedDuBytes':{'cache':17410143,'index':13154725},'measurementBasis':measurement_basis,'measurementProbe':measurement_probe}:fail('base-image seed scope/size measurement evidence differs')
        if packet['softwareOutput']!={'archivePath':'software/cargo-registry.tar','format':'uncompressed deterministic ustar','containsOnly':['registry/cache','registry/index'],'archiveContainsNoCredentialsOrConfig':True,'softwareNotPublicEvidence':True}:fail('software output scope differs')
        if packet['runtime']['imageId']!=BUILDER or packet['runtime']['platform']!='linux/amd64' or packet['source']['commit']!=SOURCE_COMMIT or packet['source']['tree']!=SOURCE_TREE:fail('builder/source pins mismatch')
        if packet['network']['onlyNetworkUsingCommand']!=FETCH_COMMAND:fail('only network-using command differs')
        if packet['source']['stageRoster']!={'path':'inputs/source-custody/git-stage-roster.txt','sizeBytes':STAGE_BYTES,'sha256':STAGE_SHA,'fileCount':5901,'terminalLf':False} or packet['source']['custody']!={'path':'inputs/source-custody/custody.json','sizeBytes':619,'sha256':CUSTODY_SHA}:fail('stage/custody packet schema differs')
        for p in (ROOT,INPUTS,RUNTIME,SOURCE,PACKET,MANIFEST,CAPTURE,STAGE,CUSTODY,INPUTS/'source-custody/source-inputs.rows.json',BASE_SIZE,TABLE_FAIL,TABLE_FAIL_COPY,ACCEPTED_PLAN,ACQ003_RUN,ACQ003_FAIL_ORIGINAL,ACQ003_FAIL_COPY,ACQ003_PUBLIC_FILES,SIZE_PROBE_RESULT,SIZE_PROBE/'probe.py',SIZE_PROBE/'stdout.log',SIZE_PROBE/'stderr.log',SIZE_PROBE_PLAN,ACQ004_RUN,ACQ004_FAIL,ACQ004_FAIL_COPY,ACQ004_PUBLIC_FILES,MARKER_PLAN,MARKER_PROBE/'result.json',MARKER_PROBE/'probe.py',MARKER_PROBE/'stdout.log',MARKER_PROBE/'stderr.log',ACQ005_SOURCE,ACQ005_SOURCE_MANIFEST,ACQ005_FAIL_COPY):
            if not p.is_absolute() or p.resolve(strict=True)!=p:fail('input path not absolute canonical: '+str(p))
        stage=parse_stage(packet);lock_raw,registry,local=parse_lock(packet)
        if sha_bytes(bounded_read(TABLE_FAIL,PER_PUBLIC))!=TABLE_FAIL_SHA:fail('table006 fail receipt changed')
        if sha_bytes(bounded_read(TABLE_FAIL_COPY,PER_PUBLIC))!=TABLE_FAIL_SHA:fail('retained table006 fail receipt copy changed')
        if sha_bytes(bounded_read(ACCEPTED_PLAN,16*1024))!=PLAN_SHA:fail('accepted acquisition plan copy changed')
        if sha_bytes(bounded_read(ACQ003_FAIL_ORIGINAL,PER_PUBLIC))!=ACQ003_FAIL_SHA or sha_bytes(bounded_read(ACQ003_FAIL_COPY,PER_PUBLIC))!=ACQ003_FAIL_SHA:fail('preserved acquisition003 failure receipt changed')
        prior004=verify_prior_acquisition004()
        if prior004.get('failure')!='RuntimeError: bounded Cargo acquisition container command/capture did not close successfully':fail('preserved acquisition004 container failure differs')
        prior005_source=verify_prior_acquisition005_source()
        if sha_bytes(bounded_read(ACQ005_FAIL_COPY,PER_PUBLIC))!=ACQ005_FAIL_SHA:fail('preserved acquisition005 failure result changed')
        prior005_fail=json.loads(bounded_read(ACQ005_FAIL_COPY,PER_PUBLIC))
        if prior005_fail.get('executionId')!='22f6f507f4364c9d8e2c6b163aa44ec8' or prior005_fail.get('status')!='FAIL_OR_UNKNOWN' or prior005_fail.get('executionPerformed') is not False or prior005_fail.get('failure')!='RuntimeError: registry marker metadata probe differs from exact accepted observation' or prior005_fail.get('metadataCommands')!=[] or prior005_fail.get('cleanup',{}).get('verified') is not True:
            fail('preserved acquisition005 pre-Docker failure schema differs')
        marker_plan_raw=bounded_read(MARKER_PLAN,16*1024)
        if sha_bytes(marker_plan_raw)!='67cf1214e1fb714f6a12dae01cd68d3f5e2d8373ea89fb179db1c68366d52446':fail('accepted registry marker plan copy changed')
        marker_probe=json.loads(bounded_read(MARKER_PROBE/'result.json',16*1024))
        marker_probe_files=[]
        for name,(want_sha,want_size) in MARKER_PROBE_FILES.items():
            raw=bounded_read(MARKER_PROBE/name,want_size)
            if len(raw)!=want_size or sha_bytes(raw)!=want_sha:fail('registry marker probe capture pin changed: '+name)
            marker_probe_files.append({'path':'inputs/evidence/registry-marker-probe-001/'+name,'sizeBytes':want_size,'sha256':want_sha})
        if marker_probe.get('imageId')!=BUILDER or marker_probe.get('platform')!='linux/amd64' or marker_probe.get('network')!='none' or marker_probe.get('ownedContainerAbsent') is not True:
            fail('registry marker probe identity/scope differs')
        marker_text='Signature: 8a477f597d28d172789f06886806bc55\n# This file is a cache directory tag created by cargo.\n# For information about cache directory tags see https://bford.info/cachedir/\n'
        marker_bytes=marker_text.encode('utf-8')
        if len(marker_bytes)!=MARKER_SIZE or sha_bytes(marker_bytes)!=MARKER_SHA:fail('accepted marker UTF-8 witness does not close to exact byte pin')
        expected_marker_rows=[{'kind':'file','mode':420,'name':'CACHEDIR.TAG','sha256':MARKER_SHA,'sizeBytes':MARKER_SIZE,'utf8':marker_text},
            {'kind':'directory','mode':493,'name':'cache','sizeBytes':64},{'kind':'directory','mode':493,'name':'index','sizeBytes':64},{'kind':'directory','mode':493,'name':'src','sizeBytes':64}]
        if marker_probe.get('profile')!='g03.base-registry-metadata-probe/1' or marker_probe.get('status')!='PASS_METADATA_ONLY' or marker_probe.get('exitCode')!=0 or marker_probe.get('readOnly') is not True or marker_probe.get('result',{}).get('rows')!=expected_marker_rows:
            fail('registry marker metadata probe differs from exact accepted observation')
        if marker_probe.get('scope')!='Filesystem metadata only, no Cargo/product/test/network/Mac execution' or marker_probe.get('ownedContainerAbsent') is not True or marker_probe.get('ownedContainerName')!='g03-registry-tag-probe-001' or marker_probe.get('absenceWitness')!='root exact-name docker ps -a query exit0/empty after --rm':
            fail('registry marker probe scope/cleanup provenance differs')
        expected_probe_files=[{'path':name,'sha256':v[0],'sizeBytes':v[1]} for name,v in MARKER_PROBE_FILES.items()]
        if marker_probe.get('files')!=expected_probe_files:fail('registry marker probe result file pins differ')
        prior_fail=json.loads(bounded_read(ACQ003_FAIL_COPY,PER_PUBLIC))
        if (prior_fail.get('status')!='FAIL_OR_UNKNOWN' or prior_fail.get('executionPerformed') is not True or
            prior_fail.get('cleanup',{}).get('verified') is not True or prior_fail.get('cleanup',{}).get('containerAbsent') is not True or prior_fail.get('cleanup',{}).get('volumeAbsent') is not True or
            prior_fail.get('containerCommand',{}).get('exitCode')!=1 or prior_fail.get('captureAudit',{}).get('verified') is not True or
            prior_fail.get('captureAudit',{}).get('physicalBytes')!=2111 or prior_fail.get('publicEvidenceBytesExcludingResult')!=2288 or prior_fail.get('operatorResultBytes')!=33498):fail('preserved acquisition003 failure/cleanup receipt schema differs')
        prior_files=prior_fail.get('publicFiles',[])
        if len(prior_files)!=41 or prior_files!=sorted(prior_files,key=lambda x:x.get('path','')) or len({x.get('path') for x in prior_files})!=41:fail('preserved acquisition003 output roster is incomplete/noncanonical')
        prior_public_bytes=0;prior_log_bytes=0
        for row in prior_files:
            if (set(row)!={'class','mode','path','sha256','sizeBytes'} or not safe_rel(row['path']) or type(row['sizeBytes']) is not int or not (0<=row['sizeBytes']<=PER_PUBLIC) or type(row['mode']) is not int or row['mode'] not in (0o600,0o644) or not re.fullmatch(r'[0-9a-f]{64}',row['sha256'])):fail('preserved acquisition003 output row is outside its closed schema')
            is_log=row['path'].startswith('logs/')
            if row['class']!=('raw-log' if is_log else 'public-evidence'):fail('preserved acquisition003 output classification differs')
            original=ACQ003_RUN/row['path'];copy=ACQ003_PUBLIC_FILES/row['path']
            for path in (original,copy):
                h,_,n,mode=hash_stable(path,PER_PUBLIC)
                if (h,n,mode)!=(row['sha256'],row['sizeBytes'],row['mode']):fail('preserved acquisition003 output physical file differs: '+row['path'])
            prior_public_bytes+=row['sizeBytes']
            if is_log:prior_log_bytes+=row['sizeBytes']
        if prior_public_bytes!=2288 or prior_log_bytes!=2111:fail('preserved acquisition003 public/raw-log byte totals differ')
        prior_guest=json.loads(bounded_read(ACQ003_PUBLIC_FILES/'guest/evidence/acquisition-guest-report.json',PER_PUBLIC))
        if prior_guest.get('status')!='FAIL_OR_UNKNOWN' or prior_guest.get('executionPerformed') is not False or prior_guest.get('failure')!='RuntimeError: pinned base image Cargo cache apparent size differs':fail('preserved acquisition003 guest pre-fetch failure receipt differs')
        if sha_bytes(bounded_read(SIZE_PROBE_PLAN,16*1024))!=SIZE_PROBE_PLAN_SHA:fail('accepted cache measurement plan copy changed')
        if sha_bytes(bounded_read(SIZE_PROBE_RESULT,16*1024))!=SIZE_PROBE_RESULT_SHA:fail('exact-image cache size probe receipt changed')
        for probe_name,(probe_sha,probe_size) in SIZE_PROBE_FILES.items():
            probe_raw=bounded_read(SIZE_PROBE/probe_name,probe_size)
            if len(probe_raw)!=probe_size or sha_bytes(probe_raw)!=probe_sha:fail('exact-image cache-size probe capture pin changed: '+probe_name)
        probe_doc=json.loads(bounded_read(SIZE_PROBE_RESULT,16*1024))
        probe_files=[{'path':name,'sha256':probe_sha,'sizeBytes':probe_size} for name,(probe_sha,probe_size) in SIZE_PROBE_FILES.items()]
        probe_roots=probe_doc.get('result',{}).get('roots',[])
        if (probe_doc.get('profile')!='g03.base-cache-size-semantics-probe/1' or probe_doc.get('status')!='PASS_METADATA_ONLY' or probe_doc.get('exitCode')!=0 or probe_doc.get('network')!='none' or probe_doc.get('readOnly') is not True or probe_doc.get('platform')!='linux/amd64' or probe_doc.get('imageId')!=BUILDER or probe_doc.get('ownedContainerAbsent') is not True or probe_doc.get('ownedContainerName')!='g03-cargo-size-probe-001' or
            probe_doc.get('ownedContainerAbsenceWitness')!='root docker ps -a exact-name query exit0/empty after --rm command' or
            probe_doc.get('scope')!='Filesystem metadata and du only; no Cargo/product/compiler/test/network/Mac execution' or
            probe_doc.get('limits')!={'commandSeconds':30,'cpus':1,'killGraceSeconds':5,'memoryBytes':268435456,'pids':32} or probe_doc.get('files')!=probe_files or
            probe_doc.get('result',{}).get('scope')!='read-only base-image cache filesystem metadata; no Cargo/compiler/product/network' or
            [(x.get('name'),x.get('regularFileBytes'),x.get('directories'),x.get('files'),x.get('hardlinkedFiles'),x.get('naiveApparentBytes'),x.get('uniqueInodeApparentBytes'),x.get('duStdout'),x.get('duStderr')) for x in probe_roots]!=[('cache',17410143,2,161,0,17417537,17417537,'17410143\t/opt/cargo/registry/cache\n',''),('index',13154725,216,214,0,13160387,13160387,'13154725\t/opt/cargo/registry/index\n','')]):fail('exact-image cache-size probe observations do not close')
        base_meta=json.loads(bounded_read(BASE_SIZE,8192))
        base_meta_sha,_,base_meta_size,_=hash_stable(BASE_SIZE,8192)
        if base_meta_sha!=BASE_SIZE_SHA or base_meta_sha!=packet['cacheSeed']['imageSizeMetadataSha256'] or base_meta_size!=BASE_SIZE.stat().st_size:fail('pinned base-cache measurement digest differs')
        if packet['cacheSeed']['reportedDuBytes']!={'cache':17410143,'index':13154725}:fail('base-cache image size pins differ')
        if packet['cacheSeed']['measurementBasis']!=measurement_basis:fail('base-cache measurement semantics differ')
        if packet['evidence']!={'acquisition005ManifestSha256':ACQ005_MANIFEST_SHA,'acquisition005ManifestPath':'inputs/evidence/acquisition005-source/integrity-manifest.json',
          'acquisition005FailurePath':'inputs/evidence/acquisition005-failure.json','acquisition005FailureSha256':ACQ005_FAIL_SHA,
          'acquisition005Source':prior005_source,
          'table006FailurePath':str(TABLE_FAIL),'table006FailureSha256':TABLE_FAIL_SHA,
          'table006Scope':'fresh18 install, wheel-member proof and distribution snapshot passed; offline native CLI stopped because locked registry crate jsonschema was absent; cleanup verified',
          'acquisition004FailurePath':str(ACQ004_FAIL),'acquisition004FailureSha256':ACQ004_FAIL_SHA,
          'acquisition004PublicFilesPath':'inputs/evidence/acquisition004-public-files',
          'acquisition004FailureScope':'Cargo acquisition FAIL_OR_UNKNOWN after the container command failed; guest reported Cargo home registry tree unsafe; the receipt does not contain a guest cargoFetch row or offending registry-entry witness; owned cleanup verified',
          'registryMarkerProbePath':'inputs/evidence/registry-marker-probe-001/result.json','registryMarkerProbeSha256':'b83d3c009efb05271a3132023ca4ce9afcddeb2649dac9526c7a85674898c0f1',
          'registryMarkerProbePlanPath':'inputs/evidence/locked-cargo-cache-marker005-sol-plan001.md','registryMarkerProbePlanSha256':'67cf1214e1fb714f6a12dae01cd68d3f5e2d8373ea89fb179db1c68366d52446',
          'registryMarker':{'path':'registry/CACHEDIR.TAG','kind':'regular-file','mode':420,'sizeBytes':177,'sha256':MARKER_SHA},
          'baseCacheMetadataSha256':'b1e9b93d3212493cd847d2c645efa5186417dde5eacbda8224e6f9b9c501dc16',
          'acquisition003FailurePath':'/private/tmp/g03-linux-locked-cargo-cache-operator-003/runs/2c527cb8c89640ecb060291e62e07505/operator-result.json',
          'acquisition003FailureSha256':ACQ003_FAIL_SHA,
          'acquisition003FailureScope':'pre-fetch FAIL_OR_UNKNOWN: exact-image cache apparent-size guard compared regular-file bytes plus directory inode sizes against the pinned du measurement; cargo fetch not executed; owned cleanup verified',
          'acquisition003PublicFilesPath':'inputs/evidence/acquisition003-public-files',
          'cacheMeasurementPlanPath':'inputs/evidence/locked-cargo-cache-measurement004-sol-plan001.md','cacheMeasurementPlanSha256':SIZE_PROBE_PLAN_SHA}:fail('acquisition provenance evidence pins differ')
        if (base_meta.get('profile')!='g03.local-linux-tool-cache-metadata/1' or base_meta.get('exitCode')!=0 or base_meta.get('ownedContainerAbsent') is not True or
            base_meta.get('stdout')!='17410143\t/opt/cargo/registry/cache\n13154725\t/opt/cargo/registry/index\n'):
            fail('read-only base image Cargo cache size evidence mismatch')
        source_before=verify_source(packet,stage);host_identity_before=host_source_identity()
        image=control(['docker','image','inspect','--format','{{.Id}}|{{.Os}}|{{.Architecture}}',BUILDER],20).strip()
        if image!=BUILDER+'|linux|amd64':fail('pinned builder image identity/platform mismatch')
        if control(['docker','volume','ls','--filter','name=^'+volume_name+'$','--format','{{.Name}}'],15).strip():fail('fresh cache volume name already exists')
        volume_create_attempted=True
        created=control(['docker','volume','create','--driver','local','--label','codex.g03.owner='+RUNID,'--label','codex.g03.purpose=locked-cargo-cache-acquisition',volume_name],15).strip()
        if created!=volume_name:fail('owned fresh Cargo cache volume was not created exactly')
        volume_created=True
        vinfo=control(['docker','volume','inspect','--format','{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.owner"}}|{{index .Labels "codex.g03.purpose"}}',volume_name],15).strip()
        if vinfo!=f'{volume_name}|local|{RUNID}|locked-cargo-cache-acquisition':fail('owned volume identity/labels mismatch')
        envs={'G03_PACKET_SHA256':packet_sha,'HOME':'/tmp/home','TMPDIR':'/tmp','CARGO_HOME':'/cargo','RUSTUP_HOME':'/opt/rustup',
          'RUSTUP_TOOLCHAIN':'1.90.0-x86_64-unknown-linux-gnu','CARGO_NET_OFFLINE':'false','CARGO_REGISTRIES_CRATES_IO_PROTOCOL':'sparse',
          'CARGO_NET_RETRY':'2','CARGO_HTTP_TIMEOUT':'30','CARGO_HTTP_LOW_SPEED_LIMIT':'10',
          'PATH':'/opt/rustup/toolchains/1.90.0-x86_64-unknown-linux-gnu/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}
        argv=['docker','create','--platform=linux/amd64','--name',container_name,'--label','codex.g03.owner='+RUNID,
          '--label','codex.g03.purpose=locked-cargo-cache-acquisition','--network=bridge','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
          '--cpus=2','--memory=2g','--pids-limit=256','--tmpfs=/tmp:rw,nosuid,nodev,exec,size=256m',
          '--mount',f'type=bind,src={SOURCE},dst=/workspace,readonly','--mount',f'type=bind,src={INPUTS},dst=/input,readonly',
          '--mount',f'type=bind,src={RUNTIME},dst=/operator,readonly','--mount',f'type=volume,src={volume_name},dst=/cargo,volume-nocopy',
          '--mount',f'type=bind,src={guest_output},dst=/out']
        for k,v in envs.items():argv+=['--env',k+'='+v]
        argv+=['--workdir=/workspace','--entrypoint',packet['runtime']['pythonPath'],BUILDER,'-B','-I','/operator/acquisition_guest.py','--packet-sha256',packet_sha]
        if control(['docker','ps','-a','--filter','name=^'+container_name+'$','--format','{{.Names}}'],10).strip():fail('fresh acquisition container name already exists')
        container_create_attempted=True
        container_id=control(argv,30).strip()
        if not re.fullmatch(r'[0-9a-f]{64}',container_id):fail('docker create did not return exact container ID')
        container_created=True
        summary=control(['docker','inspect','--format','{{.Id}}|{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}|{{index .Config.Labels "codex.g03.owner"}}|{{index .Config.Labels "codex.g03.purpose"}}|{{json .HostConfig.Tmpfs}}',container_id],15).strip()
        parts=summary.split('|')
        if len(parts)!=10 or parts[:9]!=[container_id,BUILDER,'bridge','true','256','2000000000','2147483648',RUNID,'locked-cargo-cache-acquisition'] or json.loads(parts[9])!={'/tmp':'rw,nosuid,nodev,exec,size=256m'}:
            fail('container identity/resources/network/rootfs differ from predeclared packet')
        mounts=json.loads(control(['docker','inspect','--format','{{json .Mounts}}',container_id],15))
        expected_mounts={'/workspace':('bind',str(SOURCE),True),'/input':('bind',str(INPUTS),True),'/operator':('bind',str(RUNTIME),True),
          '/cargo':('volume',volume_name,False),'/out':('bind',str(guest_output),False)}
        actual={m.get('Destination'):m for m in mounts}
        if set(actual)!=set(expected_mounts):fail('container mount destination roster differs')
        for dest,(kind,src,ro) in expected_mounts.items():
            m=actual[dest]
            if (m.get('Type')!=kind or m.get('RW')==ro):fail('container mount type/read-only state differs at '+dest)
            if kind=='volume' and m.get('Name')!=src:fail('fresh owned cache volume mount differs')
            if kind=='bind' and m.get('Source') not in (src,str(pathlib.Path(src).resolve())):fail('container bind source differs at '+dest)
        start_at=time.monotonic();outer_deadline=min(START+TOTAL-TERMINAL,start_at+FETCH_MAX+40)
        if outer_deadline-time.monotonic()<20:fail('outer acquisition command cannot fit before terminal reserve')
        container_start_attempted=True
        capture_row={'argv':['docker','start','-a',container_id],'cwd':str(ROOT),'startMonotonic':start_at,'deadlineMonotonic':outer_deadline,
          'elapsedSeconds':None,'exitCode':None,'captureAttempted':True,'capture':None,'physicalClosure':None}
        proc=None
        try:
            proc=subprocess.Popen(capture_row['argv'],cwd=str(ROOT),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
            cap=CAPTURE_HELPER.bounded_capture(proc,OUTPUT/'logs',container_name,outer_deadline,prefix='cargo-fetch',aggregate_remaining=OUTER_TOTAL)
            physical=CAPTURE_HELPER.verify_outer_capture(cap);LOG_BYTES+=cap.get('totalRetainedBytes',0)
            capture_row.update(elapsedSeconds=round(time.monotonic()-start_at,3),exitCode=proc.returncode,capture=cap,physicalClosure=physical)
        except BaseException as exc:
            capture_row.update(elapsedSeconds=round(time.monotonic()-start_at,3),captureFailure=type(exc).__name__+': '+str(exc)[:200])
            if proc is not None and proc.poll() is None:
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:proc.wait(timeout=GRACE)
                except subprocess.TimeoutExpired:
                    try:os.killpg(proc.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    try:proc.wait(timeout=1)
                    except subprocess.TimeoutExpired:pass
            raise
        if (proc.returncode!=0 or cap.get('timedOut') or cap.get('drainExpired') or cap.get('captureFailed') or any(cap.get('truncated',[])) or not physical.get('verified')):
            fail('bounded Cargo acquisition container command/capture did not close successfully')
        state=control(['docker','inspect','--format','{{.Id}}|{{.State.Status}}|{{.State.ExitCode}}|{{index .Config.Labels "codex.g03.owner"}}|{{index .Config.Labels "codex.g03.purpose"}}',container_id],15).strip().split('|')
        if state!=[container_id,'exited','0',RUNID,'locked-cargo-cache-acquisition']:fail('Cargo acquisition container completion identity/state differs')
        report_path=guest_output/'evidence/acquisition-guest-report.json';rh,_,rn,_=hash_stable(report_path,PER_PUBLIC)
        guest=json.loads(bounded_read(report_path,PER_PUBLIC))
        if guest.get('status')!='LOCKED_CARGO_FETCH_PASS' or guest.get('executionPerformed') is not True or guest.get('packetSha256')!=packet_sha:fail('guest acquisition receipt is not a closed pass')
        if guest.get('sourceBefore')!=source_before or guest.get('sourceAfter')!=source_before:fail('guest source/lock pre/post closure differs from host precheck')
        if guest.get('cargoFetch',{}).get('argv')!=FETCH_COMMAND or guest.get('cargoFetch',{}).get('exitCode')!=0 or guest.get('cargoFetch',{}).get('environment',{}).get('CARGO_NET_OFFLINE')!='false':fail('guest did not run only the exact locked cargo fetch')
        fetch_row=guest.get('cargoFetch',{})
        if guest.get('cargoFetchCaptureStatus')!='completed' or fetch_row.get('cwd')!='/workspace' or fetch_row.get('terminationGraceSeconds')!=GRACE or fetch_row.get('environment',{}).get('CARGO_NET_OFFLINE')!='false':fail('retained Cargo fetch completion row differs')
        entry_witness=guest.get('registryEntryWitness',{})
        expected_marker={'name':'CACHEDIR.TAG','type':'regular-file','mode':MARKER_MODE,'sizeBytes':MARKER_SIZE,'sha256':MARKER_SHA}
        if entry_witness.get('rootType')!='directory' or entry_witness.get('truncated') is not False or entry_witness.get('entryCount')!=len(entry_witness.get('entries',[])) or expected_marker not in entry_witness.get('entries',[]):fail('bounded exact registry marker witness is absent')
        witnessed_dirs={x.get('name') for x in entry_witness.get('entries',[]) if x.get('type')=='directory'}
        witnessed_names={x.get('name') for x in entry_witness.get('entries',[])}
        if not {'cache','index'}.issubset(witnessed_dirs) or witnessed_dirs-{'cache','index','src'} or witnessed_names-{'cache','index','src','CACHEDIR.TAG'} or any(x.get('type') not in ('directory','regular-file') for x in entry_witness.get('entries',[])):fail('registry immediate-entry witness contains unexpected type/name')
        gd=guest.get('guestDuration',{});fc=guest.get('cargoFetch',{})
        if gd.get('clockDomain')!='container_local_monotonic' or gd.get('maximumWallSeconds')!=510 or type(gd.get('elapsedSeconds')) not in (int,float) or not (0<=gd['elapsedSeconds']<=510) or type(fc.get('maximumWallSecondsIncludingTerminationGrace')) not in (int,float) or not (10<fc['maximumWallSecondsIncludingTerminationGrace']<=480) or type(fc.get('elapsedSeconds')) not in (int,float) or not (0<=fc['elapsedSeconds']<=fc['maximumWallSecondsIncludingTerminationGrace']):fail('guest-local duration bounds or clock-domain evidence differs')
        if guest.get('sparseIndexWitnessCount')!=115 or len(guest.get('sparseIndexWitnesses',[]))!=115:fail('complete 115-package sparse-index witness roster absent')
        base_seed=guest.get('baseImageSeed',{})
        if (base_seed.get('imageId')!=BUILDER or base_seed.get('paths')!=['registry/cache','registry/index'] or
            base_seed.get('regularFileApparentBytes')!={'cache':17410143,'index':13154725} or
            base_seed.get('measurementBasis')!=measurement_basis):fail('guest exact-image regular-file size measurement receipt differs')
        archive_closure=verify_archive(packet,guest,guest_output)
        source_after=verify_source(packet,stage)
        if source_after!=source_before:fail('host P56 source/lock closure changed after acquisition')
        host_identity_after=host_source_identity()
        if host_identity_after!=host_identity_before:fail('host P56 Git commit/tree/cleanliness changed during acquisition')
        freeze_after=verify_frozen_manifest(args.manifest_sha256,OUTPUT)
        if freeze_after!=manifest:fail('operator source package changed during acquisition')
        result.update(status='LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS',executionPerformed=True,packet={'path':str(PACKET),'sha256':packet_sha,'sizeBytes':len(packet_raw)},
          source={'before':source_before,'after':source_after,'hostGitBefore':host_identity_before,'hostGitAfter':host_identity_after},
          image={'id':BUILDER,'platform':'linux/amd64'},volume={'name':volume_name,'driver':'local','owner':RUNID,'purpose':'locked-cargo-cache-acquisition'},
          guestReport={'path':'guest/evidence/acquisition-guest-report.json','sha256':rh,'sizeBytes':rn,'raw':guest},
          archiveClosure=archive_closure,containerCommand=capture_row,sourceFreezeManifest=freeze_after,
          registryPackageCount=len(registry),localPackageCount=len(local))
    except BaseException as exc:
        failure=type(exc).__name__+': '+str(exc)[:500]
        result['status']='FAIL_OR_UNKNOWN';result['failure']=failure;result['executionPerformed']=container_start_attempted
    finally:
        CLEANUP_MODE=True
        clean_deadline=START+TOTAL
        if container_create_attempted:
            try:
                if not re.fullmatch(r'[0-9a-f]{64}',container_id or ''):
                    listed_name=control(['docker','ps','-a','--filter','name=^'+container_name+'$','--format','{{.Names}}'],10).strip()
                    if listed_name:
                        if listed_name!=container_name:fail('uncertain container-create cleanup name differs')
                        recovered=control(['docker','inspect','--format','{{.Id}}|{{.Name}}|{{index .Config.Labels "codex.g03.owner"}}|{{index .Config.Labels "codex.g03.purpose"}}',container_name],10).strip().split('|')
                        if (len(recovered)!=4 or not re.fullmatch(r'[0-9a-f]{64}',recovered[0]) or recovered[1]!='/'+container_name or
                            recovered[2:]!=[RUNID,'locked-cargo-cache-acquisition']):fail('uncertain container-create recovery identity/owner differs')
                        container_id=recovered[0]
                    else:container_id=''
                listed=control(['docker','ps','-a','--filter','id='+container_id,'--format','{{.ID}}'],10).strip() if container_id else ''
                if listed:
                    info=control(['docker','inspect','--format','{{.Id}}|{{index .Config.Labels "codex.g03.owner"}}|{{index .Config.Labels "codex.g03.purpose"}}|{{.State.Running}}',container_id],10).strip().split('|')
                    if info[:3]!=[container_id,RUNID,'locked-cargo-cache-acquisition']:fail('refusing cleanup of nonowned container')
                    if info[3]=='true':
                        control(['docker','stop','--time',str(GRACE),container_id],GRACE+2)
                    control(['docker','rm','--force',container_id],15)
                absent=control(['docker','ps','-a','--filter',('id='+container_id if container_id else 'name=^'+container_name+'$'),'--format',('{{.ID}}' if container_id else '{{.Names}}')],10).strip()
                cleanup['containerAbsent']=not absent
                if absent:cleanup['errors'].append('owned container remains')
            except BaseException as exc:cleanup['errors'].append('container cleanup '+type(exc).__name__+': '+str(exc)[:150])
        else:cleanup['containerAbsent']=True
        if volume_create_attempted:
            try:
                present=control(['docker','volume','ls','--filter','name=^'+volume_name+'$','--format','{{.Name}}'],10).strip()
                if present:
                    if present!=volume_name:fail('uncertain volume-create cleanup name differs')
                    info=control(['docker','volume','inspect','--format','{{.Name}}|{{index .Labels "codex.g03.owner"}}|{{index .Labels "codex.g03.purpose"}}',volume_name],10).strip()
                    if info!=f'{volume_name}|{RUNID}|locked-cargo-cache-acquisition':fail('refusing cleanup of nonowned Cargo volume')
                    control(['docker','volume','rm',volume_name],15)
                absent=control(['docker','volume','ls','--filter','name=^'+volume_name+'$','--format','{{.Name}}'],10).strip()
                cleanup['volumeAbsent']=not absent
                if absent:cleanup['errors'].append('owned Cargo volume remains')
            except BaseException as exc:cleanup['errors'].append('volume cleanup '+type(exc).__name__+': '+str(exc)[:150])
        else:cleanup['volumeAbsent']=True
        cleanup['verified']=cleanup['containerAbsent'] and cleanup['volumeAbsent'] and not cleanup['errors'];cleanup['elapsedSeconds']=round(time.monotonic()-START,3)
        result['cleanup']=cleanup;result['metadataCommands']=META;result['elapsedSeconds']=round(time.monotonic()-START,3)
        result['executionPerformed']=container_start_attempted
        if capture_row is not None:result['containerCommand']=capture_row
        try:capture_audit=verify_capture_logs(capture_row,container_start_attempted)
        except BaseException as exc:capture_audit={'verified':False,'physicalBytes':0,'recordedLogBytes':LOG_BYTES,'outerFiles':[],'errors':['capture audit '+type(exc).__name__+': '+str(exc)[:160]]}
        result['captureAudit']=capture_audit
        if failure or not cleanup['verified'] or not capture_audit['verified'] or time.monotonic()>=DEADLINE:
            result['status']='FAIL_OR_UNKNOWN'
            result['failure']=failure or ('owned cleanup failed' if not cleanup['verified'] else 'capture closure failed' if not capture_audit['verified'] else 'aggregate deadline exceeded')
        else:result['status']='LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS'
        try:
            public,public_bytes,software_bytes,log_bytes=public_inventory(OUTPUT)
            result['publicFiles']=public;result['publicEvidenceBytesExcludingResult']=public_bytes;result['softwareBytes']=software_bytes;result['rawLogBytes']=log_bytes
            result['evidenceClosureVerified']=True
            if log_bytes!=capture_audit['physicalBytes']:fail('public raw-log inventory differs from capture audit')
        except BaseException as exc:
            result['status']='FAIL_OR_UNKNOWN';result['failure']='final evidence closure: '+type(exc).__name__+': '+str(exc)[:300];result['evidenceClosureVerified']=False
            public_bytes=0
        result['elapsedSeconds']=round(time.monotonic()-START,3)
        try:
            if result['status']=='LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS':
                terminal=promote_final_result(OUTPUT/'operator-result.json',result,public_bytes)
                if time.monotonic()>=DEADLINE:fail('terminal pass promotion crossed original aggregate deadline')
            else:fail_result_receipt(OUTPUT/'operator-result.json',result,public_bytes)
        except BaseException as exc:
            result['status']='FAIL_OR_UNKNOWN';result['failure']='terminal promotion: '+type(exc).__name__+': '+str(exc)[:300]
            fail_result_receipt(OUTPUT/'operator-result.json',result,public_bytes)
    return 0 if result.get('status')=='LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS' else 1

if __name__=='__main__':raise SystemExit(main())
