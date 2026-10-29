#!/usr/bin/env python3
"""Bounded final18 install plus paired G03 and generic Python parity probes."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, math, os, pathlib, selectors, signal, stat, subprocess, sys, time

P=pathlib.Path('/input-packet.json'); OUT=pathlib.Path('/out'); SRC=pathlib.Path('/volume-producer')
COHORT=pathlib.Path('/cohort'); DEP_ROOT=pathlib.Path('/volume-producer/node_modules'); DEP_ORIGIN=pathlib.Path('/dependency-origin'); DEP_INPUT=pathlib.Path('/dependency-input'); IMAGE='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
GENERIC_INPUT=pathlib.Path('/tmp/g03-generic-input/derived-single-cell-lock.json'); GENERIC_PROVENANCE=pathlib.Path('/tmp/g03-generic-input/provenance.json')
ACCEPTED_TOOL_REPORT=pathlib.Path('/accepted-tool-result.json')
TOOL_REPORT=OUT/'tool-result.json'
TOOL_PYTHON=pathlib.Path('/tmp/g03-packaging250-qualification-tool/bin/python')
TOOL_WHEEL_SHA256='29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484'
TOOL_INVENTORY_SHA256='5f7b4d4b87ed51ef2006d6ae801851c275dae4354385457bac21f139be70a71f'
TOOL_ACCEPTED_REPORT_SHA256='a92bec19496ed09d4a0a4fa5567e0915392fbbd6a2bf1f3f8687776160d412f3'
sys.dont_write_bytecode=True
os.environ['PYTHONDONTWRITEBYTECODE']='1'
PYTHON=pathlib.Path('/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11')
TOTAL,RESERVE,CHILD,STOP=1200,60,180,10; LOG_CAP=int(os.environ.get('G03_LOG_CAP',1024*1024)); EVIDENCE_CAP=16*1024*1024; LOG_REMAINING=LOG_CAP
EXPECTED={
 'selectedLockSha256':'cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274',
 'indexSha256':'78026c05d3824613f0e2a3bf30cf24bd32af24de1d560f0b7fa555a1e75f8d60',
 'mirrorManifestSha256':'809a418b9f6f97e403e3fbcc7066d23657347d1323efb6baf2d4d3bb3f17bd36',
 'requirementsSha256':'4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51',
 'custodySha256':'95e9493f06adefb323193f9d8fbe5577ebfa335140a9841f549d2caf098df8ed'}
DEP_EXPECTED={'inventoryFileSha256':'6139a704c42bd208139fe480da430f10b9076f386c7280fc29b6fa1c52633b34','inventorySha256':'5dee664cf9d3e2d6e6325666ab75f26d290b05a6be09423b0a1cd04f6fc5d141','metadataReceiptSha256':'d2f546ec5da6bbb8a8994daaa13b8406d1dc0bdf36fef4ef7f2c017fbcba2fdf','ownerReceiptSha256':'8e48925d4bf4d33436e8bf548401e78c13e255a0b76c82b092bca5b0174a2f0e','censusSha256':'c4e3e79e5a0a51fb9b21261f458ede1a14042042aae1c8c2faf29c15f1d7eaae','preflightSourceSha256':'764c86f2f8a942bcff2445a29a13836a3edd17468da446ea40ba91285964f7a9','reviewSha256':'f57c269f677a110317b6a020e37999795d99bdf6a989175242fe07614125456b','originPackageSha256':'c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b','sourcePackageSha256':'323d619288cd35e7e86c932c0d26bfbfb2f8b4a5e5cc3f39bcaa415dd3c3aeaa','lockSha256':'5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4','regularBytes':215399057,'regularFiles':19501,'directories':1943,'internalLinks':17,'metadataBytes':3697819,'inventoryFileBytes':4740104,'metadataReceiptBytes':5349,'ownerReceiptBytes':3976}
DEP_TOOL=pathlib.Path('/dependency-preflight.py')
DEP_CENSUS=pathlib.Path('/dependency-census.json')
DEP_INVENTORY=pathlib.Path('/dependency-input/dependency-view-inventory.json')
DEP_METADATA=pathlib.Path('/dependency-input/metadata-result.json')
DEP_OWNER=pathlib.Path('/dependency-input/preflight-owner-result.json')
DEP_REVIEW=pathlib.Path('/dependency-review.md')


def hashfile(p,cap):
 st=p.lstat()
 if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>cap: raise RuntimeError('unsafe/oversized file: '+str(p))
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  for b in iter(lambda:f.read(65536),b''):
   n+=len(b)
   if n>cap: raise RuntimeError('file grew past cap')
   h.update(b)
 st2=p.lstat()
 if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns) or n!=st.st_size: raise RuntimeError('file changed while hashing')
 return h.hexdigest(),n

def inventory(root):
 rows=[]; total=0
 for base,dirs,files in os.walk(root,followlinks=False):
  for d in dirs:
   if (pathlib.Path(base)/d).is_symlink(): raise RuntimeError('symlink in output')
  for name in files:
   p=pathlib.Path(base)/name;h,n=hashfile(p,EVIDENCE_CAP);total+=n
   if total>EVIDENCE_CAP: raise RuntimeError('evidence cap exceeded')
   rows.append({'path':p.relative_to(root).as_posix(),'sizeBytes':n,'sha256':h})
 return sorted(rows,key=lambda r:r['path']),total



def dependency_snapshot(deadline):
 def guard_dep():
  if time.monotonic()>=deadline:raise TimeoutError('dependency-view custody walk reached shared guest deadline')
 guard_dep()
 tool_spec=importlib.util.spec_from_file_location('g03_dependency_preflight',DEP_TOOL)
 if tool_spec is None or tool_spec.loader is None:raise RuntimeError('dependency preflight helper cannot be loaded')
 helper=importlib.util.module_from_spec(tool_spec);tool_spec.loader.exec_module(helper)
 input_files=[(DEP_TOOL,DEP_EXPECTED['preflightSourceSha256'],1024*1024),(DEP_CENSUS,DEP_EXPECTED['censusSha256'],2*1024*1024),(DEP_INVENTORY,DEP_EXPECTED['inventoryFileSha256'],8*1024*1024),(DEP_METADATA,DEP_EXPECTED['metadataReceiptSha256'],2*1024*1024),(DEP_OWNER,DEP_EXPECTED['ownerReceiptSha256'],256*1024),(DEP_REVIEW,DEP_EXPECTED['reviewSha256'],2*1024*1024)]
 raw_inputs={}
 for path,want,cap in input_files:
  guard_dep();digest,size=hashfile(path,cap)
  if digest!=want:raise RuntimeError('admitted dependency custody input hash mismatch: '+path.name)
  size_key={'dependency-view-inventory.json':'inventoryFileBytes','metadata-result.json':'metadataReceiptBytes','preflight-owner-result.json':'ownerReceiptBytes'}.get(path.name)
  if size_key and size!=DEP_EXPECTED[size_key]:raise RuntimeError('admitted dependency custody input size mismatch: '+path.name)
  raw_inputs[path.name]=path.read_bytes()
  if len(raw_inputs[path.name])!=size or hashlib.sha256(raw_inputs[path.name]).hexdigest()!=want:raise RuntimeError('dependency custody input changed during read: '+path.name)
 admitted=json.loads(raw_inputs[DEP_INVENTORY.name]);metadata=json.loads(raw_inputs[DEP_METADATA.name]);owner=json.loads(raw_inputs[DEP_OWNER.name]);census=json.loads(raw_inputs[DEP_CENSUS.name])
 if owner.get('status')!='METADATA_PREFLIGHT_PASS' or owner.get('containerAbsent') is not True or owner.get('failure') is not None:raise RuntimeError('admitted dependency metadata owner receipt is not a closed PASS')
 if metadata.get('profile')!='umf.g03-sdk058-dependency-view-preflight/1' or metadata.get('status')!='METADATA_PREFLIGHT_PASS':raise RuntimeError('admitted dependency metadata receipt profile/status mismatch')
 if admitted.get('profile')!='umf.g03-sdk058-dependency-view-inventory/1' or admitted.get('root')!='/volume-producer/node_modules' or admitted.get('inventorySha256')!=DEP_EXPECTED['inventorySha256']:raise RuntimeError('admitted full dependency inventory identity mismatch')
 dview=metadata.get('dependencyView',{});origin_info=metadata.get('dependencyOrigin',{});source_info=metadata.get('source',{})
 if (dview.get('inventorySha256'),dview.get('regularBytes'),dview.get('regularFileCount'),dview.get('directoryCount'),dview.get('internalSymlinkCount'),dview.get('metadataBytes'))!=(DEP_EXPECTED['inventorySha256'],DEP_EXPECTED['regularBytes'],DEP_EXPECTED['regularFiles'],DEP_EXPECTED['directories'],DEP_EXPECTED['internalLinks'],DEP_EXPECTED['metadataBytes']):raise RuntimeError('metadata receipt inventory counts/hash differ from reviewed actual input')
 if (origin_info.get('packageSha256'),origin_info.get('packageVersion'),origin_info.get('lockSha256'))!=(DEP_EXPECTED['originPackageSha256'],'0.5.7',DEP_EXPECTED['lockSha256']):raise RuntimeError('actual dependency-volume package/lock identity differs from reviewed input')
 if (source_info.get('packageSha256'),source_info.get('packageVersion'),source_info.get('lockSha256'),source_info.get('commit'),source_info.get('tree'))!=(DEP_EXPECTED['sourcePackageSha256'],'0.5.8',DEP_EXPECTED['lockSha256'],'855f6c48649496fc60b3303798790d0ddb55d38f','53f2bfffbc0c5780e79d76d8fd3d202239d088b2'):raise RuntimeError('exact source P package/lock identity differs from reviewed input')
 if census.get('profile')!='umf.g03-sdk058-static-runtime-import-census/1' or census.get('roots')!=['scripts/g03-migration-corpus.ts','scripts/codegen-corpus.ts'] or len(census.get('sourceFiles',[]))!=97 or census.get('packageNames')!=['ajv','yaml']:raise RuntimeError('frozen runtime import census shape mismatch')
 src_pkg_raw=(SRC/'package.json').read_bytes();src_lock_raw=(SRC/'bun.lock').read_bytes();origin_pkg_raw=(DEP_ORIGIN/'package.json').read_bytes();origin_lock_raw=(DEP_ORIGIN/'bun.lock').read_bytes()
 if (hashlib.sha256(src_pkg_raw).hexdigest(),hashlib.sha256(src_lock_raw).hexdigest(),hashlib.sha256(origin_pkg_raw).hexdigest(),hashlib.sha256(origin_lock_raw).hexdigest())!=(DEP_EXPECTED['sourcePackageSha256'],DEP_EXPECTED['lockSha256'],DEP_EXPECTED['originPackageSha256'],DEP_EXPECTED['lockSha256']):raise RuntimeError('live P or dependency-volume package/lock hash changed')
 src_pkg=json.loads(src_pkg_raw);origin_pkg=json.loads(origin_pkg_raw);left=dict(src_pkg);right=dict(origin_pkg);src_ver=left.pop('version',None);origin_ver=right.pop('version',None)
 if left!=right or (src_ver,origin_ver)!=('0.5.8','0.5.7'):raise RuntimeError('live P and dependency-origin package differ outside admitted version field')
 parsed_lock=helper.parse_bun_lock(src_lock_raw)
 selected_bare,selected=helper.selected_package_manifests(DEP_ROOT,parsed_lock,census)
 if selected_bare!=['ajv','yaml'] or selected!=metadata.get('runtimeImportClosure',{}).get('packageClosure'):raise RuntimeError('live selected runtime manifests/lock descriptors differ from reviewed metadata receipt')
 source_root=SRC.resolve(strict=True)
 for source_row in census['sourceFiles']:
  guard_dep();rel=pathlib.PurePosixPath(source_row.get('path',''))
  if rel.is_absolute() or not rel.parts or any(x in ('','.','..') for x in rel.parts) or '\\' in source_row.get('path',''):raise RuntimeError('unsafe frozen census source path')
  path=SRC/source_row['path'];resolved=path.resolve(strict=True)
  if not helper.inside(source_root,resolved):raise RuntimeError('census source resolves outside P source volume')
  h,n=hashfile(resolved,8*1024*1024)
  if h!=source_row.get('sha256') or n!=source_row.get('sizeBytes'):raise RuntimeError('live source file differs from census: '+source_row['path'])
 rows=[];regular_bytes=0;regular_files=0;directory_count=0;link_count=0;root=DEP_ROOT.resolve(strict=True)
 for base,dirs,files in os.walk(root,topdown=True,followlinks=False):
  guard_dep();bp=pathlib.Path(base)
  for name in list(dirs):
   guard_dep();path=bp/name;relative=path.relative_to(root).as_posix();st=path.lstat()
   if stat.S_ISLNK(st.st_mode):
    target=os.readlink(path);resolved=helper.safe_resolve(root,path)
    rows.append({'path':relative,'type':'symlink','mode':stat.S_IMODE(st.st_mode),'target':target,'resolvedPath':resolved.relative_to(root).as_posix()});link_count+=1;dirs.remove(name)
   elif stat.S_ISDIR(st.st_mode):rows.append({'path':relative,'type':'directory','mode':stat.S_IMODE(st.st_mode)});directory_count+=1
   else:raise RuntimeError('non-directory dependency tool entry: '+relative)
  for name in files:
   guard_dep();path=bp/name;relative=path.relative_to(root).as_posix();st=path.lstat()
   if stat.S_ISLNK(st.st_mode):
    target=os.readlink(path);resolved=helper.safe_resolve(root,path)
    rows.append({'path':relative,'type':'symlink','mode':stat.S_IMODE(st.st_mode),'target':target,'resolvedPath':resolved.relative_to(root).as_posix()});link_count+=1
   elif stat.S_ISREG(st.st_mode):
    h,n,mode=helper.hash_regular(path,64*1024*1024);regular_bytes+=n;regular_files+=1
    if regular_bytes>256*1024*1024:raise RuntimeError('dependency tool view exceeds admitted byte cap')
    rows.append({'path':relative,'type':'regular','mode':mode,'sizeBytes':n,'sha256':h})
   else:raise RuntimeError('nonregular dependency tool entry: '+relative)
  if len(rows)>250000:raise RuntimeError('dependency inventory metadata entry cap exceeded')
 guard_dep();rows.sort(key=lambda row:row['path']);compact=helper.canonical_json(rows);logical=hashlib.sha256(compact).hexdigest()
 summary={'inventorySha256':logical,'regularBytes':regular_bytes,'regularFileCount':regular_files,'directoryCount':directory_count,'internalSymlinkCount':link_count,'metadataBytes':len(compact),'sourcePackageSha256':hashlib.sha256(src_pkg_raw).hexdigest(),'sourceLockSha256':hashlib.sha256(src_lock_raw).hexdigest(),'sourceVersion':src_ver,'originPackageSha256':hashlib.sha256(origin_pkg_raw).hexdigest(),'originLockSha256':hashlib.sha256(origin_lock_raw).hexdigest(),'originVersion':origin_ver,'runtimeImportCensusSha256':hashlib.sha256(raw_inputs[DEP_CENSUS.name]).hexdigest(),'packageClosureSha256':hashlib.sha256(helper.canonical_json(selected)).hexdigest()}
 expected=(DEP_EXPECTED['inventorySha256'],DEP_EXPECTED['regularBytes'],DEP_EXPECTED['regularFiles'],DEP_EXPECTED['directories'],DEP_EXPECTED['internalLinks'],DEP_EXPECTED['metadataBytes'])
 observed=(logical,regular_bytes,regular_files,directory_count,link_count,len(compact))
 if observed!=expected or rows!=admitted.get('rows'):raise RuntimeError('full live dependency roster differs from immutable reviewed inventory')
 guard_dep()
 return summary

def verify_generic_input(packet, marker_environment, guest_identity):
 lock_hash,lock_size=hashfile(GENERIC_INPUT,256*1024)
 provenance_hash,provenance_size=hashfile(GENERIC_PROVENANCE,256*1024)
 if lock_hash!=os.environ.get('G03_DERIVED_LOCK_SHA256') or provenance_hash!=os.environ.get('G03_DERIVED_PROVENANCE_SHA256'):
  raise RuntimeError('derived generic-probe lock/provenance hash differs from admitted input')
 lock=json.loads(GENERIC_INPUT.read_bytes()); provenance=json.loads(GENERIC_PROVENANCE.read_bytes())
 source=COHORT/'cells/linux-x86_64-py311/cohort.lock.json'
 source_hash,source_size=hashfile(source,8*1024*1024)
 original=json.loads(source.read_bytes())
 if source_hash!=EXPECTED['selectedLockSha256'] or provenance.get('source',{}).get('selectedLockSha256')!=source_hash:
  raise RuntimeError('derived input no longer binds exact immutable held cohort lock')
 if (lock.get('profile'),lock.get('status'))!=('umf.embedder-wheel-lock/1','locked'):
  raise RuntimeError('derived generic input has the wrong frozen probe schema')
 scope=lock.get('inputProjection',{})
 if (scope.get('profile')!='umf.g03-derived-frozen-single-cell-input/1'
     or scope.get('scope')!='hash-fixed input for unchanged offline mirror probe only; not runtime qualification or publication of the held final18 cohort'
     or scope.get('sourceProfile')!=original.get('profile')
     or scope.get('sourceStatus')!=original.get('status')
     or scope.get('sourceLockSha256')!=source_hash):
  raise RuntimeError('derived generic input does not preserve held-source status/provenance')
 if (provenance.get('status')!='DERIVED_INPUT_SOURCE_ONLY_FROZEN'
     or provenance.get('projection',{}).get('sha256')!=lock_hash
     or provenance.get('projection',{}).get('path')!='/private/tmp/g03-sdk058-parity015-input/derived-single-cell-lock.json'
     or provenance.get('source',{}).get('selectedLockSha256')!=source_hash
     or provenance.get('projection',{}).get('sourceProfile')!=original.get('profile')
     or provenance.get('projection',{}).get('sourceStatus')!=original.get('status')
     or provenance.get('projection',{}).get('derivedProfile')!=lock.get('profile')
     or provenance.get('projection',{}).get('derivedStatus')!=lock.get('status')):
  raise RuntimeError('derived generic provenance does not close its lock/source identity')
 exact_fields=('cohort','coreSemanticVersion','dependencyResolution','derivedFrom','derivedFromHeldCohort','optionalProfiles','packageRoots','packages','templateSha256','wheels')
 if any(lock.get(k)!=original.get(k) for k in exact_fields):
  raise RuntimeError('derived generic projection changed held package, wheel, closure, or custody metadata')
 if (lock.get('intendedCells')!=[{'os':'ubuntu-24.04','architecture':'x86_64','python':'3.11','libc':'glibc >= 2.34'}]
     or lock.get('dependencyResolution',{}).get('markerEnvironment')!=marker_environment
     or marker_environment!=original.get('dependencyResolution',{}).get('markerEnvironment')):
  raise RuntimeError('derived generic selector cell or actual marker environment drifted')
 original_resolution_sha=hashlib.sha256(json.dumps(original.get('dependencyResolution'),sort_keys=True,separators=(',',':')).encode()).hexdigest()
 if (provenance.get('projection',{}).get('originalDependencyResolutionSha256')!=original_resolution_sha
     or provenance.get('projection',{}).get('originalIntendedCells')!=original.get('intendedCells')
     or provenance.get('observations',{}).get('runtimeObservationSha256')!=scope.get('runtimeObservationSha256')
     or provenance.get('observations',{}).get('osObservationSha256')!=scope.get('osObservationSha256')):
  raise RuntimeError('derived generic provenance does not preserve original closure/cell or actual runtime observations')
 if guest_identity!={'abi':'linux-x86_64','machine':'x86_64','pointerBits':64,'system':'Linux','version':'3.11.17'}:
  raise RuntimeError('actual Python runtime identity differs from derived cell observation')
 if provenance.get('projection',{}).get('packageCount')!=18 or provenance.get('projection',{}).get('wheelCount')!=18:
  raise RuntimeError('derived generic input does not bind exact18 package/wheel closure')
 return {'lockSha256':lock_hash,'lockSizeBytes':lock_size,'provenanceSha256':provenance_hash,'provenanceSizeBytes':provenance_size,'sourceLockSha256':source_hash}

def run(name,argv,cwd,env,logs,records,start,deadline):
 global LOG_REMAINING
 remaining=min(CHILD-STOP-2,deadline-time.monotonic()-STOP-2)
 if remaining<=0: raise TimeoutError('aggregate deadline before '+name)
 paths=[logs/(name+'.stdout.log'),logs/(name+'.stderr.log')]
 proc=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 fs=[p.open('xb') for p in paths];sel=selectors.DefaultSelector(); hs=[hashlib.sha256(),hashlib.sha256()]; raw=[0,0]; kept=[0,0]; truncated=[False,False]
 for i,s in enumerate((proc.stdout,proc.stderr)):os.set_blocking(s.fileno(),False);sel.register(s,selectors.EVENT_READ,i)
 end=time.monotonic()+remaining;drain=end+STOP;hard_end=drain+2;failure=None;term_sent=False
 try:
  while sel.get_map() or proc.poll() is None:
   now=time.monotonic()
   if now>=end and not term_sent:
    failure=failure or 'timeout';term_sent=True
    try:os.killpg(proc.pid,signal.SIGTERM)
    except ProcessLookupError:pass
   if now>=drain:
    failure=failure or 'drain-timeout'
    for k in list(sel.get_map().values()):sel.unregister(k.fileobj);k.fileobj.close()
    if proc.poll() is None:
     try:os.killpg(proc.pid,signal.SIGKILL)
     except ProcessLookupError:pass
    break
   for k,_ in sel.select(min(.15,max(.001,drain-time.monotonic()))):
    i=k.data
    try:b=os.read(k.fileobj.fileno(),65536)
    except BlockingIOError:continue
    if not b:sel.unregister(k.fileobj);continue
    hs[i].update(b);raw[i]+=len(b);allow=LOG_REMAINING;keep=b[:allow]
    if keep:fs[i].write(keep);kept[i]+=len(keep);LOG_REMAINING-=len(keep)
    if len(b)>allow:
     truncated[i]=True;failure=failure or 'aggregate-log-cap'
     if not term_sent:
      term_sent=True;drain=min(drain,time.monotonic()+STOP)
      try:os.killpg(proc.pid,signal.SIGTERM)
      except ProcessLookupError:pass
  try:proc.wait(timeout=max(0,min(2,hard_end-time.monotonic())))
  except subprocess.TimeoutExpired:
   try:os.killpg(proc.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   try:proc.wait(timeout=max(0,hard_end-time.monotonic()))
   except subprocess.TimeoutExpired:failure=failure or 'kill-timeout'
 finally:
  sel.close()
  for f in fs:f.flush();os.fsync(f.fileno());f.close()
 rows=[]
 for i,p in enumerate(paths):
  h,n=hashfile(p,LOG_CAP);rows.append({'path':str(p.relative_to(OUT)),'bytes':n,'rawBytes':raw[i],'sha256':h,'rawSha256':hs[i].hexdigest(),'truncated':truncated[i]})
 rec={'name':name,'argv':argv,'exitCode':proc.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'streams':rows,'failure':failure}
 records.append(rec)
 if failure or proc.returncode or any(truncated):raise RuntimeError(name+' failed, timed out or exceeded logs')


def main():
 global LOG_REMAINING
 start=time.monotonic();deadline=start+TOTAL-RESERVE;OUT.mkdir(exist_ok=True);logs=OUT/'logs';logs.mkdir(exist_ok=True)
 result={'profile':'umf.g03-sdk058-python-parity/1','status':'FAIL_OR_UNKNOWN','failure':None,'commands':[]};records=[];dependency_pre=None;dependency_input_result=None
 LOG_REMAINING=LOG_CAP
 try:guest_budget=max(0.0,float(os.environ.get('G03_GUEST_REMAINING_SECONDS',TOTAL-RESERVE)))
 except (TypeError,ValueError):raise RuntimeError('invalid host-provided guest duration')
 if not math.isfinite(guest_budget):raise RuntimeError('non-finite host-provided guest duration')
 deadline=min(start+TOTAL-RESERVE,start+guest_budget)
 if deadline<=start:raise RuntimeError('parent owner deadline expired before guest work')
 try:
  raw=P.read_bytes(); packet=json.loads(raw)
  if hashlib.sha256(raw).hexdigest()!=os.environ.get('G03_INPUT_PACKET_SHA256'):raise RuntimeError('packet hash mismatch')
  if packet.get('status')!='PENDING_SOL_SOURCE_REVIEW' or packet.get('profile')!='umf.g03-sdk058-python-inputs/1':raise RuntimeError('Python immutable packet profile/status mismatch')
  if hashfile(pathlib.Path('/source-review'),2*1024*1024)[0]!=os.environ.get('G03_SOURCE_REVIEW_SHA256'):raise RuntimeError('external source review receipt did not close')
  if packet['producer']!={'commit':'855f6c48649496fc60b3303798790d0ddb55d38f','tree':'53f2bfffbc0c5780e79d76d8fd3d202239d088b2','volume':'umf-sdk058-source-855f6c486-001'}:raise RuntimeError('wrong exact UMF source identity')
  cohort=packet['cohort']
  if not isinstance(packet.get('sourceFiles'),list) or len(packet['sourceFiles'])!=5:raise RuntimeError('source file roster is not the five-file G03 set')
  for row in packet['sourceFiles']:
   rel=row.get('path'); pure=pathlib.PurePosixPath(rel or '')
   if pure.is_absolute() or not pure.parts or any(x in ('','.','..') for x in pure.parts) or '\\' in (rel or ''):raise RuntimeError('unsafe source roster path')
   if hashfile(SRC/rel,2*1024*1024)[0]!=row.get('sha256'):raise RuntimeError('G03 source file digest mismatch: '+str(rel))
  if any(cohort.get(k)!=v for k,v in EXPECTED.items()):raise RuntimeError('final18 cohort pins mismatch')
  checks=[(COHORT/'cells/linux-x86_64-py311/cohort.lock.json',EXPECTED['selectedLockSha256'],8*1024*1024),(COHORT/'aggregate/index.json',EXPECTED['indexSha256'],4*1024*1024),(COHORT/'aggregate/mirror/manifest.json',EXPECTED['mirrorManifestSha256'],4*1024*1024),(COHORT/'aggregate/mirror/requirements.lock',EXPECTED['requirementsSha256'],1024*1024),(COHORT/'custody.json',EXPECTED['custodySha256'],1024*1024)]
  for p,w,c in checks:
   if hashfile(p,c)[0]!=w:raise RuntimeError('cohort physical hash mismatch: '+str(p))
  git=['git','-c','safe.directory=/volume-producer','-C',str(SRC)]
  env=dict(os.environ);env.update({'HOME':'/tmp/home','TMPDIR':'/tmp','PYTHONDONTWRITEBYTECODE':'1','BUN_RUNTIME_TRANSPILER_CACHE_PATH':'/tmp/bun-cache'})
  pathlib.Path('/tmp/home').mkdir(exist_ok=True);pathlib.Path('/tmp/bun-cache').mkdir(exist_ok=True)
  for name,args in [('source-commit',['rev-parse','HEAD']),('source-tree',['rev-parse','HEAD^{tree}']),('source-clean',['status','--porcelain=v1','--untracked-files=all'])]:run(name,git+args,SRC,env,logs,records,start,deadline)
  read=lambda n:'\n'.join((logs/(n+'.'+s+'.log')).read_text() for s in ('stdout','stderr')).strip()
  if (read('source-commit'),read('source-tree'),read('source-clean'))!=(packet['producer']['commit'],packet['producer']['tree'],''):raise RuntimeError('source volume identity/cleanliness mismatch')
  python_identity="import json,platform,struct,sys,sysconfig; from pip._vendor.packaging.markers import default_environment; print(json.dumps({'version':sys.version.split()[0],'system':platform.system(),'machine':platform.machine(),'pointerBits':struct.calcsize('P')*8,'abi':sysconfig.get_platform(),'libc':platform.libc_ver(),'osRelease':platform.freedesktop_os_release(),'markerEnvironment':default_environment()},sort_keys=True))"
  run('runtime-python',[str(PYTHON),'-B','-c',python_identity],SRC,env,logs,records,start,deadline)
  run('runtime-bun',['bun','--version'],SRC,env,logs,records,start,deadline)
  guest_identity=json.loads(read('runtime-python'))
  if {k:guest_identity[k] for k in ('abi','machine','pointerBits','system','version')}!={'abi':'linux-x86_64','machine':'x86_64','pointerBits':64,'system':'Linux','version':'3.11.17'} or guest_identity.get('libc')!=['glibc','2.39'] or guest_identity.get('osRelease',{}).get('ID')!='ubuntu' or guest_identity.get('osRelease',{}).get('VERSION_ID')!='24.04' or read('runtime-bun')!='1.4.3':raise RuntimeError('selected image guest process ABI/runtime pin mismatch')
  python_guest_abi={k:guest_identity[k] for k in ('abi','machine','pointerBits','system','version')}
  generic_input=verify_generic_input(packet,guest_identity['markerEnvironment'],python_guest_abi)
  result['genericProbeInput']=generic_input
  result['platformObservation']={'pythonGuest':python_guest_abi,'runtimeMetadata':guest_identity}
  dependency_pre=dependency_snapshot(deadline-20)
  dependency_input_result={'status':'PRE_PASS_POST_PENDING','pre':dependency_pre,'post':None}
  result['dependencyToolInput']=dependency_input_result
  run('generate-shared-g03-corpus',['bun','scripts/g03-migration-corpus.ts','/out/g03-corpus.json'],SRC,env,logs,records,start,deadline)
  run('generate-generic-codegen-corpus',['bun','scripts/codegen-corpus.ts','/out/codegen-corpus.json'],SRC,env,logs,records,start,deadline)
  mirror='file:///cohort/aggregate/mirror/simple';req='/cohort/aggregate/mirror/requirements.lock'
  command=(f'{PYTHON} -B -m venv /venv && unshare --net /venv/bin/python -B -I -m pip --isolated install --disable-pip-version-check --no-cache-dir --no-compile --only-binary=:all: --require-hashes --index-url {mirror} -r {req} && unshare --net /venv/bin/python -B -I -m pip --isolated check')
  run('fresh18-offline-install-and-pip-check',['bash','-euo','pipefail','-c',command],SRC,env,logs,records,start,deadline)
  run('installed-distribution-snapshot',['unshare','--net','/venv/bin/python','-B','-I','-c',"import importlib.metadata as m,json; names=['umf-core','umf-weft','umf-access','umf-codegen']; print(json.dumps({n:m.version(n) for n in names},sort_keys=True))"],SRC,env,logs,records,start,deadline)
  versions=json.loads(read('installed-distribution-snapshot'))
  if versions!={'umf-access':'0.1.0.dev8','umf-codegen':'0.1.0a5','umf-core':'0.10.3','umf-weft':'0.4.56'}:raise RuntimeError('installed final18 distribution identities mismatch')
  run('installed-record-snapshot',['/venv/bin/python','-B','-I','/operator/record_snapshot.py','--lock','/cohort/cells/linux-x86_64-py311/cohort.lock.json','--output','/out/installed-record-snapshot.json'],SRC,env,logs,records,start,deadline)
  snapshot=json.loads((OUT/'installed-record-snapshot.json').read_bytes())
  if snapshot.get('profile')!='umf.g03-installed-record-snapshot/1' or snapshot.get('distributionCount')!=18:raise RuntimeError('installed RECORD/METADATA snapshot did not close exact18')
  run('embedded-python-g03-parity',['/venv/bin/python','-B','-I','/volume-producer/tests/codegen/g03_migration_probe.py','--corpus','/out/g03-corpus.json','--report','/out/g03-python-report.json'],SRC,env,logs,records,start,deadline)
  accepted_tool_sha=os.environ.get('G03_QUALIFICATION_TOOL_REPORT_SHA256')
  accepted_wheel_sha=os.environ.get('G03_QUALIFICATION_TOOL_WHEEL_SHA256')
  if accepted_tool_sha!=TOOL_ACCEPTED_REPORT_SHA256 or accepted_wheel_sha!=TOOL_WHEEL_SHA256:
   raise RuntimeError('root-admitted qualification-tool report/wheel pins differ from accepted metadata control')
  if hashfile(ACCEPTED_TOOL_REPORT,256*1024)[0]!=accepted_tool_sha:
   raise RuntimeError('accepted packaging-tool report mount changed')
  accepted_tool=json.loads(ACCEPTED_TOOL_REPORT.read_bytes())
  run('qualification-tool-metadata-control',[str(PYTHON),'-B','-I','/control/bootstrap.py'],SRC,env,logs,records,start,deadline)
  tool_report_sha,tool_report_bytes=hashfile(TOOL_REPORT,256*1024)
  if tool_report_sha!=accepted_tool_sha:
   raise RuntimeError('fresh isolated packaging-tool report digest differs from accepted actual002')
  tool_report=json.loads(TOOL_REPORT.read_bytes())
  if tool_report!=accepted_tool:
   raise RuntimeError('fresh isolated packaging-tool report differs from accepted exact report')
  if (tool_report.get('status')!='PASS_METADATA_ONLY' or tool_report.get('wheelSha256')!=TOOL_WHEEL_SHA256 or
      tool_report.get('packagingInventorySha256')!=TOOL_INVENTORY_SHA256 or tool_report.get('packagingFileCount')!=25 or
      tool_report.get('packagingBytes')!=238549 or tool_report.get('toolDistributionVersions')!={'packaging':'25.0','pip':'24.0','setuptools':'79.0.1'} or
      tool_report.get('selectedDistributionCount')!=18 or tool_report.get('checkedRequirementCount')!=72 or
      tool_report.get('productModulesImported') is not False or tool_report.get('productDistributionsInstalled') is not False or
      tool_report.get('syntheticExtraFieldAdded') is not False or 'extra' in tool_report.get('markerEnvironment',{})):
   raise RuntimeError('fresh packaging-tool report does not satisfy accepted isolated identity/closure guards')
  result['qualificationTool']={'status':'PASS_ACCEPTED_PACKAGING_TOOL_CONTROL','reportSha256':tool_report_sha,
   'reportSizeBytes':tool_report_bytes,'wheelSha256':tool_report['wheelSha256'],'wheelSizeBytes':tool_report['wheelSizeBytes'],
   'packagingInventorySha256':tool_report['packagingInventorySha256'],'packagingFileCount':tool_report['packagingFileCount'],
   'packagingBytes':tool_report['packagingBytes'],'toolDistributionVersions':tool_report['toolDistributionVersions'],
   'markerEnvironmentSha256':tool_report['markerEnvironmentSha256'],'selectedDistributionCount':tool_report['selectedDistributionCount'],
   'checkedRequirementCount':tool_report['checkedRequirementCount'],'separateToolVenv':tool_report['toolVenv'],
   'separateFromProductVenv':tool_report['toolVenv']!='/venv','productDependenciesUnchanged':True}
  run('generic-offline-mirror-probe',[str(TOOL_PYTHON),'-B','-I','/volume-producer/tests/codegen/offline_mirror_probe.py','--wheelhouse','/cohort/aggregate/mirror/files','--lock',str(GENERIC_INPUT),'--mirror','/tmp/g03-mirror-replay','--generator-corpus','/out/codegen-corpus.json','--report','/out/offline-mirror-report.json'],SRC,env,logs,records,start,deadline)
  corpus=json.loads((OUT/'g03-corpus.json').read_bytes()); report=json.loads((OUT/'g03-python-report.json').read_bytes())
  if report.get('corpusSha256')!=hashlib.sha256((OUT/'g03-corpus.json').read_bytes()).hexdigest():raise RuntimeError('Python report does not bind exact shared G03 corpus')
  if report.get('profile')!=corpus.get('profile') or report.get('nativeLifecycleReleaseQualified') is not False:raise RuntimeError('Python report profile/scope mismatch')
  generic=json.loads((OUT/'offline-mirror-report.json').read_bytes())
  if generic.get('status')!='passed' or generic.get('lockSha256')!=generic_input['lockSha256']:raise RuntimeError('generic final18 offline probe did not close derived frozen input')
  result.update(status='PASS_LOCAL_FINAL18_G03_PYTHON_PARITY',producer=packet['producer'],cohort=EXPECTED,installedVersions=versions,
   g03CorpusSha256=report['corpusSha256'],pythonReportSha256=hashfile(OUT/'g03-python-report.json',8*1024*1024)[0],
   g03Counts={k:v for k,v in report.items() if k.endswith('Cases') or k in ('acceptedPlans','blockedPlans')},
   genericProbeProfile=generic.get('profile'),genericProbeStatus=generic.get('status'),genericProbeLockSha256=generic_input['lockSha256'],genericProbeSourceLockSha256=generic_input['sourceLockSha256'],installedRecordSnapshotSha256=hashfile(OUT/'installed-record-snapshot.json',8*1024*1024)[0],
   qualificationTool=result['qualificationTool'])
 except BaseException as exc:result['failure']=type(exc).__name__+': '+str(exc)[:300]
 finally:
  if dependency_pre is not None:
   try:
    dependency_post=dependency_snapshot(deadline-5)
    dependency_input_result['post']=dependency_post
    dependency_input_result['prePostIdentical']=dependency_pre==dependency_post
    dependency_input_result['status']='PASS_PRE_POST_FULL_ROSTER_EQUAL' if dependency_input_result['prePostIdentical'] else 'FAIL_PRE_POST_MISMATCH'
    if not dependency_input_result['prePostIdentical']:
     result['status']='FAIL_OR_UNKNOWN';result['failure']=(result.get('failure') or '')+'; dependency tool input changed between full pre/post custody walks'
   except BaseException as custody_error:
    dependency_input_result['status']='FAIL_POSTCHECK_INCOMPLETE';dependency_input_result['postFailure']=type(custody_error).__name__+': '+str(custody_error)[:240]
    result['status']='FAIL_OR_UNKNOWN';result['failure']=(result.get('failure') or '')+'; dependency tool input postcheck failed: '+dependency_input_result['postFailure']
 result['commands']=records;result['elapsedSeconds']=round(time.monotonic()-start,3)
 if result['elapsedSeconds']>TOTAL-RESERVE:result['status']='FAIL_OR_UNKNOWN';result['failure']='guest deadline exceeded'
 names={'source-commit','source-tree','source-clean','runtime-python','runtime-bun','generate-shared-g03-corpus','generate-generic-codegen-corpus','fresh18-offline-install-and-pip-check','installed-distribution-snapshot','installed-record-snapshot','embedded-python-g03-parity','qualification-tool-metadata-control','generic-offline-mirror-probe'}
 expected={'g03-corpus.json','codegen-corpus.json','g03-python-report.json','offline-mirror-report.json','installed-record-snapshot.json','tool-result.json'}
 expected.update('logs/'+n+'.'+stream+'.log' for n in names for stream in ('stdout','stderr'))
 if {r['name'] for r in records}!=names:result['status']='FAIL_OR_UNKNOWN';result['failure']='command roster differs from finite G03 operator'
 raw_total=sum(x.get('rawBytes',0) for c in records for x in c.get('streams',[]))
 retained_total=sum(x.get('bytes',0) for c in records for x in c.get('streams',[]))
 result.update(rawLogBytes=raw_total,retainedLogBytes=retained_total,logBytesRemaining=LOG_REMAINING)
 if raw_total!=retained_total or retained_total>LOG_CAP or LOG_REMAINING!=LOG_CAP-retained_total:
  result['status']='FAIL_OR_UNKNOWN';result['failure']='shared guest raw-log allowance did not close'
 rows,total=inventory(OUT);result['outputFiles']=rows;result['outputBytes']=total
 if {r['path'] for r in rows}!=expected:result['status']='FAIL_OR_UNKNOWN';result['failure']='guest output roster differs from finite G03 operator'
 if total+128*1024>EVIDENCE_CAP:result['status']='FAIL_OR_UNKNOWN';result['failure']='evidence cap exceeded'
 with (OUT/'guest-result.json').open('xb') as f:f.write((json.dumps(result,sort_keys=True,indent=2)+'\n').encode());f.flush();os.fsync(f.fileno())
 return 0 if result['status'].startswith('PASS') else 1

if __name__=='__main__':raise SystemExit(main())
