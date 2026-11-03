# SPDX-License-Identifier: MIT OR Apache-2.0
"""Proposed streaming source-S archive correspondence check; never extracts files."""
from pathlib import Path,PurePosixPath
import hashlib,json,subprocess,tarfile
SOURCE='e3f38ef6f05ae636d2837f9d69f8d6805222664b'
TREE='a21368a92df488882ef9771e4a1d92205267ddd3'
PREFIX='umf-v0.10.8/'
ARCHIVE_SHA='e42c9efba0f652e65021e9d2cf67b32a82d1452b3f8fa1c8c918d16eb14f60ac'
ARCHIVE_BYTES=1677409904
ROSTER_SHA='6c46d53fd58f10ee7107f93f045521f40320fb9094a8b62214d54dbbb1a30481'
def insist(v,m):
 if not v:raise ValueError(m)
def parse_roster(raw):
 result={}
 for row in raw.split(b'\0'):
  if not row:continue
  meta,name=row.split(b'\t',1);mode,kind,oid=meta.decode().split();name=name.decode('utf8','surrogateescape')
  insist(kind=='blob' and mode in ('100644','100755','120000') and name not in result,'Unsupported/duplicate Git source entry')
  result[name]=(mode,oid)
 return result

def verify_tar(archive,roster):
 try:return _verify_tar(archive,roster)
 except (tarfile.TarError, OSError) as error:raise ValueError("Unreadable source archive") from error

def _verify_tar(archive,roster):
 seen=set();dirs={''}
 for name in roster:
  dirs.update(str(p) for p in PurePosixPath(name).parents if str(p)!='.')
 with tarfile.open(archive,mode='r|gz') as tar:
  for item in tar:
   insist(item.name==PREFIX.rstrip('/') or item.name.startswith(PREFIX),'Wrong source archive prefix')
   name=item.name[len(PREFIX):].rstrip('/') if item.name!=PREFIX.rstrip('/') else ''
   insist(not name.startswith('/') and all(p not in ('.','..') for p in name.split('/')) if name else item.isdir(),'Unsafe archive path')
   # Exact git archive tar.umask=0002 policy: directories/executables 0775,
   # regular files 0664, symlinks 0777. Equality also rejects special bits.
   if item.isdir():
    insist(item.type==tarfile.DIRTYPE and item.mode==0o775,'Source directory type/permissions changed')
    insist(name in dirs,'Untracked archive directory');continue
   insist(name in roster and name not in seen,'Extra/duplicate source member: '+name);seen.add(name);mode,oid=roster[name]
   if mode=='120000':
    insist(item.type==tarfile.SYMTYPE and item.mode==0o777,'Source symlink type/permissions changed');raw=item.linkname.encode('utf8','surrogateescape');digest=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
   else:
    insist(item.type==tarfile.REGTYPE and item.mode==({'100644':0o664,'100755':0o775}[mode]),'Source regular/executable type/permissions changed')
    h=hashlib.sha1(b'blob '+str(item.size).encode()+b'\0');stream=tar.extractfile(item)
    while chunk:=stream.read(1024*1024):h.update(chunk)
    digest=h.hexdigest()
   insist(digest==oid,'Source member bytes differ from exact Git blob: '+name)
  insist(tar.pax_headers.get('comment')==SOURCE,'Archive PAX source commit differs')
 insist(seen==set(roster),'Source archive omitted tracked members')
 return {'sourceS':SOURCE,'sourceTree':TREE,'trackedMembersVerified':len(seen),'allModesSymlinksAndBlobBytesMatch':True,'extracted':False}

def verify(repo,archive,receipt):
 git=lambda *args:subprocess.check_output(['git','-C',str(repo),*args])
 insist(git('rev-parse',SOURCE+'^{tree}').decode().strip()==TREE,'Source Git tree differs')
 raw=git('ls-tree','-r','-z',SOURCE);insist(hashlib.sha256(raw).hexdigest()==ROSTER_SHA,'Full authoritative Git source roster differs')
 roster=parse_roster(raw);insist(len(roster)==70549,'Source roster count differs')
 insist(archive.stat().st_size==ARCHIVE_BYTES,'Archive size differs')
 h=hashlib.sha256()
 with archive.open('rb')as f:
  while b:=f.read(1024*1024):h.update(b)
 insist(h.hexdigest()==ARCHIVE_SHA,'Complete source archive bytes differ')
 result=verify_tar(archive,roster);result.update(archiveSHA256=h.hexdigest(),archiveBytes=archive.stat().st_size,gitRosterSHA256=ROSTER_SHA)
 receipt.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description=__doc__)
 for n in ('repo','archive','receipt'):p.add_argument('--'+n,type=Path,required=True)
 a=p.parse_args();verify(a.repo,a.archive,a.receipt)
