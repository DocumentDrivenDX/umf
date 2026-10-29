#!/usr/bin/env python3
"""Verify selected wheel METADATA/RECORD against installed bytes and emit compact custody."""
from __future__ import annotations
import argparse, base64, hashlib, importlib.metadata, json, os, pathlib, re, stat, sys, sysconfig

MAX_FILE=128*1024*1024; MAX_TOTAL=256*1024*1024; MAX_OUTPUT=8*1024*1024; MAX_METADATA_RAW=8*1024*1024

def norm(s:str)->str:return re.sub(r'[-_.]+','-',s).lower()
def fail(s:str):raise RuntimeError(s)
def digest(path:pathlib.Path,record_mode:str|None,retain_metadata:bool,aggregate_remaining:int)->tuple[str,int,str|None,bytes]:
 st=path.lstat()
 if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size>MAX_FILE:fail('unsafe/oversized installed file: '+str(path))
 if retain_metadata and st.st_size>MAX_METADATA_RAW:fail('installed METADATA exceeds bounded text limit: '+str(path))
 record_hasher=None
 if record_mode is not None:
  try:record_hasher=hashlib.new(record_mode)
  except (ValueError,TypeError):fail('unsupported RECORD hash algorithm')
  if record_hasher.digest_size<=0:fail('RECORD hash algorithm must have fixed output size')
 fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0));h=hashlib.sha256();n=0;metadata=bytearray()
 try:
  opened=os.fstat(fd)
  if not stat.S_ISREG(opened.st_mode) or (opened.st_dev,opened.st_ino,opened.st_size)!=(st.st_dev,st.st_ino,st.st_size):fail('installed file changed before read')
  while True:
   b=os.read(fd,65536)
   if not b:break
   n+=len(b)
   if n>MAX_FILE:fail('installed file grew past per-file limit')
   if n>aggregate_remaining:fail('selected installed software exceeds 256 MiB')
   h.update(b)
   if record_hasher is not None:record_hasher.update(b)
   if retain_metadata:
    if len(metadata)+len(b)>MAX_METADATA_RAW:fail('installed METADATA exceeds bounded text limit')
    metadata.extend(b)
  after=os.fstat(fd)
  if (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)!=(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns) or n!=opened.st_size:fail('installed file changed during read')
 finally:os.close(fd)
 return h.hexdigest(),n,(record_hasher.hexdigest() if record_hasher is not None else None),bytes(metadata)

def main()->int:
 p=argparse.ArgumentParser();p.add_argument('--lock',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args()
 lock=json.loads(a.lock.read_bytes()); expected={norm(x['distribution']):x['version'] for x in lock['packages']}
 if len(expected)!=len(lock['packages']) or len(expected)!=18:fail('selected lock must contain exactly 18 unique packages')
 seen={};rows=[];total=0;root=pathlib.Path(sys.prefix).resolve(strict=True); aliases={}
 for dist in importlib.metadata.distributions():
  name=dist.metadata.get('Name')
  if not name or norm(name) not in expected:continue
  key=norm(name)
  if key in seen:fail('duplicate installed distribution: '+name)
  if dist.version!=expected[key]:fail('installed package version differs from selected lock: '+name)
  files=dist.files
  if not files:fail('installed distribution has no RECORD file inventory: '+name)
  metadata_path=next((f for f in files if f.name=='METADATA' and '.dist-info/' in f.as_posix()),None)
  record_path=next((f for f in files if f.name=='RECORD' and '.dist-info/' in f.as_posix()),None)
  if metadata_path is None or record_path is None:fail('installed distribution lacks METADATA or RECORD: '+name)
  package_rows=[];metasha=None;recordsha=None
  for item in files:
   rel=item.as_posix(); pure=pathlib.PurePosixPath(rel)
   if pure.is_absolute() or any(part in ('.','') for part in pure.parts) or '\\' in rel:fail('unsafe RECORD member path')
   # Wheel RECORDs legitimately refer to console scripts with ../.. from
   # site-packages. Resolve from the distribution, retain the original string,
   # and accept only a regular target wholly beneath this exact active venv.
   path=pathlib.Path(dist.locate_file(item)).absolute()
   resolved=path.resolve(strict=True)
   if resolved!=root and root not in resolved.parents:fail('installed RECORD member escapes active venv')
   walk=path.anchor and pathlib.Path(path.anchor) or pathlib.Path('/')
   for part in path.parts[1:]:
    if part=='..':walk=walk.parent;continue
    walk=walk/part
    if walk.is_symlink():fail('symlink component in installed RECORD path')
   cur=root
   for part in resolved.relative_to(root).parts[:-1]:
    cur=cur/part
    if cur.is_symlink():fail('symlink component in installed RECORD target')
   if resolved.is_symlink() or not stat.S_ISREG(resolved.lstat().st_mode):fail('nonregular installed RECORD target')
   normpath=resolved.relative_to(root).as_posix()
   if normpath in aliases:fail('duplicate/aliased RECORD target: '+rel)
   aliases[normpath]=rel
   path=resolved
   is_record=item==record_path
   if item.hash is None:
    if not is_record or item.size is not None:fail('only the exact self RECORD row may omit hash and size: '+rel)
    record_mode=None
   else:
    if item.size is None:fail('hashed RECORD member lacks declared size: '+rel)
    record_mode=item.hash.mode
    try:
     probe=hashlib.new(record_mode)
     if probe.digest_size<=0:fail('RECORD hash algorithm must have fixed output size: '+rel)
    except (ValueError,TypeError):fail('unsupported RECORD hash algorithm: '+rel)
   sha,size,record_digest,raw=digest(path,record_mode,item==metadata_path,MAX_TOTAL-total);total+=size
   if item.size is not None and int(item.size)!=size:fail('installed size differs from RECORD: '+rel)
   if record_mode is not None:
    expected_hash=base64.urlsafe_b64encode(bytes.fromhex(record_digest)).rstrip(b'=').decode('ascii')
    if expected_hash!=item.hash.value:fail('installed byte digest differs from RECORD: '+rel)
   if item==metadata_path:
    metasha=sha
    text=raw.decode('utf-8')
    lines=text.splitlines()
    if not any(line==f'Name: {name}' for line in lines):fail('METADATA name differs from installed distribution: '+name)
    if not any(line==f'Version: {expected[key]}' for line in lines):fail('METADATA version differs from lock: '+name)
   if item==record_path:recordsha=sha
   package_rows.append({'path':rel,'venvRelativePath':normpath,'sizeBytes':size,'sha256':sha})
  package_rows.sort(key=lambda r:r['path']); roster=json.dumps(package_rows,sort_keys=True,separators=(',',':')).encode()
  seen[key]={'name':name,'version':dist.version,'memberCount':len(package_rows),'memberRosterSha256':hashlib.sha256(roster).hexdigest(),'metadataSha256':metasha,'recordSha256':recordsha}
 if set(seen)!=set(expected):fail('installed distribution roster differs from exact18 selected lock')
 result={'profile':'umf.g03-installed-record-snapshot/1','python':sys.version.split()[0],'distributions':{k:seen[k] for k in sorted(seen)},'distributionCount':len(seen),'regularMemberBytes':total,'activeVenv':str(root),'softwareClassLimits':{'perRegularFileBytes':MAX_FILE,'aggregateRegularBytes':MAX_TOTAL,'metadataRawBytes':MAX_METADATA_RAW}}
 canonical=json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
 if len(canonical)>MAX_OUTPUT:fail('installed record snapshot exceeds 8 MiB')
 a.output.parent.mkdir(parents=True,exist_ok=True)
 with a.output.open('xb') as f:f.write(canonical+b'\n');f.flush();os.fsync(f.fileno())
 print(json.dumps({'profile':result['profile'],'distributionCount':len(seen),'regularMemberBytes':total,'snapshotSha256':hashlib.sha256(canonical).hexdigest()},sort_keys=True))
 return 0
if __name__=='__main__':raise SystemExit(main())
