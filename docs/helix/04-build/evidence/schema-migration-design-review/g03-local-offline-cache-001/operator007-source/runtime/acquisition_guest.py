#!/usr/bin/env python3
"""Bounded registry-only Cargo cache acquisition guest; source-only artifact producer."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, shutil, signal, stat, subprocess, sys, tarfile, time, tomllib
from urllib.parse import urlparse

PKT=pathlib.Path('/input/cache-acquisition-packet.json')
SOURCE=pathlib.Path('/workspace'); CARGO_HOME=pathlib.Path('/cargo'); BASE=pathlib.Path('/opt/cargo/registry')
OUT=pathlib.Path('/out'); STAGE=pathlib.Path('/input/source-custody/git-stage-roster.txt'); CUSTODY=pathlib.Path('/input/source-custody/custody.json')
SOURCE_INPUTS=pathlib.Path('/input/source-custody/source-inputs.rows.json')
SOURCE_FILE_CAP=64*1024*1024; SOURCE_TOTAL_CAP=1024*1024*1024; CACHE_CONTENT_CAP=240*1024*1024; SCRATCH_CONTENT_CAP=240*1024*1024; SCRATCH_ENTRY_CAP=100000; CACHE_FILE_CAP=64*1024*1024; ROW_CAP=100000; CHUNK_ROWS=1000; INVENTORY_CAP=5*1024*1024; ARCHIVE_CAP=256*1024*1024; ARCHIVE_MEMBER_CAP=100000; INDEX_FILE_CAP=4*1024*1024
REGISTRY_MARKER_SIZE=177; REGISTRY_MARKER_SHA256='6d9d1d216e0f83abc5e5662ca62c92b4f23009466b54fa27321a69acdb778bb2'; REGISTRY_MARKER_MODE=0o644
FETCH_MAX_SECONDS=480; GRACE_SECONDS=10; POLL_SECONDS=.25; GUEST_WALL_SECONDS=510; GUEST_FINAL_RESERVE_SECONDS=15
LOCAL_STARTED=0.0; LOCAL_DEADLINE=0.0


def compact(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def sha_bytes(data): return hashlib.sha256(data).hexdigest()
def work_guard():
    if LOCAL_STARTED and time.monotonic()>=LOCAL_DEADLINE:raise RuntimeError('single guest monotonic duration bound reached')
def bounded_read(path,cap):
    work_guard()
    if path.is_symlink() or not path.is_file():raise RuntimeError('bounded read requires regular nonsymlink file: '+str(path))
    before=path.lstat()
    if before.st_size>cap:raise RuntimeError('bounded input exceeds file cap: '+str(path))
    with path.open('rb') as f:raw=f.read(cap+1)
    after=path.lstat()
    if len(raw)>cap or len(raw)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode))!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)):
        raise RuntimeError('bounded input changed or exceeded cap: '+str(path))
    work_guard();return raw
def toml_bounded(path,cap):
    try:return tomllib.loads(bounded_read(path,cap).decode('utf-8','strict'))
    except (ValueError,UnicodeDecodeError) as exc:raise RuntimeError('bounded TOML input invalid: '+str(path)) from exc
def write_atomic(path, value, cap=1024*1024):
    work_guard()
    raw=compact(value)+b'\n'
    if len(raw)>cap: raise RuntimeError('receipt exceeds cap: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+'.tmp')
    fd=os.open(str(tmp),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'wb') as f:
            for at in range(0,len(raw),65536):work_guard();f.write(raw[at:at+65536])
            f.flush();os.fsync(f.fileno())
        work_guard();os.replace(tmp,path); dfd=os.open(str(path.parent),os.O_RDONLY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
    finally:
        try:tmp.unlink()
        except FileNotFoundError:pass
    work_guard();return {'path':str(path.relative_to(OUT)),'sizeBytes':len(raw),'sha256':sha_bytes(raw)}

def stable_file(path,cap):
    work_guard()
    if path.is_symlink() or not path.is_file():raise RuntimeError('not regular input file: '+str(path))
    before=path.lstat()
    if before.st_size>cap:raise RuntimeError('input file exceeds cap: '+str(path))
    h=hashlib.sha256();blob=hashlib.sha1();blob.update(b'blob '+str(before.st_size).encode()+b'\0');n=0
    with path.open('rb') as f:
        for b in iter(lambda:f.read(65536),b''):
            work_guard()
            n+=len(b)
            if n>cap:raise RuntimeError('input grew beyond cap: '+str(path))
            h.update(b);blob.update(b)
    after=path.lstat()
    if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode))!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)) or n!=before.st_size:
        raise RuntimeError('input changed while hashing: '+str(path))
    work_guard();return h.hexdigest(),blob.hexdigest(),n,before.st_mode

def registry_entry_witness(registry_root):
    """Bounded lstat of immediate registry entries; only the pinned marker is read."""
    work_guard()
    if registry_root.is_symlink() or not registry_root.is_dir():
        return {'rootType':'symlink' if registry_root.is_symlink() else 'non-directory-or-absent','entries':[],'entryCount':0,'truncated':False}
    try:names=sorted(os.listdir(registry_root))
    except BaseException as exc:return {'rootType':'directory','entries':[],'entryCount':None,'truncated':True,'enumerationErrorType':type(exc).__name__[:80]}
    rows=[]; cap=min(CHUNK_ROWS,SCRATCH_ENTRY_CAP)
    for name in names[:cap]:
        work_guard(); p=registry_root/name
        try:
            st=p.lstat(); mode=stat.S_IMODE(st.st_mode)
            if stat.S_ISDIR(st.st_mode): kind='directory'
            elif stat.S_ISREG(st.st_mode): kind='regular-file'
            elif stat.S_ISLNK(st.st_mode): kind='symlink'
            else: kind='other'
            row={'name':name,'type':kind,'mode':mode,'sizeBytes':st.st_size if kind=='regular-file' else None}
            if name=='CACHEDIR.TAG' and kind=='regular-file' and st.st_size<=REGISTRY_MARKER_SIZE:
                h,_,n,mode_bits=stable_file(p,REGISTRY_MARKER_SIZE)
                row.update(sizeBytes=n,sha256=h,mode=stat.S_IMODE(mode_bits))
            rows.append(row)
        except BaseException as exc:
            rows.append({'name':name,'type':'unavailable','errorType':type(exc).__name__[:80]})
    return {'rootType':'directory','entries':rows,'entryCount':len(names),'truncated':len(names)>cap}

def verify_registry_children(registry_root,witness):
    if witness.get('rootType')!='directory' or witness.get('truncated'):
        raise RuntimeError('Cargo registry root/entry witness is unsafe or truncated')
    allowed={'cache','index','src','CACHEDIR.TAG'}
    entries=witness.get('entries',[])
    if {x.get('name') for x in entries}!=set(os.listdir(registry_root)):
        raise RuntimeError('Cargo registry entry witness changed during validation')
    marker_seen=False
    for row in entries:
        name=row['name']; p=registry_root/name
        if name=='CACHEDIR.TAG':
            if row.get('type')!='regular-file' or row.get('mode')!=REGISTRY_MARKER_MODE or row.get('sizeBytes')!=REGISTRY_MARKER_SIZE or row.get('sha256')!=REGISTRY_MARKER_SHA256:
                raise RuntimeError('Cargo registry CACHEDIR.TAG differs from exact measured marker')
            h,_,n,mode_bits=stable_file(p,REGISTRY_MARKER_SIZE)
            if (h,n,stat.S_IMODE(mode_bits))!=(REGISTRY_MARKER_SHA256,REGISTRY_MARKER_SIZE,REGISTRY_MARKER_MODE):
                raise RuntimeError('Cargo registry CACHEDIR.TAG changed after its bounded witness')
            marker_seen=True
        elif name not in allowed or row.get('type')!='directory' or p.is_symlink() or not p.is_dir():
            raise RuntimeError('Cargo registry has unexplained/unsafe immediate entry: '+name[:120])
    if not {'cache','index'}.issubset({x['name'] for x in entries}):
        raise RuntimeError('Cargo registry cache/index directory is absent')
    if not marker_seen:raise RuntimeError('Cargo registry exact measured CACHEDIR.TAG marker is absent')

def parse_stage(packet):
    cfg=packet['source'];raw=bounded_read(STAGE,cfg['stageRoster']['sizeBytes'])
    if len(raw)!=cfg['stageRoster']['sizeBytes'] or sha_bytes(raw)!=cfg['stageRoster']['sha256']:
        raise RuntimeError('retained stage roster byte pin mismatch')
    if raw.endswith(b'\n') or b'\r' in raw or b'\0' in raw:raise RuntimeError('retained stage line-ending shape differs from exact capture')
    lines=raw.split(b'\n')
    if len(lines)!=cfg['trackedCount'] or len(lines)!=cfg['stageRoster']['fileCount'] or any(not x for x in lines):
        raise RuntimeError('retained stage row count/empty-line shape differs')
    rx=re.compile(rb'(100644|100755) ([0-9a-f]{40}) 0\t([^\t\\\x00-\x1f\x7f]+)')
    out={};prior=None
    for line in lines:
        work_guard()
        m=rx.fullmatch(line)
        if not m:raise RuntimeError('stage row is outside closed stage-0 grammar')
        mode,blob,path=m.groups();rel=path.decode('utf-8','strict');pp=pathlib.PurePosixPath(rel)
        if not rel or pp.is_absolute() or pp.as_posix()!=rel or any(p in ('','.','..') for p in pp.parts) or '\\' in rel or any(ord(c)<32 or ord(c)==127 for c in rel):
            raise RuntimeError('stage path is not canonical safe UTF-8 relative path')
        if prior is not None and path<=prior:raise RuntimeError('stage paths are not strictly sorted/unique')
        prior=path;out[rel]={'mode':mode.decode(),'blob':blob.decode()}
    if len(out)!=cfg['trackedCount']:raise RuntimeError('stage roster count does not close')
    return out

def parse_lock(path, packet):
    doc=toml_bounded(path,28742)
    rows=doc.get('package')
    if not isinstance(rows,list):raise RuntimeError('Cargo.lock has no package array')
    registry=[];local=[]
    for x in rows:
        work_guard()
        name=x.get('name');version=x.get('version');source=x.get('source');checksum=x.get('checksum')
        if not isinstance(name,str) or not isinstance(version,str):raise RuntimeError('Cargo.lock package name/version malformed')
        if source is None:
            local.append({'name':name,'version':version})
        elif source==packet['cargoLock']['registrySource'] and isinstance(checksum,str) and re.fullmatch(r'[0-9a-f]{64}',checksum):
            registry.append({'name':name,'version':version,'checksumSha256':checksum,'source':source})
        else:raise RuntimeError('unapproved Cargo.lock Git/custom/path/network source: '+str(source))
    registry.sort(key=lambda x:(x['name'],x['version']));local.sort(key=lambda x:(x['name'],x['version']))
    c=packet['cargoLock']
    if (registry!=c['registryPackages'] or local!=sorted(c['localWorkspacePackages']+[
        {'name':x['name'],'version':x['version']} for x in c['pathPackages']],key=lambda x:(x['name'],x['version'])) or
        len(registry)!=c['registryPackageCount'] or len(local)!=c['registryPackageCount']*0+c['localWorkspacePackageCount']+c['pathPackageCount']):
        raise RuntimeError('Cargo.lock package/source/checksum roster differs from sealed packet')
    if sha_bytes(compact(registry))!=c['registryPackageRosterSha256'] or sha_bytes(compact(c['localWorkspacePackages']))!=c['localWorkspaceRosterSha256'] or sha_bytes(compact(c['pathPackages']))!=c['pathPackageRosterSha256']:
        raise RuntimeError('Cargo.lock closed package roster digest mismatch')
    if doc.get('version')!=4:raise RuntimeError('Cargo.lock format version changed')
    return doc,registry,local

def verify_cargo_manifest(packet, local):
    manifest=toml_bounded(SOURCE/'Cargo.toml',SOURCE_FILE_CAP)
    expected_path=packet['cargoLock']['pathPackages']
    cargo_config=toml_bounded(SOURCE/'.cargo/config.toml',SOURCE_FILE_CAP)
    config=cargo_config.get('target',{}).get('wasm32-unknown-unknown',{})
    if set(cargo_config)!={'target'} or config!={'rustflags':['--cfg','getrandom_backend="unsupported"']}:raise RuntimeError('source Cargo config differs from the closed target-rustflags-only profile')
    patch=manifest.get('patch',{}).get('crates-io',{})
    if patch!={'ahash':{'path':'vendor/ahash'}} or expected_path!=[{'name':'ahash','version':'0.8.12','path':'vendor/ahash','source':'Cargo.toml [patch.crates-io]'}]:
        raise RuntimeError('workspace path patch differs from the single closed vendor allowlist')
    vendor=SOURCE/'vendor/ahash/Cargo.toml'
    vd=toml_bounded(vendor,SOURCE_FILE_CAP)
    vp=vd.get('package',{})
    if (vp.get('name'),vp.get('version'))!=('ahash','0.8.12'):raise RuntimeError('vendored ahash package identity mismatch')
    members=manifest.get('workspace',{}).get('members',[])
    member_names=[]
    for member in members:
        q=SOURCE/member/'Cargo.toml'
        member_doc=toml_bounded(q,SOURCE_FILE_CAP)
        package=member_doc.get('package',{});name=package.get('name');version=package.get('version')
        if isinstance(version,dict) and version.get('workspace') is True:version=manifest['workspace']['package']['version']
        if not name:raise RuntimeError('workspace member package identity missing: '+member)
        member_names.append((name,version))
    expected={(x['name'],x['version']) for x in packet['cargoLock']['localWorkspacePackages']}
    if set(member_names)!=expected or len(member_names)!=len(expected):raise RuntimeError('workspace member/local lock package roster mismatch')
    all_local={(x['name'],x['version']) for x in local}
    if all_local!=expected|{('ahash','0.8.12')}:raise RuntimeError('lock local/path package set is not closed')

def verify_source(packet, stage):
    cfg=packet['source']; lock_cfg=cfg['cargoLock']; manifest_cfg=cfg['cargoManifest']; config_cfg=cfg['cargoConfig']
    for spec in (lock_cfg,manifest_cfg,config_cfg):
        h,_,n,_=stable_file(SOURCE/spec['path'],SOURCE_FILE_CAP)
        if (h,n)!=(spec['sha256'],spec['sizeBytes']):raise RuntimeError('source manifest/lock/config pin mismatch: '+spec['path'])
    _,registry,local=parse_lock(SOURCE/'Cargo.lock',packet);verify_cargo_manifest(packet,local)
    selected_spec=cfg['sourceInputs'];selected_raw=bounded_read(SOURCE_INPUTS,selected_spec['sizeBytes'])
    if len(selected_raw)!=selected_spec['sizeBytes'] or sha_bytes(selected_raw)!=selected_spec['sha256']:raise RuntimeError('original selected-source roster pin mismatch')
    selected=json.loads(selected_raw)
    if not isinstance(selected,list) or len(selected)!=selected_spec['rowCount'] or selected!=sorted(selected,key=lambda x:x.get('path','')):raise RuntimeError('selected-source roster schema/order differs')
    selected_by={}
    for item in selected:
        if set(item)!={'path','bytes','sha256'} or not isinstance(item['path'],str) or not re.fullmatch(r'[0-9a-f]{64}',item['sha256']) or type(item['bytes']) is not int or item['bytes']<0:raise RuntimeError('selected-source row outside closed roster schema')
        rel=item['path'];pp=pathlib.PurePosixPath(rel)
        if not rel or pp.is_absolute() or pp.as_posix()!=rel or any(x in ('','.','..') for x in pp.parts) or '\\' in rel or rel not in stage or rel in selected_by:raise RuntimeError('selected-source row not unique within tracked stage')
        selected_by[rel]=item
    rows=[];total=0;prev=''
    for rel,entry in stage.items():
        if rel<=prev:raise RuntimeError('stage iteration order changed')
        prev=rel;p=SOURCE/rel;parent=p.parent
        while parent!=SOURCE:
            if parent.is_symlink() or not parent.is_dir():raise RuntimeError('source ancestor not a real directory: '+rel)
            parent=parent.parent
        h,blob,n,mode_bits=stable_file(p,SOURCE_FILE_CAP);mode=stat.S_IMODE(mode_bits)
        if mode!={'100644':0o644,'100755':0o755}[entry['mode']]:raise RuntimeError('source mode differs from stage row: '+rel)
        if blob!=entry['blob']:raise RuntimeError('physical source Git blob differs from captured stage row: '+rel)
        selected_item=selected_by.get(rel)
        if selected_item is not None and (selected_item['bytes']!=n or selected_item['sha256']!=h):raise RuntimeError('physical selected source differs from original 1459-row roster: '+rel)
        total+=n;rows.append([rel,n,h,mode])
        if total>SOURCE_TOTAL_CAP:raise RuntimeError('source total exceeds guard')
    if len(rows)!=cfg['trackedCount'] or total!=cfg['totalBytes']:raise RuntimeError('physical source count/total differs')
    roster_sha=sha_bytes(compact(rows))
    return {'profile':'g03.locked-cargo-source-closure/1','commit':cfg['commit'],'tree':cfg['tree'],'stageRosterSha256':cfg['stageRoster']['sha256'],
      'stageRosterBytes':cfg['stageRoster']['sizeBytes'],'fileCount':len(rows),'totalBytes':total,'rosterSha256':roster_sha,
      'selectedSourceRosterSha256':selected_spec['sha256'],'selectedSourceRowCount':len(selected_by),
      'cargoManifestSha256':manifest_cfg['sha256'],'cargoLockSha256':lock_cfg['sha256'],'cargoConfigSha256':config_cfg['sha256'],
      'registryPackageCount':len(registry),'localPackageCount':len(local)}

def tree_size_guard(root:pathlib.Path):
    if root.is_symlink() or not root.is_dir():raise RuntimeError('cache guard root unsafe')
    total=0;count=1
    for base,dirs,files in os.walk(root,topdown=True,followlinks=False):
        work_guard()
        bp=pathlib.Path(base)
        for d in dirs:
            work_guard()
            p=bp/d
            if p.is_symlink() or not p.is_dir():raise RuntimeError('cache guard found symlink/non-directory')
            count+=1
        for n in files:
            work_guard()
            p=bp/n
            if p.is_symlink() or not p.is_file():raise RuntimeError('cache guard found symlink/non-file')
            st=p.lstat()
            if st.st_size>CACHE_FILE_CAP:raise RuntimeError('cache guard per-file size cap exceeded')
            total+=st.st_size;count+=1
            if total>SCRATCH_CONTENT_CAP or count>SCRATCH_ENTRY_CAP:raise RuntimeError('complete Cargo-home scratch content/entry cap exceeded')
        if count>SCRATCH_ENTRY_CAP:raise RuntimeError('complete Cargo-home scratch entry cap exceeded')
    return total,count

def tree_inventory(root:pathlib.Path,prefix:str,deadline=None):
    if root.is_symlink() or not root.is_dir():raise RuntimeError('cache tree root is absent or unsafe: '+str(root))
    rows=[];total=0;dirs=[]
    for base,subdirs,files in os.walk(root,topdown=True,followlinks=False):
        work_guard()
        basep=pathlib.Path(base)
        for d in sorted(subdirs):
            p=basep/d
            if p.is_symlink() or not p.is_dir():raise RuntimeError('symlink/non-directory in registry cache')
            dirs.append(p)
        for name in sorted(files):
            work_guard()
            p=basep/name
            if p.is_symlink() or not p.is_file():raise RuntimeError('symlink/nonregular file in registry cache')
            h,_,n,mode=stable_file(p,CACHE_FILE_CAP);rel=prefix+'/'+p.relative_to(root).as_posix();rows.append({'path':rel,'kind':'file','sizeBytes':n,'sha256':h,'mode':stat.S_IMODE(mode)});total+=n
            if total>CACHE_CONTENT_CAP:raise RuntimeError('registry software content exceeds declared 240 MiB cap')
            if len(rows)>ROW_CAP:raise RuntimeError('registry inventory row count exceeds bound')
    for p in dirs:
        work_guard()
        rel=prefix+'/'+p.relative_to(root).as_posix();rows.append({'path':rel,'kind':'directory','sizeBytes':0,'sha256':None,'mode':stat.S_IMODE(p.lstat().st_mode)})
    rows.append({'path':prefix,'kind':'directory','sizeBytes':0,'sha256':None,'mode':stat.S_IMODE(root.lstat().st_mode)})
    if len(rows)>ROW_CAP:raise RuntimeError('registry inventory row count exceeds bound')
    rows.sort(key=lambda x:x['path'])
    return rows,total

def copy_tree_bounded(src,dst):
    if src.is_symlink() or not src.is_dir() or dst.exists() or dst.is_symlink():raise RuntimeError('bounded registry seed copy paths unsafe/nonfresh')
    os.mkdir(dst,stat.S_IMODE(src.lstat().st_mode))
    for base,dirs,files in os.walk(src,topdown=True,followlinks=False):
        work_guard();basep=pathlib.Path(base);rel=basep.relative_to(src);destbase=dst/rel
        for name in sorted(dirs):
            work_guard();s=basep/name;d=destbase/name
            if s.is_symlink() or not s.is_dir():raise RuntimeError('unsafe directory during base seed copy')
            os.mkdir(d,stat.S_IMODE(s.lstat().st_mode))
        for name in sorted(files):
            work_guard();s=basep/name;d=destbase/name
            if s.is_symlink() or not s.is_file():raise RuntimeError('unsafe file during base seed copy')
            before=s.lstat()
            if before.st_size>CACHE_FILE_CAP:raise RuntimeError('base seed file exceeds per-file cache cap')
            copied=0
            with s.open('rb') as sf,d.open('xb') as df:
                while True:
                    work_guard();block=sf.read(65536)
                    if not block:break
                    copied+=len(block)
                    if copied>before.st_size or copied>CACHE_FILE_CAP:raise RuntimeError('base seed grew beyond bounded copy size')
                    df.write(block)
                df.flush();os.fsync(df.fileno())
            after=s.lstat()
            if copied!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise RuntimeError('base seed input changed during copy')
            shutil.copystat(s,d,follow_symlinks=False)
        shutil.copystat(basep,destbase,follow_symlinks=False)

def sparse_index_path(name):
    n=name.lower()
    if len(n)==1:return '1/'+n
    if len(n)==2:return '2/'+n
    if len(n)==3:return '3/'+n[0]+'/'+n
    return n[:2]+'/'+n[2:4]+'/'+n

def parse_sparse_index(raw,expected_name):
    if len(raw)>INDEX_FILE_CAP or not raw.startswith(b'\x03\x02\x00\x00\x00'):raise RuntimeError('sparse index cache entry header/size invalid')
    pos=5
    def field():
        nonlocal pos
        end=raw.find(b'\0',pos)
        if end<0:raise RuntimeError('sparse index cache has unterminated field')
        value=raw[pos:end];pos=end+1;return value
    etag=field()
    if not etag.startswith(b'etag: ') or len(etag)>4096:raise RuntimeError('sparse index cache etag field invalid')
    records={}
    while pos<len(raw):
        work_guard()
        version=field().decode('utf-8','strict');record_raw=field()
        try:record=json.loads(record_raw)
        except (ValueError,UnicodeDecodeError) as exc:raise RuntimeError('sparse index package record invalid') from exc
        if not isinstance(record,dict) or record.get('name')!=expected_name or record.get('vers')!=version or not re.fullmatch(r'[0-9a-f]{64}',record.get('cksum','')):
            raise RuntimeError('sparse index version/name/checksum fields do not close')
        if version in records:raise RuntimeError('duplicate sparse index package version')
        records[version]={'checksumSha256':record['cksum'],'recordSha256':sha_bytes(record_raw),'recordBytes':len(record_raw)}
    return records

def sparse_index_witnesses(registry,inventory,index_root):
    rows={r['path']:r for r in inventory if r['kind']=='file'};parsed={};witnesses=[]
    for pkg in registry:
        work_guard();path=f'registry/index/{index_root}/.cache/{sparse_index_path(pkg["name"])}'
        row=rows.get(path)
        if row is None or row['sizeBytes']>INDEX_FILE_CAP:raise RuntimeError('canonical sparse index cache file absent/over cap: '+pkg['name'])
        if path not in parsed:
            raw=bounded_read(CARGO_HOME/path,INDEX_FILE_CAP)
            if sha_bytes(raw)!=row['sha256'] or len(raw)!=row['sizeBytes']:raise RuntimeError('sparse index cache bytes differ from inventory')
            parsed[path]=parse_sparse_index(raw,pkg['name'])
        record=parsed[path].get(pkg['version'])
        if not record or record['checksumSha256']!=pkg['checksumSha256']:raise RuntimeError('sparse index locked version/checksum mismatch: '+pkg['name']+' '+pkg['version'])
        witnesses.append({'name':pkg['name'],'version':pkg['version'],'path':path,'checksumSha256':record['checksumSha256'],
          'recordSha256':record['recordSha256'],'recordBytes':record['recordBytes'],'cacheFileSha256':row['sha256']})
    if len(witnesses)!=len(registry):raise RuntimeError('sparse index witness count differs from 115 locked registry rows')
    return witnesses

def verify_registry_config(index_root):
    found=[]
    for p in index_root.glob('*/config.json'):
        if p.is_symlink() or not p.is_file():raise RuntimeError('unsafe registry config.json')
        raw=bounded_read(p,1024*1024);doc=json.loads(raw)
        if set(doc)-{'dl','api','auth-required'} or not isinstance(doc.get('dl'),str):raise RuntimeError('registry config has unexpected/credential fields')
        u=urlparse(doc['dl'])
        if u.scheme!='https' or u.hostname!='static.crates.io' or not u.path.startswith('/crates'):
            raise RuntimeError('Cargo registry download URL is outside static.crates.io')
        if doc.get('api') is not None:
            api=urlparse(doc['api'])
            if api.scheme!='https' or api.hostname not in ('crates.io','www.crates.io'):raise RuntimeError('Cargo registry API URL is unapproved')
        found.append({'path':p.relative_to(CARGO_HOME).as_posix(),'sha256':sha_bytes(raw),'sizeBytes':len(raw),'dl':doc['dl'],'api':doc.get('api'),'authRequired':doc.get('auth-required',False)})
    if len(found)!=1:raise RuntimeError('expected exactly one standard crates.io sparse index config')
    return found[0]

def lock_archive_checks(registry, inventory):
    by_name={}
    for r in inventory:
        if r['kind']=='file' and r['path'].startswith('registry/cache/') and r['path'].endswith('.crate'):
            by_name.setdefault(pathlib.PurePosixPath(r['path']).name,[]).append(r)
    checks=[]
    for pkg in registry:
        name=pkg['name']+'-'+pkg['version']+'.crate';matches=by_name.get(name,[])
        if len(matches)!=1:raise RuntimeError('locked registry archive missing/duplicated: '+name)
        row=matches[0]
        if row['sha256']!=pkg['checksumSha256']:raise RuntimeError('locked .crate SHA256 differs from Cargo.lock: '+name)
        checks.append({'name':pkg['name'],'version':pkg['version'],'archivePath':row['path'],'sizeBytes':row['sizeBytes'],'sha256':row['sha256']})
    return checks,by_name

class CappedWriter:
    def __init__(self,raw,cap):self.raw=raw;self.cap=cap;self.count=0
    def write(self,data):
        work_guard()
        if self.count+len(data)>self.cap:raise RuntimeError('deterministic archive streaming cap exceeded')
        n=self.raw.write(data)
        if n!=len(data):raise RuntimeError('deterministic archive short write')
        self.count+=n;return n
    def tell(self):return self.raw.tell()
    def flush(self):return self.raw.flush()
    def __getattr__(self,name):return getattr(self.raw,name)

class GuardedReader:
    def __init__(self,raw,expected):self.raw=raw;self.expected=expected;self.count=0
    def read(self,size=-1):
        work_guard()
        if size<0:size=self.expected-self.count
        data=self.raw.read(size)
        self.count+=len(data)
        if self.count>self.expected:raise RuntimeError('archive input grew beyond its inventoried size')
        if not data and self.count!=self.expected:raise RuntimeError('archive input ended before its inventoried size')
        return data

def archive_tree(inventory, path):
    if path.exists() or path.is_symlink():raise RuntimeError('software archive destination is not fresh')
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=path.open('xb');limited=CappedWriter(raw,ARCHIVE_CAP)
    try:
        with tarfile.open(fileobj=limited,mode='w',format=tarfile.USTAR_FORMAT) as tf:
            for row in inventory:
                work_guard();rel=row['path'];src=CARGO_HOME/rel
                ti=tarfile.TarInfo(rel);ti.uid=0;ti.gid=0;ti.uname='';ti.gname='';ti.mtime=0;ti.mode=row['mode']
                if row['kind']=='directory':
                    ti.type=tarfile.DIRTYPE;ti.size=0;tf.addfile(ti)
                else:
                    if row['sizeBytes']>CACHE_FILE_CAP:raise RuntimeError('archive input exceeds per-file ceiling')
                    ti.type=tarfile.REGTYPE;ti.size=row['sizeBytes']
                    before=src.lstat()
                    if src.is_symlink() or not src.is_file() or before.st_size!=row['sizeBytes'] or stat.S_IMODE(before.st_mode)!=row['mode']:
                        raise RuntimeError('archive input identity differs from the closed inventory')
                    with src.open('rb') as f:tf.addfile(ti,GuardedReader(f,row['sizeBytes']))
                    after=src.lstat()
                    if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode))!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)):
                        raise RuntimeError('archive input changed during bounded streaming')
        limited.flush();os.fsync(raw.fileno())
    except BaseException:
        raw.close()
        try:path.unlink()
        except FileNotFoundError:pass
        raise
    else:raw.close()
    work_guard();h,_,n,mode=stable_file(path,ARCHIVE_CAP)
    if n>ARCHIVE_CAP:raise RuntimeError('deterministic software archive exceeds 256 MiB cap')
    return {'path':str(path.relative_to(OUT)),'sizeBytes':n,'sha256':h,'mode':stat.S_IMODE(mode)}

def save_inventory_chunks(rows):
    folder=OUT/'evidence/inventory-chunks';folder.mkdir(parents=True,exist_ok=False)
    chunks=[];total=0
    for i in range(0,len(rows),CHUNK_ROWS):
        batch=rows[i:i+CHUNK_ROWS];raw=compact({'profile':'g03.locked-cargo-cache-inventory-chunk/1','chunkIndex':len(chunks),'firstPath':batch[0]['path'],'lastPath':batch[-1]['path'],'rows':batch})+b'\n'
        if len(raw)>1024*1024:raise RuntimeError('fixed inventory chunk exceeds 1 MiB')
        name=f'inventory-{len(chunks):04d}.json';p=folder/name
        with p.open('xb') as f:
            for at in range(0,len(raw),65536):work_guard();f.write(raw[at:at+65536])
            f.flush();os.fsync(f.fileno())
        h,_,n,_=stable_file(p,1024*1024);total+=n
        if total>INVENTORY_CAP:raise RuntimeError('inventory chunks exceed 5 MiB evidence allowance')
        chunks.append({'path':'evidence/inventory-chunks/'+name,'rowCount':len(batch),'sizeBytes':n,'sha256':h})
    index={'profile':'g03.locked-cargo-cache-inventory-index/1','encoding':'chunked-compact-json-v1','rowCount':len(rows),
      'chunkRows':CHUNK_ROWS,'chunks':chunks,'totalChunkBytes':total,'rowsSha256':sha_bytes(compact(rows))}
    index_info=write_atomic(OUT/'evidence/inventory-index.json',index,1024*1024)
    return index,index_info,total

def main():
    global LOCAL_STARTED,LOCAL_DEADLINE
    LOCAL_STARTED=time.monotonic();LOCAL_DEADLINE=LOCAL_STARTED+GUEST_WALL_SECONDS
    ap=argparse.ArgumentParser();ap.add_argument('--packet-sha256',required=True);args=ap.parse_args()
    report={'profile':'g03.locked-cargo-cache-guest/1','status':'FAIL_OR_UNKNOWN','executionPerformed':False,'failure':'guest has not completed'}
    report_path=OUT/'evidence/acquisition-guest-report.json'
    write_atomic(report_path,report)
    try:
        packet_raw=bounded_read(PKT,128*1024)
        if sha_bytes(packet_raw)!=args.packet_sha256:raise RuntimeError('packet digest differs')
        packet=json.loads(packet_raw)
        if set(packet)!={'profile','status','source','cargoLock','runtime','network','cacheSeed','limits','softwareOutput','evidence'} or packet.get('profile')!='g03.locked-cargo-cache-inputs/1' or packet.get('status')!='FROZEN_LOCAL_INPUTS':raise RuntimeError('closed packet profile/status mismatch')
        if packet['runtime']!={'imageId':'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10','platform':'linux/amd64','rustupToolchain':'1.90.0-x86_64-unknown-linux-gnu','rustc':'rustc 1.90.0 (1159e78c4 2025-09-14)','cargo':'cargo 1.90.0 (840b83a10 2025-07-30)','cargoPath':'/opt/rustup/toolchains/1.90.0-x86_64-unknown-linux-gnu/bin/cargo','rustupHome':'/opt/rustup','pythonPath':'/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','pythonVersion':'3.11.17'}:raise RuntimeError('explicit image/toolchain/Python pin mismatch')
        if sys.version_info[:3]!=(3,11,17) or pathlib.Path(sys.executable)!=pathlib.Path(packet['runtime']['pythonPath']):raise RuntimeError('guest interpreter is not the pinned standard-library Python')
        lim=packet['limits']
        if (lim.get('aggregateSeconds'),lim.get('terminalReserveSeconds'),lim.get('fetchCommandMaximumSeconds'),lim.get('fetchActiveSeconds'),lim.get('terminationGraceSeconds'),lim.get('cpuCores'),lim.get('memoryBytes'),lim.get('pids'),lim.get('tmpfsBytes'),lim.get('cacheContentBytes'),lim.get('scratchContentBytes'),lim.get('scratchEntries'),lim.get('scratchFileBytes'),lim.get('archiveBytes'),lim.get('archiveMemberCount'),lim.get('archiveExpandedBytes'),lim.get('sparseIndexWitnessFileBytes'),lim.get('guestWallSeconds'),lim.get('guestFinalReserveSeconds'))!=(600,60,480,470,10,2,2147483648,256,268435456,251658240,251658240,100000,67108864,268435456,100000,251658240,4194304,510,15):raise RuntimeError('acquisition safety envelope differs from frozen packet')
        if packet['network']!={'mode':'bridge','onlyNetworkUsingCommand':['cargo','fetch','--locked','--manifest-path','/workspace/Cargo.toml'],'cargoRegistryProtocol':'sparse','expectedIndexUrl':'https://index.crates.io/','allowedDownloadHost':'static.crates.io','proxyEnvironmentVariables':[],'cargoConfigSource':'read-only source .cargo/config.toml plus fresh /cargo with no user config/credentials'}:raise RuntimeError('network/source restriction packet mismatch')
        if os.environ.get('G03_PACKET_SHA256')!=args.packet_sha256:raise RuntimeError('packet environment binding differs')
        for k in os.environ:
            if k.lower().endswith('_proxy') or k.lower() in ('http_proxy','https_proxy','all_proxy','no_proxy'):raise RuntimeError('proxy environment is forbidden for acquisition')
        stage=parse_stage(packet);lock,registry,local=parse_lock(SOURCE/'Cargo.lock',packet);verify_cargo_manifest(packet,local)
        source_before=verify_source(packet,stage)
        cargo_started=False
        cargo=pathlib.Path(packet['runtime']['cargoPath']);rustc=cargo.with_name('rustc')
        env={'PATH':str(cargo.parent)+':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/tmp/home','TMPDIR':'/tmp',
          'CARGO_HOME':'/cargo','RUSTUP_HOME':'/opt/rustup','RUSTUP_TOOLCHAIN':packet['runtime']['rustupToolchain'],
          'CARGO_NET_OFFLINE':'false','CARGO_REGISTRIES_CRATES_IO_PROTOCOL':'sparse','CARGO_NET_RETRY':'2','CARGO_HTTP_TIMEOUT':'30',
          'CARGO_HTTP_LOW_SPEED_LIMIT':'10'}
        version_rows=[{'tool':'cargo','versionPinnedByBuilderImage':'1.90.0 (840b83a10 2025-07-30)','path':str(cargo)},
          {'tool':'rustc','versionPinnedByBuilderImage':'1.90.0 (1159e78c4 2025-09-14)','path':str(rustc)}]
        pathlib.Path('/tmp/home').mkdir(parents=True,exist_ok=True)
        if CARGO_HOME.exists() and any(CARGO_HOME.iterdir()):raise RuntimeError('fresh owned Cargo volume is not empty before seeding')
        CARGO_HOME.mkdir(exist_ok=True); (CARGO_HOME/'registry').mkdir()
        base_rows=[];base_total=0;base_file_bytes={}
        for name,want in [('cache',17410143),('index',13154725)]:
            src=BASE/name
            rows,total=tree_inventory(src,'registry/'+name)
            if total!=want:raise RuntimeError('exact-image pinned Cargo '+name+' regular-file apparent byte total differs')
            base_rows.extend(rows);base_total+=total;base_file_bytes[name]=total
            copy_tree_bounded(src,CARGO_HOME/'registry'/name)
        base_rows.sort(key=lambda x:x['path'])
        base_crates=[r for r in base_rows if r['kind']=='file' and r['path'].startswith('registry/cache/') and r['path'].endswith('.crate')]
        if len(compact(base_crates))>1024*1024:raise RuntimeError('base-image crate archive roster exceeds 1 MiB')
        if base_total>CACHE_CONTENT_CAP:raise RuntimeError('base image cache exceeds declared content cap')
        copied=[]
        for name in ('cache','index'):
            rows,_=tree_inventory(CARGO_HOME/'registry'/name,'registry/'+name);copied.extend(rows)
        copied.sort(key=lambda x:x['path'])
        if copied!=base_rows:raise RuntimeError('seeded registry/cache/index differs from exact image trees')
        if base_file_bytes!=packet['cacheSeed']['reportedDuBytes']:raise RuntimeError('observed exact-image regular-file apparent byte totals differ from pinned du metadata')
        seed_scratch,scratch_entries=tree_size_guard(CARGO_HOME)
        if seed_scratch>CACHE_CONTENT_CAP:raise RuntimeError('base cache seed exceeds complete Cargo-home scratch cap')
        config_before=verify_registry_config(CARGO_HOME/'registry'/'index')
        if config_before.get('authRequired'):raise RuntimeError('crates.io index config unexpectedly requires credentials')
        allowed_top={'registry'}
        if set(p.name for p in CARGO_HOME.iterdir())!=allowed_top:raise RuntimeError('Cargo home has an unexpected pre-fetch entry')
        command=['cargo','fetch','--locked','--manifest-path','/workspace/Cargo.toml']
        if command!=packet['network']['onlyNetworkUsingCommand'] or shutil.which('cargo',path=env['PATH'])!=str(cargo):raise RuntimeError('closed Cargo command/PATH identity changed')
        started=time.monotonic();remaining=LOCAL_DEADLINE-started-GUEST_FINAL_RESERVE_SECONDS
        fetch_wall=min(FETCH_MAX_SECONDS,remaining)
        if fetch_wall<=GRACE_SECONDS+1:raise RuntimeError('remaining guest duration cannot contain fetch plus termination grace')
        deadline=started+fetch_wall;grace_start=deadline-GRACE_SECONDS;proc=subprocess.Popen(command,cwd=str(SOURCE),env=env,stdin=subprocess.DEVNULL,start_new_session=True);cargo_started=True
        failure=None;timed=False;last_scan=0.0;kill_at=deadline
        while proc.poll() is None:
            now=time.monotonic()
            if now-last_scan>=POLL_SECONDS:
                last_scan=now
                try:
                    used,entry_count=tree_size_guard(CARGO_HOME)
                    if used>SCRATCH_CONTENT_CAP or entry_count>SCRATCH_ENTRY_CAP:
                        failure='complete Cargo-home scratch reached its declared 240 MiB/100000-entry cap';timed=True
                except BaseException as ex:
                    failure='registry inventory guard failed: '+type(ex).__name__;timed=True
                if timed:
                    try:os.killpg(proc.pid,signal.SIGTERM)
                    except ProcessLookupError:pass
                    kill_at=min(deadline,time.monotonic()+GRACE_SECONDS)
                    break
            if now>=grace_start and not timed:
                timed=True;failure='Cargo fetch exceeded its 480-second command cap'
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                kill_at=deadline;break
            time.sleep(.1)
        if timed and proc.poll() is None:
            try:proc.wait(timeout=max(.001,kill_at-time.monotonic()))
            except subprocess.TimeoutExpired:
                try:os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                try:proc.wait(timeout=1)
                except subprocess.TimeoutExpired:failure='Cargo child could not be reaped after SIGKILL'
        exit_code=proc.poll();ended=time.monotonic()
        report['cargoFetch']={'argv':command,'cwd':'/workspace','elapsedSeconds':round(ended-started,3),
            'maximumWallSecondsIncludingTerminationGrace':round(fetch_wall,3),'terminationGraceSeconds':GRACE_SECONDS,'exitCode':exit_code,
            'environment':env,'proxyEnvironmentPresent':False}
        report['cargoFetchCaptureStatus']='completed' if exit_code is not None else 'child-not-reaped'
        write_atomic(report_path,report)
        if failure or exit_code!=0:raise RuntimeError(failure or f'cargo fetch exit {exit_code}')
        registry_root=CARGO_HOME/'registry'
        witness=registry_entry_witness(registry_root)
        report['registryEntryWitness']=witness
        write_atomic(report_path,report)
        scratch_total,scratch_entries=tree_size_guard(CARGO_HOME)
        if scratch_total>SCRATCH_CONTENT_CAP or scratch_entries>SCRATCH_ENTRY_CAP:raise RuntimeError('post-fetch complete Cargo-home scratch cap exceeded')
        source_after=verify_source(packet,stage)
        if source_after!=source_before:raise RuntimeError('source/lock changed during Cargo acquisition')
        top=set(p.name for p in CARGO_HOME.iterdir())
        if top-{ 'registry','.package-cache','.package-cache-mutate','.global-cache'}:raise RuntimeError('Cargo home contains unexpected config/credential/binary/source entries')
        verify_registry_children(registry_root,witness)
        inv=[];total=0
        for name in ('cache','index'):
            rows,n=tree_inventory(CARGO_HOME/'registry'/name,'registry/'+name);inv.extend(rows);total+=n
        cfg_after=verify_registry_config(CARGO_HOME/'registry'/'index')
        if cfg_after['dl']!=config_before['dl']:raise RuntimeError('crates.io registry download config changed unexpectedly')
        index_root=pathlib.PurePosixPath(cfg_after['path']).parts[2]
        if not index_root.startswith('index.crates.io-'):raise RuntimeError('sparse registry cache root is not canonical crates.io')
        witnesses=sparse_index_witnesses(registry,inv,index_root)
        checks,crate_map=lock_archive_checks(registry,inv)
        base_files={r['path']:r for r in base_rows if r['kind']=='file'}
        expected_paths={x['archivePath'] for x in checks}
        for name,rows in crate_map.items():
            for row in rows:
                if row['path'] not in expected_paths and base_files.get(row['path'])!=row:
                    raise RuntimeError('unexpected newly acquired crate archive outside Cargo.lock: '+row['path'])
        if total>CACHE_CONTENT_CAP:raise RuntimeError('final registry contents exceed software content cap')
        idx,index_info,chunk_total=save_inventory_chunks(inv)
        archive=archive_tree(inv,OUT/'software/cargo-registry.tar')
        report={'profile':'g03.locked-cargo-cache-guest/1','status':'LOCKED_CARGO_FETCH_PASS','executionPerformed':True,
          'packetSha256':args.packet_sha256,'sourceBefore':source_before,'sourceAfter':source_after,'cargoVersion':version_rows,
          'guestDuration':{'clockDomain':'container_local_monotonic','anchorStartedAt':LOCAL_STARTED,'endedAt':time.monotonic(),'elapsedSeconds':round(time.monotonic()-LOCAL_STARTED,3),'maximumWallSeconds':GUEST_WALL_SECONDS,'finalReserveSeconds':GUEST_FINAL_RESERVE_SECONDS},
          'cargoFetch':report['cargoFetch'],'cargoFetchCaptureStatus':report['cargoFetchCaptureStatus'],'registryEntryWitness':witness,
          'networkSources':{'lockRegistrySource':packet['network']['expectedIndexUrl'],'registryConfig':cfg_after,
            'lockedRegistryPackageCount':len(registry),'onlyAcquisitionCommand':command},
          'baseImageSeed':{'imageId':packet['runtime']['imageId'],'paths':['registry/cache','registry/index'],'regularFileApparentBytes':base_file_bytes,
            'measurementBasis':packet['cacheSeed']['measurementBasis'],'fileContentBytes':base_total,'inventorySha256':sha_bytes(compact(base_rows)),'fileCount':sum(1 for x in base_rows if x['kind']=='file'),
            'baseCrateArchiveRoster':base_crates,'baseCrateArchiveRosterSha256':sha_bytes(compact(base_crates))},
          'cargoHomeTopLevel':sorted(top),'scratch':{'contentBytes':scratch_total,'entryCount':scratch_entries,'contentCapBytes':SCRATCH_CONTENT_CAP,'entryCap':SCRATCH_ENTRY_CAP,'perFileCapBytes':CACHE_FILE_CAP},
          'inventory':{'profile':idx['profile'],'rowCount':idx['rowCount'],'fileCount':sum(1 for x in inv if x['kind']=='file'),
            'directoryCount':sum(1 for x in inv if x['kind']=='directory'),'fileContentBytes':total,'rowsSha256':idx['rowsSha256'],
            'indexPath':index_info['path'],'indexSha256':index_info['sha256'],'chunkBytes':chunk_total,'archive':archive},
          'lockedCrateChecks':checks,'lockedCrateCount':len(checks),'sparseIndexWitnesses':witnesses,'sparseIndexWitnessCount':len(witnesses),'unlockedNewCrateArchives':0,
          'scope':'registry acquisition only; no compilation, tests, source imports, wheel, or product execution'}
        write_atomic(report_path,report)
        print('LOCKED_CARGO_FETCH_PASS '+json.dumps({'lockedCrates':len(checks),'cacheBytes':total,'archiveSha256':archive['sha256']},separators=(',',':')),flush=True)
        return 0
    except BaseException as exc:
        report.update(status='FAIL_OR_UNKNOWN',executionPerformed=locals().get('cargo_started',False),failure=type(exc).__name__+': '+str(exc)[:500])
        try:write_atomic(report_path,report)
        except BaseException:pass
        print('LOCKED_CARGO_FETCH_FAIL '+report.get('failure','unknown'),flush=True)
        return 1

if __name__=='__main__':raise SystemExit(main())
