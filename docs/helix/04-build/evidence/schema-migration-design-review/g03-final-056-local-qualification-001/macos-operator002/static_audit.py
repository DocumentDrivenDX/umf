#!/usr/bin/env python3
"""Static-only arm64 macOS wheel audit; never installs or executes wheel members."""
from __future__ import annotations
import base64,csv,hashlib,io,json,pathlib,re,stat,struct,sys,zipfile
from email.parser import Parser

MAX_WHEEL=32*1024*1024
MAX_MEMBERS=160
MAX_MEMBER=128*1024*1024
MAX_EXPANDED=128*1024*1024
MAX_METADATA=16*1024*1024
VERSION='0.4.56'
LINUX_WRAPPER_SHA256='cd0fa27c9580742333d14e24d5ebfd74babb47d31720bb4c577278d05486f11d'
DIST='umf_weft-0.4.56.dist-info/'
NATIVE='weft/weft.abi3.so'
LICENSE_NAMES=('LICENSE.md','LICENSE-MIT','LICENSE-APACHE','THIRD-PARTY-LICENSES.txt')
EXPECTED_MEMBERS={
 'weft/__init__.py',NATIVE,
 DIST+'METADATA',DIST+'WHEEL',DIST+'RECORD',
 *(DIST+'licenses/'+name for name in LICENSE_NAMES),
}

# Mach-O section_64 flags use the low eight bits for section type.
S_ZEROFILL=0x1
S_GB_ZEROFILL=0xC
S_THREAD_LOCAL_ZEROFILL=0x12
ZERO_FILL_TYPES={S_ZEROFILL,S_GB_ZEROFILL,S_THREAD_LOCAL_ZEROFILL}
LC_ID_DYLIB=0xD
DYLIB_LOAD_COMMANDS={0xC,0x18,0x80000018,0x1F,0x8000001F,0x20,0x23,0x80000023}


def sha(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def triplet(value:int)->list[int]:return [(value>>16)&0xffff,(value>>8)&0xff,value&0xff]
def _load_string(data:bytes,command_offset:int,command_size:int,minimum_offset:int,label:str)->str:
 if command_offset<minimum_offset or command_offset>=command_size:raise ValueError(label+' string offset outside structure')
 end=data.find(b'\0',command_offset,command_size)
 if end<0:raise ValueError(label+' string is not NUL-terminated')
 if any(data[end+1:command_size]):raise ValueError(label+' string padding is not zero')
 try:value=data[command_offset:end].decode('utf-8')
 except UnicodeDecodeError as e:raise ValueError(label+' is not UTF-8') from e
 if not value:raise ValueError(label+' is empty')
 return value

def _safe_system_path(value:str,label:str)->None:
 p=pathlib.PurePosixPath(value)
 if (not value.startswith(('/usr/lib/','/System/Library/')) or value.startswith('//')
     or any(part in ('','.','..') for part in p.parts)):
  raise ValueError(label+' is outside the closed system-library path set: '+value)

def parse_macho(data:bytes,member_names:set[str])->dict:
 if len(data)<32:raise ValueError('short Mach-O header')
 magic,cpu,sub,filetype,ncmds,sizeofcmds,flags,reserved=struct.unpack_from('<IiiIIIII',data,0)
 if magic!=0xfeedfacf or cpu!=0x0100000c:raise ValueError('Mach-O is not 64-bit arm64')
 if filetype!=8:raise ValueError('native extension is not MH_BUNDLE')
 if ncmds>4096 or sizeofcmds>len(data)-32:raise ValueError('Mach-O command bounds invalid')
 pos=32;end=32+sizeofcmds;minimum=None;sdk=None;build_versions=0;dylib_ids=[];dependencies=[];rpaths=[];commands=[];sections=[]
 for _ in range(ncmds):
  if pos+8>end:raise ValueError('truncated load command')
  cmd,cmdsize=struct.unpack_from('<II',data,pos)
  if cmdsize<8 or cmdsize%8 or pos+cmdsize>end:raise ValueError('invalid/alignment load command size')
  if cmd==0x32:
   build_versions+=1
   if cmdsize<24:raise ValueError('short LC_BUILD_VERSION')
   plat,m,sdkv,nt=struct.unpack_from('<IIII',data,pos+8)
   if nt>(cmdsize-24)//8 or plat!=1:raise ValueError('invalid platform/tool list')
   minimum=triplet(m);sdk=triplet(sdkv)
  elif cmd==LC_ID_DYLIB or cmd in DYLIB_LOAD_COMMANDS:
   if cmdsize<24:raise ValueError('short dylib command')
   name_offset=struct.unpack_from('<I',data,pos+8)[0]
   value=_load_string(data[pos:pos+cmdsize],name_offset,cmdsize,24,'dylib')
   row={'command':cmd,'name':value}
   if cmd==LC_ID_DYLIB:dylib_ids.append(row)
   else:dependencies.append(row)
  elif cmd==0x19: # LC_SEGMENT_64 with bounded section file ranges
   if cmdsize<72:raise ValueError('short LC_SEGMENT_64')
   fileoff,filesize=struct.unpack_from('<QQ',data,pos+40);nsects=struct.unpack_from('<I',data,pos+64)[0]
   if fileoff>len(data) or filesize>len(data)-fileoff or nsects>(cmdsize-72)//80:raise ValueError('segment file/section bounds invalid')
   for i in range(nsects):
    q=pos+72+i*80
    sectname=data[q:q+16].split(b'\0',1)[0].decode('ascii','strict')
    segname=data[q+16:q+32].split(b'\0',1)[0].decode('ascii','strict')
    addr,size=struct.unpack_from('<QQ',data,q+32);offset,align,reloff,nreloc=struct.unpack_from('<IIII',data,q+48);section_flags=struct.unpack_from('<I',data,q+64)[0]
    section_type=section_flags&0xff
    if section_type not in ZERO_FILL_TYPES:
     if offset>len(data) or size>len(data)-offset or offset<fileoff or offset+size>fileoff+filesize:raise ValueError('section file range outside its segment/native member: '+segname+'/'+sectname)
    if nreloc and (reloff>len(data) or nreloc>(len(data)-reloff)//8):raise ValueError('section relocation range outside native member')
    sections.append({'segment':segname,'section':sectname,'address':addr,'size':size,'fileOffset':offset,'type':section_type,'zeroFill':section_type in ZERO_FILL_TYPES})
  elif cmd in (0x1d,0x26,0x29,0x2b,0x2e,0x80000033,0x80000034):
   if cmdsize<16:raise ValueError('short linkedit-data command')
   dataoff,datasize=struct.unpack_from('<II',data,pos+8)
   if dataoff>len(data) or datasize>len(data)-dataoff:raise ValueError('linkedit-data range invalid')
  elif cmd in (0x22,0x80000022):
   if cmdsize<48:raise ValueError('short dyld-info command')
   for i in range(5):
    dataoff,datasize=struct.unpack_from('<II',data,pos+8+i*8)
    if dataoff>len(data) or datasize>len(data)-dataoff:raise ValueError('dyld-info range invalid')
  elif cmd in (0x1c,0x8000001c):
   if cmdsize<12:raise ValueError('short rpath command')
   name_offset=struct.unpack_from('<I',data,pos+8)[0]
   rpaths.append(_load_string(data[pos:pos+cmdsize],name_offset,cmdsize,12,'rpath'))
  commands.append({'cmd':cmd,'bytes':cmdsize});pos+=cmdsize
 if pos!=end or minimum is None or build_versions!=1:raise ValueError('missing, duplicate, or malformed build-version command')
 if tuple(minimum)!=(11,0,0):raise ValueError('Mach-O minimum OS differs from macOS 11.0 wheel tag')
 if tuple(sdk or ())[:2]!=(27,0):raise ValueError('Mach-O SDK does not match selected macOS SDK 27.0')
 if dylib_ids:raise ValueError('extension bundle unexpectedly declares LC_ID_DYLIB')
 for row in dependencies:_safe_system_path(row['name'],'load dependency')
 for value in rpaths:_safe_system_path(value,'LC_RPATH')
 return {'cpuType':cpu,'cpuSubtype':sub,'fileType':filetype,'minimumOS':minimum,'sdk':sdk,
         'dylibIds':dylib_ids,'loadDependencies':dependencies,'rpaths':rpaths,
         'sections':sections,'loadCommands':commands}

def _member_preflight(wheel:pathlib.Path)->tuple[list[zipfile.ZipInfo],int]:
 st=wheel.lstat()
 if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size<=0 or st.st_size>MAX_WHEEL:raise ValueError('wheel type/size cap')
 with zipfile.ZipFile(wheel) as archive:
  infos=archive.infolist()
  if not infos or len(infos)>MAX_MEMBERS:raise ValueError('wheel entry count exceeds the exact profile cap')
  names=set();compressed=0;expanded=0
  for info in infos:
   name=info.filename;p=pathlib.PurePosixPath(name);mode=info.external_attr>>16;filetype=stat.S_IFMT(mode)
   if (not name or name in names or p.is_absolute() or '..' in p.parts or '\\' in name
       or stat.S_ISLNK(mode) or info.is_dir() or (filetype and filetype!=stat.S_IFREG)
       or info.flag_bits&1 or info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED)):
    raise ValueError('unsafe, duplicate, encrypted, or unsupported wheel member')
   names.add(name);compressed+=info.compress_size;expanded+=info.file_size
   if info.file_size>MAX_MEMBER or expanded>MAX_EXPANDED or compressed>MAX_WHEEL:raise ValueError('wheel member/expanded/compressed preflight cap')
   if name.endswith('.dist-info/METADATA') and info.file_size>MAX_METADATA:raise ValueError('distribution METADATA exceeds 16 MiB cap')
  if names!=EXPECTED_MEMBERS:raise ValueError('wheel regular-member roster differs from closed macOS build contract')
  return infos,expanded

def main()->None:
 if len(sys.argv)!=4:raise ValueError('usage: static_audit.py WHEEL REPORT PRODUCER_ROOT')
 wheel=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);source=pathlib.Path(sys.argv[3])
 if wheel.name!='umf_weft-0.4.56-cp39-abi3-macosx_11_0_arm64.whl':raise ValueError('filename/tag identity mismatch')
 infos,expanded=_member_preflight(wheel)
 contents={}
 with zipfile.ZipFile(wheel) as archive:
  for info in infos:
   raw=archive.read(info)
   if len(raw)!=info.file_size:raise ValueError('member length mismatch')
   contents[info.filename]=raw
 members={name:{'bytes':len(raw),'sha256':sha(raw)} for name,raw in sorted(contents.items())}
 md=Parser().parsestr(contents[DIST+'METADATA'].decode('utf8'))
 wheeltext=contents[DIST+'WHEEL'].decode('utf8')
 tags=[line[5:] for line in wheeltext.splitlines() if line.startswith('Tag: ')]
 if (md.get('Name')!='umf-weft' or md.get('Version')!=VERSION or md.get('Requires-Python')!='>=3.9'
     or md.get_all('Requires-Dist',[]) or md.get('License-Expression')!='MIT OR Apache-2.0'):
  raise ValueError('distribution metadata/license identity mismatch')
 if (tags!=['cp39-abi3-macosx_11_0_arm64'] or 'Root-Is-Purelib: false' not in wheeltext):raise ValueError('wheel tag/purelib mismatch')
 if hashlib.sha256(contents['weft/__init__.py']).hexdigest()!=LINUX_WRAPPER_SHA256:raise ValueError('wrapper bytes differ from accepted same-source Linux wheel')
 if contents[NATIVE][:4]!=b'\xcf\xfa\xed\xfe':raise ValueError('native member is not little-endian 64-bit Mach-O')
 rows=list(csv.reader(io.StringIO(contents[DIST+'RECORD'].decode('utf8'))))
 if len(rows)!=len(members) or {row[0] for row in rows}!=set(members):raise ValueError('RECORD roster mismatch')
 for name,digest,size in rows:
  if name==DIST+'RECORD':
   if digest or size:raise ValueError('RECORD self cells not empty')
  else:
   expected='sha256='+base64.urlsafe_b64encode(bytes.fromhex(members[name]['sha256'])).rstrip(b'=').decode()
   if digest!=expected or int(size)!=members[name]['bytes']:raise ValueError('RECORD entry mismatch '+name)
 license_members={};source_license_proofs={}
 if sorted(md.get_all('License-File',[]))!=sorted(LICENSE_NAMES):raise ValueError('METADATA License-File roster differs from reviewed source')
 for item in LICENSE_NAMES:
  member=DIST+'licenses/'+item;src=source/'crates/weft-python'/item
  if src.is_symlink() or not src.is_file():raise ValueError('producer license source missing/unsafe '+item)
  src_size=src.stat().st_size
  if src_size>2*1024*1024:raise ValueError('producer license source exceeds 2 MiB')
  with src.open('rb') as source_file:src_bytes=source_file.read(2*1024*1024+1)
  if len(src_bytes)>2*1024*1024:raise ValueError('producer license source grew past 2 MiB')
  if len(src_bytes)!=src_size or hashlib.sha256(src_bytes).hexdigest()!=members[member]['sha256'] or len(src_bytes)!=members[member]['bytes']:
   raise ValueError('wheel license bytes differ from producer source: '+item)
  source_license_proofs[item]={'bytes':src_size,'sha256':hashlib.sha256(src_bytes).hexdigest()};license_members[item]=member
 native=parse_macho(contents[NATIVE],set(members))
 with wheel.open('rb') as wf:
  wh=hashlib.sha256();wsize=0
  for block in iter(lambda:wf.read(1024*1024),b''):
   wsize+=len(block)
   if wsize>MAX_WHEEL:raise ValueError('wheel grew past compressed cap')
   wh.update(block)
 wheel_sha=wh.hexdigest()
 if wsize!=wheel.stat().st_size:raise ValueError('wheel changed during hashing')
 report={'profile':'weft-local-macos-arm64-static-wheel-audit/1','status':'STATIC_WHEEL_PASS',
  'wheel':{'filename':wheel.name,'bytes':wsize,'sha256':wheel_sha},'members':members,'memberCount':len(members),
  'expandedBytes':expanded,'tags':tags,'recordExact':True,'licenseExpression':'MIT OR Apache-2.0',
  'licenseMembers':license_members,'producerLicenseSources':source_license_proofs,
  'wrapper':{'member':'weft/__init__.py','sha256':members['weft/__init__.py']['sha256'],
             'acceptedLinuxSameSourceSha256':LINUX_WRAPPER_SHA256},
  'nativeMember':NATIVE,'nativeSha256':members[NATIVE]['sha256'],'nativeBytes':members[NATIVE]['bytes'],'macho':native,
  'scope':'static archive/Mach-O only; candidate was not installed, imported, or executed'}
 raw=(json.dumps(report,sort_keys=True,indent=2)+'\n').encode()
 if len(raw)>MAX_METADATA:raise ValueError('audit metadata cap exceeded')
 with out.open('xb') as f:f.write(raw);f.flush();import os;os.fsync(f.fileno())
 print(json.dumps({'status':report['status'],'wheel':report['wheel'],'nativeMember':NATIVE,'nativeSha256':members[NATIVE]['sha256']},sort_keys=True))

if __name__=='__main__':main()
