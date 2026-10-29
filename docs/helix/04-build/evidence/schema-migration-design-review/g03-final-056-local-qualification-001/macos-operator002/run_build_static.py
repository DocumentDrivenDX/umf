#!/usr/bin/env python3
"""Bounded local macOS arm64 build + static wheel inspection; never imports candidate."""
from __future__ import annotations
import base64,csv,hashlib,io,json,os,pathlib,platform,re,selectors,signal,stat,subprocess,sys,time,uuid,zipfile,datetime
from email.parser import Parser

ROOT=pathlib.Path('/private/tmp/weft-g03-ordinary-module')
OUT=pathlib.Path('/private/tmp/g03-weft-macos-arm64-build-002')
CARGO_SOURCE=pathlib.Path.home()/'.cargo'
RUST_BIN=pathlib.Path('/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
MATURIN=pathlib.Path('/private/tmp/umf-pr40-tools/maturin/bin/maturin')
PYTHON=pathlib.Path('/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9')
PYTHON_FRAMEWORK=pathlib.Path('/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9')
CLANG=pathlib.Path('/Library/Developer/CommandLineTools/usr/bin/clang')
LD=pathlib.Path('/Library/Developer/CommandLineTools/usr/bin/ld')
SDK=pathlib.Path('/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk')
HEAD='973d864c8d26b2bc173a411eac8368da5efc1ab3'; TREE='8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff'; VERSION='0.4.56'
TOTAL=3600; RESERVE=60; CLEANUP=60; STAGES={'setup':600,'candidate-build':1800,'static-audit':120}
STATIC_AUDIT_SHA='fbfbf1c0214e98d26987cc625084a1429ab578d9f48f546a5d4a4002803dbe0b'
LOG_CAP=1024*1024; META_CAP=16*1024*1024; WHEEL_CAP=32*1024*1024; EXPANDED_CAP=128*1024*1024
EXEC=str(uuid.uuid4()); START=time.monotonic(); DEADLINE=START+TOTAL-RESERVE; SETUP_DEADLINE=START+STAGES['setup']
LOG_USED=[0]
OUTPUT_OWNED=False
FINALIZING=False
FINAL_CHECK_DEADLINE=START+TOTAL-15
CHECKED_COMMANDS=[]
PREFLIGHT_CAPTURE_CAP=1024*1024
SETUP_PHASE=True


def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()
def active_deadline()->float:
 if FINALIZING:return FINAL_CHECK_DEADLINE
 return min(DEADLINE,SETUP_DEADLINE) if SETUP_PHASE else DEADLINE
def hash_file(p:pathlib.Path,cap:int)->tuple[int,str]:
 before=p.lstat()
 if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):raise RuntimeError(f'not a regular file: {p}')
 h=hashlib.sha256(); n=0
 with p.open('rb') as f:
  while True:
   if time.monotonic()>=active_deadline():raise TimeoutError(f'hash/read deadline reached: {p}')
   b=f.read(min(1024*1024,cap+1-n))
   if not b:break
   n+=len(b)
   if n>cap:raise RuntimeError(f'file exceeds cap: {p}')
   h.update(b)
 after=p.lstat()
 if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) or n!=before.st_size:raise RuntimeError(f'file changed while hashing: {p}')
 return n,h.hexdigest()
def json_write(path:pathlib.Path,obj:object,cap:int=META_CAP)->str:
 data=(json.dumps(obj,sort_keys=True,indent=2)+'\n').encode()
 if len(data)>cap:raise RuntimeError(f'metadata cap exceeded: {path}')
 tmp=path.with_name(path.name+'.tmp-'+uuid.uuid4().hex)
 with tmp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(tmp,path)
 dfd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(dfd)
 finally:os.close(dfd)
 return sha(data)
def run_bounded(name:str,argv:list[str],env:dict[str,str],limit:int,cwd:pathlib.Path|None=None)->dict:
 remain=DEADLINE-time.monotonic()
 if remain<=0:raise TimeoutError('aggregate work deadline reached')
 allotted=min(limit,remain);start=time.monotonic();start_utc=datetime.datetime.now(datetime.timezone.utc).isoformat();base=OUT/'logs'/name
 paths=[base.with_suffix('.stdout.log'),base.with_suffix('.stderr.log')]
 remaining_log=max(0,LOG_CAP-LOG_USED[0]);per_stream=remaining_log//2
 files=[p.open('xb') for p in paths]
 actual_cwd=cwd or ROOT
 proc=subprocess.Popen(argv,cwd=actual_cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 sel=selectors.DefaultSelector();hs=[hashlib.sha256(),hashlib.sha256()];counts=[0,0];truncated=[False,False]
 for i,stream in enumerate((proc.stdout,proc.stderr)):
  os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ,i)
 end=start+allotted;grace=10;timed_out=False;drain_expired=False;term_sent=False;kill_at=end+grace
 try:
  while sel.get_map() or proc.poll() is None:
   now=time.monotonic()
   if now>=end and not term_sent:
    timed_out=True;term_sent=True
    try:os.killpg(proc.pid,signal.SIGTERM)
    except ProcessLookupError:pass
   if term_sent and now>=kill_at:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    if sel.get_map():
     drain_expired=True
     for key in list(sel.get_map().values()):
      sel.unregister(key.fileobj)
      try:key.fileobj.close()
      except OSError:pass
    break
   if not sel.get_map():
    time.sleep(.1);continue
   for key,_ in sel.select(.2):
    i=key.data
    try:data=os.read(key.fileobj.fileno(),65536)
    except BlockingIOError:continue
    if not data:sel.unregister(key.fileobj);continue
    hs[i].update(data);allow=max(0,per_stream-counts[i]);keep=data[:allow]
    if keep:files[i].write(keep);counts[i]+=len(keep)
    if len(keep)<len(data):
     truncated[i]=True
     if not term_sent:
      term_sent=True;kill_at=min(end+grace,time.monotonic()+grace)
      try:os.killpg(proc.pid,signal.SIGTERM)
      except ProcessLookupError:pass
  if proc.poll() is None:
   try:proc.wait(timeout=1)
   except subprocess.TimeoutExpired:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:proc.wait(timeout=1)
    except subprocess.TimeoutExpired:drain_expired=True
 finally:
  capture_errors=[]
  try:sel.close()
  except BaseException as exc:capture_errors.append('selector-close '+type(exc).__name__)
  for i,f in enumerate(files):
   for operation in ('flush','fsync','close'):
    try:
     if operation=='flush':f.flush()
     elif operation=='fsync':os.fsync(f.fileno())
     else:f.close()
    except BaseException as exc:capture_errors.append(f'{operation}[{i}] '+type(exc).__name__)
 physical=[]
 for i,path in enumerate(paths):
  size,digest=hash_file(path,LOG_CAP)
  if size!=counts[i] or digest!=hs[i].hexdigest():capture_errors.append('physical log mismatch '+path.name)
  physical.append({'path':str(path),'bytes':size,'sha256':digest})
 LOG_USED[0]+=sum(counts)
 row={'name':name,'argv':argv,'cwd':str(actual_cwd),'startUtc':start_utc,'endUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'monotonicStart':start,'monotonicEnd':time.monotonic(),'exitCode':proc.returncode,'durationSeconds':round(time.monotonic()-start,3),'limitSeconds':limit,'effectiveDeadlineSeconds':round(allotted,3),'paths':[str(x) for x in paths],'retainedBytes':counts,'rawSha256':[h.hexdigest() for h in hs],'truncated':truncated,'timedOut':timed_out,'drainExpired':drain_expired,'captureErrors':capture_errors,'physical':physical}
 row['ok']=not(timed_out or drain_expired or capture_errors or any(truncated) or proc.returncode!=0)
 return row

def checked(argv:list[str],timeout:int=10)->str:
 remain=min(active_deadline(),SETUP_DEADLINE if not FINALIZING else FINAL_CHECK_DEADLINE)-time.monotonic()
 if remain<=0:raise TimeoutError('preflight command has no remaining bounded time')
 allotted=min(timeout,remain);began=time.monotonic();proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,stdin=subprocess.DEVNULL,start_new_session=True)
 sel=selectors.DefaultSelector();buffers=[bytearray(),bytearray()];streams=(proc.stdout,proc.stderr)
 for i,stream in enumerate(streams):os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ,i)
 timed=False;overflow=False;failure=None;term_at=None
 try:
  while sel.get_map() or proc.poll() is None:
   now=time.monotonic()
   if now-began>=allotted and not timed:
    timed=True;failure=failure or 'timeout'
    if term_at is None:
     term_at=now
     try:os.killpg(proc.pid,signal.SIGTERM)
     except ProcessLookupError:pass
   if term_at is not None and now>=term_at+10:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    for key in list(sel.get_map().values()):
     sel.unregister(key.fileobj)
     try:key.fileobj.close()
     except OSError:pass
    break
   if not sel.get_map():time.sleep(.02);continue
   for key,_ in sel.select(.05):
    i=key.data
    try:block=os.read(key.fileobj.fileno(),65536)
    except BlockingIOError:continue
    if not block:sel.unregister(key.fileobj);continue
    if sum(map(len,buffers))+len(block)>PREFLIGHT_CAPTURE_CAP:
     allowed=max(0,PREFLIGHT_CAPTURE_CAP-sum(map(len,buffers)))
     if allowed:buffers[i].extend(block[:allowed])
     overflow=True;failure='output-cap'
     if term_at is None:
      term_at=now
      try:os.killpg(proc.pid,signal.SIGTERM)
      except ProcessLookupError:pass
    else:buffers[i].extend(block)
 finally:
  sel.close()
  for stream in streams:
   try:stream.close()
   except OSError:pass
 if proc.poll() is None:
  try:proc.wait(timeout=1)
  except subprocess.TimeoutExpired:
   try:os.killpg(proc.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   try:proc.wait(timeout=1)
   except subprocess.TimeoutExpired:failure='kill-timeout'
 stdout=bytes(buffers[0]);stderr=bytes(buffers[1]);duration=round(time.monotonic()-began,3)
 row={'argv':argv,'exitCode':proc.returncode,'durationSeconds':duration,'timeLimitSeconds':round(allotted,3),
      'stdoutBytes':len(stdout),'stderrBytes':len(stderr),'stdoutSha256':sha(stdout),'stderrSha256':sha(stderr),
      'timedOut':timed,'outputCapped':overflow,'failure':failure}
 CHECKED_COMMANDS.append(row)
 if timed or overflow or failure or proc.returncode!=0:
  raise RuntimeError(f'preflight command failed ({failure or proc.returncode}): {argv!r}; stderr={stderr[-500:].decode(errors="replace")}')
 return stdout.decode(errors='strict').strip()

def source_identity(check_setup:bool=True)->dict:
 deadline=SETUP_DEADLINE if check_setup and not FINALIZING else active_deadline()
 if time.monotonic()>=deadline:raise TimeoutError('source identity deadline exceeded')
 def git(args):return checked(['git','-c',f'safe.directory={ROOT}','-C',str(ROOT),*args],timeout=8)
 h=git(['rev-parse','HEAD']);t=git(['rev-parse','HEAD^{tree}']);s=git(['status','--porcelain'])
 if (h,t,s)!=(HEAD,TREE,''):raise RuntimeError('producer source is not exact clean P56')
 stage=git(['ls-files','--stage']);tracked=git(['ls-files']).splitlines()
 prefixes=('crates/','spec/','vendor/','.cargo/','tests/','docs/helix/02-design/contracts/','docs/helix/03-test/fixtures/','spikes/b001/fixtures/')
 chosen=[x for x in tracked if '/' not in x or x.startswith(prefixes)];rows=[]
 for rel in chosen:
  if time.monotonic()>=deadline:raise TimeoutError('source input inventory deadline exceeded')
  p=ROOT/rel
  if p.is_symlink() or not p.is_file():raise RuntimeError(f'build input not regular: {rel}')
  n,d=hash_file(p,32*1024*1024);rows.append({'path':rel,'bytes':n,'sha256':d})
 return {'commit':h,'tree':t,'status':s,'trackedCount':len(tracked),'gitStageRosterSha256':sha(stage.encode()),'selectedInputCount':len(rows),'selectedInputRosterSha256':sha((json.dumps(rows,sort_keys=True)+'\n').encode()),'version':VERSION}

def verify_tools()->dict:
 if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('operator requires actual Darwin arm64 host')
 versions={'rustc':checked([str(RUST_BIN/'rustc'),'-Vv']),'cargo':checked([str(RUST_BIN/'cargo'),'-V']),'maturin':checked([str(MATURIN),'--version']),'maturinBuildHelp':checked([str(MATURIN),'build','--help']),'python':checked([str(PYTHON),'--version']),'clang':checked([str(CLANG),'--version']),'ld':checked([str(LD),'-v']),'sdk':checked(['/usr/bin/xcrun','--sdk','macosx','--show-sdk-path']),'sdkVersion':checked(['/usr/bin/xcrun','--sdk','macosx','--show-sdk-version'])}
 for option in ('--release','--locked','--offline','--target','--interpreter','--out'):
  if option not in versions['maturinBuildHelp']:raise RuntimeError('Maturin build help lacks required option '+option)
 if versions['sdkVersion']!='27.0':raise RuntimeError('selected Apple SDK version differs from pinned 27.0')
 versions['maturinBuildHelpSha256']=sha(versions['maturinBuildHelp'].encode());del versions['maturinBuildHelp']
 if 'rustc 1.90.0 ' not in versions['rustc'] or versions['cargo']!='cargo 1.90.0 (840b83a10 2025-07-30)' or versions['maturin']!='maturin 1.9.6' or versions['python']!='Python 3.9.6' or pathlib.Path(versions['sdk']).resolve()!=SDK.resolve():raise RuntimeError('toolchain/version/SDK identity mismatch')
 py=checked([str(PYTHON),'-c',"import json,platform,sys,sysconfig;print(json.dumps({'version':platform.python_version(),'machine':platform.machine(),'soabi':sysconfig.get_config_var('SOABI'),'include':sysconfig.get_path('include'),'platinclude':sysconfig.get_path('platinclude'),'ldversion':sysconfig.get_config_var('LDVERSION'),'libpl':sysconfig.get_config_var('LIBPL'),'libdir':sysconfig.get_config_var('LIBDIR'),'ldlibrary':sysconfig.get_config_var('LDLIBRARY'),'executable':sys.executable,'prefix':sys.prefix,'base_prefix':sys.base_prefix,'pythonframework':sysconfig.get_config_var('PYTHONFRAMEWORK'),'pythonframeworkdir':sysconfig.get_config_var('PYTHONFRAMEWORKDIR'),'pythonframeworkprefix':sysconfig.get_config_var('PYTHONFRAMEWORKPREFIX'),'pythonframeworkinstalldir':sysconfig.get_config_var('PYTHONFRAMEWORKINSTALLDIR')}))"])
 pyobj=json.loads(py)
 if pyobj['version']!='3.9.6' or pyobj['machine']!='arm64' or not pyobj['soabi']:raise RuntimeError('build interpreter config mismatch')
 string_fields=('include','platinclude','libpl','libdir','ldlibrary','executable','prefix','base_prefix','pythonframework','pythonframeworkdir','pythonframeworkprefix','pythonframeworkinstalldir')
 if any(k not in pyobj or (pyobj[k] is not None and not isinstance(pyobj[k],str)) for k in string_fields):raise RuntimeError('build interpreter raw path/config field has unexpected type')
 if any(not isinstance(pyobj.get(k),str) or not pyobj[k] for k in ('executable','prefix','base_prefix')):raise RuntimeError('build interpreter executable/prefix fields are missing or not strings')
 framework_root=PYTHON_FRAMEWORK.resolve(strict=True)
 if pathlib.Path(pyobj['executable']).resolve(strict=True)!=PYTHON.resolve(strict=True) or pathlib.Path(pyobj['prefix']).resolve(strict=True)!=framework_root or pathlib.Path(pyobj['base_prefix']).resolve(strict=True)!=framework_root:raise RuntimeError('build interpreter executable/prefix identity mismatch')
 if pyobj['prefix']!=str(PYTHON_FRAMEWORK) or pyobj['base_prefix']!=str(PYTHON_FRAMEWORK):raise RuntimeError('raw interpreter prefix differs from fixed framework profile')
 def identity(p):
  rp=p.resolve(strict=True);n,d=hash_file(rp,256*1024*1024);return {'path':str(p),'resolvedPath':str(rp),'bytes':n,'sha256':d}
 paths=[('rustc',RUST_BIN/'rustc'),('cargo',RUST_BIN/'cargo'),('maturin',MATURIN),('clang',CLANG),('ld',LD),('python',PYTHON),('sdkSettings',SDK/'SDKSettings.json'),('Python.h',PYTHON_FRAMEWORK/'Headers/Python.h'),('patchlevel.h',PYTHON_FRAMEWORK/'Headers/patchlevel.h'),('pyconfig.h',PYTHON_FRAMEWORK/'Headers/pyconfig.h'),('Makefile',PYTHON_FRAMEWORK/'lib/python3.9/config-3.9-darwin/Makefile'),('pythonFrameworkBinary',PYTHON_FRAMEWORK/'Python3')]
 expected={'rustc':'b2011d06d5c7efff7b48b1e1aec6106989e44f3a5ad1d171e06a41c0fbc3ffea','cargo':'b617f75ab3fadd5d764368413b7e87532dfa45039aac431f9c0af883b824a6e6','maturin':'efc2e751af40d8f62e9e471efc9677cab58b22a0bdc7244f7a3d8e70a59d1b7a','clang':'1590ac950a3d627817d09ade5cb60b2115f17a72182a3141e010b4bcc482a0c9','ld':'374d9f0713bce2c8a9e1e82bde51615d5433516a10d99b63107eb6ee70542e4c','python':'6e7ae61f68a3838094fc56590f84c52069a97d7816f6bb79e0e85995b340e464','sdkSettings':'7b93ad7e534cc4b31c6a4e39d19b5e0288acf2168c2649479a796d1cb51939fb','Python.h':'0d60539391d29ddda8bbc8a855771435e23322ef7da6fd433f6029381e5fd07a','patchlevel.h':'0514484aa8e9460723bad55dd2b3b8b01feee0dc79e88866840c3851bd79a1d5','pyconfig.h':'b7151baaa719352b5184cb459083e0e4cd7eb263f9c2b716c729dda28e0e45c2','Makefile':'bf8e45741691036a4963bd85337663982fa814f134196154454dea8dd05c7081','pythonFrameworkBinary':'6d3f7badc96687779a34b0bb10b74800b69cd97f7cda4a39a41a35e5d7175d01'}
 files=[]
 framework_keys={'Python.h','patchlevel.h','pyconfig.h','Makefile','pythonFrameworkBinary'}
 for key,p in paths:
  row=identity(p);row['key']=key;files.append(row)
  if key in expected and row['sha256']!=expected[key]:raise RuntimeError(f'pinned build input hash mismatch: {key}')
  if key=='pythonFrameworkBinary' and row['bytes']!=2949168:raise RuntimeError('framework binary size differs from pinned identity')
  if key in framework_keys and pathlib.Path(row['resolvedPath']).is_relative_to(framework_root) is False:raise RuntimeError(f'selected framework identity escaped fixed root: {key}')
 raw_path_facts={}
 for key in ('include','platinclude','libpl','libdir','prefix','base_prefix','executable','pythonframeworkdir','pythonframeworkprefix','pythonframeworkinstalldir'):
  value=pyobj.get(key)
  raw_path_facts[key]={'raw':value,'exists':pathlib.Path(value).exists() if isinstance(value,str) else None}
 composite=(str(pyobj['libdir'])+'/'+str(pyobj['ldlibrary'])) if pyobj.get('libdir') and pyobj.get('ldlibrary') else None
 raw_path_facts['pythonframework']={'raw':pyobj.get('pythonframework'),'role':'reported-framework-name'}
 raw_path_facts['reportedLibdirLdlibraryComposite']={'raw':composite,'exists':pathlib.Path(composite).exists() if composite else None,'role':'reported-composite-not-required-linked-library'}
 framework_file_rows={x['key']:{'path':x['path'],'resolvedPath':x['resolvedPath'],'bytes':x['bytes'],'sha256':x['sha256']} for x in files if x['key'] in framework_keys}
 python_selection={'profile':'fixed-CLT-Python3.9-framework-physical-measurement','frameworkRoot':str(framework_root),'rawPathObservations':raw_path_facts,'selectedPhysicalFiles':framework_file_rows,'extensionModuleLinksLibpython':False,'linkageQualification':'Darwin PyO3 0.27.1 extension-module/abi3-py39 profile; no libpython link required','priorMetadataObservation':{'path':'/private/tmp/g03-macos-python39-framework-metadata-001.json','sha256':'b915ca6253e342063419e187067e2ec9de870630bd910d986133543b31b03e5a','isPriorEvidenceNotRuntimeResult':True}}
 rustlib=RUST_BIN.parent/'lib/rustlib/aarch64-apple-darwin/lib';rust_files=[]
 if not rustlib.is_dir():raise RuntimeError('native aarch64 Rust std target is missing')
 for f in sorted(rustlib.iterdir()):
  if time.monotonic()>=active_deadline():raise TimeoutError('Rust target identity inventory deadline exceeded')
  if f.is_symlink() or not f.is_file():raise RuntimeError('unexpected Rust std target member')
  n,d=hash_file(f,512*1024*1024);rust_files.append({'name':f.name,'bytes':n,'sha256':d})
 if not any(x['name'].startswith('libstd-') for x in rust_files):raise RuntimeError('Rust std target inventory lacks libstd')
 settings=json.loads((SDK/'SDKSettings.json').read_text())
 return {'versions':versions,'pythonConfig':pyobj,'pythonIdentitySelection':python_selection,'files':files,'rustTarget':{'path':str(rustlib),'files':rust_files,'rosterSha256':sha((json.dumps(rust_files,sort_keys=True)+'\n').encode())},'sdkSettings':settings,'boundedCommandObservations':list(CHECKED_COMMANDS)}

def parse_lock_packages()->list[dict]:
 text=(ROOT/'Cargo.lock').read_text(); rows=[]
 for block in re.split(r'\[\[package\]\]\s*',text)[1:]:
  source_line=re.search(r'^source\s*=\s*"([^"]+)"',block,re.M)
  if source_line and source_line.group(1)!='registry+https://github.com/rust-lang/crates.io-index':
   raise RuntimeError('Cargo.lock contains a registry outside the reviewed crates.io cache profile')
  nm=re.search(r'^name\s*=\s*"([^"]+)"',block,re.M);ver=re.search(r'^version\s*=\s*"([^"]+)"',block,re.M);src=re.search(r'^source\s*=\s*"registry\+([^\"]+)"',block,re.M); chk=re.search(r'^checksum\s*=\s*"([0-9a-f]{64})"',block,re.M)
  if src:
   if not(nm and ver and chk):raise RuntimeError('incomplete registry Cargo.lock package')
   rows.append({'name':nm.group(1),'version':ver.group(1),'checksum':chk.group(1),'registry':src.group(1)})
 return rows

def prepare_owned_cargo()->dict:
 # Only verified .crate archives and their sparse index/config are copied. Cargo itself
 # unpacks those checksum-verified archives into this fresh owned Cargo home offline.
 packages=parse_lock_packages();cacheroot=CARGO_SOURCE/'registry'/'cache';indexroot=CARGO_SOURCE/'registry'/'index'
 cachebases=list(cacheroot.iterdir());indexbases=list(indexroot.iterdir())
 if not(cachebases and indexbases):raise RuntimeError('required local Cargo archive/index caches are absent')
 plan=[];unique_sources={}
 for pkg in packages:
  if time.monotonic()>=SETUP_DEADLINE:raise TimeoutError('Cargo cache preflight exceeded 600-second setup bound')
  archive_name=f"{pkg['name']}-{pkg['version']}.crate";archive_matches=[]
  for base in cachebases:
   q=base/archive_name
   if q.is_file() and not q.is_symlink():archive_matches.append((base,q))
  if len(archive_matches)!=1:raise RuntimeError(f'locked registry archive not uniquely cached: {archive_name}')
  reg_hash=archive_matches[0][0].name
  name=pkg['name'].lower()
  if len(name)==1:idxrel=pathlib.Path('1')/name
  elif len(name)==2:idxrel=pathlib.Path('2')/name
  elif len(name)==3:idxrel=pathlib.Path('3')/name[0]/name
  else:idxrel=pathlib.Path(name[:2])/name[2:4]/name
  index_matches=[(b,b/'.cache'/idxrel) for b in indexbases if (b/'.cache'/idxrel).is_file() and not (b/'.cache'/idxrel).is_symlink()]
  if len(index_matches)!=1:raise RuntimeError(f'missing/ambiguous locked sparse index record: {name}')
  index_base,index_file=index_matches[0]
  if index_base.name!=reg_hash:raise RuntimeError('Cargo sparse-index and archive cache roots disagree')
  archive=archive_matches[0][1]
  if hash_file(archive,64*1024*1024)[1]!=pkg['checksum']:
   raise RuntimeError(f"cached .crate checksum differs from Cargo.lock: {archive_name}")
  cfg=index_base/'config.json'
  if not cfg.is_file() or cfg.is_symlink():raise RuntimeError('Cargo registry download configuration missing or unsafe')
  cfg_data=json.loads(cfg.read_text())
  if cfg_data.get('dl')!='https://static.crates.io/crates':raise RuntimeError('Cargo registry download endpoint differs from crates.io')
  for src,dst in ((archive,pathlib.Path('registry/cache')/reg_hash/archive_name),
                   (index_file,pathlib.Path('registry/index')/reg_hash/'.cache'/idxrel),
                   (cfg,pathlib.Path('registry/index')/reg_hash/'config.json')):
   unique_sources[str(src)]=(src,dst)
  plan.append({'package':pkg,'archive':archive,'archiveRelative':pathlib.Path('registry/cache')/reg_hash/archive_name,
               'indexFile':index_file,'indexRelative':pathlib.Path('registry/index')/reg_hash/'.cache'/idxrel,
               'configFile':cfg,'registryHash':reg_hash})
 total=0;preflight=[]
 for src,dst in unique_sources.values():
  if time.monotonic()>=SETUP_DEADLINE:raise TimeoutError('Cargo cache size preflight exceeded 600-second setup bound')
  if src.is_symlink() or not src.is_file():raise RuntimeError('Cargo cache input is not a regular file')
  n=src.stat().st_size
  if n>64*1024*1024:raise RuntimeError(f'Cargo cache individual file exceeds bound: {src}')
  total+=n;preflight.append({'source':str(src),'relativeDestination':str(dst),'bytes':n})
  if total>2*1024*1024*1024:raise RuntimeError('selected Cargo archive/index cache exceeds 2 GiB pre-copy budget')
 target=OUT/'cargo-home'
 for rel in ('registry/cache','registry/index'):(target/rel).mkdir(parents=True,exist_ok=True)
 copied={}
 for src,dst in unique_sources.values():
  if time.monotonic()>=SETUP_DEADLINE:raise TimeoutError('setup/cache-copy stage exceeded 600 seconds')
  n,d=hash_file(src,64*1024*1024);out=target/dst;out.parent.mkdir(parents=True,exist_ok=True)
  with src.open('rb') as inp,out.open('xb') as dest:
   while True:
    if time.monotonic()>=SETUP_DEADLINE:raise TimeoutError('Cargo cache copy deadline exceeded')
    block=inp.read(1024*1024)
    if not block:break
    dest.write(block)
   dest.flush();os.fsync(dest.fileno())
  if hash_file(out,64*1024*1024)!=(n,d):raise RuntimeError('owned Cargo cache copy changed')
  copied[str(src)]={'source':str(src),'ownedPath':str(out),'bytes':n,'sha256':d}
 selected=[]
 for item in plan:
  pkg=item['package'];a=copied[str(item['archive'])]
  if a['sha256']!=pkg['checksum']:raise RuntimeError(f"cached .crate SHA-256 differs from Cargo.lock: {pkg['name']}-{pkg['version']}")
  selected.append({'package':pkg,'archive':a,'indexRecord':copied[str(item['indexFile'])],
                   'registryConfig':copied[str(item['configFile'])]})
 copied_rows=sorted(copied.values(),key=lambda row:row['source'])
 return {'lockedRegistryPackageCount':len(packages),'preflightFileCount':len(preflight),'selectedBytes':total,
  'maxSelectedBytes':2*1024*1024*1024,'preflightInventorySha256':sha((json.dumps(preflight,sort_keys=True)+'\n').encode()),
  'copiedFileCount':len(copied_rows),'copiedFileRosterSha256':sha((json.dumps(copied_rows,sort_keys=True)+'\n').encode()),
  'copiedFiles':copied_rows,'packages':selected,'sourcePolicy':'checksum-verified .crate archives copied; no unpacked registry/source trees copied'}

def main()->int:
 global OUTPUT_OWNED,FINALIZING,SETUP_PHASE,FINAL_CHECK_DEADLINE
 if os.environ.get('G03_MACOS_BUILD_EXECUTE')!='1':raise RuntimeError('explicit execution flag required')
 status='FAIL_OR_UNKNOWN';failure=None;stages=[];tool=None;source=None;cache=None;candidate=None
 start=time.monotonic()
 try:
  if OUT.exists() or OUT.is_symlink():raise RuntimeError('output path must be fresh')
  OUT.mkdir(mode=0o700);OUTPUT_OWNED=True
  for name in ('logs','dist','target','cargo-home','home','tmp'):(OUT/name).mkdir(mode=0o700)
  seed={'profile':'weft-local-macos-arm64-build-static/1','status':'FAIL_OR_UNKNOWN','executionKind':'local-build-only','executionId':EXEC,'functionalQualification':'NOT_RUN','failure':'preflight incomplete','operatorPath':str(pathlib.Path(__file__).resolve())}
  json_write(OUT/'result.json',seed)
  runner_path=pathlib.Path(__file__).resolve();audit_path=runner_path.parent/'static_audit.py'
  runner_size,runner_sha=hash_file(runner_path,512*1024);audit_size,audit_sha=hash_file(audit_path,256*1024)
  operator_identity={'runnerPath':str(runner_path),'runnerBytes':runner_size,'runnerSha256':runner_sha,
                     'staticAuditPath':str(audit_path),'staticAuditBytes':audit_size,'staticAuditSha256':audit_sha}
  source=source_identity();tool=verify_tools()
  if time.monotonic()>SETUP_DEADLINE:raise TimeoutError('source/tool preflight exceeded 600-second setup bound')
  if audit_sha!=STATIC_AUDIT_SHA:raise RuntimeError('static audit helper source hash mismatch')
  cfg=ROOT/'crates/weft-python/pyproject.toml'; text=cfg.read_text(); cargo_toml=(ROOT/'crates/weft-python/Cargo.toml').read_text(); root_cargo=(ROOT/'Cargo.toml').read_text()
  expected_features=['ashlar-sdk-ordered-page-candidate','raw-postgresql-reads','ashlar-databricks-paths-keys','ashlar-databricks-qualified','truss-postgresql-pg18','current-postgresql-scalar-candidate','current-databricks-scalar-candidate','current-query-refinement-candidate','current-presence-graph-requirements-candidate']
  if 'version = "0.4.56"' not in text or 'version = "0.4.56"' not in cargo_toml or 'version="=0.27.1",features=["extension-module","abi3-py39"]' not in cargo_toml or 'debug = 1' not in root_cargo or 'strip = "none"' not in root_cargo:raise RuntimeError('candidate version, PyO3 abi3, or release profile differs')
  match=re.search(r'(?m)^features\s*=\s*\[(.*?)\]\s*$',text,re.S)
  if not match or re.findall(r'"([^"]+)"',match.group(1))!=expected_features:raise RuntimeError('pyproject Maturin feature roster differs from reviewed nine features')
  env={'PATH':str(RUST_BIN)+':/usr/bin:/bin:/usr/sbin:/sbin','RUSTUP_TOOLCHAIN':'1.90.0-aarch64-apple-darwin','CARGO_HOME':str(OUT/'cargo-home'),'CARGO_TARGET_DIR':str(OUT/'target'),'CARGO_BUILD_JOBS':'4','PYO3_PYTHON':str(PYTHON),'SDKROOT':str(SDK),'CC':str(CLANG),'CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER':str(CLANG),'MACOSX_DEPLOYMENT_TARGET':'11.0','HOME':str(OUT/'home'),'TMPDIR':str(OUT/'tmp'),'LC_ALL':'C'}
  cache=prepare_owned_cargo()
  if time.monotonic()>SETUP_DEADLINE:raise TimeoutError('setup cache preparation exceeded 600 seconds')
  setup={'source':source,'toolchain':tool,'selectedCargoCache':cache,'candidateBuildConfig':{'version':VERSION,'pyo3Version':'0.27.1','pyo3Features':['extension-module','abi3-py39'],'maturinFeatures':expected_features,'releaseDebug':1,'releaseStrip':'none','target':'aarch64-apple-darwin','minimumMacOS':'11.0'},'effectiveEnvironment':{k:env[k] for k in ('PATH','RUSTUP_TOOLCHAIN','CARGO_HOME','CARGO_TARGET_DIR','CARGO_BUILD_JOBS','PYO3_PYTHON','SDKROOT','CC','CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER','MACOSX_DEPLOYMENT_TARGET','HOME','TMPDIR','LC_ALL')}}
  json_write(OUT/'setup.json',setup)
  if time.monotonic()>SETUP_DEADLINE:raise TimeoutError('setup evidence finalization exceeded 600 seconds')
  SETUP_PHASE=False
  build_row=run_bounded('candidate-build',[str(MATURIN),'build','--release','--locked','--offline','--target','aarch64-apple-darwin','--interpreter',str(PYTHON),'--out',str(OUT/'dist')],env,STAGES['candidate-build'],ROOT/'crates/weft-python');stages.append(build_row)
  if not build_row['ok']:raise RuntimeError('candidate build failed; bounded logs retained')
  wheels=sorted((OUT/'dist').glob('*.whl'))
  if len(wheels)!=1 or wheels[0].is_symlink() or not wheels[0].is_file():raise RuntimeError('candidate wheel output roster mismatch')
  wheel_size,wheel_hash=hash_file(wheels[0],WHEEL_CAP)
  audit_start=time.monotonic()
  audit_row=run_bounded('static-audit',[str(PYTHON),str(audit_path),str(wheels[0]),str(OUT/'static-audit.json'),str(ROOT)],env,STAGES['static-audit']);stages.append(audit_row)
  if not audit_row['ok']:raise RuntimeError('static wheel audit failed; bounded logs retained')
  report_size,report_sha=hash_file(OUT/'static-audit.json',META_CAP)
  candidate=json.loads(OUT.joinpath('static-audit.json').read_bytes())
  if candidate.get('status')!='STATIC_WHEEL_PASS' or candidate.get('wheel',{}).get('sha256')!=wheel_hash or candidate.get('wheel',{}).get('bytes')!=wheel_size:raise RuntimeError('static audit report does not close over candidate wheel')
  candidate['staticReportPhysical']={'path':str(OUT/'static-audit.json'),'bytes':report_size,'sha256':report_sha}
  if time.monotonic()-audit_start>STAGES['static-audit']:raise TimeoutError('static audit plus closure exceeded 120 seconds')
  status='LOCAL_MACOS_BUILD_STATIC_PASS'
 except BaseException as e:failure=f'{type(e).__name__}: {str(e)[:500]}';status='FAIL_OR_UNKNOWN'
 finally:
  FINALIZING=True
  FINAL_CHECK_DEADLINE=min(time.monotonic()+CLEANUP,START+TOTAL-15)
  try:post=source_identity(check_setup=False)
  except BaseException as e:post={'error':f'{type(e).__name__}: {str(e)[:200]}'}
  try:post_tools=verify_tools()
  except BaseException as e:post_tools={'error':f'{type(e).__name__}: {str(e)[:200]}'}
  try:
   if 'operator_identity' not in locals():raise RuntimeError('operator identity unavailable')
   rn,rh=hash_file(pathlib.Path(operator_identity['runnerPath']),512*1024)
   an,ah=hash_file(pathlib.Path(operator_identity['staticAuditPath']),256*1024)
   post_operator={'runnerBytes':rn,'runnerSha256':rh,'staticAuditBytes':an,'staticAuditSha256':ah}
   if (rn,rh,an,ah)!=(runner_size,runner_sha,audit_size,audit_sha):
    status='FAIL_OR_UNKNOWN';failure=(failure+'; ' if failure else '')+'operator source changed during build'
  except BaseException as e:
   post_operator={'error':f'{type(e).__name__}: {str(e)[:200]}'}
   status='FAIL_OR_UNKNOWN';failure=(failure+'; ' if failure else '')+'terminal operator identity check failed'
  def stable_tool(x):return {k:v for k,v in x.items() if k!='boundedCommandObservations'} if isinstance(x,dict) else x
  if source is not None and post!=source:status='FAIL_OR_UNKNOWN';failure=(failure+'; ' if failure else '')+'producer changed during build'
  if tool is not None and stable_tool(post_tools)!=stable_tool(tool):status='FAIL_OR_UNKNOWN';failure=(failure+'; ' if failure else '')+'pinned tool/SDK inputs changed during build'
  terminal_deadline=FINAL_CHECK_DEADLINE
  if time.monotonic()>terminal_deadline:status='FAIL_OR_UNKNOWN';failure=(failure+'; ' if failure else '')+'aggregate deadline left no terminal closure reserve'
  record={'profile':'weft-local-macos-arm64-build-static/1','status':status,'executionKind':'local-build-only','executionId':EXEC,'source':source,'postRunSource':post,'tools':tool,'postRunTools':post_tools,'postRunOperator':post_operator,'selectedCargoCache':cache,'candidate':candidate,'stages':stages,'boundedCommandObservations':list(CHECKED_COMMANDS),'cleanupErrors':[],'functionalQualification':'NOT_RUN','installed':False,'compilerParity':False,'browserParity':False,'hosted':False,'failure':failure,'operator':{**(operator_identity if 'operator_identity' in locals() else {}),'acceptedPlanPath':'/private/tmp/g03-macos-build-only-operator-sol-plan001.md','acceptedPlanSha256':'cafc0eb9b3ed1346210e2e1b85e437df8fb85beb7bd70e5e454f992de5b5ac53','measurementRepairPlanPath':'/private/tmp/g03-macos-preflight001-sol-actual-and-repair-plan002.md','measurementRepairPlanSha256':'fba4b31855acb8ab74a864ef4e5b84d080a52987d5e4a95ffe493c1d045b0ff4'},'limits':{'aggregateSeconds':TOTAL,'terminalReserveSeconds':RESERVE,'cleanupSeconds':CLEANUP,'stageSeconds':STAGES,'killGraceSeconds':10,'aggregateLogBytes':LOG_CAP,'aggregateLogRetainedBytes':LOG_USED[0],'metadataBytes':META_CAP,'wheelBytes':WHEEL_CAP,'expandedWheelBytes':EXPANDED_CAP,'cargoCacheBytes':2*1024*1024*1024,'cargoJobs':4}}
  if OUTPUT_OWNED:
   result_path=OUT/'result.json'
   try:
    rows=[];allowed_logs={'candidate-build.stdout.log','candidate-build.stderr.log','static-audit.stdout.log','static-audit.stderr.log'}
    if not (OUT/'logs').is_dir():raise RuntimeError('selected log directory missing')
    log_names={p.name for p in (OUT/'logs').iterdir()}
    if not log_names.issubset(allowed_logs):raise RuntimeError('unexpected selected log evidence member')
    for name in ('setup.json','static-audit.json'):
     p=OUT/name
     if p.exists():
      n,d=hash_file(p,META_CAP);rows.append({'path':name,'bytes':n,'sha256':d})
    for name in sorted(log_names):
     p=OUT/'logs'/name;n,d=hash_file(p,LOG_CAP);rows.append({'path':'logs/'+name,'bytes':n,'sha256':d})
    expected_logs={}
    for stage in stages:
     for item in stage.get('physical',[]):expected_logs[pathlib.Path(item['path']).name]=(item['bytes'],item['sha256'])
    actual_logs={pathlib.Path(item['path']).name:(item['bytes'],item['sha256']) for item in rows if item['path'].startswith('logs/')}
    if actual_logs!=expected_logs:raise RuntimeError('selected physical logs differ from bounded command captures')
    family=sum(x['bytes'] for x in rows)
    record['selectedEvidenceFiles']=rows;record['selectedEvidenceBytes']=family
    raw=(json.dumps(record,sort_keys=True,indent=2)+'\n').encode()
    if family+len(raw)>META_CAP:raise RuntimeError('complete selected evidence family exceeds 16 MiB')
    if time.monotonic()>terminal_deadline:raise TimeoutError('terminal deadline crossed before receipt write')
    with result_path.with_suffix('.json.tmp').open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    if time.monotonic()>terminal_deadline:raise TimeoutError('terminal deadline crossed before receipt publish')
    os.replace(result_path.with_suffix('.json.tmp'),result_path)
    dfd=os.open(OUT,os.O_RDONLY);os.fsync(dfd);os.close(dfd)
    result_bytes,result_sha=hash_file(result_path,META_CAP)
    if (result_bytes,result_sha)!=(len(raw),sha(raw)):raise RuntimeError('terminal receipt physical bytes do not match serialized result')
    if time.monotonic()>terminal_deadline:
     status='FAIL_OR_UNKNOWN';record['status']=status;record['failure']='terminal deadline crossed after receipt durability'
     raw=(json.dumps(record,sort_keys=True,indent=2)+'\n').encode()
     if len(raw)+family<=META_CAP:
      with result_path.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    result_bytes,result_sha=hash_file(result_path,META_CAP)
    if (result_bytes,result_sha)!=(len(raw),sha(raw)):raise RuntimeError('terminal receipt physical bytes do not match serialized result')
   except BaseException as e:
    status='FAIL_OR_UNKNOWN';failure=f'terminal receipt failure: {type(e).__name__}: {str(e)[:200]}'
    minimal={'profile':'weft-local-macos-arm64-build-static/1','status':'FAIL_OR_UNKNOWN','executionId':EXEC,'failure':failure,'functionalQualification':'NOT_RUN'}
    try:
     raw=(json.dumps(minimal,sort_keys=True,indent=2)+'\n').encode()
     with result_path.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    except BaseException:pass
 print(json.dumps({'status':status,'failure':failure,'output':str(OUT)},sort_keys=True));return 0 if status=='LOCAL_MACOS_BUILD_STATIC_PASS' else 1
if __name__=='__main__':raise SystemExit(main())
