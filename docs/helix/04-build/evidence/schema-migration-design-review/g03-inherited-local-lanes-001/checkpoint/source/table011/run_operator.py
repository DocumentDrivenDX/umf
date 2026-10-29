#!/usr/bin/env python3
"""Bounded local Linux adapter for inherited Weft table-operations checks; never hosted CI."""
from __future__ import annotations
import argparse, base64, hashlib, importlib.util, json, os, pathlib, stat, subprocess, sys, time, uuid
import selectors, signal, re

ROOT=pathlib.Path('/private/tmp/g03-final-table-operations-operator-011')
RUNTIME=ROOT/'runtime'
FROZEN_MANIFEST=ROOT/'integrity-manifest.json'
SOURCE=pathlib.Path('/private/tmp/weft-g03-ordinary-module')
COHORT=pathlib.Path('/private/tmp/g03-final-cohort-056-linux311-001')
WASM_TOOL=pathlib.Path('/private/tmp/g03-linux-wasm-tool-02105-001/files/wasm-bindgen-0.2.105-x86_64-unknown-linux-musl/wasm-bindgen')
PLAYWRIGHT=pathlib.Path('/Users/erik/Projects/weft/node_modules/playwright')
PLAYWRIGHT_CORE=pathlib.Path('/Users/erik/Projects/weft/node_modules/playwright-core')
BROWSER_DEPS_MANIFEST=ROOT/'inputs/browser-deps/manifest.json'
BROWSER_DEPS_MANIFEST_SHA='9f99c0ee83fd0e34ff5f48a83e27f46fd39e3140230629237e0849ea5e07a770'
BUILDER='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
PG_IMAGE='sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
BROWSER_IMAGE='sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
BROWSER_NODE='v24.20.0'; BROWSER_CHROME='Google Chrome for Testing 153.0.8010.12'
CHROMIUM_PATH='/ms-playwright/chromium-1243/chrome-linux-arm64/chrome'
CHROMIUM_SHA='839efe5fd8b6a773dd81b2e10afdc15f3c0a17316fb82b5908c0533306c4ed9e'
SOURCE_COMMIT='973d864c8d26b2bc173a411eac8368da5efc1ab3'; SOURCE_TREE='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff'
WORKFLOW=SOURCE/'.github/workflows/table-operations.yml'
WORKFLOW_SHA='62a1c09eab8568c12d91f3047ecf41edbba81bbcfe9c103a53846d2bb3ebe610'
COHORT_CUSTODY='95e9493f06adefb323193f9d8fbe5577ebfa335140a9841f549d2caf098df8ed'
COHORT_LOCK='cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274'
COHORT_INDEX='78026c05d3824613f0e2a3bf30cf24bd32af24de1d560f0b7fa555a1e75f8d60'
COHORT_MIRROR='809a418b9f6f97e403e3fbcc7066d23657347d1323efb6baf2d4d3bb3f17bd36'
COHORT_REQUIREMENTS='4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51'
WHEEL_REL='aggregate/mirror/files/umf_weft-0.4.56-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl'
WHEEL_SHA='32f4c38d9a614dd4c3a367f8b24d5cd4ba41ec80c2a4a2e3423e2082a294dbdd'; WHEEL_SIZE=14358901
CAPTURE=RUNTIME/'bounded_capture.py'; CAPTURE_SHA='acc1a03387d2eeeac3b06b6d6cdb3c5a477073f6aa4eeea53c55c7996c38b1b0'
PREP_OPERATOR_RESULT=pathlib.Path('/private/tmp/g03-final-installed-prep-operator-001/runs/13fd35e735e542d6b5f1ee92b50c8796/operator-result.json')
PREP_OPERATOR_SHA='5202e1b1567e7cfd7950b7e8205eace9d63f88bd67a3633743faef52be85be27'
PREP_GUEST_RESULT=pathlib.Path('/private/tmp/g03-final-installed-prep-operator-001/runs/13fd35e735e542d6b5f1ee92b50c8796/guest/guest-result.json')
PREP_GUEST_SHA='87650bce2ae314404f763671aef164bb8a2d22cd9a3eff8a572ca442ff6dc4cc'
TOTAL=2700; TERMINAL_RESERVE=60; STOP=10; LOG_CAP=1024*1024; EVIDENCE_CAP=8*1024*1024; ARTIFACT_CAP=256*1024*1024
EVIDENCE_DEADLINE=2400; FINAL_WRITE_DEADLINE=2520; OUTPUT_CHUNK=65536
LOG_CLEANUP_RESERVE=256*1024; METADATA_CAPTURE_LIMIT=64*1024; OUTER_CAPTURE_LIMIT=64*1024
LANE_START=0.0; LANE_DEADLINE=0.0; LANE_STAGE='setup'
STAGES={'setup':180,'build':900,'bindings':1380,'native':1680,'browser':2280,'evidence':2400,'upload':2520}
OUTPUT_ROOT=ROOT/'runs'
SOURCE_COUNT=5901; SOURCE_TOTAL_BYTES=860543639; SOURCE_TOTAL_CAP=1024*1024*1024; SOURCE_FILE_CAP=64*1024*1024
SOURCE_STAGE_ROSTER=ROOT/'inputs/source-custody/git-stage-roster.txt'; SOURCE_STAGE_CUSTODY=ROOT/'inputs/source-custody/custody.json'
SOURCE_STAGE_SHA='bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b'; SOURCE_STAGE_BYTES=780359
SOURCE_STAGE_CUSTODY_SHA='e936a962be023654bd045cafa1f02d664e06e4c6bd6f686e4441f8558e027621'
SOURCE_ROSTER_PROFILE='umf.g03-table-operations-source-roster/3'; SOURCE_ROSTER_COLUMNS=['path','sizeBytes','sha256','mode']


def fail(s): raise RuntimeError(s)
def canonical(p:pathlib.Path):
    if not p.is_absolute() or p.resolve(strict=True)!=p: fail('path is not absolute/canonical: '+str(p))
    q=p
    while q!=q.parent:
        if q.is_symlink(): fail('symlink path component: '+str(q))
        q=q.parent
    return p
def require_time(deadline, label):
    if time.monotonic()>=deadline: fail('deadline reached during '+label)
def hash_file(p:pathlib.Path,cap:int,deadline=None):
    active=LANE_START+STAGES.get(LANE_STAGE,STAGES['evidence'])-2 if LANE_START else time.monotonic()+3600
    deadline=min(LANE_DEADLINE,active) if deadline is None and LANE_DEADLINE else (active if deadline is None else deadline)
    require_time(deadline,'hashing '+str(p))
    before=p.lstat()
    if not stat.S_ISREG(before.st_mode) or p.is_symlink() or before.st_size>cap: fail('unsafe or oversized file: '+str(p))
    h=hashlib.sha256();n=0
    with p.open('rb') as f:
        for b in iter(lambda:f.read(65536),b''):
            require_time(deadline,'hashing '+str(p))
            n+=len(b)
            if n>cap:fail('file grew beyond cap')
            h.update(b)
    after=p.lstat()
    if n!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):fail('file changed during hash')
    require_time(deadline,'finishing hash '+str(p))
    return h.hexdigest(),n
def read_file(p:pathlib.Path,cap:int,deadline=None):
    active=LANE_START+STAGES.get(LANE_STAGE,STAGES['evidence'])-2 if LANE_START else time.monotonic()+3600
    deadline=min(LANE_DEADLINE,active) if deadline is None and LANE_DEADLINE else (active if deadline is None else deadline)
    require_time(deadline,'reading '+str(p))
    before=p.lstat()
    if not stat.S_ISREG(before.st_mode) or p.is_symlink() or before.st_size>cap:fail('unsafe or oversized file: '+str(p))
    out=bytearray()
    with p.open('rb') as f:
      while True:
        require_time(deadline,'reading '+str(p))
        b=f.read(min(65536,cap+1-len(out)))
        if not b:break
        out.extend(b)
        if len(out)>cap:fail('file grew beyond read cap: '+str(p))
    after=p.lstat()
    if len(out)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):fail('file changed during bounded read: '+str(p))
    require_time(deadline,'finishing read '+str(p))
    return bytes(out)
def inventory(root:pathlib.Path,per_file=ARTIFACT_CAP,total_cap=ARTIFACT_CAP):
    if root.is_symlink() or not root.is_dir():fail('inventory root is not a real directory: '+str(root))
    rows=[];total=0
    for base,dirs,files in os.walk(root,followlinks=False):
        if any((pathlib.Path(base)/d).is_symlink() for d in dirs):fail('symlink directory in output')
        for name in sorted(files):
            p=pathlib.Path(base)/name;h,n=hash_file(p,per_file);total+=n
            if total>total_cap:fail('output inventory exceeds cap')
            rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
    return sorted(rows,key=lambda x:x['path']),total
def parse_stage_roster(raw:bytes):
    if len(raw)!=SOURCE_STAGE_BYTES or hashlib.sha256(raw).hexdigest()!=SOURCE_STAGE_SHA:fail('retained Git stage-roster bytes/hash differ')
    # Root retained the original `git ls-files --stage` stdout with the final LF stripped.
    # Require exactly 5,900 LF-terminated rows and one valid unterminated final row.
    if raw.endswith(b'\n') or b'\r' in raw or b'\x00' in raw:fail('retained stage-roster line ending shape differs from root capture')
    lines=raw.split(b'\n')
    if len(lines)!=SOURCE_COUNT or any(not line for line in lines):fail('retained stage-roster row count or empty-line shape differs')
    stage={}; previous=None
    for line in lines:
        m=re.fullmatch(rb'(100644|100755) ([0-9a-f]{40}) 0\t([^\t\\\x00-\x1f\x7f]+)',line)
        if not m:fail('retained stage-roster row is outside closed stage-0 grammar')
        mode_s,blob_s,path_b=m.groups()
        try:rel=path_b.decode('utf-8','strict')
        except UnicodeDecodeError:fail('retained stage path is not canonical UTF-8')
        pp=pathlib.PurePosixPath(rel)
        if (not rel or pp.is_absolute() or pp.as_posix()!=rel or any(x in ('','.','..') for x in pp.parts)
            or '\\' in rel or any(ord(c)<32 or ord(c)==127 for c in rel)):
            fail('retained stage path is not a canonical safe relative path')
        key=path_b
        if previous is not None and key<=previous:fail('retained stage paths are not strictly byte-sorted and unique')
        previous=key
        stage[rel]={'gitMode':mode_s.decode(),'gitBlobSha1':blob_s.decode()}
    if len(stage)!=SOURCE_COUNT:fail('retained stage roster is not the full tracked source set')
    return stage

def source_basis():
    raw=read_file(SOURCE_STAGE_ROSTER,SOURCE_STAGE_BYTES+1)
    stage=parse_stage_roster(raw)
    custody_raw=read_file(SOURCE_STAGE_CUSTODY,4096)
    if hashlib.sha256(custody_raw).hexdigest()!=SOURCE_STAGE_CUSTODY_SHA:fail('retained source custody metadata hash differs')
    custody=json.loads(custody_raw)
    expected={'gitStageRosterSha256':SOURCE_STAGE_SHA,'producerCommit':SOURCE_COMMIT,'producerTree':SOURCE_TREE,
      'profile':'g03.macos-source-roster-custody/1','scope':'Root readonly metadata capture; exact original build002 source digest closure, no product/tool execution.',
      'selectedInputCount':1459,'selectedInputRosterSha256':'6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2',
      'sourceRoot':'/private/tmp/weft-g03-ordinary-module','status':'','trackedCount':SOURCE_COUNT}
    if custody!=expected:fail('retained root source custody metadata schema or identity differs')
    return stage,{'profile':'g03.git-stage-roster-custody/1','sha256':SOURCE_STAGE_SHA,'bytes':SOURCE_STAGE_BYTES,'fileCount':SOURCE_COUNT,
      'terminalLf':False,'custodySha256':SOURCE_STAGE_CUSTODY_SHA,'producerCommit':SOURCE_COMMIT,'producerTree':SOURCE_TREE,'producerStatusAtCapture':''}

def git_blob_sha1(path:pathlib.Path,size:int,deadline):
    h=hashlib.sha1();h.update(b'blob '+str(size).encode('ascii')+b'\0');n=0
    with path.open('rb') as f:
      for block in iter(lambda:f.read(65536),b''):
        require_time(deadline,'Git blob hashing '+str(path));h.update(block);n+=len(block)
    if n!=size:fail('source file changed during Git blob hash')
    return h.hexdigest()

def verify_source_roster(source_root:pathlib.Path,roster_path:pathlib.Path,deadline):
    roster_raw=read_file(roster_path,1024*1024,deadline)
    if len(roster_raw)>=1024*1024: fail('source custody roster is not below its public-file cap')
    roster=json.loads(roster_raw)
    if roster.get('profile')!=SOURCE_ROSTER_PROFILE or roster.get('encoding')!='compact-json-array-v1' or roster.get('columns')!=SOURCE_ROSTER_COLUMNS or roster.get('sourceCommit')!=SOURCE_COMMIT or roster.get('sourceTree')!=SOURCE_TREE:
        fail('source custody roster identity mismatch')
    stage,basis=source_basis()
    rows=roster.get('files')
    if (not isinstance(rows,list) or len(rows)!=SOURCE_COUNT or roster.get('fileCount')!=SOURCE_COUNT or
        roster.get('totalBytes')!=SOURCE_TOTAL_BYTES or roster.get('sourceBytesCap')!=SOURCE_TOTAL_CAP or
        roster.get('maximumFileBytes')!=SOURCE_FILE_CAP or roster.get('sourceReportBytesCap')!=1024*1024 or
        roster.get('stageBasis')!=basis): fail('complete source custody roster does not match the pinned stage basis')
    expected=hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    if expected!=roster.get('rosterSha256'): fail('compact source custody roster digest mismatch')
    total=0;previous=''
    if any(not isinstance(row,list) or not row or not isinstance(row[0],str) for row in rows):fail('compact roster path column is malformed')
    if set(stage)!=set(row[0] for row in rows):fail('compact roster paths differ from all retained stage-0 paths')
    for row in rows:
        if not isinstance(row,list) or len(row)!=4:fail('compact source custody row has wrong fixed column count')
        rel,size,digest,expected_mode=row; pp=pathlib.PurePosixPath(rel or '')
        st=stage.get(rel)
        if (not isinstance(rel,str) or not isinstance(size,int) or size<0 or size>SOURCE_FILE_CAP or
            not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest) or type(expected_mode) is not int or
            pp.is_absolute() or pp.as_posix()!=rel or any(x in ('','.','..') for x in pp.parts) or '\\' in rel or rel<=previous or st is None):
            fail('unsafe, missing, or unordered source custody row')
        previous=rel;p=source_root/rel
        q=p.parent
        while q!=source_root:
            if q.is_symlink() or not q.is_dir():fail('source custody ancestor is not a real directory: '+rel)
            q=q.parent
        before=p.lstat()
        if not stat.S_ISREG(before.st_mode) or p.is_symlink():fail('source custody entry is not a regular file: '+rel)
        mode=stat.S_IMODE(before.st_mode)
        expected_git_mode={'100644':0o644,'100755':0o755}.get(st['gitMode'])
        if expected_git_mode is None or mode!=expected_git_mode or expected_mode!=mode:fail('physical source mode differs from retained Git stage mode: '+rel)
        h,n=hash_file(p,SOURCE_FILE_CAP,deadline);blob=git_blob_sha1(p,n,deadline);mode_after=stat.S_IMODE(p.lstat().st_mode);total+=n
        if mode_after!=mode or (h,n)!=(digest,size) or blob!=st['gitBlobSha1'] or total>SOURCE_TOTAL_CAP: fail('physical source bytes/SHA256/Git blob differ from retained stage roster: '+rel)
    if total!=SOURCE_TOTAL_BYTES or total!=roster.get('totalBytes'):fail('source custody physical byte total mismatch')
    return {'profile':roster['profile'],'fileCount':len(rows),'totalBytes':total,'rosterSha256':expected,'stageBasis':basis}

def verify_portable_dependency(root:pathlib.Path, package_name:str, expected_roster:str, deadline):
    manifest_sha,_=hash_file(BROWSER_DEPS_MANIFEST,1024*1024,deadline)
    if manifest_sha!=BROWSER_DEPS_MANIFEST_SHA:fail('portable dependency metadata manifest digest mismatch')
    manifest=json.loads(read_file(BROWSER_DEPS_MANIFEST,1024*1024,deadline))
    if manifest.get('profile')!='umf.g03-table-operations-portable-js-dependencies/1':fail('portable dependency manifest profile mismatch')
    matches=[x for x in manifest.get('packages',[]) if x.get('name')==package_name]
    if len(matches)!=1:fail('portable dependency package is absent or duplicated in closed manifest')
    package=matches[0]; entries=package.get('entries',{}); expected_files=entries.get('files',[])
    if set(package)!={'entries','entryCount','fileBytes','fileCount','name','nativeMagicPaths','root','rosterSha256','version'} or set(entries)!={'directories','files','symlinks'}:
        fail('portable dependency manifest row schema is not closed')
    if any(set(row)!={'bytes','mode','path','sha256'} for row in expected_files) or any(set(row)!={'mode','path'} for row in entries.get('directories',[])):
        fail('portable dependency file/directory entry schema is not closed')
    if package.get('root')!=str(root) or package.get('version')!='1.62.1' or entries.get('symlinks')!=[] or package.get('nativeMagicPaths')!=[]:
        fail('portable browser package includes nonportable or mismatched entries')
    rows,total=inventory(root,per_file=64*1024*1024,total_cap=64*1024*1024)
    actual=[{'bytes':r['sizeBytes'],'mode':stat.S_IMODE((root/r['path']).lstat().st_mode),
        'path':r['path'],'sha256':r['sha256']} for r in rows]
    if actual!=expected_files or len(rows)!=package.get('fileCount') or total!=package.get('fileBytes') or package.get('rosterSha256')!=expected_roster:
        fail('physical portable dependency tree differs from its captured complete inventory')
    dirs=[]
    for base,subdirs,_ in os.walk(root,followlinks=False):
      for name in subdirs:
        p=pathlib.Path(base)/name
        dirs.append({'mode':stat.S_IMODE(p.lstat().st_mode),'path':p.relative_to(root).as_posix()})
    if sorted(dirs,key=lambda r:r['path'])!=entries.get('directories'):
      fail('portable dependency directory inventory or modes changed')
    expected_modes={r['path']:r['mode'] for r in expected_files}
    for row in rows:
      if stat.S_IMODE((root/row['path']).lstat().st_mode)!=expected_modes[row['path']]:fail('portable dependency file mode changed: '+row['path'])
    actual_entries={'directories':sorted(dirs,key=lambda r:r['path']),'files':actual,'symlinks':[]}
    if package.get('entryCount')!=len(actual_entries['files'])+len(actual_entries['directories'])+len(actual_entries['symlinks']):
      fail('portable dependency entry count differs from complete physical inventory')
    actual_roster=hashlib.sha256(json.dumps(actual_entries,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if actual_roster!=expected_roster:fail('portable dependency roster digest differs from its approved pin')
    return {'fileCount':len(rows),'totalBytes':total,'rosterSha256':actual_roster}
def verify_acquired_cargo_cache(packet:dict,deadline:float):
    cache=packet.get('cargoCache',{})
    if cache.get('executionAllowed') is not True or cache.get('status')!='SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE':
        fail('locked Cargo cache is not Sol-accepted and execution-enabled')
    runid=cache.get('acquisitionRunId')
    if not isinstance(runid,str) or not re.fullmatch(r'[0-9a-f]{32}',runid):fail('acquisition run identity is malformed')
    acq_root=pathlib.Path(cache.get('acquisitionOperatorRoot',''))
    if acq_root!=pathlib.Path('/private/tmp/g03-linux-locked-cargo-cache-operator-007'):fail('acquisition operator root differs from approved exact root')
    manifest=acq_root/'integrity-manifest.json';acq_packet=acq_root/'inputs/cache-acquisition-packet.json'
    if hash_file(manifest,4*1024*1024,deadline)[0]!=cache.get('acquisitionOperatorManifestSha256'):fail('acquisition operator manifest digest differs')
    if hash_file(acq_packet,128*1024,deadline)[0]!=cache.get('acquisitionPacketSha256'):fail('acquisition input packet digest differs')
    acquisition_packet=json.loads(read_file(acq_packet,128*1024,deadline))
    if acquisition_packet.get('profile')!='g03.locked-cargo-cache-inputs/1' or acquisition_packet.get('status')!='FROZEN_LOCAL_INPUTS':fail('acquisition packet profile/status is not the reviewed contract')
    if (acquisition_packet.get('source',{}).get('commit')!=SOURCE_COMMIT or acquisition_packet.get('source',{}).get('tree')!=SOURCE_TREE or
        acquisition_packet.get('cargoLock',{}).get('registryPackageCount')!=115 or acquisition_packet.get('cargoLock',{}).get('registryPackageRosterSha256')!='4d2783d27f77d329a6367866b973255224993f54c830edcc78f554a5f52a2346' or
        acquisition_packet.get('runtime',{}).get('imageId')!=BUILDER or acquisition_packet.get('softwareOutput',{}).get('archivePath')!='software/cargo-registry.tar' or
        acquisition_packet.get('softwareOutput',{}).get('containsOnly')!=['registry/cache','registry/index']):fail('acquisition packet does not bind the reviewed P56 Cargo archive contract')
    review=pathlib.Path(cache.get('acquisitionSolReviewPath') or '')
    canonical(review)
    review_hash,_=hash_file(review,1024*1024,deadline)
    if review_hash!=cache.get('acquisitionSolReviewSha256'):fail('Sol acquisition acceptance review digest differs')
    out=acq_root/'runs'/runid
    canonical(out)
    result_path=out/'operator-result.json';guest_dir=out/'guest';canonical(guest_dir)
    result_raw=read_file(result_path,1024*1024,deadline);result_hash=hashlib.sha256(result_raw).hexdigest()
    if result_hash!=cache.get('acquisitionOperatorResultSha256'):fail('acquisition operator result digest differs')
    result=json.loads(result_raw)
    cleanup=result.get('cleanup',{})
    source=result.get('source',{});before=source.get('before',{});after=source.get('after',{})
    # The producer's top-level `failure` retains its pre-finalization seed text; accept only the independent closed PASS conjunction below.
    command=result.get('containerCommand',{});capture=command.get('capture',{});raw=capture.get('rawBytes');retained=capture.get('retainedBytes')
    pass_capture=(command.get('exitCode')==0 and command.get('captureAttempted') is True and capture.get('exitCode')==0 and capture.get('timedOut') is False and capture.get('drainExpired') is False and capture.get('captureErrors')==[] and capture.get('streamsEOF')==[True,True] and capture.get('truncated')==[False,False] and isinstance(raw,list) and isinstance(retained,list) and raw==retained and capture.get('totalRetainedBytes')==sum(raw) and capture.get('captureFailed') is False and result.get('captureAudit',{}).get('verified') is True and result.get('captureAudit',{}).get('errors')==[] and command.get('physicalClosure',{}).get('verified') is True and command.get('physicalClosure',{}).get('errors')==[])
    if (result.get('profile')!='g03.locked-cargo-cache-local-operator/1' or result.get('executionId')!=runid or
        result.get('status')!='LOCAL_LOCKED_CARGO_CACHE_ACQUISITION_PASS' or result.get('executionPerformed') is not True or
        result.get('evidenceClosureVerified') is not True or cleanup.get('verified') is not True or cleanup.get('errors')!=[] or
        cleanup.get('containerAbsent') is not True or cleanup.get('volumeAbsent') is not True or pass_capture is not True or
        result.get('sourceFreezeManifest',{}).get('sha256')!=cache.get('acquisitionOperatorManifestSha256') or
        result.get('packet',{}).get('path')!=str(acq_packet) or result.get('packet',{}).get('sha256')!=cache.get('acquisitionPacketSha256') or
        result.get('scope',{}).get('onlyCargoFetch') is not True or result.get('scope',{}).get('compile') is not False or
        result.get('scope',{}).get('tests') is not False or result.get('scope',{}).get('productImports') is not False or
        result.get('scope',{}).get('wheelBuild') is not False or before!=after or before.get('commit')!=SOURCE_COMMIT or
        before.get('tree')!=SOURCE_TREE or before.get('fileCount')!=SOURCE_COUNT or before.get('totalBytes')!=SOURCE_TOTAL_BYTES or
        result.get('image',{}).get('id')!=BUILDER or result.get('image',{}).get('platform')!='linux/amd64' or
        result.get('captureAudit',{}).get('verified') is not True):
        fail('acquisition result is not a cleaned, source-bound, evidence-closed locked-cache pass')
    guest_rel='guest/evidence/acquisition-guest-report.json'
    gr=result.get('guestReport',{})
    if gr.get('path')!=guest_rel or gr.get('sha256')!=cache.get('acquisitionGuestReportSha256') or gr.get('sha256')!=cache.get('acquisitionGuestReportSha256'):
        fail('acquisition guest-report path/hash binding differs')
    report_path=guest_dir/'evidence/acquisition-guest-report.json'
    report_raw=read_file(report_path,1024*1024,deadline)
    report_hash=hashlib.sha256(report_raw).hexdigest();report=json.loads(report_raw)
    if (report_hash!=cache.get('acquisitionGuestReportSha256') or gr.get('sizeBytes')!=len(report_raw) or gr.get('raw')!=report or
        report.get('status')!='LOCKED_CARGO_FETCH_PASS' or report.get('executionPerformed') is not True or
        report.get('packetSha256')!=cache.get('acquisitionPacketSha256') or report.get('sourceBefore')!=before or report.get('sourceAfter')!=before):
        fail('physical acquisition guest report does not match accepted result/pins')
    if report.get('lockedCrateCount')!=115 or len(report.get('lockedCrateChecks',[]))!=115 or report.get('sparseIndexWitnessCount')!=115 or len(report.get('sparseIndexWitnesses',[]))!=115:
        fail('acquisition report lacks all 115 Cargo.lock and sparse-index witnesses')
    inv=report.get('inventory',{}); idx_path=guest_dir/'evidence/inventory-index.json'
    idx_raw=read_file(idx_path,1024*1024,deadline);idx_hash=hashlib.sha256(idx_raw).hexdigest()
    if idx_hash!=cache.get('inventoryIndexSha256') or inv.get('indexSha256')!=idx_hash or inv.get('indexPath')!='evidence/inventory-index.json':fail('physical acquisition inventory index pin differs')
    idx=json.loads(idx_raw)
    if idx.get('profile')!='g03.locked-cargo-cache-inventory-index/1' or idx.get('encoding')!='chunked-compact-json-v1' or idx.get('chunkRows')!=1000:fail('acquisition inventory index schema differs')
    chunks=idx.get('chunks')
    if not isinstance(chunks,list) or not chunks or len(chunks)>100:fail('acquisition inventory chunk roster exceeds closed bounds')
    chunk_bytes=0;rows=[]
    for i,ch in enumerate(chunks):
        if set(ch)!={'path','rowCount','sizeBytes','sha256'} or ch.get('path')!=f'evidence/inventory-chunks/inventory-{i:04d}.json' or type(ch.get('sizeBytes')) is not int or not (0<ch['sizeBytes']<=1024*1024):fail('acquisition inventory chunk descriptor malformed')
        raw=read_file(guest_dir/ch['path'],1024*1024,deadline)
        if (len(raw),hashlib.sha256(raw).hexdigest())!=(ch['sizeBytes'],ch['sha256']):fail('acquisition inventory chunk physical hash differs')
        doc=json.loads(raw);batch=doc.get('rows')
        if (doc.get('profile')!='g03.locked-cargo-cache-inventory-chunk/1' or doc.get('chunkIndex')!=i or not isinstance(batch,list) or
            len(batch)!=ch['rowCount'] or not batch or doc.get('firstPath')!=batch[0].get('path') or doc.get('lastPath')!=batch[-1].get('path')):
            fail('acquisition inventory chunk schema/boundaries differ')
        rows.extend(batch);chunk_bytes+=len(raw)
        if chunk_bytes>5*1024*1024:fail('acquisition inventory chunk aggregate exceeds cap')
    row_digest=hashlib.sha256(json.dumps(rows,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    if (chunk_bytes!=cache.get('inventoryChunkBytes') or chunk_bytes!=idx.get('totalChunkBytes') or len(rows)!=cache.get('inventoryRowCount') or
        len(rows)!=idx.get('rowCount') or row_digest!=idx.get('rowsSha256') or row_digest!=inv.get('rowsSha256') or row_digest!=cache.get('inventoryRowsSha256')):
        fail('complete acquisition inventory rows do not close against packet/index/report')
    archive=inv.get('archive',{});archive_rel='guest/software/cargo-registry.tar'
    if archive.get('path')!='software/cargo-registry.tar' or archive.get('sha256')!=cache.get('archiveSha256') or archive.get('sizeBytes')!=cache.get('archiveBytes'):
        fail('actual archive descriptor differs from accepted packet pin')
    if (result.get('archiveClosure',{}).get('archiveSha256'),result.get('archiveClosure',{}).get('archiveBytes'),
        result.get('archiveClosure',{}).get('inventoryIndexSha256'),result.get('archiveClosure',{}).get('inventoryChunkBytes'),
        result.get('archiveClosure',{}).get('inventoryRows'),result.get('archiveClosure',{}).get('cacheContentBytes'),
        result.get('archiveClosure',{}).get('lockedCrateCount'),result.get('archiveClosure',{}).get('sparseIndexWitnessCount')) != (
        cache.get('archiveSha256'),cache.get('archiveBytes'),idx_hash,chunk_bytes,len(rows),cache.get('cacheContentBytes'),115,115):
        fail('operator archiveClosure does not bind physical archive and inventory')
    archive_path=guest_dir/'software/cargo-registry.tar';ah,an=hash_file(archive_path,cache['archiveMaxBytes'],deadline)
    if (ah,an)!=(cache.get('archiveSha256'),cache.get('archiveBytes')):fail('physical acquired cache archive differs from accepted SHA/size')
    closure={'runId':runid,'operatorResultSha256':result_hash,'guestReportSha256':report_hash,'inventoryIndexSha256':idx_hash,'inventoryRowsSha256':row_digest,'inventoryChunkBytes':chunk_bytes,'inventoryRowCount':len(rows),'archiveSha256':ah,'archiveBytes':an,'cacheContentBytes':cache.get('cacheContentBytes')}
    return {'guestRoot':guest_dir,'closure':closure}

def verify_frozen_manifest(path:pathlib.Path,expected_sha:str,deadline:float,owned_output:pathlib.Path):
    actual,_=hash_file(path,4*1024*1024,deadline)
    if actual!=expected_sha:fail('source freeze manifest hash differs from the caller pin')
    manifest=json.loads(read_file(path,4*1024*1024,deadline))
    if manifest.get('profile')!='umf.g03-table-operations-source-freeze/1' or manifest.get('status')!='FROZEN_SOURCE_ONLY_NOT_EXECUTED':
      fail('source freeze manifest state/profile mismatch')
    if manifest.get('executionPerformed') is not False or manifest.get('testsPerformed') is not False or manifest.get('gitMutation') is not False:
      fail('source freeze manifest claims execution, tests, or Git mutation')
    rows=manifest.get('files')
    if not isinstance(rows,list) or manifest.get('fileCount')!=len(rows):fail('source freeze manifest roster incomplete')
    seen=set();total=0
    for row in rows:
      rel=row.get('path');pp=pathlib.PurePosixPath(rel or '')
      if not isinstance(rel,str) or pp.is_absolute() or any(x in ('','.','..') for x in pp.parts) or '\\' in rel or rel in seen:
        fail('unsafe or duplicate source freeze manifest path')
      seen.add(rel); item=ROOT/rel
      if FROZEN_MANIFEST in item.parents or item==FROZEN_MANIFEST:fail('manifest cannot include itself')
      h,n=hash_file(item,int(row.get('sizeBytes',-1)),deadline)
      if (h,n)!=(row.get('sha256'),row.get('sizeBytes')):fail('frozen operator/input file differs from source manifest: '+rel)
      total+=n
    if sorted(seen)!=[r.get('path') for r in rows] or total!=manifest.get('totalBytes'):fail('source freeze manifest ordering/total differs')
    if owned_output.parent!=OUTPUT_ROOT or owned_output.name!=RUNID or owned_output.is_symlink():fail('runtime output exclusion is not the exact owned UUID subtree')
    actual_files=[]
    for base,dirs,files in os.walk(ROOT,followlinks=False):
      if pathlib.Path(base)==owned_output:
        dirs[:]=[]
        continue
      if any((pathlib.Path(base)/d).is_symlink() for d in dirs):fail('source package contains an unlisted symlink directory')
      for name in files:
        item=pathlib.Path(base)/name
        if item.is_symlink() or not stat.S_ISREG(item.lstat().st_mode):fail('source package contains an unsafe or nonregular file')
        if item!=FROZEN_MANIFEST:actual_files.append(item.relative_to(ROOT).as_posix())
    if sorted(actual_files)!=sorted(seen):fail('source package has a missing or unlisted file')
    return {'sha256':actual,'fileCount':len(rows),'totalBytes':total,'sizeBytes':path.stat().st_size,'status':manifest['status']}
def verify_phase_receipt(phase_root:pathlib.Path,inventory_rows:list[dict],deadline:float):
    by_path={r['path']:(r['sha256'],r['sizeBytes']) for r in inventory_rows}
    receipt_path=phase_root/'phase-result.json'
    receipt=json.loads(read_file(receipt_path,1024*1024,deadline))
    for row in receipt.get('publicFiles',[]):
      rel=row.get('path');actual=by_path.get(rel)
      if actual!=(row.get('sha256'),row.get('sizeBytes')):fail('phase public report/log receipt differs from physical inventory: '+str(rel))
    for command in receipt.get('commands',[]):
      for stream in command.get('streams',[]):
        rel=stream.get('path');actual=by_path.get(rel)
        if (stream.get('truncated') is not False or stream.get('physicalClosed') is not True or
            actual!=(stream.get('sha256'),stream.get('bytes')) or
            (stream.get('rawBytes')!=stream.get('bytes') or stream.get('rawSha256')!=stream.get('sha256'))):
          fail('phase raw/retained command capture no longer matches its physical log: '+str(rel))
    return {'phase':receipt.get('phase'),'status':receipt.get('status'),'receiptSha256':hash_file(receipt_path,1024*1024,deadline)[0],
        'fileCount':len(inventory_rows)}
def verify_outer_and_metadata_captures(op,inventory_rows):
    by_path={r['path']:(r['sha256'],r['sizeBytes']) for r in inventory_rows}
    outer_verified={}
    for name,record in op.containers.items():
      capture=record.get('capture')
      if not capture:continue
      physical=op.cap.verify_outer_capture(capture)
      if not physical.get('verified') or physical!=record.get('physicalClosure'):
        fail('outer process capture changed after its original closure: '+name)
      for row in physical.get('files',[]):
        rel=pathlib.Path(row['path']).relative_to(op.out).as_posix()
        if by_path.get(rel)!=(row['sha256'],row['sizeBytes']):fail('outer capture differs from final physical inventory: '+name)
      outer_verified[name]=physical
    for command in op.rows:
      for row in command.get('physicalCaptureFiles',[]):
        if by_path.get(row.get('path'))!=(row.get('sha256'),row.get('sizeBytes')):
          fail('metadata raw capture differs from final physical inventory')
    return outer_verified
def write_json(path,value,cap=1024*1024,deadline=None):
    deadline=LANE_DEADLINE or (time.monotonic()+3600) if deadline is None else deadline
    raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
    if len(raw)>cap:fail('JSON exceeds per-file cap')
    with path.open('xb') as f:
      for offset in range(0,len(raw),OUTPUT_CHUNK):
        require_time(deadline,'writing '+str(path));f.write(raw[offset:offset+OUTPUT_CHUNK])
      f.flush();os.fsync(f.fileno())
    h,n=hash_file(path,cap,deadline)
    if (h,n)!=(hashlib.sha256(raw).hexdigest(),len(raw)):fail('durable JSON physical closure mismatch')
def atomic_json(path,value,cap=1024*1024,deadline=None):
    deadline=LANE_DEADLINE or (time.monotonic()+3600) if deadline is None else deadline
    raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
    if len(raw)>cap:fail('atomic JSON exceeds per-file cap')
    tmp=path.with_name(path.name+'.tmp-'+uuid.uuid4().hex)
    try:
      with tmp.open('xb') as f:
        for offset in range(0,len(raw),OUTPUT_CHUNK):
          require_time(deadline,'writing '+str(tmp));f.write(raw[offset:offset+OUTPUT_CHUNK])
        f.flush();os.fsync(f.fileno())
      require_time(deadline,'replacing '+str(path));os.replace(tmp,path)
      dfd=os.open(str(path.parent),os.O_RDONLY)
      try:os.fsync(dfd)
      finally:os.close(dfd)
      h,n=hash_file(path,cap,deadline)
      if (h,n)!=(hashlib.sha256(raw).hexdigest(),len(raw)):fail('atomic JSON physical closure mismatch')
    finally:
      try:tmp.unlink()
      except FileNotFoundError:pass
def sized_result_bytes(value):
    for _ in range(12):
        raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
        if value.get('operatorResultBytes')==len(raw): return raw
        value['operatorResultBytes']=len(raw)
    fail('final result size field did not converge')

def bounded_metadata(argv,timeout=20,capture_limit=METADATA_CAPTURE_LIMIT,deadline=None):
    start=time.monotonic(); wall_deadline=min(start+timeout,deadline if deadline is not None else (LANE_DEADLINE or start+timeout))
    limit=wall_deadline-3.0;hard_deadline=wall_deadline
    if start>=limit: raise TimeoutError('metadata command cannot start before its lane/stage deadline: '+argv[0])
    if capture_limit<=0: raise RuntimeError('metadata command has no remaining shared capture allowance: '+argv[0])
    proc=None; sel=selectors.DefaultSelector(); chunks=[bytearray(),bytearray()]; hashes=[hashlib.sha256(),hashlib.sha256()]; raw=[0,0]; labels=['stdout','stderr']; eof=[False,False]
    timed=False; overflow=False; errors=[]; terminate_at=None; hard=False
    try:
      proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
      for i,s in enumerate((proc.stdout,proc.stderr)):os.set_blocking(s.fileno(),False);sel.register(s,selectors.EVENT_READ,i)
      while proc.poll() is None or sel.get_map():
        now=time.monotonic()
        if now>=limit and terminate_at is None:
          timed=True;terminate_at=now
          try:os.killpg(proc.pid,signal.SIGTERM)
          except ProcessLookupError:pass
        if terminate_at is not None and not hard and now-terminate_at>=1.5:
          if proc.poll() is None:
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
          hard=True
        if now>=hard_deadline:
          for key in list(sel.get_map().values()):
            try:sel.unregister(key.fileobj);key.fileobj.close()
            except (KeyError,OSError):pass
          if proc.poll() is None:errors.append('reap-expired');break
        for key,_ in sel.select(min(.1,max(.001,limit-now)) if terminate_at is None else .05):
          i=key.data;room=capture_limit-sum(map(len,chunks))
          if room<=0:
            overflow=True
            if terminate_at is None:
              terminate_at=time.monotonic()
              try:os.killpg(proc.pid,signal.SIGTERM)
              except ProcessLookupError:pass
            continue
          try:b=os.read(key.fileobj.fileno(),min(65536,room))
          except BlockingIOError:continue
          if not b:eof[i]=True;sel.unregister(key.fileobj);key.fileobj.close();continue
          raw[i]+=len(b);hashes[i].update(b);keep=min(len(b),max(0,room));chunks[i].extend(b[:keep])
          if keep<len(b):overflow=True
          if overflow and terminate_at is None:
            terminate_at=time.monotonic()
            try:os.killpg(proc.pid,signal.SIGTERM)
            except ProcessLookupError:pass
      if proc.poll() is None:
        try:proc.wait(timeout=max(.001,min(1,hard_deadline-time.monotonic())))
        except subprocess.TimeoutExpired:
          try:os.killpg(proc.pid,signal.SIGKILL)
          except ProcessLookupError:pass
          try:proc.wait(timeout=1)
          except subprocess.TimeoutExpired:errors.append('reap-expired')
    except BaseException as exc:errors.append(type(exc).__name__+': '+str(exc)[:180])
    finally:
      for s in (() if proc is None else (proc.stdout,proc.stderr)):
        try:s.close()
        except OSError:pass
      sel.close()
    end=time.monotonic();retained=sum(map(len,chunks)); complete=bool(proc is not None and proc.returncode is not None and all(eof) and not timed and not overflow and not errors)
    return {'argv':argv,'cwd':os.getcwd(),'startMonotonic':start,'endMonotonic':end,'exitCode':None if proc is None else proc.returncode,'elapsedSeconds':round(end-start,6),
      'stdout':bytes(chunks[0]).decode('utf-8','replace'),'stderr':bytes(chunks[1]).decode('utf-8','replace'),
      'stdoutRawBase64':base64.b64encode(bytes(chunks[0])).decode('ascii'),'stderrRawBase64':base64.b64encode(bytes(chunks[1])).decode('ascii'),
      'stdoutBytes':raw[0],'stdoutSha256':hashes[0].hexdigest(),'stderrBytes':raw[1],'stderrSha256':hashes[1].hexdigest(),
      'retainedBytes':retained,'stdoutRetainedBytes':len(chunks[0]),'stderrRetainedBytes':len(chunks[1]),'captureLimitBytes':capture_limit,'timedOut':timed,'truncated':overflow,
      'timeCapSeconds':round(wall_deadline-start,3),'terminationGraceSeconds':3,'wallDeadlineMonotonic':wall_deadline,
      'streamsEOF':eof,'captureComplete':complete,'captureErrors':errors}
def create_volume(op,name,runid,kind):
    if op.meta(['docker','volume','ls','--filter','name=^'+name+'$','--format','{{.Name}}']):fail('owned volume name already exists')
    row=op.observe(['docker','volume','create','--driver','local','--label','codex.g03.execution-id='+runid,'--label','codex.g03.kind='+kind,name])
    if row['exitCode'] or row['stdout'].strip()!=name:fail('owned volume creation failed')
    meta=op.meta(['docker','volume','inspect','--format','{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.execution-id"}}|{{index .Labels "codex.g03.kind"}}',name])
    if meta!=f'{name}|local|{runid}|{kind}':fail('owned volume identity mismatch')
def container_id(op,name):
    out=op.meta(['docker','inspect','--format','{{.Id}}|{{index .Config.Labels "codex.g03.execution-id"}}|{{.Image}}|{{.State.ExitCode}}|{{index .Config.Labels "codex.g03.kind"}}',name])
    vals=out.split('|')
    if len(vals)!=5 or vals[1]!=RUNID or vals[2] not in (BUILDER,PG_IMAGE,BROWSER_IMAGE) or not re.fullmatch(r'[0-9a-f]{64}',vals[0]) or vals[4]!='table-operations':fail('container identity/ownership mismatch')
    return {'id':vals[0],'executionId':vals[1],'imageId':vals[2],'exitCode':int(vals[3]) if vals[3] else None,'kind':vals[4]}

RUNID=''
def host_source_identity(op):
    base=['git','-C',str(SOURCE)]
    ident={'identityBasis':'bounded_host_git_metadata'}
    for key,args in [('commit',['rev-parse','HEAD']),('tree',['rev-parse','HEAD^{tree}']),('status',['status','--porcelain'])]:
        ident[key]=op.meta(base+args,timeout=12)
    if {k:ident[k] for k in ('commit','tree','status')}!={'commit':SOURCE_COMMIT,'tree':SOURCE_TREE,'status':''}:
        fail('bounded host Git identity/cleanliness differs from P56 custody')
    return ident

class Operator:
 def __init__(self,runid,out,packet,start,cache_guest_root):
    self.runid=runid;self.out=out;self.packet=packet;self.start=start;self.deadline=self.start+TOTAL-TERMINAL_RESERVE;self.cache_guest_root=cache_guest_root
    self.rows=[];self.containers={};self.volumes={};self.owned_names=set();self.network=f'g03-table-net-{runid}';self.network_id=None;self.cleanup_mode=False
    self.pgdata=f'g03-table-pgdata-{runid}';self.venv=f'g03-table-venv-{runid}';self.target=f'g03-table-target-{runid}';self.cargo=f'g03-table-cargo-{runid}'
    self.capture_errors=[];self.log_bytes=0;self.stage='setup';self.metadata_sequence=0
    sys.dont_write_bytecode=True
    spec=importlib.util.spec_from_file_location('bounded_capture',CAPTURE)
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper);self.cap=helper
 def observe(self,argv,timeout=20):
    remaining=max(0,LOG_CAP-(0 if self.cleanup_mode else LOG_CLEANUP_RESERVE)-self.log_bytes)
    if remaining<=0: fail('shared raw-log allowance reached its terminal reserve')
    stage_deadline=self.stage_deadline()
    r=bounded_metadata(argv,timeout,min(METADATA_CAPTURE_LIMIT,remaining),stage_deadline)
    physical=[]
    for label,key,hash_key,retained_key in (('stdout','stdoutRawBase64','stdoutSha256','stdoutRetainedBytes'),('stderr','stderrRawBase64','stderrSha256','stderrRetainedBytes')):
      data=base64.b64decode(r.pop(key),validate=True);p=self.out/'outer'/f'metadata-{self.metadata_sequence:04d}.{label}.log'
      with p.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
      digest,size=hash_file(p,METADATA_CAPTURE_LIMIT,stage_deadline)
      if digest!=r[hash_key] or size!=r[retained_key]:fail('metadata raw capture physical hash/size mismatch')
      physical.append({'path':str(p.relative_to(self.out)),'sizeBytes':size,'sha256':digest})
    self.metadata_sequence+=1;r['physicalCaptureFiles']=physical
    self.rows.append(r);self.log_bytes+=r['retainedBytes']
    if not r['captureComplete'] or r['truncated']: fail('bounded metadata command capture failed: '+argv[0])
    return r
 def meta(self,argv,timeout=20):
    r=self.observe(argv,timeout)
    if r['exitCode']!=0: fail('bounded metadata command failed: '+argv[0])
    return r['stdout'].strip()
 def stage_deadline(self):
    return min(self.deadline,self.start+STAGES.get(self.stage,STAGES['evidence'])-2)
 def stop_owned(self,name):
    try:subprocess.run(['docker','stop','--time',str(STOP),name],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=STOP+5,check=False)
    except Exception as e:self.capture_errors.append('stop '+name+': '+type(e).__name__)
 def run_container(self,name,image,argv,stage,outdir,*,mounts,network='none',cpus='4',memory='8g',pids='8192',platform='linux/amd64',env=None,shm=None,cap_seconds=None):
    global LANE_STAGE
    LANE_STAGE=stage
    self.stage=stage
    offset=STAGES[stage]-2;deadline=min(self.deadline,self.start+offset)
    if cap_seconds is not None: deadline=min(deadline,time.monotonic()+cap_seconds)
    if time.monotonic()>=deadline:fail('stage deadline reached before '+name)
    if self.meta(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']):fail('container name already exists')
    remaining=max(0,LOG_CAP-LOG_CLEANUP_RESERVE-self.log_bytes)
    outer_allowance=min(OUTER_CAPTURE_LIMIT,remaining)
    guest_allowance=max(0,remaining-outer_allowance)
    if env is not None and 'G03_PHASE_LOG_CAP' in env: env['G03_PHASE_LOG_CAP']=str(guest_allowance)
    self.owned_names.add(name)
    self.containers[name]={'phase':name.split('-')[2] if name.startswith('g03-table-') else 'unknown'}
    spec=['docker','run','--pull=never','--platform='+platform,'--name',name,'--label','codex.g03.execution-id='+self.runid,'--label','codex.g03.kind=table-operations',
      '--read-only','--network='+network,'--cpus='+cpus,'--memory='+memory,'--pids-limit='+pids,
      '--tmpfs=/tmp:rw,nosuid,nodev,exec,size=2g']
    if shm:spec+=['--shm-size='+shm]
    for m in mounts:spec+=['--mount',m]
    if env:
      for k,v in env.items():spec+=['-e',k+'='+str(v)]
    spec += ['--workdir=/workspace',image,*argv]
    docker_env={k:os.environ[k] for k in ('PATH','HOME','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CERT_PATH','DOCKER_TLS_VERIFY') if k in os.environ}
    docker_start=time.monotonic()
    proc=subprocess.Popen(spec,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,env=docker_env,cwd=str(ROOT))
    cap=self.cap.bounded_capture(proc,self.out/'outer',name,deadline,prefix=name,aggregate_remaining=outer_allowance)
    docker_end=time.monotonic()
    closure=self.cap.verify_outer_capture(cap)
    self.log_bytes+=cap.get('totalRetainedBytes',0)
    self.containers[name]={'capture':cap,'physicalClosure':closure,'config':None,
      'command':{'argv':spec,'cwd':str(ROOT),'environment':docker_env,'startMonotonic':docker_start,'endMonotonic':docker_end,'elapsedSeconds':round(docker_end-docker_start,6),'outerAllowanceBytes':outer_allowance,'guestAllowanceBytes':guest_allowance}}
    if (proc.returncode!=0 or cap.get('timedOut') or cap.get('drainExpired') or cap.get('captureFailed') or any(cap.get('truncated',[])) or not closure.get('verified')):
      fail('bounded container command failed or capture did not close: '+name)
    if self.log_bytes>LOG_CAP-LOG_CLEANUP_RESERVE: fail('shared raw-log allowance exhausted before terminal cleanup reserve')
    phase_result=outdir/'phase-result.json'
    if phase_result.is_file():
      phase_doc=json.loads(read_file(phase_result,1024*1024,deadline))
      phase_logs=phase_doc.get('logBytes')
      if type(phase_logs) is not int or phase_logs<0 or phase_logs>guest_allowance: fail('guest phase exceeded its allocated shared log allowance')
      self.log_bytes+=phase_logs
      if self.log_bytes>LOG_CAP-LOG_CLEANUP_RESERVE: fail('shared log allowance exceeded after guest phase')
    ident=container_id(self,name);self.containers[name]['identity']=ident
    config=self.meta(['docker','inspect','--format','{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}',name])
    if config!=f'{image}|{network}|true|{pids}|{int(float(cpus)*1_000_000_000)}|{int(memory[:-1])*1024**3 if memory.endswith("g") else int(memory)}':fail('container runtime configuration differs from packet')
    self.containers[name]['config']=config
    mounts_text=self.meta(['docker','inspect','--format','{{json .Mounts}}',name]); actual_mounts=json.loads(mounts_text)
    expected={}
    for spec in mounts:
      fields=dict(part.split('=',1) for part in spec.split(',') if '=' in part); target=fields.get('target')
      if not target or target in expected: fail('duplicate or malformed declared mount')
      expected[target]={'Type':fields.get('type'),'Source':fields.get('source'),'Name':fields.get('source') if fields.get('type')=='volume' else None,'RW':not ('readonly' in spec.split(','))}
    actual={m.get('Destination'):m for m in actual_mounts}
    for target,want in expected.items():
      got=actual.get(target)
      if not got or got.get('Type')!=want['Type'] or got.get('RW')!=want['RW']:fail('container mount type/RW differs at '+target)
      if want['Type']=='volume' and got.get('Name')!=want['Name']:fail('container volume name differs at '+target)
      if want['Type']=='bind' and got.get('Source') not in (want['Source'],str(pathlib.Path(want['Source']).resolve())):fail('container bind source differs at '+target)
    if set(actual)!=set(expected):fail('container has unexpected or missing mount destinations')
    self.containers[name]['mounts']=[{k:m.get(k) for k in ('Type','Source','Name','Destination','RW')} for m in actual_mounts]
    return cap,closure
 def guest_mounts(self,outdir,prior=None,network='none'):
    ms=[f'type=bind,source={SOURCE},target=/workspace,readonly',f'type=bind,source={COHORT},target=/cohort,readonly',
        f'type=bind,source={RUNTIME},target=/operator,readonly',f'type=bind,source={self.packet_path},target=/input-packet.json,readonly',
        f'type=bind,source={SOURCE_STAGE_ROSTER},target=/input-git-stage-roster.txt,readonly',
        f'type=bind,source={SOURCE_STAGE_CUSTODY},target=/input-source-custody.json,readonly',
        f'type=bind,source={self.cache_guest_root},target=/cargo-cache-input,readonly',
        f'type=bind,source={outdir},target=/out',
        f'type=volume,source={self.venv},target=/venv'+(',readonly' if prior else ''),
        f'type=volume,source={self.target},target=/target']
    ms += [f'type=bind,source={WASM_TOOL},target=/wasm-tools/wasm-bindgen,readonly',f'type=volume,source={self.cargo},target=/cargo']
    if prior:ms.append(f'type=bind,source={prior},target=/prepared,readonly')
    return ms
 def phase(self,phase,stage,outdir,prior=None,network='none'):
    name=f'g03-table-{phase}-{self.runid}'
    remaining=max(0,LOG_CAP-LOG_CLEANUP_RESERVE-self.log_bytes)
    outer_allowance=min(OUTER_CAPTURE_LIMIT,remaining)
    guest_allowance=max(0,remaining-outer_allowance)
    env={'G03_INPUT_PACKET_SHA256':self.packet_sha,'G03_LANE_ELAPSED_AT_PHASE_START':str(round(time.monotonic()-self.start,6)),
         'G03_PHASE_LOG_CAP':str(guest_allowance)}
    return self.run_container(name,BUILDER,['/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','-B','-I','/operator/table_guest.py','--phase',phase],stage,outdir,mounts=self.guest_mounts(outdir,prior),network=network,env=env)
 def pg_start(self):
    global LANE_STAGE
    LANE_STAGE='native'
    self.stage='native'
    name=f'g03-table-pg-{self.runid}'
    if self.meta(['docker','network','ls','--filter','name=^'+self.network+'$','--format','{{.Name}}']):fail('owned network already exists')
    row=self.observe(['docker','network','create','--driver','bridge','--internal','--label','codex.g03.execution-id='+self.runid,'--label','codex.g03.kind=table-operations',self.network],timeout=20)
    network_id=row['stdout'].strip()
    if row['exitCode'] or not re.fullmatch(r'[0-9a-f]{64}',network_id):fail('owned network creation did not return a Docker network ID')
    self.network_id=network_id
    nmeta=self.meta(['docker','network','inspect','--format','{{.Id}}|{{.Name}}|{{.Driver}}|{{.Internal}}|{{index .Labels "codex.g03.execution-id"}}',self.network_id])
    if nmeta!=f'{network_id}|{self.network}|bridge|true|{self.runid}':fail('network ID/name/driver/internal/owner identity mismatch')
    if self.meta(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']):fail('PG container name already exists')
    self.owned_names.add(name); self.containers[name]={'phase':'postgres'}
    pg=['docker','run','-d','--pull=never','--platform=linux/arm64','--name',name,'--label','codex.g03.execution-id='+self.runid,'--label','codex.g03.kind=table-operations',
      '--network',self.network,'--network-alias','table-pg','--read-only','--cpus=2','--memory=2g','--pids-limit=1024',
      '--tmpfs=/tmp:rw,nosuid,nodev,size=64m','--tmpfs=/var/run/postgresql:rw,nosuid,nodev,size=64m',
      '--mount',f'type=volume,source={self.pgdata},target=/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',PG_IMAGE]
    row=self.observe(pg,timeout=30)
    if not row['captureComplete'] or row['exitCode']:fail('PostgreSQL container creation failed')
    # Observe exact owned ID/config and verify the explicit named storage mount (no anonymous data volume).
    ident=container_id(self,name);self.containers[name]={'identity':ident,'config':None}
    reported_id=row['stdout'].strip()
    if not re.fullmatch(r'[0-9a-f]{64}',reported_id) or reported_id!=ident['id']:
      fail('PostgreSQL launch ID differs from the independently inspected exact container')
    cfg=self.meta(['docker','inspect','--format','{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}',name])
    if cfg!=f'{PG_IMAGE}|{self.network}|true|1024|2000000000|2147483648':fail('PostgreSQL resource/config mismatch')
    mounts=json.loads(self.meta(['docker','inspect','--format','{{json .Mounts}}',name]))
    if len(mounts)!=1:fail('PostgreSQL container has unexpected or anonymous mounts')
    data=[m for m in mounts if m.get('Destination')=='/var/lib/postgresql']
    if len(data)!=1 or data[0].get('Type')!='volume' or data[0].get('Driver')!='local' or data[0].get('Name')!=self.pgdata or data[0].get('RW') is not True:fail('PostgreSQL data-volume identity mismatch')
    self.containers[name]['config']=cfg;self.containers[name]['mounts']=[{k:m.get(k) for k in ('Type','Name','Destination','RW')} for m in mounts]
    # Health wait is bounded to native stage; each command records its own result.
    readiness_deadline=min(time.monotonic()+60,self.start+STAGES['native']-60,self.deadline)
    while time.monotonic()<readiness_deadline:
      row=self.observe(['docker','exec',name,'pg_isready','-U','postgres'],timeout=min(5,max(.1,readiness_deadline-time.monotonic())))
      if row['exitCode']==0:break
      time.sleep(min(2,max(0,readiness_deadline-time.monotonic())))
    else:fail('PostgreSQL did not become ready before native stage cutoff')
    ver=self.meta(['docker','exec',name,'psql','-U','postgres','-Atqc',"select current_setting('server_version'), current_setting('server_version_num'), version()"],timeout=15)
    fields=ver.split('|')
    # Driver command emits a delimiter-separated closed identity.
    if len(fields)!=3 or fields[0]!='18.6 (Debian 18.6-1.pgdg13+2)' or fields[1]!='180006' or fields[2]!='PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit':fail('PostgreSQL exact server version identity mismatch')
    self.containers[name]['postgresVersion']={'serverVersion':fields[0],'serverVersionNum':fields[1],'fullVersion':fields[2]}
 def run_browser(self,prepare_dir,native_dir,outdir):
    global LANE_STAGE
    LANE_STAGE='browser'
    self.stage='browser'
    browser=self.packet['browser']; name=f'g03-table-browser-oracle-{self.runid}'
    node_module=PLAYWRIGHT/'index.mjs'; core_entry=PLAYWRIGHT_CORE/'index.mjs'
    mounts=[f'type=bind,source={SOURCE},target=/workspace,readonly',f'type=bind,source={prepare_dir}/artifacts/operation-browser-cases.json,target=/cases/operation-browser-cases.json,readonly',
      f'type=bind,source={native_dir}/artifacts/table-web,target=/table-web,readonly',f'type=bind,source={PLAYWRIGHT},target=/deps/node_modules/playwright,readonly',
      f'type=bind,source={PLAYWRIGHT_CORE},target=/deps/node_modules/playwright-core,readonly',f'type=bind,source={outdir},target=/out']
    identity_out=self.out/'browser-identity';identity_out.mkdir(exist_ok=True)
    identity_mounts=[f'type=bind,source={SOURCE},target=/workspace,readonly',f'type=bind,source={PLAYWRIGHT},target=/deps/node_modules/playwright,readonly',f'type=bind,source={PLAYWRIGHT_CORE},target=/deps/node_modules/playwright-core,readonly',f'type=bind,source={identity_out},target=/out']
    identity_cmd='mkdir -p /tmp/home && export HOME=/tmp/home; node --version && \"$WEFT_CHROMIUM_EXECUTABLE\" --version && sha256sum \"$WEFT_CHROMIUM_EXECUTABLE\"'
    identity_name=f'g03-table-browser-identity-{self.runid}'
    self.run_container(identity_name,BROWSER_IMAGE,['/bin/sh','-eu','-c',identity_cmd],'browser',identity_out,mounts=identity_mounts,network='none',platform='linux/arm64',cpus='4',memory='8g',pids='8192',env={'WEFT_CHROMIUM_EXECUTABLE':browser['chromiumExecutable'],'HOME':'/tmp/home'},shm='1g',cap_seconds=30)
    identity_lines=read_file(self.out/'outer'/(identity_name+'.stdout.log'),128*1024,self.stage_deadline()).decode('utf-8','strict').splitlines()
    if len(identity_lines)!=3 or identity_lines[0].strip()!=BROWSER_NODE or identity_lines[1].strip()!=BROWSER_CHROME or identity_lines[2].split()[0]!=CHROMIUM_SHA:fail('browser Node/Chromium runtime identity differs from pinned preflight')
    node_cmd='node tests/raw-postgresql/table-operation-browser.mjs /cases/operation-browser-cases.json /table-web /out/reports/browser.json'
    (outdir/'reports').mkdir(exist_ok=True)
    env={'WEFT_PLAYWRIGHT_MODULE':'/deps/node_modules/playwright/index.mjs','WEFT_CHROMIUM_EXECUTABLE':browser['chromiumExecutable'],'HOME':'/tmp/home'}
    cap,closure=self.run_container(name,BROWSER_IMAGE,['/bin/sh','-eu','-c',node_cmd],'browser',outdir,mounts=mounts,network='none',platform='linux/arm64',cpus='4',memory='8g',pids='8192',env=env,shm='1g')
    identity_after_out=self.out/'browser-identity-after';identity_after_out.mkdir(exist_ok=True)
    identity_after_name=f'g03-table-browser-identity-after-{self.runid}'
    self.run_container(identity_after_name,BROWSER_IMAGE,['/bin/sh','-eu','-c',identity_cmd],'browser',identity_after_out,
      mounts=identity_mounts,network='none',platform='linux/arm64',cpus='4',memory='8g',pids='8192',
      env={'WEFT_CHROMIUM_EXECUTABLE':browser['chromiumExecutable'],'HOME':'/tmp/home'},shm='1g',cap_seconds=30)
    after_lines=read_file(self.out/'outer'/(identity_after_name+'.stdout.log'),128*1024,self.stage_deadline()).decode('utf-8','strict').splitlines()
    if len(after_lines)!=3 or after_lines[0].strip()!=BROWSER_NODE or after_lines[1].strip()!=BROWSER_CHROME or after_lines[2].split()[0]!=CHROMIUM_SHA:
      fail('browser Node/Chromium identity changed after runtime use')
    return cap,closure
 def cleanup(self):
    global LANE_STAGE
    self.cleanup_mode=True
    self.stage='evidence';LANE_STAGE='evidence'
    result={'daemonReachable':False,'containers':{},'volumes':{},'networkRemoved':False,'networkAbsent':False,'verified':False}
    try:
      info=self.observe(['docker','info','--format','{{.OSType}}/{{.Architecture}}'],timeout=15);result['daemonReachable']=info['exitCode']==0 and info['stdout'].strip().startswith('linux/')
      if not result['daemonReachable']:return result
      for name in sorted(self.owned_names):
        listed=self.meta(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).splitlines()
        if listed:
          if listed!=[name]:fail('nonunique owned container listing')
          found=container_id(self,name); expected=self.containers.get(name,{}).get('identity')
          if found['executionId']!=self.runid or (expected and found['id']!=expected.get('id')):fail('refuse removal of foreign/replaced container identity')
          rm=self.observe(['docker','rm','--force',name],timeout=20)
          result['containers'][name]={'removeExit':rm['exitCode']}
          if rm['exitCode']:fail('owned container cleanup failed')
        absent=not self.meta(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).splitlines()
        result['containers'].setdefault(name,{})['absent']=absent
      for name,kind in ((self.pgdata,'table-postgres-data'),(self.venv,'table-venv'),(self.target,'table-cargo-target'),(self.cargo,'table-cargo-home')):
        listed=self.meta(['docker','volume','ls','--filter','name=^'+name+'$','--format','{{.Name}}']).splitlines()
        if listed:
          if listed!=[name]:fail('nonunique volume listing')
          desc=self.meta(['docker','volume','inspect','--format','{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.execution-id"}}|{{index .Labels "codex.g03.kind"}}',name])
          if desc!=f'{name}|local|{self.runid}|{kind}':fail('refuse removal of volume with foreign ownership')
          rm=self.observe(['docker','volume','rm',name],timeout=20)
          result['volumes'][name]={'removeExit':rm['exitCode']}
          if rm['exitCode']:fail('owned volume cleanup failed')
        absent=not self.meta(['docker','volume','ls','--filter','name=^'+name+'$','--format','{{.Name}}']).splitlines()
        result['volumes'].setdefault(name,{})['absent']=absent
      listed=self.meta(['docker','network','ls','--filter','name=^'+self.network+'$','--format','{{.Name}}']).splitlines()
      if listed:
        if listed!=[self.network]:fail('nonunique internal network listing')
        desc=self.meta(['docker','network','inspect','--format','{{.Id}}|{{.Name}}|{{.Driver}}|{{.Internal}}|{{index .Labels "codex.g03.execution-id"}}|{{index .Labels "codex.g03.kind"}}',self.network_id or self.network])
        if desc!=f'{self.network_id}|{self.network}|bridge|true|{self.runid}|table-operations':fail('refuse removal of network with foreign identity')
        rm=self.observe(['docker','network','rm',self.network],timeout=20)
        result['networkRemoved']=rm['exitCode']==0
        if rm['exitCode']:fail('owned network cleanup failed')
      result['networkAbsent']=not self.meta(['docker','network','ls','--filter','name=^'+self.network+'$','--format','{{.Name}}']).splitlines()
      result['verified']=(all(v.get('absent') and v.get('removeExit',0)==0 for v in result['containers'].values()) and
       all(v.get('absent') and v.get('removeExit',0)==0 for v in result['volumes'].values()) and result['networkAbsent'] and not self.capture_errors)
    except BaseException as e:result['error']=type(e).__name__+': '+str(e)[:200]
    return result

def main():
 global RUNID,LANE_START,LANE_DEADLINE,LANE_STAGE
 parser=argparse.ArgumentParser();parser.add_argument('--inputs',required=True,type=pathlib.Path);parser.add_argument('--inputs-sha256',required=True);parser.add_argument('--source-manifest-sha256',required=True);parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 if os.environ.get('G03_TABLE_OPERATIONS_EXECUTE')!='1' or not args.execute: fail('explicit local execution guard is absent')
 if args.inputs!=ROOT/'inputs/table-operations-packet.json': fail('only the exact local packet path is accepted')
 held=json.loads(args.inputs.read_text())
 cache=held.get('cargoCache',{})
 if held.get('status')!='FROZEN_LOCAL_INPUTS' or cache.get('executionAllowed') is not True or cache.get('status')!='SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE' or not all(cache.get(k) for k in ('acquisitionSolReviewSha256','acquisitionSolReviewPath','acquisitionRunId','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveSha256','archiveBytes','inventoryIndexSha256','inventoryRowsSha256','inventoryChunkBytes','inventoryRowCount','cacheContentBytes')):
  fail('locked Cargo cache is held; this source-only derivative is not executable')
 start=time.monotonic();LANE_START=start;LANE_DEADLINE=start+TOTAL-TERMINAL_RESERVE;LANE_STAGE='setup'
 if args.inputs!=ROOT/'inputs/table-operations-packet.json':fail('only the exact frozen local packet path is accepted')
 RUNID=uuid.uuid4().hex;out=OUTPUT_ROOT/RUNID;out.mkdir(parents=True);(out/'outer').mkdir();
 for x in ('prepare','native-wasm','browser','artifacts'): (out/x).mkdir()
 result={'profile':'umf.g03-table-operations-local-operator/2','executionKind':'local_linux_diagnostic','executionId':RUNID,'status':'FAIL_OR_UNKNOWN',
  'scope':{'lane':'table-operations','wasmFeatureProfile':['raw-postgresql-reads'],'trussFactsAndEntitySelection':False,'trussWasmProfile':False,'duplicateRustSuiteOrWheelBuild':False},
  'limits':{'inheritedTotalSeconds':TOTAL,'terminalReserveSeconds':TERMINAL_RESERVE,'terminationGraceSeconds':STOP,'publicLogBytes':LOG_CAP,'publicEvidenceBytes':EVIDENCE_CAP,'operatorResultBytesCap':1024*1024,
   'selectedArtifactBytes':ARTIFACT_CAP,'inheritedStageOffsetsSeconds':STAGES,'addedArtifactCapIsLocalOperatorDefense':True},
  'source':{'commit':SOURCE_COMMIT,'tree':SOURCE_TREE},'builderImage':BUILDER,'postgresImage':PG_IMAGE,'browserImage':BROWSER_IMAGE}
 seed={'profile':result['profile'],'executionKind':result['executionKind'],'executionId':RUNID,'status':'FAIL_OR_UNKNOWN',
       'failure':'terminal finalization has not closed','evidenceClosureVerified':False,'publicFiles':[],'publicBytes':0,
       'operatorResultBytesCap':1024*1024,'executionPerformed':False}
 write_json(out/'operator-result.json',seed,cap=1024*1024,deadline=LANE_DEADLINE)
 op=None;failure=None
 try:
    for p in (ROOT,RUNTIME,SOURCE,COHORT,WASM_TOOL,PLAYWRIGHT,PLAYWRIGHT_CORE,args.inputs,CAPTURE,FROZEN_MANIFEST,PREP_OPERATOR_RESULT,PREP_GUEST_RESULT,BROWSER_DEPS_MANIFEST,SOURCE_STAGE_ROSTER,SOURCE_STAGE_CUSTODY):canonical(p)
    source_freeze=verify_frozen_manifest(FROZEN_MANIFEST,args.source_manifest_sha256,min(start+STAGES['setup'],LANE_DEADLINE),out)
    packet_raw=read_file(args.inputs,128*1024,min(start+STAGES['setup'],LANE_DEADLINE));packet_sha=hashlib.sha256(packet_raw).hexdigest();packet_size=len(packet_raw)
    if packet_sha!=args.inputs_sha256 or packet_size!=len(packet_raw):fail('input packet exact hash mismatch')
    packet=json.loads(packet_raw)
    if packet.get('profile')!='umf.g03-table-operations-inputs/9' or packet.get('status')!='FROZEN_LOCAL_INPUTS':fail('input packet status/profile mismatch')
    cache=packet.get('cargoCache',{})
    if set(cache)!={'profile','executionAllowed','status','acquisitionOperatorRoot','acquisitionOperatorManifestSha256','acquisitionPacketSha256','acquisitionSolReviewSha256','acquisitionSolReviewPath','acquisitionRunId','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveRelativePath','archiveSha256','archiveBytes','inventoryIndexSha256','inventoryRowsSha256','inventoryChunkBytes','inventoryRowCount','cacheContentBytes','lockedCrateCount','sparseIndexWitnessCount','archiveMaxBytes','sourceImageId','mountDestination'}:fail('locked Cargo cache packet schema is not closed')
    required_cache={'profile':'umf.g03-locked-cargo-cache-consumer/1','executionAllowed':True,'status':'SOL_ACCEPTED_VERIFIED_CACHE_AVAILABLE','acquisitionOperatorRoot':'/private/tmp/g03-linux-locked-cargo-cache-operator-007','archiveRelativePath':'guest/software/cargo-registry.tar','lockedCrateCount':115,'sparseIndexWitnessCount':115,'archiveMaxBytes':67108864,'sourceImageId':BUILDER,'mountDestination':'/cargo-cache-input'}
    if any(cache.get(k)!=v for k,v in required_cache.items()) or type(cache.get('archiveBytes')) is not int or type(cache.get('inventoryChunkBytes')) is not int or type(cache.get('inventoryRowCount')) is not int or type(cache.get('cacheContentBytes')) is not int or not (0<cache['archiveBytes']<=cache['archiveMaxBytes'] and 0<=cache['inventoryChunkBytes']<=5*1024*1024 and 0<cache['inventoryRowCount']<=100000 and 0<=cache['cacheContentBytes']<=64*1024*1024) or not all(cache.get(k) for k in ('acquisitionSolReviewSha256','acquisitionSolReviewPath','acquisitionRunId','acquisitionOperatorResultSha256','acquisitionGuestReportSha256','archiveSha256','inventoryIndexSha256','inventoryRowsSha256')): fail('locked Cargo cache is not bound to an accepted acquisition and physical archive')
    cache_input_before=verify_acquired_cargo_cache(packet,min(start+STAGES['setup'],LANE_DEADLINE))
    cache_guest_root=cache_input_before['guestRoot']
    if set(packet.get('source',{}))!={'commit','tree','workflowSha256'} or packet['source']['commit']!=SOURCE_COMMIT or packet['source']['tree']!=SOURCE_TREE or len(packet['source']['workflowSha256'])!=64:fail('P56 source pins mismatch')
    if set(packet.get('browser',{}))!={'imageId','platform','nodeVersion','chromiumExecutable','chromiumVersion','chromiumSha256','playwrightVersion','playwrightTreeSha256','playwrightCoreTreeSha256'}:fail('browser identity packet schema mismatch')
    if packet['browser']!={'imageId':BROWSER_IMAGE,'platform':'linux/arm64','nodeVersion':BROWSER_NODE,'chromiumExecutable':CHROMIUM_PATH,'chromiumVersion':BROWSER_CHROME,'chromiumSha256':CHROMIUM_SHA,'playwrightVersion':'1.62.1','playwrightTreeSha256':packet['browser']['playwrightTreeSha256'],'playwrightCoreTreeSha256':packet['browser']['playwrightCoreTreeSha256']}:fail('browser identity is not exact approved route')
    wh,wn=hash_file(COHORT/'aggregate/mirror/files'/pathlib.Path(WHEEL_REL).name,64*1024*1024)
    if (wh,wn)!=(WHEEL_SHA,WHEEL_SIZE):fail('accepted final wheel hash/size mismatch')
    for p,want,cap in ((COHORT/'custody.json',COHORT_CUSTODY,1024*1024),(COHORT/'cells/linux-x86_64-py311/cohort.lock.json',COHORT_LOCK,8*1024*1024),
      (COHORT/'aggregate/index.json',COHORT_INDEX,4*1024*1024),(COHORT/'aggregate/mirror/manifest.json',COHORT_MIRROR,4*1024*1024),
      (COHORT/'aggregate/mirror/requirements.lock',COHORT_REQUIREMENTS,1024*1024),
      (WORKFLOW,packet['source']['workflowSha256'],1024*1024),
      (BROWSER_DEPS_MANIFEST,BROWSER_DEPS_MANIFEST_SHA,1024*1024),
      (SOURCE_STAGE_ROSTER,SOURCE_STAGE_SHA,SOURCE_STAGE_BYTES),(SOURCE_STAGE_CUSTODY,SOURCE_STAGE_CUSTODY_SHA,4096),
      (ROOT/'inputs/evidence/browser-tool-preflight.json',packet['provenance']['browserPreflightSha256'],1024*1024),
      (ROOT/'inputs/evidence/wasm-bindgen-version-preflight.json',packet['provenance']['wasmPreflightSha256'],1024*1024),
      (ROOT/'inputs/evidence/final-cohort-construction-result.json',packet['provenance']['cohortConstructionResultSha256'],8*1024*1024),
      (ROOT/'inputs/evidence/final-cohort-data-review.md',packet['provenance']['cohortDataReviewSha256'],1024*1024)):
      h,_=hash_file(p,cap)
      if h!=want:fail('immutable input digest mismatch: '+str(p))
    cohort_result=json.loads(read_file(ROOT/'inputs/evidence/final-cohort-construction-result.json',8*1024*1024,min(start+STAGES['setup'],LANE_DEADLINE)))
    if (cohort_result.get('candidateWheel',{}).get('sha256')!=WHEEL_SHA or
        cohort_result.get('candidateWheel',{}).get('sizeBytes')!=WHEEL_SIZE or
        cohort_result.get('candidateWheel',{}).get('builderStatus')!='FAIL_OR_UNKNOWN'):
      fail('original cohort construction failure record or selected wheel identity changed')
    if packet.get('cohort')!={'root':'/cohort','custodySha256':COHORT_CUSTODY,'lockSha256':COHORT_LOCK,'indexSha256':COHORT_INDEX,'mirrorManifestSha256':COHORT_MIRROR,'requirementsSha256':COHORT_REQUIREMENTS,
      'wheel':{'path':WHEEL_REL,'sha256':WHEEL_SHA,'sizeBytes':WHEEL_SIZE,'version':'0.4.56'}}:fail('cohort packet differs from accepted final18')
    if packet.get('stageOffsetsSeconds')!=STAGES or packet.get('aggregateSeconds')!=TOTAL:fail('inherited lane clock changed')
    prior_result_hash,_=hash_file(PREP_OPERATOR_RESULT,128*1024)
    prior_guest_hash,_=hash_file(PREP_GUEST_RESULT,1024*1024)
    if prior_result_hash!=PREP_OPERATOR_SHA or prior_guest_hash!=PREP_GUEST_SHA:fail('actual prior preparation evidence changed')
    prior_result=json.loads(read_file(PREP_OPERATOR_RESULT,128*1024,min(start+STAGES['setup'],LANE_DEADLINE)));prior_guest=json.loads(read_file(PREP_GUEST_RESULT,1024*1024,min(start+STAGES['setup'],LANE_DEADLINE)))
    if (prior_result.get('status')!='PASS_INSTALLED_SNAPSHOT_AND_COMPILER_ADMISSION_ONLY' or prior_result.get('cleanup',{}).get('verified') is not True or
        prior_guest.get('status')!='PASS_INSTALLED_SNAPSHOT_AND_COMPILER_ADMISSION_ONLY' or
        prior_guest.get('cohort',{}).get('weftSourceCommit')!=SOURCE_COMMIT or prior_guest.get('cohort',{}).get('weftSourceTree')!=SOURCE_TREE or
        prior_guest.get('cohort',{}).get('weftWheelSha256')!=WHEEL_SHA or prior_guest.get('cohort',{}).get('weftWheelSizeBytes')!=WHEEL_SIZE):
      fail('actual prior installed-preparation evidence does not bind this source and wheel')
    wasm_h,wasm_n=hash_file(WASM_TOOL,16*1024*1024)
    if (wasm_h,wasm_n)!=(packet['wasmBindgen']['sha256'],packet['wasmBindgen']['sizeBytes']):fail('wasm-bindgen tool hash mismatch')
    # Verify complete portable JS package trees; do not execute any host-native dependency.
    portable_before={}
    for root,key,count,size,sha in ((PLAYWRIGHT,'playwrightTreeSha256',62,5074152,'3a9482a4f587a730abd98fc0c620c3a6eff5d2f9a88f1a91e16dee8ec3ab6230'),
      (PLAYWRIGHT_CORE,'playwrightCoreTreeSha256',111,13442086,'d1c9e8b6e3bb37b49f5ba10a847f32bcde4d64df58b30434ab0ed66ee20e60aa')):
      if packet['browser'][key]!=sha:fail('portable Playwright tree fingerprint mismatch')
      package_name='playwright' if root==PLAYWRIGHT else 'playwright-core'
      observed=verify_portable_dependency(root,package_name,sha,min(start+STAGES['setup'],LANE_DEADLINE))
      if (observed['fileCount'],observed['totalBytes'],observed['rosterSha256'])!=(count,size,sha):fail('portable Playwright tree count/size mismatch')
      portable_before[str(root)]=observed
    cap_h,cap_n=hash_file(CAPTURE,512*1024)
    if cap_h!=CAPTURE_SHA:fail('bounded capture helper pin mismatch')
    sys.dont_write_bytecode=True
    helper_spec=importlib.util.spec_from_file_location('bounded_capture',CAPTURE);helper=importlib.util.module_from_spec(helper_spec);helper_spec.loader.exec_module(helper)
    op=Operator(RUNID,out,packet,start,cache_guest_root);op.packet_path=args.inputs;op.packet_sha=args.inputs_sha256
    source_host_before=host_source_identity(op)
    builder_meta=op.meta(['docker','image','inspect','--format','{{.Id}}|{{.Os}}/{{.Architecture}}',BUILDER])
    pg_meta=op.meta(['docker','image','inspect','--format','{{.Id}}|{{.Os}}/{{.Architecture}}|{{json .Config.Volumes}}',PG_IMAGE])
    browser_meta=op.meta(['docker','image','inspect','--format','{{.Id}}|{{.Os}}/{{.Architecture}}',BROWSER_IMAGE])
    if builder_meta!=BUILDER+'|linux/amd64' or pg_meta.split('|',2)[:2]!=[PG_IMAGE,'linux/arm64'] or browser_meta!=BROWSER_IMAGE+'|linux/arm64':fail('pinned Docker image platform/digest mismatch')
    if '/var/lib/postgresql' not in pg_meta:fail('PostgreSQL image data-volume requirement absent')
    # Exact no-network setup and bindings. Product source/cohort/package trees are mounted read-only.
    for nm,kind in ((op.venv,'table-venv'),(op.target,'table-cargo-target'),(op.pgdata,'table-postgres-data'),(op.cargo,'table-cargo-home')):create_volume(op,nm,RUNID,kind)
    host_workflow,_=hash_file(WORKFLOW,1024*1024,min(start+STAGES['bindings'],LANE_DEADLINE))
    if host_workflow!=packet['source']['workflowSha256']:fail('P56 workflow bytes changed after packet review')
    prep=out/'prepare';prepare_logs=prep/'logs';prepare_logs.mkdir();
    cap,closure=op.phase('prepare','bindings',prep)
    prep_result=json.loads(read_file(prep/'phase-result.json',1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE)))
    if prep_result.get('status')!='PREPARE_PASS':fail('offline install/comparator/bindings phase did not pass')
    source_roster_path=prep/'reports/source-inputs.rows.json'
    source_custody=verify_source_roster(SOURCE,source_roster_path, min(start+STAGES['evidence'],LANE_DEADLINE))
    if source_custody!=prep_result.get('sourceIdentity',{}).get('custody'):fail('prepare phase source custody receipt does not close')
    prep_inventory,prep_inventory_bytes=inventory(prep,ARTIFACT_CAP,ARTIFACT_CAP)
    prep_receipt_closure=verify_phase_receipt(prep,prep_inventory,min(start+STAGES['evidence'],LANE_DEADLINE))
    # A fresh exact owned PostgreSQL 18.6 target is created only after offline package/binding admission.
    op.pg_start()
    nw=out/'native-wasm';nw.mkdir(exist_ok=True)
    cap,closure=op.phase('native-wasm','browser',nw,prior=prep,network=op.network)
    nw_result=json.loads(read_file(nw/'phase-result.json',1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE)))
    if nw_result.get('status')!='NATIVE_WASM_PASS':fail('native/WASM phase failed')
    if verify_source_roster(SOURCE,source_roster_path,min(start+STAGES['evidence'],LANE_DEADLINE))!=source_custody:
      fail('source bytes changed before/through native-WASM phase')
    prep_inventory_after,_=inventory(prep,ARTIFACT_CAP,ARTIFACT_CAP)
    if prep_inventory_after!=prep_inventory:fail('prior preparation outputs changed during native-WASM phase')
    native_inventory,native_inventory_bytes=inventory(nw,ARTIFACT_CAP,ARTIFACT_CAP)
    native_receipt_closure=verify_phase_receipt(nw,native_inventory,min(start+STAGES['evidence'],LANE_DEADLINE))
    browser=out/'browser';(browser/'logs').mkdir();(browser/'reports').mkdir()
    cap,closure=op.run_browser(prep,nw,browser)
    brow=(browser/'reports/browser.json')
    bh,bn=hash_file(brow,1024*1024)
    # Verify captured image identity from closed browser command logs and report status.
    br=json.loads(read_file(brow,1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE)))
    if not isinstance(br,dict) or br.get('scope')!='real Chromium shared compiler parity; no native database authority' or br.get('nativeExecutionQualified') is not False or br.get('tamperControls')!=1 or br.get('invalidUnicodeTransportControls')!=2 or br.get('nodeProcess') is not False or br.get('require') is not False or br.get('browser')!=BROWSER_CHROME.removeprefix('Google Chrome for Testing '):fail('browser report did not satisfy closed route/browser controls')
    cases=json.loads(read_file(prep/'artifacts/operation-browser-cases.json',1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE)))
    cases_hash,cases_size=hash_file(prep/'artifacts/operation-browser-cases.json',1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE))
    expected_cases=[{'name':x['name'],'status':x['expected']['status'],'nativeWasmEqual':True,'requestSha256':hashlib.sha256(x['request'].encode()).hexdigest()} for x in cases]
    if br.get('cases')!=expected_cases:fail('browser report case roster/status/hash differs from exact generated corpus')
    js_hash,js_bytes=hash_file(nw/'artifacts/table-web/weft_wasm.js',64*1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE)); wasm_hash,wasm_bytes=hash_file(nw/'artifacts/table-web/weft_wasm_bg.wasm',64*1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE))
    wasm_rows=nw_result.get('tableWasm',{}).get('files',[])
    wasm_expected={row.get('path'):(row.get('sha256'),row.get('sizeBytes')) for row in wasm_rows}
    if wasm_expected!={'weft_wasm.js':(js_hash,js_bytes),'weft_wasm_bg.wasm':(wasm_hash,wasm_bytes),
        'weft_wasm.d.ts':(wasm_expected.get('weft_wasm.d.ts',(None,None))[0],wasm_expected.get('weft_wasm.d.ts',(None,None))[1]),
        'weft_wasm_bg.wasm.d.ts':(wasm_expected.get('weft_wasm_bg.wasm.d.ts',(None,None))[0],wasm_expected.get('weft_wasm_bg.wasm.d.ts',(None,None))[1])}:
      fail('native-WASM phase artifact inventory differs from physical bytes')
    if (br.get('javascriptSha256'),br.get('wasmSha256'))!=(js_hash,wasm_hash):fail('browser-consumed table WASM bytes differ from sealed generated artifacts')
    if verify_source_roster(SOURCE,prep/'reports/source-inputs.rows.json',min(start+STAGES['evidence'],LANE_DEADLINE))!=source_custody:
      fail('source bytes changed during browser phase')
    prep_inventory_after,_=inventory(prep,ARTIFACT_CAP,ARTIFACT_CAP)
    native_inventory_after,_=inventory(nw,ARTIFACT_CAP,ARTIFACT_CAP)
    if prep_inventory_after!=prep_inventory or native_inventory_after!=native_inventory:fail('immutable earlier phase outputs changed in later phase')
    for root,key in ((PLAYWRIGHT,'playwrightTreeSha256'),(PLAYWRIGHT_CORE,'playwrightCoreTreeSha256')):
      package_name='playwright' if root==PLAYWRIGHT else 'playwright-core'
      observed=verify_portable_dependency(root,package_name,packet['browser'][key],min(start+STAGES['evidence'],LANE_DEADLINE))
      if portable_before[str(root)]!=observed:fail('portable browser dependency tree changed after runtime use')
    if prep_result.get('nativeCli',{}).get('sha256')!=nw_result.get('nativeCli',{}).get('sha256') or prep_result.get('nativeCli',{}).get('sizeBytes')!=nw_result.get('nativeCli',{}).get('sizeBytes'):
      fail('native CLI comparator identity changed between phase receipts')
    if hash_file(prep/'artifacts/operation-browser-cases.json',1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE))!=(cases_hash,cases_size):
      fail('browser case corpus changed after it was admitted')
    wasm_tool_after=hash_file(WASM_TOOL,16*1024*1024,min(start+STAGES['evidence'],LANE_DEADLINE))
    if wasm_tool_after!=(packet['wasmBindgen']['sha256'],packet['wasmBindgen']['sizeBytes']):fail('pinned wasm-bindgen bytes changed during run')
    source_freeze_after=verify_frozen_manifest(FROZEN_MANIFEST,args.source_manifest_sha256,min(start+STAGES['evidence'],LANE_DEADLINE),out)
    if source_freeze_after!=source_freeze:fail('frozen operator, packet, or local evidence changed after execution')
    cache_input_after=verify_acquired_cargo_cache(packet,min(start+STAGES['evidence'],LANE_DEADLINE))
    if cache_input_after['closure']!=cache_input_before['closure']:fail('accepted read-only Cargo cache input changed during table lane')
    source_host_after=host_source_identity(op)
    if source_host_after!=source_host_before:fail('bounded host Git commit/tree/cleanliness changed during table lane')
    # Existing browser script emits its own exact status/count assertions; preserve raw report and bind it.
    result.update(status='LOCAL_TABLE_OPERATIONS_BOUNDARY_PASS',inputPacket={'path':str(args.inputs),'sha256':packet_sha,'sizeBytes':packet_size},
      workflowSha256=host_workflow,prepareResult=prep_result,nativeWasmResult=nw_result,browserReport={'path':'browser/reports/browser.json','sha256':bh,'sizeBytes':bn,'raw':br},
      sourceCustody=source_custody,hostSourceIdentity={'before':source_host_before,'after':source_host_after},phaseInventories={'prepare':{'files':prep_inventory,'sizeBytes':prep_inventory_bytes},'nativeWasm':{'files':native_inventory,'sizeBytes':native_inventory_bytes}},
      phaseReceiptPhysicalClosure={'prepare':prep_receipt_closure,'nativeWasm':native_receipt_closure},
      portableDependencyCustody=portable_before,sourceFreezeManifest=source_freeze,lockedCargoCacheInput={'before':cache_input_before['closure'],'after':cache_input_after['closure']},
      priorCohortConstruction={'path':str(ROOT/'inputs/evidence/final-cohort-construction-result.json'),
        'sha256':packet['provenance']['cohortConstructionResultSha256'],'candidateWheelBuilderStatus':cohort_result['candidateWheel']['builderStatus'],
        'candidateWheelStatus':cohort_result['candidateWheel']['status']},
      priorPreparation={'operatorResultSha256':prior_result_hash,'guestResultSha256':prior_guest_hash,
        'operatorStatus':prior_result['status'],'guestStatus':prior_guest['status']},commandCaptures=op.containers)
 except BaseException as e:failure=type(e).__name__+': '+str(e)[:350]
 cleanup=op.cleanup() if op is not None else {'verified':False,'notStarted':True}
 if failure or not cleanup.get('verified') or time.monotonic()-start>TOTAL-TERMINAL_RESERVE:
    result['status']='FAIL_OR_UNKNOWN';result['failure']=failure or ('owned cleanup failed' if not cleanup.get('verified') else 'terminal reserve/deadline crossed')
 result['cleanup']=cleanup;result['metadataCommands']=op.rows if op else []
 result['elapsedSeconds']=round(time.monotonic()-start,3)
 failure_seed={'profile':result['profile'],'executionKind':result['executionKind'],'executionId':RUNID,'status':'FAIL_OR_UNKNOWN',
   'failure':failure or ('cleanup unverified' if not cleanup.get('verified') else 'final evidence closure pending'),
   'cleanup':cleanup,'metadataCommandCount':len(op.rows) if op else 0,
   'failedMetadataCommands':[r.get('name',r.get('argv',['unknown'])[0]) for r in (op.rows if op else []) if not r.get('captureComplete',True)],
   'executionPerformed':True,'evidenceClosureVerified':False,'operatorResultBytesCap':1024*1024}
 atomic_json(out/'operator-result.json',failure_seed,cap=1024*1024,deadline=min(start+STAGES['upload'],LANE_DEADLINE))
 # Separate public evidence from retained software artifacts; enforce the inherited 8 MiB report/log cap.
 public=[];public_total=0;artifacts=[];artifact_total=0
 for sub in ('outer','prepare','native-wasm','browser'):
    root=out/sub
    if not root.exists():continue
    for base,dirs,files in os.walk(root,followlinks=False):
      if any((pathlib.Path(base)/d).is_symlink() for d in dirs):fail('symlink output tree')
      for fname in sorted(files):
       p=pathlib.Path(base)/fname
       is_artifact='artifacts' in p.parts
       cap=(128*1024*1024 if is_artifact else 1024*1024)
       h,n=hash_file(p,cap,min(start+STAGES['evidence'],LANE_DEADLINE));row={'path':str(p.relative_to(out)),'sizeBytes':n,'sha256':h}
       if is_artifact:artifact_total+=n;artifacts.append(row)
       else:public_total+=n;public.append(row)
 physical_captures=verify_outer_and_metadata_captures(op,public+artifacts) if op is not None else {}
 result['physicalCaptureClosure']=physical_captures
 if public_total>EVIDENCE_CAP: result['status']='FAIL_OR_UNKNOWN';result['failure']='public evidence exceeds inherited 8 MiB cap'
 if artifact_total>ARTIFACT_CAP: result['status']='FAIL_OR_UNKNOWN';result['failure']='selected software artifacts exceed added 256 MiB local cap'
 result['publicFiles']=public;result['publicBytes']=public_total;result['selectedArtifacts']=artifacts;result['selectedArtifactBytes']=artifact_total
 result['operatorResultBytes']=0
 final_raw=sized_result_bytes(result)
 if len(final_raw)>1024*1024:
   result['status']='FAIL_OR_UNKNOWN';result['failure']='operator result exceeds 1 MiB per-file public cap'
   final_raw=sized_result_bytes(result)
 if public_total+len(final_raw)>EVIDENCE_CAP:
   result['status']='FAIL_OR_UNKNOWN';result['failure']='selected public evidence plus exact final result exceeds inherited 8 MiB cap'
   final_raw=sized_result_bytes(result)
 if time.monotonic()>=start+STAGES['upload'] and result['status'].endswith('PASS'):
   result['status']='FAIL_OR_UNKNOWN';result['failure']='inherited upload-stage deadline crossed during final inventory'
   final_raw=sized_result_bytes(result)
 LANE_STAGE='upload'
 output=out/'operator-result.json';candidate_status=result['status']
 if candidate_status.endswith('PASS'):
   result['candidateStatus']=candidate_status;result['status']='FAIL_OR_UNKNOWN'
   result['failure']='final receipt promotion pending physical closure';result['evidenceClosureVerified']=False
   final_raw=sized_result_bytes(result)
 atomic_json(output,result,cap=1024*1024,deadline=min(start+STAGES['upload'],LANE_DEADLINE))
 require_time(LANE_DEADLINE,'final post-write terminal reserve check')
 final_size=output.stat().st_size
 if final_size!=result['operatorResultBytes'] or public_total+final_size>EVIDENCE_CAP: fail('physical final receipt size/cap closure mismatch')
 if candidate_status.endswith('PASS'):
   result['status']=candidate_status;result['failure']=None;result['evidenceClosureVerified']=True
   final_raw=sized_result_bytes(result)
   if len(final_raw)>1024*1024 or public_total+len(final_raw)>EVIDENCE_CAP: fail('promoted final receipt exceeds inclusive public bounds')
   atomic_json(output,result,cap=1024*1024,deadline=min(start+STAGES['upload'],LANE_DEADLINE))
   require_time(LANE_DEADLINE,'promoted final post-write terminal reserve check')
   if output.stat().st_size!=result['operatorResultBytes']: fail('promoted final receipt size does not close')
 print(json.dumps({'status':result['status'],'executionId':RUNID,'output':str(out)},sort_keys=True))
 return 0 if result['status'].endswith('PASS') else 1

if __name__=='__main__': raise SystemExit(main())
