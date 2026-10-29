#!/usr/bin/env python3
"""Bounded static audit of the frozen UMF macOS arm64 wheel; never executes members."""
from __future__ import annotations
import base64,csv,hashlib,io,json,pathlib,re,stat,struct,sys,zipfile
from email.parser import Parser
MAX_WHEEL=32*1024*1024; MAX_MEMBERS=160; MAX_MEMBER=128*1024*1024; MAX_EXPANDED=128*1024*1024; MAX_METADATA=16*1024*1024
VERSION='0.4.56'; WHEEL_NAME='umf_weft-0.4.56-cp39-abi3-macosx_11_0_arm64.whl'
WHEEL_SHA256='68f9297b4b55df483b86d3041040991c4dadfb9b4d63afcff1420c43f93ae41d'; NATIVE='weft/weft.abi3.so'; NATIVE_SHA256='7f746042c88dde86b0a096b831a4243d40e2448255c1146cf515787b22c30225'; NATIVE_BYTES=32410624
LINUX_WRAPPER_SHA256='cd0fa27c9580742333d14e24d5ebfd74babb47d31720bb4c577278d05486f11d'; LICENSE_NAMES=('LICENSE.md','LICENSE-MIT','LICENSE-APACHE','THIRD-PARTY-LICENSES.txt'); DIST='umf_weft-0.4.56.dist-info/'
EXPECTED_MEMBERS={'weft/__init__.py',NATIVE,DIST+'METADATA',DIST+'WHEEL',DIST+'RECORD',*(DIST+'licenses/'+n for n in LICENSE_NAMES)}
LC_ID_DYLIB=0xD; DYLIB_LOAD_COMMANDS={0xC,0x18,0x80000018,0x1F,0x8000001F,0x20,0x23,0x80000023}; ZERO_FILL_TYPES={1,0xC,0x12}
EXPECTED_LOADS=['/usr/lib/libiconv.2.dylib','/usr/lib/libSystem.B.dylib']; INIT='_PyInit_weft'
def sha(b):return hashlib.sha256(b).hexdigest()
def hash_path(p,cap):
 st=p.lstat()
 if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size>cap:raise ValueError('unsafe/oversized wheel file')
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  while True:
   block=f.read(min(1024*1024,cap+1-n))
   if not block:break
   n+=len(block)
   if n>cap:raise ValueError('wheel grew past cap')
   h.update(block)
 after=p.lstat()
 if n!=st.st_size or (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise ValueError('wheel changed while hashing')
 return n,h.hexdigest()
def read_path(p,cap):
 st=p.lstat()
 if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size>cap:raise ValueError('unsafe/oversized source file')
 out=bytearray()
 with p.open('rb') as f:
  while True:
   block=f.read(min(1024*1024,cap+1-len(out)))
   if not block:break
   out.extend(block)
   if len(out)>cap:raise ValueError('source file grew past cap')
 after=p.lstat()
 if len(out)!=st.st_size or (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):raise ValueError('source file changed while reading')
 return bytes(out)
def triplet(v):return [(v>>16)&65535,(v>>8)&255,v&255]
def uleb(b,p,end):
 v=0;s=0;start=p
 while p<end and p-start<10:
  x=b[p];p+=1;v|=(x&127)<<s
  if not x&128:return v,p
  s+=7
 raise ValueError('malformed or oversized ULEB128')
def load_string(b,o,z,minimum,label):
 if o<minimum or o>=z:raise ValueError(label+' string offset outside structure')
 e=b.find(b'\0',o,z)
 if e<0 or any(b[e+1:z]):raise ValueError(label+' string terminator/padding invalid')
 try:v=b[o:e].decode('utf8')
 except UnicodeDecodeError as ex:raise ValueError(label+' string is not UTF-8') from ex
 if not v:raise ValueError(label+' string is empty')
 return v
def safe_system(v):
 p=pathlib.PurePosixPath(v)
 if not v.startswith(('/usr/lib/','/System/Library/')) or v.startswith('//') or any(x in ('','.','..') for x in p.parts):raise ValueError('load dependency outside closed system-library set: '+v)
def read_member(archive,info):
 out=bytearray()
 with archive.open(info,'r') as f:
  while True:
   block=f.read(min(1024*1024,info.file_size+1-len(out)))
   if not block:break
   out.extend(block)
   if len(out)>info.file_size or len(out)>MAX_MEMBER:raise ValueError('decompressed wheel member exceeds declared/capped size')
 if len(out)!=info.file_size:raise ValueError('decompressed wheel member length differs from ZIP directory')
 return bytes(out)
def parse_exports(b,off,size):
 if not size or off>len(b) or size>len(b)-off:raise ValueError('export-trie range invalid')
 end=off+size; pending=[(0,'')]; seen=set(); exports={}; nodes=0
 while pending:
  pos,prefix=pending.pop()
  if pos in seen:raise ValueError('export trie has cycle or duplicate node offset')
  seen.add(pos);nodes+=1
  if nodes>4096:raise ValueError('export trie node cap exceeded')
  if pos>=size:raise ValueError('export trie child offset outside trie')
  terminal,p=uleb(b,off+pos,end)
  if terminal>end-p:raise ValueError('export terminal exceeds trie')
  te=p+terminal
  if terminal:
   flags,q=uleb(b,p,te)
   if flags!=0:raise ValueError('export is weak, re-export, resolver, or unknown kind')
   address,q=uleb(b,q,te)
   if q!=te:raise ValueError('ambiguous export terminal payload')
   if prefix in exports:raise ValueError('duplicate exported name')
   exports[prefix]=address
  p=te
  if p>=end:raise ValueError('truncated export child count')
  count=b[p];p+=1
  if count>128:raise ValueError('export child count exceeds cap')
  for _ in range(count):
   z=b.find(b'\0',p,end)
   if z<0 or z==p:raise ValueError('malformed export edge')
   try:edge=b[p:z].decode('utf8')
   except UnicodeDecodeError as ex:raise ValueError('export edge is not UTF-8') from ex
   child,q=uleb(b,z+1,end)
   if child>=size:raise ValueError('export child offset outside trie')
   pending.append((child,prefix+edge));p=q
 if set(exports)!={INIT}:raise ValueError('export trie must contain exactly the regular initializer')
 return exports, nodes
def parse_macho(b):
 if len(b)<32:raise ValueError('short Mach-O header')
 magic,cpu,sub,ft,ncmds,szcmd,flags,reserved=struct.unpack_from('<IiiIIIII',b)
 if magic!=0xfeedfacf or cpu!=0x0100000c or sub!=0:raise ValueError('Mach-O is not little-endian arm64 subtype 0')
 if ft!=6:raise ValueError('native extension is not exact-role MH_DYLIB')
 if ncmds>4096 or szcmd>len(b)-32:raise ValueError('Mach-O command bounds invalid')
 pos=32;end=32+szcmd;minimum=None;sdk=None;bv=0;ids=[];deps=[];rpaths=[];sections=[];symtab=None;dyld=None;commands=[]
 for _ in range(ncmds):
  if pos+8>end:raise ValueError('truncated load command')
  cmd,cs=struct.unpack_from('<II',b,pos)
  if cs<8 or cs%8 or pos+cs>end:raise ValueError('invalid/alignment load command size')
  if cmd==0x32:
   bv+=1
   if cs<24:raise ValueError('short LC_BUILD_VERSION')
   plat,m,sd,nt=struct.unpack_from('<IIII',b,pos+8)
   if nt>(cs-24)//8 or plat!=1:raise ValueError('invalid platform/tool list')
   minimum=triplet(m);sdk=triplet(sd)
  elif cmd==LC_ID_DYLIB or cmd in DYLIB_LOAD_COMMANDS:
   if cs<24:raise ValueError('short dylib command')
   no=struct.unpack_from('<I',b,pos+8)[0];name=load_string(b[pos:pos+cs],no,cs,24,'dylib');row={'command':cmd,'name':name}
   (ids if cmd==LC_ID_DYLIB else deps).append(row)
  elif cmd==0x19:
   if cs<72:raise ValueError('short LC_SEGMENT_64')
   fileoff,filesize=struct.unpack_from('<QQ',b,pos+40);initprot=struct.unpack_from('<I',b,pos+60)[0];ns=struct.unpack_from('<I',b,pos+64)[0]
   if fileoff>len(b) or filesize>len(b)-fileoff or ns>(cs-72)//80:raise ValueError('segment file/section bounds invalid')
   for i in range(ns):
    q=pos+72+i*80;sn=b[q:q+16].split(b'\0',1)[0].decode('ascii');gn=b[q+16:q+32].split(b'\0',1)[0].decode('ascii');addr,size=struct.unpack_from('<QQ',b,q+32);fo,al,ro,nr=struct.unpack_from('<IIII',b,q+48);typ=struct.unpack_from('<I',b,q+64)[0]&255
    if typ not in ZERO_FILL_TYPES and (fo>len(b) or size>len(b)-fo or fo<fileoff or fo+size>fileoff+filesize):raise ValueError('section file range outside segment/native member: '+gn+'/'+sn)
    if nr and (ro>len(b) or nr>(len(b)-ro)//8):raise ValueError('section relocation range outside native member')
    section_flags=struct.unpack_from('<I',b,q+64)[0]
    sections.append({'ordinal':len(sections)+1,'segment':gn,'section':sn,'address':addr,'size':size,'fileOffset':fo,'type':typ,'flags':section_flags,'initProtection':initprot,'zeroFill':typ in ZERO_FILL_TYPES})
  elif cmd==0x2:
   if cs<24 or symtab is not None:raise ValueError('duplicate/short LC_SYMTAB')
   so,nsy,stro,strsz=struct.unpack_from('<IIII',b,pos+8);symtab=(so,nsy,stro,strsz)
  elif cmd==0x80000022:
   if cs<48 or dyld is not None:raise ValueError('duplicate/short LC_DYLD_INFO_ONLY')
   pairs=[struct.unpack_from('<II',b,pos+8+i*8) for i in range(5)]
   for do,ds in pairs:
    if do>len(b) or ds>len(b)-do:raise ValueError('dyld-info range invalid')
   dyld=pairs
  elif cmd in (0x1d,0x26,0x29,0x2b,0x2e,0x80000033,0x80000034):
   if cs<16:raise ValueError('short linkedit-data command')
   do,ds=struct.unpack_from('<II',b,pos+8)
   if do>len(b) or ds>len(b)-do:raise ValueError('linkedit-data range invalid')
  elif cmd in (0x1c,0x8000001c):
   if cs<12:raise ValueError('short rpath command')
   no=struct.unpack_from('<I',b,pos+8)[0];rpaths.append(load_string(b[pos:pos+cs],no,cs,12,'rpath'))
  commands.append({'cmd':cmd,'bytes':cs});pos+=cs
 if pos!=end or minimum is None or bv!=1:raise ValueError('missing, duplicate, or malformed build-version command')
 if tuple(minimum)!=(11,0,0) or tuple(sdk or ())[:2]!=(27,0):raise ValueError('minimum OS/SDK differs from pinned macOS profile')
 if len(ids)!=1 or ids[0]['name']!='@rpath/weft.abi3.so':raise ValueError('exactly one expected LC_ID_DYLIB self identity required')
 if len(deps)!=2 or sorted(x['name'] for x in deps)!=sorted(EXPECTED_LOADS):raise ValueError('load dependency set differs from exact observed system paths')
 for x in deps:safe_system(x['name'])
 if rpaths:raise ValueError('rpaths are forbidden for this frozen wheel')
 if symtab is None or dyld is None:raise ValueError('required symbol/export metadata missing')
 so,nsy,stro,strsz=symtab
 if nsy>100000 or so>len(b) or nsy>(len(b)-so)//16 or stro>len(b) or strsz>len(b)-stro:raise ValueError('LC_SYMTAB range invalid')
 strings=b[stro:stro+strsz];matches=[]
 for i in range(nsy):
  q=so+i*16;st,typ,sect,desc,val=struct.unpack_from('<IBBHQ',b,q)
  if st>=strsz:raise ValueError('nlist string index outside string table')
  e=strings.find(b'\0',st)
  if e<0:raise ValueError('nlist string is not terminated')
  name=strings[st:e].decode('utf8','strict') if st else ''
  if name==INIT and not (typ&0xe0):matches.append({'type':typ,'section':sect,'value':val,'external':bool(typ&1)})
 if len(matches)!=1 or (matches[0]['type']&0x0e)!=0x0e or not matches[0]['external'] or not 1<=matches[0]['section']<=len(sections):raise ValueError('initializer lacks a unique defined external symbol with a valid section ordinal')
 exports,nodes=parse_exports(b,dyld[4][0],dyld[4][1])
 if exports[INIT]!=matches[0]['value']:raise ValueError('exported initializer address differs from defined external symbol')
 sec=sections[matches[0]['section']-1]
 if (sec['ordinal']!=matches[0]['section'] or sec['segment']!='__TEXT' or sec['section']!='__text'
     or sec['zeroFill'] or not (sec['initProtection']&4) or not (sec['flags']&(0x80000000|0x400))
     or not sec['address']<=exports[INIT]<sec['address']+sec['size']):raise ValueError('initializer is not in its declared executable file-backed __TEXT,__text section')
 return {'cpuType':cpu,'cpuSubtype':sub,'fileType':ft,'minimumOS':minimum,'sdk':sdk,'dylibIds':ids,'loadDependencies':deps,'rpaths':rpaths,'sections':sections,'loadCommands':commands,'symbolTable':{'symbolCount':nsy,'initializer':matches[0]},'exports':{'names':sorted(exports),'initializerAddress':exports[INIT],'nodeCount':nodes}}
def main():
 if len(sys.argv)!=4:raise ValueError('usage: static_audit.py WHEEL REPORT PRODUCER_ROOT')
 wheel=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);source=pathlib.Path(sys.argv[3])
 st=wheel.lstat()
 if wheel.name!=WHEEL_NAME or stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size!=11190603 or st.st_size>MAX_WHEEL:raise ValueError('exact wheel identity/type/size mismatch')
 before=hash_path(wheel,MAX_WHEEL)[1]
 if before!=WHEEL_SHA256:raise ValueError('original wheel SHA-256 mismatch')
 with zipfile.ZipFile(wheel) as z:
  infos=z.infolist()
  if not infos or len(infos)>MAX_MEMBERS:raise ValueError('wheel entry count cap')
  names=set();compressed=expanded=0
  for x in infos:
   p=pathlib.PurePosixPath(x.filename);mode=x.external_attr>>16;ft=stat.S_IFMT(mode)
   if not x.filename or x.filename in names or p.is_absolute() or '..' in p.parts or '\\' in x.filename or stat.S_ISLNK(mode) or x.is_dir() or (ft and ft!=stat.S_IFREG) or x.flag_bits&1 or x.compress_type not in (0,8):raise ValueError('unsafe/duplicate/unsupported wheel member')
   names.add(x.filename);compressed+=x.compress_size;expanded+=x.file_size
   if x.file_size>MAX_MEMBER or expanded>MAX_EXPANDED or compressed>MAX_WHEEL or (x.filename==DIST+'METADATA' and x.file_size>MAX_METADATA):raise ValueError('wheel member/expanded/compressed cap')
  if names!=EXPECTED_MEMBERS:raise ValueError('wheel member roster differs from closed contract')
  contents={x.filename:read_member(z,x) for x in infos}
 members={n:{'bytes':len(v),'sha256':sha(v)} for n,v in sorted(contents.items())}
 if members[NATIVE]!={'bytes':NATIVE_BYTES,'sha256':NATIVE_SHA256}:raise ValueError('native member identity mismatch')
 md=Parser().parsestr(contents[DIST+'METADATA'].decode('utf8')); wt=contents[DIST+'WHEEL'].decode('utf8');tags=[x[5:] for x in wt.splitlines() if x.startswith('Tag: ')]
 if md.get('Name')!='umf-weft' or md.get('Version')!=VERSION or md.get('Requires-Python')!='>=3.9' or md.get_all('Requires-Dist',[]) or md.get('License-Expression')!='MIT OR Apache-2.0':raise ValueError('distribution metadata/license identity mismatch')
 if tags!=['cp39-abi3-macosx_11_0_arm64'] or 'Root-Is-Purelib: false' not in wt:raise ValueError('WHEEL tag/purelib mismatch')
 if sha(contents['weft/__init__.py'])!=LINUX_WRAPPER_SHA256:raise ValueError('wrapper differs from accepted same-source Linux wrapper')
 rows=list(csv.reader(io.StringIO(contents[DIST+'RECORD'].decode('utf8'))))
 if len(rows)!=len(members) or {r[0] for r in rows}!=set(members):raise ValueError('RECORD roster mismatch')
 for n,d,s in rows:
  if n==DIST+'RECORD':
   if d or s:raise ValueError('RECORD self cells not empty')
  else:
   ex='sha256='+base64.urlsafe_b64encode(bytes.fromhex(members[n]['sha256'])).rstrip(b'=').decode()
   if d!=ex or int(s)!=members[n]['bytes']:raise ValueError('RECORD entry mismatch '+n)
 if sorted(md.get_all('License-File',[]))!=sorted(LICENSE_NAMES):raise ValueError('METADATA License-File roster mismatch')
 license_sources={}
 for name in LICENSE_NAMES:
  p=source/'crates/weft-python'/name
  raw=read_path(p,2*1024*1024)
  if sha(raw)!=members[DIST+'licenses/'+name]['sha256'] or len(raw)!=members[DIST+'licenses/'+name]['bytes']:raise ValueError('license differs from producer source '+name)
  license_sources[name]={'bytes':len(raw),'sha256':sha(raw)}
 native=parse_macho(contents[NATIVE]);after=hash_path(wheel,MAX_WHEEL)[1]
 if after!=before:raise ValueError('original wheel changed during audit')
 report={'profile':'weft-local-macos-static-audit-only/1','status':'STATIC_WHEEL_PASS','wheel':{'path':str(wheel),'filename':wheel.name,'bytes':st.st_size,'sha256':before},'members':members,'memberCount':len(members),'expandedBytes':expanded,'tags':tags,'recordExact':True,'licenseExpression':'MIT OR Apache-2.0','producerLicenseSources':license_sources,'wrapper':{'member':'weft/__init__.py','sha256':members['weft/__init__.py']['sha256'],'acceptedLinuxSameSourceSha256':LINUX_WRAPPER_SHA256},'nativeMember':NATIVE,'nativeSha256':members[NATIVE]['sha256'],'nativeBytes':members[NATIVE]['bytes'],'macho':native,'scope':'static archive/Mach-O data inspection only; not installed, imported, or executed'}
 raw=(json.dumps(report,sort_keys=True,indent=2)+'\n').encode()
 if len(raw)>MAX_METADATA:raise ValueError('audit report exceeds 16 MiB cap')
 with out.open('xb') as f:f.write(raw);f.flush();import os;os.fsync(f.fileno())
 print(json.dumps({'status':report['status'],'wheel':report['wheel'],'nativeSha256':members[NATIVE]['sha256']},sort_keys=True))
if __name__=='__main__':main()
