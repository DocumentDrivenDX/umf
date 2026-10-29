#!/usr/bin/env python3
"""Single-owner, admission-bound Python then installed-SDK Chromium G03 lane."""
from __future__ import annotations
import argparse,hashlib,json,os,pathlib,signal,stat,subprocess,sys,threading,time,uuid
ROOT=pathlib.Path('/private/tmp/g03-sdk058-parity-019'); R=ROOT/'runtime'
DEPENDENCY_OUTPUT=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight/out')
DEPENDENCY_PREFLIGHT=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight/preflight.py')
DEPENDENCY_CENSUS=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight/runtime-import-census.json')
DEPENDENCY_REVIEW=pathlib.Path('/private/tmp/g03-sdk058-dependency-preflight009-sol-actual-review001.md')
DEPENDENCY_VOLUME='umf-migration-source-267675510';DEPENDENCY_SUBPATH='node_modules'
TOTAL=1800; RESERVE=60; GRACE=10; EVIDENCE=16*1024*1024; RAW=1024*1024
sys.dont_write_bytecode=True
os.environ['PYTHONDONTWRITEBYTECODE']='1'
dedupe_roots=owner_receipt_payload=replace_with_failure_receipt=None
FINAL_SLICE=20; OWNER_START=0.0; OWNER_DEADLINE=float('inf'); PHASE_DEADLINE=float('inf')

class OwnerDeadline(Exception): pass
def owner_signal(signum,frame): raise OwnerDeadline('owner interrupted by '+signal.Signals(signum).name)
def guard(seconds=0):
 now=time.monotonic()
 if now+seconds>=min(OWNER_DEADLINE,PHASE_DEADLINE):raise OwnerDeadline('shared original deadline reached')

def fail(s): raise RuntimeError(s)
def regular_hash(p,cap):
 guard()
 st=p.lstat()
 if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>cap: fail('unsafe/oversized file '+str(p))
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  for b in iter(lambda:f.read(65536),b''):
   guard()
   n+=len(b)
   if n>cap:fail('file grew beyond bound')
   h.update(b)
 st2=p.lstat()
 guard()
 if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns) or n!=st.st_size:fail('file changed during physical read')
 return h.hexdigest(),n
def tree(root):
 rows=[];total=0
 for base,dirs,files in os.walk(root,followlinks=False):
  guard()
  for d in dirs:
   guard()
   if (pathlib.Path(base)/d).is_symlink():fail('symlink in SDK install tree')
  for name in files:
   guard()
   p=pathlib.Path(base)/name;h,n=regular_hash(p,64*1024*1024);total+=n
   if total>256*1024*1024 or len(rows)>=8192:fail('SDK install tree exceeds custody bounds')
   rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
 rows.sort(key=lambda x:x['path'])
 return rows,total,hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def bounded_read(p,cap):
 h,n=regular_hash(p,cap)
 if n>cap:fail('bounded read overflow')
 guard()
 before=p.lstat();fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0));chunks=[];count=0;digest=hashlib.sha256()
 try:
  opened=os.fstat(fd)
  if not stat.S_ISREG(opened.st_mode) or (opened.st_dev,opened.st_ino,opened.st_size)!=(before.st_dev,before.st_ino,before.st_size):fail('bounded input changed before read')
  while True:
   guard();block=os.read(fd,min(65536,cap+1-count))
   if not block:break
   count+=len(block)
   if count>cap:fail('bounded input grew beyond cap')
   digest.update(block);chunks.append(block)
  after=os.fstat(fd)
  if (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)!=(opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns) or count!=n:fail('bounded input changed during read')
 finally:os.close(fd)
 raw=b''.join(chunks)
 if len(raw)!=n or digest.hexdigest()!=h:fail('bounded input digest changed after physical hash')
 guard()
 return json.loads(raw)
def docker(argv,timeout=8):
 guard(0.1)
 clipped=min(timeout,PHASE_DEADLINE-time.monotonic(),OWNER_DEADLINE-time.monotonic())
 if clipped<=0.1:raise OwnerDeadline('no shared time remains for Docker metadata')
 cp=subprocess.run(['docker']+argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=clipped,check=False)
 guard()
 if len(cp.stdout)+len(cp.stderr)>64*1024:fail('Docker cleanup metadata exceeds bound')
 return cp.returncode,cp.stdout.decode().strip()
def recover_owned(before_py,before_br):
 state={'daemonReachable':False,'ownedContainersRemoved':[],'ownedVolumesRemoved':[],'containerAbsenceVerified':False,'volumeAbsenceVerified':False,'verified':False}
 try:
  rc,out=docker(['info','--format','{{.OSType}}/{{.Architecture}}'])
  state['daemonReachable']=rc==0 and bool(out)
  if not state['daemonReachable']:return state
  pyroot=ROOT/'runs';brroot=ROOT/'browser-runs'
  pyids=[];brids=[]
  if pyroot.exists():
   for p in pyroot.iterdir():
    guard();
    if p.is_dir() and p.name not in before_py and len(p.name)==32 and all(c in '0123456789abcdef' for c in p.name):pyids.append(p.name)
  if brroot.exists():
   for p in brroot.iterdir():
    guard();
    if p.is_dir() and p.name not in before_br and len(p.name)==32 and all(c in '0123456789abcdef' for c in p.name):brids.append(p.name)
  names=[('g03-sdk058-py-'+x[:16],x,True) for x in pyids]+[('g03-sdk058-arm-browser-'+x[:14],x,False) for x in brids]
  allc=True;allv=True
  for name,owner,hasvol in names:
   guard(0.1)
   rc,listed=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])
   if rc or listed not in ('',name):allc=False;continue
   if listed:
    rc,label=docker(['inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',name])
    if rc or label!=owner:allc=False;continue
    rr,_=docker(['rm','--force',name],15)
    if rr:allc=False
   rc,listed=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])
   if rc or listed:allc=False
   if hasvol:
    vol='g03-sdk058-pyvenv-'+owner[:16]
    rc,info=docker(['volume','inspect','--format','{{.Name}}|{{index .Labels "codex.g03.execution-id"}}|{{index .Labels "codex.g03.kind"}}',vol])
    if rc==0 and info==vol+'|'+owner+'|sdk058-python-venv':
     rr,_=docker(['volume','rm',vol])
     if rr:allv=False
    elif rc!=1:allv=False
    rc,listed=docker(['volume','ls','--filter','name=^'+vol+'$','--format','{{.Name}}'])
    if rc or listed:allv=False
  state.update(ownedContainersRemoved=names,containerAbsenceVerified=allc,volumeAbsenceVerified=allv,verified=allc and allv)
 except BaseException as e:state['error']=type(e).__name__+': '+str(e)[:120]
 return state
def verify_dependency_input(admission):
 paths={'dependencyInventoryFileSha256':DEPENDENCY_OUTPUT/'dependency-view-inventory.json','dependencyMetadataReceiptSha256':DEPENDENCY_OUTPUT/'metadata-result.json','dependencyOwnerReceiptSha256':DEPENDENCY_OUTPUT/'preflight-owner-result.json','dependencyPreflightSourceSha256':DEPENDENCY_PREFLIGHT,'dependencyCensusSha256':DEPENDENCY_CENSUS,'dependencyInputReviewSha256':DEPENDENCY_REVIEW}
 observed={}
 for key,path in paths.items():
  if not path.is_absolute() or path.resolve(strict=True)!=path:fail('dependency input path is not canonical: '+str(path))
  digest,size=regular_hash(path,8*1024*1024)
  if admission.get(key)!=digest:fail('admission does not bind exact dependency input '+key)
  observed[key]={'path':str(path),'sha256':digest,'sizeBytes':size}
  size_key={'dependencyInventoryFileSha256':'dependencyInventoryFileBytes','dependencyMetadataReceiptSha256':'dependencyMetadataReceiptBytes','dependencyOwnerReceiptSha256':'dependencyOwnerReceiptBytes'}.get(key)
  if size_key and admission.get(size_key)!=size:fail('admission does not bind exact dependency input size '+size_key)
 if admission.get('dependencyVolume')!=DEPENDENCY_VOLUME or admission.get('dependencySubpath')!=DEPENDENCY_SUBPATH or admission.get('dependencyOriginMount')!='whole-volume-readonly-at-/dependency-origin':fail('admission dependency volume/subpath/origin identity mismatch')
 metadata=bounded_read(DEPENDENCY_OUTPUT/'metadata-result.json',64*1024);owner=bounded_read(DEPENDENCY_OUTPUT/'preflight-owner-result.json',64*1024)
 if owner.get('status')!='METADATA_PREFLIGHT_PASS' or owner.get('containerAbsent') is not True or owner.get('failure') is not None:fail('dependency metadata owner receipt is not closed PASS')
 if metadata.get('status')!='METADATA_PREFLIGHT_PASS' or metadata.get('profile')!='umf.g03-sdk058-dependency-view-preflight/1':fail('dependency metadata receipt profile/status mismatch')
 view=metadata.get('dependencyView',{});origin=metadata.get('dependencyOrigin',{});source=metadata.get('source',{})
 expected={'dependencyLogicalInventorySha256':'5dee664cf9d3e2d6e6325666ab75f26d290b05a6be09423b0a1cd04f6fc5d141','dependencyViewRegularBytes':215399057,'dependencyViewRegularFiles':19501,'dependencyViewDirectoryCount':1943,'dependencyViewInternalLinkCount':17,'dependencyViewMetadataBytes':3697819,'dependencyOriginPackageSha256':'c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b','dependencyOriginPackageVersion':'0.5.7','dependencySourcePackageSha256':'323d619288cd35e7e86c932c0d26bfbfb2f8b4a5e5cc3f39bcaa415dd3c3aeaa','dependencySourcePackageVersion':'0.5.8','dependencyLockSha256':'5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4','dependencyInventoryFileBytes':4740104,'dependencyMetadataReceiptBytes':5349,'dependencyOwnerReceiptBytes':3976}
 actual={'dependencyLogicalInventorySha256':view.get('inventorySha256'),'dependencyViewRegularBytes':view.get('regularBytes'),'dependencyViewRegularFiles':view.get('regularFileCount'),'dependencyViewDirectoryCount':view.get('directoryCount'),'dependencyViewInternalLinkCount':view.get('internalSymlinkCount'),'dependencyViewMetadataBytes':view.get('metadataBytes'),'dependencyOriginPackageSha256':origin.get('packageSha256'),'dependencyOriginPackageVersion':origin.get('packageVersion'),'dependencySourcePackageSha256':source.get('packageSha256'),'dependencySourcePackageVersion':source.get('packageVersion'),'dependencyLockSha256':origin.get('lockSha256'),'dependencyInventoryFileBytes':observed['dependencyInventoryFileSha256']['sizeBytes'],'dependencyMetadataReceiptBytes':observed['dependencyMetadataReceiptSha256']['sizeBytes'],'dependencyOwnerReceiptBytes':observed['dependencyOwnerReceiptSha256']['sizeBytes']}
 if actual!=expected:fail('dependency metadata receipt differs from accepted009 input review')
 for key,value in expected.items():
  if admission.get(key)!=value:fail('root admission does not bind exact accepted dependency fact '+key)
 if regular_hash(DEPENDENCY_OUTPUT/'dependency-view-inventory.json',8*1024*1024)[0]!=admission.get('dependencyInventoryFileSha256'):fail('full dependency input inventory file hash changed')
 return {'status':'ADMITTED_READONLY_TOOL_INPUT','inputs':observed,'logicalInventorySha256':actual['dependencyLogicalInventorySha256'],'regularBytes':actual['dependencyViewRegularBytes'],'regularFiles':actual['dependencyViewRegularFiles'],'directoryCount':actual['dependencyViewDirectoryCount'],'internalSymlinkCount':actual['dependencyViewInternalLinkCount'],'metadataBytes':actual['dependencyViewMetadataBytes'],'originPackageVersion':actual['dependencyOriginPackageVersion'],'originPackageSha256':actual['dependencyOriginPackageSha256'],'sourcePackageVersion':actual['dependencySourcePackageVersion'],'sourcePackageSha256':actual['dependencySourcePackageSha256'],'lockSha256':actual['dependencyLockSha256']}

def final_inventory(out,result,before_py,before_br):
 roots=[out]
 for key in ('pythonRun','browserRun'):
  if key in result:roots.append(pathlib.Path(result[key]))
 for base,before in ((ROOT/'runs',before_py),(ROOT/'browser-runs',before_br)):
  if base.exists():roots.extend(p for p in base.iterdir() if p.is_dir() and p.name not in before)
 unique_roots=dedupe_roots(roots)
 entries={};identities={};total=0
 for root in unique_roots:
  for base,dirs,names in os.walk(root,followlinks=False):
   guard()
   for d in dirs:
    guard()
    if (pathlib.Path(base)/d).is_symlink():fail('symlink in inclusive evidence')
   for name in names:
    guard();p=pathlib.Path(base)/name
    if p.is_symlink():fail('symlink file in inclusive evidence')
    resolved=p.resolve(strict=True)
    h,n=regular_hash(resolved,8*1024*1024);key=str(resolved)
    row={'path':key,'sizeBytes':n,'sha256':h};st=resolved.lstat();identity=(st.st_dev,st.st_ino)
    if key in entries:
     if entries[key]!=row:fail('conflicting duplicate evidence identity: '+key)
     continue
    if identity in identities:
     if identities[identity]['sizeBytes']!=n or identities[identity]['sha256']!=h:fail('conflicting hardlink evidence identity: '+key)
     continue
    entries[key]=row;total+=n
    identities[identity]=row
    if total>EVIDENCE:fail('inclusive final evidence exceeds16MiB; refuse publication')
 return sorted(entries.values(),key=lambda x:x['path']),total

def atomic_receipt(path,raw):
 temp=path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.tmp')
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
 try:
  view=memoryview(raw)
  while view:
   guard()
   n=os.write(fd,view[:65536])
   if n<=0:raise OSError('short receipt write')
   view=view[n:]
  os.fsync(fd)
 finally:os.close(fd)
 os.replace(temp,path)
 dfd=os.open(path.parent,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
 try:os.fsync(dfd)
 finally:os.close(dfd)
def run(argv,deadline,env,logpath,allowance):
 guard()
 effective=min(deadline,OWNER_DEADLINE,PHASE_DEADLINE)
 remaining=effective-time.monotonic()
 if remaining<=GRACE+2:fail('shared deadline leaves no child stop/reap allowance')
 p=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,env=env)
 retained=0;raw=0;truncated=False;sel=None;files=[];failure=None
 try:
  files=[logpath.open('xb')]
  import selectors
  sel=selectors.DefaultSelector()
  for stream in (p.stdout,p.stderr):os.set_blocking(stream.fileno(),False);sel.register(stream,selectors.EVENT_READ)
  stop_at=min(effective-GRACE-2,time.monotonic()+remaining-GRACE-2);term=False
  while sel.get_map() or p.poll() is None:
   now=time.monotonic()
   if now>=stop_at and not term:
    failure='shared-stage-cutoff';term=True
    try:os.killpg(p.pid,signal.SIGTERM)
    except ProcessLookupError:pass
   if now>=effective:
    failure=failure or 'shared-stage-deadline'
    for key in list(sel.get_map().values()):
     sel.unregister(key.fileobj)
     try:key.fileobj.close()
     except OSError:pass
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    break
   guard()
   for key,_ in sel.select(min(.15,max(.001,effective-now))):
    try:data=os.read(key.fileobj.fileno(),65536)
    except BlockingIOError:continue
    if not data:sel.unregister(key.fileobj);continue
    raw+=len(data);available=max(0,allowance-retained);piece=data[:available]
    if piece:files[0].write(piece);retained+=len(piece)
    if len(piece)<len(data):truncated=True;failure=failure or 'aggregate-log-cap'
  remaining=effective-time.monotonic()
  if p.poll() is None:
   try:p.wait(timeout=max(0,min(GRACE,remaining)))
   except subprocess.TimeoutExpired:
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
  if p.poll() is None:
   remaining=effective-time.monotonic()
   try:p.wait(timeout=max(0,min(2,remaining)))
   except subprocess.TimeoutExpired:failure=failure or 'child-reap-deadline'
 except BaseException:
  try:os.killpg(p.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  remaining=min(GRACE,max(0,effective-time.monotonic()))
  try:p.wait(timeout=remaining)
  except subprocess.TimeoutExpired:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   try:p.wait(timeout=max(0,min(2,max(0,effective-time.monotonic()))))
   except subprocess.TimeoutExpired:pass
  raise
 finally:
  if sel is not None:
   try:sel.close()
   except BaseException:pass
  for stream in (p.stdout,p.stderr):
   try:stream.close()
   except BaseException:pass
  for f in files:
   try:f.flush();os.fsync(f.fileno());f.close()
   except BaseException:pass
 if failure or p.returncode is None:fail(failure or 'child process was not reaped before shared stage deadline')
 digest,n=regular_hash(logpath,allowance)
 return {'exitCode':p.returncode,'rawBytes':raw,'retainedBytes':retained,'truncated':truncated,'sha256':digest}

SOURCE_FILES={
 'README.md','admission.template.json','browser-inputs.json','browser-inputs.template.json','python-inputs.json','sdk-install-inventory.json',
 'controls/terminal_closure_controls.py','runtime/guest_g03.py','runtime/record_snapshot.py','runtime/run_browser_operator.py','runtime/run_combined_operator.py','runtime/run_python_operator.py','runtime/terminal_closure.py'}
def source_footprint_refusal(allow_outputs=False):
 expected_files={x for x in SOURCE_FILES if '/' not in x}
 envelope_files={'source-manifest.json','binding.json','SHA256SUMS'}
 allowed_dirs={'controls','runtime'} | ({'runs','browser-runs','combined-runs'} if allow_outputs else set())
 seen_files=set();seen_dirs=set()
 for entry in ROOT.iterdir():
  if entry.is_symlink():fail('source root contains symlink: '+entry.name)
  if entry.is_file():
   if entry.name not in expected_files|envelope_files:fail('unexpected source-root file: '+entry.name)
   seen_files.add(entry.name)
  elif entry.is_dir():
   if entry.name not in allowed_dirs:fail('unexpected source-root directory: '+entry.name)
   seen_dirs.add(entry.name)
  else:fail('unexpected source-root filesystem entry: '+entry.name)
 for dirname in ('runtime','controls'):
  directory=ROOT/dirname
  if not directory.is_dir():fail('missing required source directory: '+dirname)
  actual=set()
  for item in directory.iterdir():
   rel=dirname+'/'+item.name
   if item.is_symlink() or not item.is_file():fail('generated cache/output/nonregular source entry: '+rel)
   if rel not in SOURCE_FILES:fail('unexpected source payload/artifact: '+rel)
   if item.suffix in ('.pyc','.pyo') or '__pycache__' in item.parts:fail('generated Python bytecode artifact: '+rel)
   actual.add(rel)
  if actual!={x for x in SOURCE_FILES if x.startswith(dirname+'/')}:fail('exact source directory roster mismatch: '+dirname)
 if seen_files!=expected_files|envelope_files:fail('exact source-root payload plus closure-envelope roster mismatch')
 if not allow_outputs and seen_dirs!={'controls','runtime'}:fail('pre-import source directory roster mismatch')
 if allow_outputs and not {'controls','runtime'}<=seen_dirs:fail('required source directories disappeared')

def main():
 global dedupe_roots,owner_receipt_payload,replace_with_failure_receipt
 source_footprint_refusal(False)
 from terminal_closure import dedupe_roots as _dedupe_roots, owner_receipt_payload as _owner_receipt_payload, replace_with_failure_receipt as _replace_with_failure_receipt
 dedupe_roots=_dedupe_roots;owner_receipt_payload=_owner_receipt_payload;replace_with_failure_receipt=_replace_with_failure_receipt
 ap=argparse.ArgumentParser();ap.add_argument('--python-packet',type=pathlib.Path,required=True);ap.add_argument('--python-sha256',required=True);ap.add_argument('--browser-packet',type=pathlib.Path,required=True);ap.add_argument('--browser-sha256',required=True);ap.add_argument('--admission',type=pathlib.Path,required=True);ap.add_argument('--admission-sha256',required=True);ap.add_argument('--sdk-install',type=pathlib.Path,required=True);ap.add_argument('--sdk-archive',type=pathlib.Path,required=True);a=ap.parse_args()
 global OWNER_START,OWNER_DEADLINE,PHASE_DEADLINE
 signal.signal(signal.SIGTERM,owner_signal)
 signal.signal(signal.SIGINT,owner_signal)
 start=time.monotonic();deadline=start+TOTAL;OWNER_START=start;OWNER_DEADLINE=deadline;PHASE_DEADLINE=deadline-RESERVE
 watchdog=threading.Timer(TOTAL,lambda:os.kill(os.getpid(),signal.SIGTERM));watchdog.daemon=True;watchdog.start()
 rid=uuid.uuid4().hex;out=ROOT/'combined-runs'/rid;out.mkdir(parents=True);before_py={p.name for p in (ROOT/'runs').iterdir()} if (ROOT/'runs').exists() else set();before_br={p.name for p in (ROOT/'browser-runs').iterdir()} if (ROOT/'browser-runs').exists() else set();result={'profile':'umf.g03-sdk058-combined-owner/1','executionId':rid,'status':'FAIL_OR_UNKNOWN','limits':{'aggregateSeconds':TOTAL,'terminalReserveSeconds':RESERVE,'stopGraceSeconds':GRACE,'rawLogBytes':RAW,'evidenceBytes':EVIDENCE,'installedRecordSoftwareFileBytes':128*1024*1024,'installedRecordSoftwareTotalBytes':256*1024*1024,'installedRecordMetadataTextBytes':8*1024*1024},'stages':[]};failure=None
 try:
  for p in (a.python_packet,a.browser_packet,a.admission,a.sdk_install,a.sdk_archive):
   if not p.is_absolute() or p.resolve(strict=True)!=p:fail('noncanonical input path '+str(p))
  ah,_=regular_hash(a.admission,256*1024)
  if ah!=a.admission_sha256:fail('admission hash mismatch')
  adm=bounded_read(a.admission,256*1024)
  for key,value in {'installedRecordSoftwareFileBytes':128*1024*1024,'installedRecordSoftwareTotalBytes':256*1024*1024,'installedRecordMetadataTextBytes':8*1024*1024}.items():
   if adm.get(key)!=value:fail('root admission does not bind exact installed RECORD software-class limit '+key)
  pyh,_=regular_hash(a.python_packet,128*1024);brh,_=regular_hash(a.browser_packet,128*1024)
  if adm.get('profile')!='umf.g03-sdk058-root-admission/1' or adm.get('status')!='ROOT_ADMITTED' or adm.get('pythonPacketSha256')!=pyh or adm.get('browserPacketSha256')!=brh or pyh!=a.python_sha256 or brh!=a.browser_sha256:fail('root admission does not bind immutable packet pair')
  manifest=ROOT/'source-manifest.json'
  mh,mn=regular_hash(manifest,4*1024*1024)
  if adm.get('sourceManifestSha256')!=mh or adm.get('bindingSha256')!=regular_hash(ROOT/'binding.json',256*1024)[0] or adm.get('sha256SumsSha256')!=regular_hash(ROOT/'SHA256SUMS',256*1024)[0]:fail('root admission does not bind frozen source closure')
  manifest_obj=bounded_read(manifest,4*1024*1024)
  expected_source_paths=sorted(str(ROOT/x) for x in SOURCE_FILES)
  if sorted(row.get('path') for row in manifest_obj.get('files',[]))!=expected_source_paths:fail('source manifest does not contain the exact thirteen-file authored whitelist')
  pins={r['path']:r['sha256'] for r in manifest_obj.get('externalPins',[])}
  platform_observation_path='/private/tmp/g03-sdk058-parity004-root-admission-001/platform-observation.json'
  required_pins={'producerReceiptSha256':'/private/tmp/g03-sdk058-local-producer-actual-002/sdk-producer-receipt.json','producerClosureSha256':'/private/tmp/g03-sdk058-local-producer-actual-002/sdk-producer-closure.json','sourcePrepReceiptSha256':'/private/tmp/g03-sdk058-source-volume-prep-003/result.json','sourceSizeMetadataSha256':'/private/tmp/g03-sdk058-producer-source-size-metadata-001.json','captureHelperSha256':'/private/tmp/sdk-057-local3600-public-h-operator-proposal011/run_public_h_docker.py','bunAcquisitionReceiptSha256':'/private/tmp/g03-linux-arm-bun143-001/receipt.json','bunStartupReceiptSha256':'/private/tmp/g03-linux-arm-bun143-001/startup-receipt.json','platformObservationSha256':platform_observation_path,'parity004SourceReviewSha256':'/private/tmp/g03-sdk058-parity004-sol-source-review001.md','parity004OwnerFailureSha256':'/private/tmp/g03-sdk058-parity-004/combined-runs/d9e627d07707410eb5be3c59cf24f888/owner-result.json','dependencyPlanSha256':'/private/tmp/g03-sdk058-parity010-sol-dependency-plan001.md','dependencyInputReviewSha256':'/private/tmp/g03-sdk058-dependency-preflight009-sol-actual-review001.md','dependencyInventoryFileSha256':'/private/tmp/g03-sdk058-parity-009-preflight/out/dependency-view-inventory.json','dependencyMetadataReceiptSha256':'/private/tmp/g03-sdk058-parity-009-preflight/out/metadata-result.json','dependencyOwnerReceiptSha256':'/private/tmp/g03-sdk058-parity-009-preflight/out/preflight-owner-result.json','dependencyPreflightSourceSha256':'/private/tmp/g03-sdk058-parity-009-preflight/preflight.py','dependencyCensusSha256':'/private/tmp/g03-sdk058-parity-009-preflight/runtime-import-census.json','mountpointPreparationReceiptSha256':'/private/tmp/g03-sdk058-input-mount-prep-001/result.json','mountpointPreparationReviewSha256':'/private/tmp/g03-sdk058-input-mount-prep001-sol-actual-review001.md','mountConfigControlReceiptSha256':'/private/tmp/g03-sdk058-mount-config-control-001/result.json','mountConfigControlReviewSha256':'/private/tmp/g03-sdk058-mount-config-control001-sol-actual-review001.md','parity005OwnerFailureSha256':'/private/tmp/g03-sdk058-parity-005/combined-runs/dabcef739bac431c94eeecd93292e5fa/owner-result.json','parity011OwnerFailureSha256':'/private/tmp/g03-sdk058-parity-011/combined-runs/a2ab7d00146e4821aef003ea6193aa41/owner-result.json','bytecodePreimageCustodySha256':'/private/tmp/g03-sdk058-parity011-bytecode-preimage-custody-001/custody.json','parity012PackagingPlanSha256':'/private/tmp/g03-sdk058-parity012-sol-source-packaging-plan001.md','parity012SourceReviewSha256':'/private/tmp/g03-sdk058-parity012-sol-source-review001.md','parity013SourceManifestSha256':'/private/tmp/g03-sdk058-parity-013/source-manifest.json','parity013SourceReviewSha256':'/private/tmp/g03-sdk058-parity013-sol-source-review001.md','parity013OwnerFailureSha256':'/private/tmp/g03-sdk058-parity-013/combined-runs/94505446830a415a9956336e51bd7f3c/owner-result.json','recordSnapshotAuditSha256':'/private/tmp/g03-sdk058-record-snapshot014-source-data-audit001.md','parity014RecordPlanSha256':'/private/tmp/g03-sdk058-parity014-sol-record-plan001.md','parity014OwnerFailureSha256':'/private/tmp/g03-sdk058-parity-014/combined-runs/cde75f10f1004e09a2b12b4db90b27ac/owner-result.json','genericInputAuditSha256':'/private/tmp/g03-sdk058-parity015-generic-input-audit001.md','genericInputPlanSha256':'/private/tmp/g03-sdk058-parity015-sol-generic-input-plan001.md','selectedImageOSObservationSha256':'/private/tmp/g03-sdk058-linux-image-os-metadata-001/result.json','selectedImageOSReviewSha256':'/private/tmp/g03-sdk058-linux-image-os-metadata001-sol-review001.md','selectedImageRuntimeObservationSha256':'/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json','selectedImageRuntimeReviewSha256':'/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md','genericProbeLockSha256':'/private/tmp/g03-sdk058-parity015-input/derived-single-cell-lock.json','genericProbeProvenanceSha256':'/private/tmp/g03-sdk058-parity015-input/provenance.json',
   'qualificationToolWheelSha256':'/private/tmp/g03-packaging250-tool-input-001/packaging-25.0-py3-none-any.whl',
   'qualificationToolLockSha256':'/private/tmp/g03-packaging250-tool-input-001/requirements.lock',
   'qualificationToolStaticAuditSha256':'/private/tmp/g03-packaging250-tool-input-001/static-audit.json',
   'qualificationToolAcquisitionSha256':'/private/tmp/g03-packaging250-tool-input-001/acquisition.json',
   'qualificationToolAcquisitionSourceSha256':'/private/tmp/g03-packaging250-tool-input-001/acquire.py',
   'qualificationToolPypiMetadataSha256':'/private/tmp/g03-packaging250-tool-input-001/pypi-metadata.json',
   'qualificationToolInputReviewSha256':'/private/tmp/g03-packaging250-tool-input001-sol-review001.md',
   'qualificationToolControlReadmeSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/README.md',
   'qualificationToolControlBootstrapSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/bootstrap.py',
   'qualificationToolControlProbeSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/probe.py',
   'qualificationToolControlRunSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/run.py',
   'qualificationToolControlManifestSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/source-manifest.json',
   'qualificationToolControlBindingSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/binding.json',
   'qualificationToolControlSumsSha256':'/private/tmp/g03-sdk058-packaging-tool-control-source-004/SHA256SUMS',
   'qualificationToolControlSourceReviewSha256':'/private/tmp/g03-sdk058-packaging-tool-control004-sol-source-review001.md',
   'qualificationToolPlanSha256':'/private/tmp/g03-sdk058-parity017-sol-isolated-tool-plan002.md',
   'qualificationToolIntegrationPlanSha256':'/private/tmp/g03-sdk058-parity017-sol-accepted-tool-integration-plan003.md',
   'qualificationToolGlobalFailureSha256':'/private/tmp/g03-sdk058-global-packaging-metadata-003/result.json',
   'qualificationToolRuntimeObservationSha256':'/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json',
   'qualificationToolRuntimeReviewSha256':'/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md',
   'qualificationToolControlOwnerSha256':'/private/tmp/g03-sdk058-packaging-tool-control-actual-002/owner-result.json',
   'qualificationToolControlReportSha256':'/private/tmp/g03-sdk058-packaging-tool-control-actual-002/tool-result.json',
   'qualificationToolControlActualReviewSha256':'/private/tmp/g03-sdk058-packaging-tool-control-actual002-sol-review001.md'}
  for key,path in required_pins.items():
   if adm.get(key)!=pins.get(path):fail('root admission does not bind external pin '+key)
   pin_row=next((row for row in manifest_obj.get('externalPins',[]) if row.get('path')==path),None)
   if pin_row is None or regular_hash(pathlib.Path(path),pin_row['sizeBytes'])!=(pin_row['sha256'],pin_row['sizeBytes']):fail('required external input failed physical preflight: '+key)
  dependency_input=verify_dependency_input(adm);result['dependencyToolInputAdmission']=dependency_input
  platform_observation=bounded_read(pathlib.Path(platform_observation_path),64*1024)
  if (platform_observation.get('profile')!='umf.g03-sdk058-platform-observation/1' or
      platform_observation.get('daemon',{}).get('command')!=['docker','info','--format','{{.OSType}}/{{.Architecture}}'] or
      platform_observation.get('daemon',{}).get('exitCode')!=0 or platform_observation.get('daemon',{}).get('stdout')!='linux/aarch64\n' or
      platform_observation.get('selectedImage',{}).get('command')!=['docker','image','inspect','--format','{{.Os}}/{{.Architecture}}','sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'] or
      platform_observation.get('selectedImage',{}).get('exitCode')!=0 or platform_observation.get('selectedImage',{}).get('stdout')!='linux/amd64\n'):
   fail('root platform observation does not bind the admitted daemon and selected image separately')
  for row in manifest_obj.get('files',[]):
   f=pathlib.Path(row['path']); fh,fn=regular_hash(f,row['sizeBytes'])
   if fh!=row['sha256'] or fn!=row['sizeBytes']:fail('frozen source-manifest file changed: '+str(f))
  review=pathlib.Path(adm['sourceReviewPath'])
  if not review.is_absolute() or review.resolve(strict=True)!=review or regular_hash(review,2*1024*1024)[0]!=adm.get('sourceReviewSha256'):fail('external source review receipt mismatch')
  py=bounded_read(a.python_packet,128*1024);br=bounded_read(a.browser_packet,128*1024)
  if py.get('status')!='PENDING_SOL_SOURCE_REVIEW' or br.get('status')!='PENDING_SOL_SOURCE_REVIEW':fail('immutable packets differ from reviewed preimages')
  if py.get('producer')!=br.get('producer') or py.get('sourceFiles')!=br.get('sourceFiles') or adm.get('cohort')!=py.get('cohort') or adm.get('sourceVolume')!=py['producer']['volume']:fail('packet pair source/cohort/volume mismatch')
  sdk=br['sdk']
  if str(a.sdk_install)!=sdk.get('installHostPath') or str(a.sdk_archive)!=sdk.get('archiveHostPath'):fail('SDK custody host paths differ from frozen packet')
  if regular_hash(a.sdk_archive,64*1024*1024)!=(sdk['archiveSha256'],sdk['archiveSizeBytes']):fail('SDK archive does not match accepted producer')
  if adm.get('sdkManifestSha256')!=sdk.get('distributionManifestSha256') or adm.get('sdkCustodySha256')!=sdk.get('installCustodySha256'):fail('admission does not bind producer manifest/custody')
  if adm.get('sdkArchiveSha256')!=sdk['archiveSha256'] or adm.get('producerCommit')!=py['producer']['commit'] or adm.get('producerTree')!=py['producer']['tree'] or adm.get('cohort')!=py['cohort'] or adm.get('browserImage')!=br.get('browser',{}).get('image') or adm.get('bunSha256')!=br.get('browser',{}).get('bunSha256') or adm.get('chromiumSha256')!=br.get('browser',{}).get('chromiumSha256') or adm.get('playwrightReceiptSha256')!=br.get('browser',{}).get('playwrightReceiptSha256'):fail('admission producer/cohort/browser identity mismatch')
  custody=a.sdk_install/'g03-sdk-install-custody.json'
  if regular_hash(custody,4*1024*1024)[0]!=sdk['installCustodySha256']:fail('actual producer custody receipt mismatch')
  manifest=a.sdk_archive.parent/'manifest.json'
  if regular_hash(manifest,4*1024*1024)!=(sdk['distributionManifestSha256'],sdk['distributionManifestSizeBytes']):fail('actual producer manifest mismatch')
  before,n,bh=tree(a.sdk_install)
  if adm.get('sdkInstallInventorySha256')!=bh or adm.get('sdkInstallBytes')!=n or adm.get('sdkInstallFiles')!=len(before) or len(before)!=1800:fail('full retained SDK install inventory differs from root admission')
  env=dict(os.environ);env.update({'G03_OWNER_START':str(start),'G03_OWNER_DEADLINE':str(deadline)})
  raw_used=0
  pylog=out/'python-operator.stdout.log'; pya=min(16*1024,RAW-raw_used)
  pyargv=[sys.executable,'-B',str(R/'run_python_operator.py'),'--inputs',str(a.python_packet),'--inputs-sha256',pyh,'--admission',str(a.admission),'--admission-sha256',ah]
  pycap=run(pyargv,min(deadline-660,start+1140),{**env,'G03_LOG_CAP':str(max(1,(RAW-pya)//4)),'G03_OUTER_LOG_CAP':str(max(1,pya//2))},pylog,pya);result['stages'].append({'name':'python-final18','capture':pycap})
  last=json.loads(pylog.read_bytes()) if pylog.exists() and pylog.stat().st_size else {}
  python_run=pathlib.Path(last['run']) if last.get('run') else None
  if python_run is not None:result['pythonRun']=str(python_run)
  if pycap['exitCode']!=0 or pycap['truncated']:fail('Python owner route failed/capture truncated')
  if python_run is None:fail('Python operator emitted no run path')
  pyouter=bounded_read(python_run/'operator-result.json',8*1024*1024)
  if pyouter.get('status')!='PASS_LOCAL_FINAL18_G03_PYTHON_PARITY' or not pyouter.get('cleanup',{}).get('verified') or not pyouter.get('outerClosure',{}).get('verified'):fail('Python OUTER status/cleanup/physical closure is not PASS')
  expected_guest={'abi':'linux-x86_64','machine':'x86_64','pointerBits':64,'system':'Linux','version':'3.11.17'}
  expected_platform={'dockerDaemon':'linux/aarch64','selectedImage':'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556','selectedImagePlatform':'linux/amd64','runPlatform':'linux/amd64','pythonGuest':expected_guest}
  if pyouter.get('image')!='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556' or pyouter.get('platform')!='linux/amd64' or pyouter.get('platformObservation')!=expected_platform:fail('Python route daemon/image/guest process observations do not close the selected platform profile')
  guest_result=python_run/'guest'/'guest-result.json';gr=bounded_read(guest_result,8*1024*1024)
  raw_used+=int(pyouter.get('logBytes',RAW+1))+pycap['rawBytes']
  if raw_used>RAW:fail('Python aggregate raw logs exceed shared 1 MiB budget')
  if gr.get('status')!='PASS_LOCAL_FINAL18_G03_PYTHON_PARITY':fail('Python guest result is not PASS')
  qualification_tool=gr.get('qualificationTool',{})
  if (qualification_tool.get('status')!='PASS_ACCEPTED_PACKAGING_TOOL_CONTROL' or
      qualification_tool.get('reportSha256')!=adm.get('qualificationToolControlReportSha256') or
      qualification_tool.get('packagingInventorySha256')!='5f7b4d4b87ed51ef2006d6ae801851c275dae4354385457bac21f139be70a71f' or
      qualification_tool.get('packagingFileCount')!=25 or qualification_tool.get('packagingBytes')!=238549 or
      qualification_tool.get('toolDistributionVersions')!={'packaging':'25.0','pip':'24.0','setuptools':'79.0.1'} or
      qualification_tool.get('selectedDistributionCount')!=18 or qualification_tool.get('checkedRequirementCount')!=72 or
      qualification_tool.get('separateFromProductVenv') is not True or qualification_tool.get('productDependenciesUnchanged') is not True or
      pyouter.get('qualificationTool')!=qualification_tool):
   fail('Python isolated packaging-tool report/custody differs from accepted metadata control')
  result['qualificationTool']=qualification_tool
  tool_witness=gr.get('dependencyToolInput',{})
  if tool_witness.get('status')!='PASS_PRE_POST_FULL_ROSTER_EQUAL' or tool_witness.get('pre')!=tool_witness.get('post') or tool_witness.get('pre',{}).get('inventorySha256')!=dependency_input['logicalInventorySha256']:fail('Python guest full dependency-tool roster did not match admitted pre/post custody walks')
  dependency_input['pythonGuestCustody']=tool_witness;result['dependencyToolInputAdmission']=dependency_input
  remaining=deadline-RESERVE-time.monotonic()
  if remaining<CHILD_BROWSER_MIN:fail('shared remaining time insufficient to start browser route')
  browserlog=out/'browser-operator.stdout.log';allow=max(1,RAW-raw_used)
  brargv=[sys.executable,'-B',str(R/'run_browser_operator.py'),'--sdk-inputs',str(a.browser_packet),'--sdk-inputs-sha256',brh,'--admission',str(a.admission),'--admission-sha256',ah,'--python-result',str(guest_result),'--sdk-install-host',str(a.sdk_install),'--sdk-archive-host',str(a.sdk_archive)]
  brcap=run(brargv,deadline-RESERVE,{**env,'G03_OWNER_DEADLINE':str(deadline-120),'G03_OUTER_LOG_CAP':str(max(1,allow//2))},browserlog,max(1,allow//2));result['stages'].append({'name':'installed-sdk-chromium','capture':brcap})
  lastb=json.loads(browserlog.read_bytes()) if browserlog.exists() and browserlog.stat().st_size else {}
  browser_run=pathlib.Path(lastb['run']) if lastb.get('run') else None
  if browser_run is not None:result['browserRun']=str(browser_run)
  if brcap['exitCode']!=0 or brcap['truncated']:fail('browser owner route failed/capture truncated')
  if browser_run is None:fail('browser operator emitted no run path')
  brouter=bounded_read(browser_run/'operator-result.json',8*1024*1024)
  if brouter.get('status')!='PASS_LOCAL_G03_INSTALLED_SDK_CHROMIUM_PARITY' or not brouter.get('cleanup',{}).get('verified') or not brouter.get('outerClosure',{}).get('verified'):fail('browser OUTER status/cleanup/physical closure is not PASS')
  raw_used+=sum(brouter.get('outerCapture',{}).get('retainedBytes',[]))+brcap['rawBytes']
  if raw_used>RAW:fail('shared aggregate raw logs exceed 1 MiB')
  # Reclose every admitted external input after both lanes, not only at preflight.
  for key,path in required_pins.items():
   if adm.get(key)!=pins.get(path):fail('root admission binding changed before final external-input closure: '+key)
   pin_row=next((row for row in manifest_obj.get('externalPins',[]) if row.get('path')==path),None)
   if pin_row is None or regular_hash(pathlib.Path(path),pin_row['sizeBytes'])!=(pin_row['sha256'],pin_row['sizeBytes']):fail('external input changed during lanes: '+key)
  after,n2,ah2=tree(a.sdk_install)
  if before!=after or n2!=n or ah2!=bh:fail('selected SDK installed tree changed during readonly consumer route')
  if regular_hash(a.admission,256*1024)[0]!=ah or regular_hash(a.python_packet,128*1024)[0]!=pyh or regular_hash(a.browser_packet,128*1024)[0]!=brh or regular_hash(review,2*1024*1024)[0]!=adm['sourceReviewSha256'] or regular_hash(pathlib.Path(platform_observation_path),64*1024)[0]!=adm['platformObservationSha256'] or regular_hash(pathlib.Path(required_pins['parity004SourceReviewSha256']),2*1024*1024)[0]!=adm['parity004SourceReviewSha256'] or regular_hash(pathlib.Path(required_pins['parity004OwnerFailureSha256']),8*1024*1024)[0]!=adm['parity004OwnerFailureSha256'] or regular_hash(pathlib.Path(required_pins['parity011OwnerFailureSha256']),8*1024*1024)[0]!=adm['parity011OwnerFailureSha256'] or regular_hash(pathlib.Path(required_pins['bytecodePreimageCustodySha256']),256*1024)[0]!=adm['bytecodePreimageCustodySha256'] or regular_hash(pathlib.Path(required_pins['parity012PackagingPlanSha256']),256*1024)[0]!=adm['parity012PackagingPlanSha256'] or regular_hash(pathlib.Path(required_pins['parity013SourceManifestSha256']),2*1024*1024)[0]!=adm['parity013SourceManifestSha256'] or regular_hash(pathlib.Path(required_pins['parity013SourceReviewSha256']),2*1024*1024)[0]!=adm['parity013SourceReviewSha256'] or regular_hash(pathlib.Path(required_pins['parity013OwnerFailureSha256']),8*1024*1024)[0]!=adm['parity013OwnerFailureSha256'] or regular_hash(pathlib.Path(required_pins['recordSnapshotAuditSha256']),128*1024)[0]!=adm['recordSnapshotAuditSha256'] or regular_hash(pathlib.Path(required_pins['parity014RecordPlanSha256']),256*1024)[0]!=adm['parity014RecordPlanSha256'] or regular_hash(DEPENDENCY_OUTPUT/'dependency-view-inventory.json',8*1024*1024)[0]!=adm['dependencyInventoryFileSha256'] or regular_hash(DEPENDENCY_OUTPUT/'metadata-result.json',2*1024*1024)[0]!=adm['dependencyMetadataReceiptSha256'] or regular_hash(DEPENDENCY_OUTPUT/'preflight-owner-result.json',256*1024)[0]!=adm['dependencyOwnerReceiptSha256'] or regular_hash(DEPENDENCY_PREFLIGHT,1024*1024)[0]!=adm['dependencyPreflightSourceSha256'] or regular_hash(DEPENDENCY_CENSUS,2*1024*1024)[0]!=adm['dependencyCensusSha256'] or regular_hash(DEPENDENCY_REVIEW,2*1024*1024)[0]!=adm['dependencyInputReviewSha256'] or regular_hash(ROOT/'source-manifest.json',4*1024*1024)[0]!=mh or regular_hash(ROOT/'binding.json',256*1024)[0]!=adm['bindingSha256'] or regular_hash(ROOT/'SHA256SUMS',256*1024)[0]!=adm['sha256SumsSha256']:fail('admission/review/platform observation/source packets changed during lane')
  source_footprint_refusal(True)
  for row in manifest_obj.get('files',[]):
   f=pathlib.Path(row['path'])
   if regular_hash(f,row['sizeBytes'])!=(row['sha256'],row['sizeBytes']):fail('frozen source changed during lane: '+str(f))
  if regular_hash(a.sdk_archive,64*1024*1024)!=(sdk['archiveSha256'],sdk['archiveSizeBytes']) or regular_hash(manifest,4*1024*1024)!=(sdk['distributionManifestSha256'],sdk['distributionManifestSizeBytes']) or regular_hash(custody,4*1024*1024)[0]!=sdk['installCustodySha256']:fail('SDK archive/manifest/custody changed during lane')
  result.update(status='PASS_LOCAL_FINAL18_G03_PYTHON_AND_INSTALLED_SDK_CHROMIUM',pythonRun=str(python_run),browserRun=str(browser_run),pythonGuestResultSha256=regular_hash(guest_result,8*1024*1024)[0],pythonOuterResultSha256=regular_hash(python_run/'operator-result.json',8*1024*1024)[0],browserOuterResultSha256=regular_hash(browser_run/'operator-result.json',8*1024*1024)[0],dockerPlatformObservation=expected_platform,sdkArchiveSha256=sdk['archiveSha256'],sdkInstallInventorySha256=bh,sdkInstallBytes=n,sdkInstallFiles=len(before),sdkInstallUnchanged=True,rawBytes=raw_used)
 except BaseException as e:failure=type(e).__name__+': '+str(e)[:300]
 result['failure']=failure;result['elapsedSecondsBeforeRecovery']=round(time.monotonic()-start,3)
 # Recovery is bounded to the first40 seconds of the reserved terminal minute;
 # keep the fixed final20 seconds for receipt closure/readback.
 PHASE_DEADLINE=deadline-FINAL_SLICE
 result['ownerCleanup']=recover_owned(before_py,before_br)
 if not result['ownerCleanup'].get('verified'):
  result['status']='FAIL_OR_UNKNOWN';result['failure']=(result.get('failure') or '')+'; owner cleanup/absence not fully verified'
 if time.monotonic()>deadline-RESERVE:
  result['status']='FAIL_OR_UNKNOWN';result['failure']=(result.get('failure') or '')+'; route/recovery consumed the 60-second terminal reserve'
 PHASE_DEADLINE=deadline
 receipt=out/'owner-result.json';receipt_hash=None
 try:
  guard(FINAL_SLICE)
  PHASE_DEADLINE=min(deadline,time.monotonic()+FINAL_SLICE)
  guard()
  result['elapsedSecondsBeforeReceipt']=round(time.monotonic()-start,3)
  files,size=final_inventory(out,result,before_py,before_br)
  guard()
  check=owner_receipt_payload(result,files,size,receipt,EVIDENCE,guard)
  guard()
  atomic_receipt(receipt,check)
  guard()
  receipt_hash,receipt_size=regular_hash(receipt,EVIDENCE)
  if receipt_size!=len(check) or receipt_size!=result['inclusiveFiles'][-1]['sizeBytes']:fail('owner receipt physical size/readback mismatch')
  reread=receipt.read_bytes()
  if hashlib.sha256(reread).hexdigest()!=receipt_hash or reread!=check:fail('owner receipt physical readback mismatch')
  guard()
  watchdog.cancel()
 except BaseException as e:
  watchdog.cancel()
  PHASE_DEADLINE=deadline
  result={'profile':'umf.g03-sdk058-combined-owner/1','executionId':rid,'status':'FAIL_OR_UNKNOWN','failure':'inclusive closure failed: '+type(e).__name__+': '+str(e)[:180],'elapsedSeconds':round(time.monotonic()-start,3),'evidencePublication':'refused'}
  # Never leave an earlier PASS receipt durable after a later closure failure.
  try:
   signal.signal(signal.SIGTERM,signal.SIG_IGN)
   bad=(json.dumps(result,sort_keys=True)+'\n').encode()
   replace_with_failure_receipt(receipt,bad,atomic_receipt)
   receipt_hash,_=regular_hash(receipt,64*1024)
  except BaseException:
   result['failure']+='; compact failure receipt write/readback failed'
 result['elapsedSecondsAfterClosure']=round(time.monotonic()-start,3)
 if time.monotonic()>=deadline:
  result['status']='FAIL_OR_UNKNOWN';result['failure']=(result.get('failure') or '')+'; original 1800-second deadline exceeded'
  try:
   signal.signal(signal.SIGTERM,signal.SIG_IGN)
   bad=(json.dumps({'profile':'umf.g03-sdk058-combined-owner/1','executionId':rid,'status':'FAIL_OR_UNKNOWN','failure':'original owner deadline exceeded during final closure','evidencePublication':'refused'})+'\n').encode()
   replace_with_failure_receipt(receipt,bad,atomic_receipt)
   receipt_hash=regular_hash(receipt,64*1024)[0]
  except BaseException:pass
 print(json.dumps({'run':str(out),'status':result.get('status'),'failure':result.get('failure'),'ownerReceiptSha256':receipt_hash},sort_keys=True))
 return 0 if result.get('status','').startswith('PASS') and time.monotonic()<=deadline else 1

CHILD_BROWSER_MIN=600
if __name__=='__main__':raise SystemExit(main())
