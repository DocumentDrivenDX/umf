#!/usr/bin/env python3
"""Bounded metadata-only custody preflight for the existing Linux node_modules view."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, selectors, signal, stat, subprocess, sys, time, uuid

PROFILE='umf.g03-sdk058-dependency-view-preflight/1'
SOURCE_VOLUME='umf-sdk058-source-855f6c486-001'
DEPENDENCY_VOLUME='umf-migration-source-267675510'
DEPENDENCY_SUBPATH='node_modules'
IMAGE='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PLATFORM='linux/amd64'
SOURCE_COMMIT='855f6c48649496fc60b3303798790d0ddb55d38f'
SOURCE_TREE='53f2bfffbc0c5780e79d76d8fd3d202239d088b2'
EXPECTED_LOCK='5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4'
CENSUS_SHA256='c4e3e79e5a0a51fb9b21261f458ede1a14042042aae1c8c2faf29c15f1d7eaae'
TOTAL=180
RAW_CAP=1024*1024
METADATA_CAP=16*1024*1024
TREE_CAP=256*1024*1024
FILE_CAP=64*1024*1024
OWNER=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight')
HISTORICAL_HOST_ORIGIN=pathlib.Path('/Users/erik/.codex/worktrees/eb69/umf')
HISTORICAL_HOST_PACKAGE_SHA256='323d619288cd35e7e86c932c0d26bfbfb2f8b4a5e5cc3f39bcaa415dd3c3aeaa'
HISTORICAL_HOST_LOCK_SHA256=EXPECTED_LOCK
MOUNTPOINT_PREP_RECEIPT=pathlib.Path('/private/tmp/g03-sdk058-input-mount-prep-001/result.json')
MOUNT_CONFIG_CONTROL=pathlib.Path('/private/tmp/g03-sdk058-mount-config-control-001/result.json')
PRIOR_LAUNCH_FAILURE=pathlib.Path('/private/tmp/g03-sdk058-parity-008-preflight/out/preflight-owner-result.json')

class Refuse(RuntimeError): pass

def sha_bytes(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def canonical_json(value) -> bytes: return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def fail(s): raise Refuse(s)

def hash_regular(path: pathlib.Path, cap: int):
 st=path.lstat()
 if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size>cap: fail(f'unsafe or oversized regular file: {path} sizeBytes={st.st_size} capBytes={cap}')
 h=hashlib.sha256();n=0
 with path.open('rb') as f:
  for block in iter(lambda:f.read(65536),b''):
   n+=len(block)
   if n>cap:fail('file grew beyond cap: '+str(path))
   h.update(block)
 st2=path.lstat()
 if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns) or n!=st.st_size:fail('file changed while hashing: '+str(path))
 return h.hexdigest(),n,stat.S_IMODE(st.st_mode)

def parse_bun_lock(raw: bytes):
 # bun.lock is JSON with permitted trailing commas; remove only commas immediately before a closer, outside strings.
 text=raw.decode('utf-8');out=[];quoted=False;escaped=False;i=0
 while i<len(text):
  ch=text[i]
  if quoted:
   out.append(ch)
   if escaped:escaped=False
   elif ch=='\\':escaped=True
   elif ch=='"':quoted=False
   i+=1;continue
  if ch=='"':quoted=True;out.append(ch);i+=1;continue
  if ch==',':
   j=i+1
   while j<len(text) and text[j].isspace():j+=1
   if j<len(text) and text[j] in '}]':i+=1;continue
  out.append(ch);i+=1
 return json.loads(''.join(out))

def inside(root: pathlib.Path, path: pathlib.Path):
 try:path.relative_to(root);return True
 except ValueError:return False

def safe_resolve(root: pathlib.Path, p: pathlib.Path):
 resolved=p.resolve(strict=True)
 if not inside(root.resolve(strict=True),resolved):fail('dependency path resolves outside mounted tool view: '+str(p))
 return resolved

def package_path(root: pathlib.Path, name: str, from_dir: pathlib.Path|None=None):
 parts=name.split('/')
 if name.startswith('@') and len(parts)<2:fail('invalid scoped package name '+name)
 starts=[]
 if from_dir is not None:
  cur=from_dir
  while inside(root,cur):
   if cur.name=='node_modules':starts.append(cur)
   if cur==root:break
   cur=cur.parent
 starts.append(root)
 seen=set()
 for nm in starts:
  candidate=nm.joinpath(*parts)
  if str(candidate) in seen:continue
  seen.add(str(candidate))
  manifest=candidate/'package.json'
  if manifest.exists():return candidate,safe_resolve(root,manifest)
 fail('required package is absent from readonly dependency view: '+name)

def lock_entry(lock, name, version):
 packages=lock.get('packages',{})
 wanted=name+'@'+version
 row=packages.get(wanted)
 if row is None:
  matches=[(k,v) for k,v in packages.items() if isinstance(v,list) and v and v[0]==wanted]
  if len(matches)!=1:fail('bun.lock has no unique installed package descriptor '+wanted)
  return matches[0][0],matches[0][1]
 return wanted,row

def selected_package_manifests(root: pathlib.Path, lock, census):
 bare=sorted(set(census.get('packageNames',[])))
 if bare!=['ajv','yaml']:fail('frozen source census runtime package set differs from approved finite G03 set')
 selected={};pending=[(name,None,'source-import') for name in bare]
 while pending:
  name,parent,why=pending.pop()
  pkgdir,manifest_path=package_path(root,name,parent)
  instance=manifest_path.relative_to(root).as_posix()
  if instance in selected:continue
  raw=manifest_path.read_bytes()
  if len(raw)>1024*1024:fail('package manifest exceeds1MiB: '+name)
  manifest=json.loads(raw)
  version=manifest.get('version')
  if manifest.get('name')!=name or not isinstance(version,str):fail('package manifest identity/version mismatch: '+name)
  descriptor,locked=lock_entry(lock,name,version)
  declarations={}
  for field in ('dependencies','optionalDependencies'):
   value=manifest.get(field,{})
   if value and not isinstance(value,dict):fail('malformed package dependency map: '+name+'/'+field)
   for child,spec in (value or {}).items():declarations[child]=spec
  lock_meta=locked[2] if len(locked)>2 and isinstance(locked[2],dict) else {}
  locked_deps=lock_meta.get('dependencies',{})
  locked_optional=lock_meta.get('optionalDependencies',{})
  for child,spec in declarations.items():
   locked_spec=locked_deps.get(child,locked_optional.get(child))
   if locked_spec!=spec:fail('installed manifest/lock dependency spec mismatch '+name+' -> '+child)
   pending.append((child,pkgdir,'transitive:'+name))
  selected[instance]={'name':name,'version':version,'manifestPath':instance,'manifestSha256':sha_bytes(raw),'lockDescriptor':descriptor,'lockIntegrity':locked[3] if len(locked)>3 and isinstance(locked[3],str) else None,'requestedBy':why,'dependencies':dict(sorted(declarations.items()))}
 return bare,selected

def inventory_tree(root: pathlib.Path):
 root=root.resolve(strict=True);rows=[];regular_bytes=0;regular_count=0;dir_count=0;link_count=0
 for base,dirs,files in os.walk(root,topdown=True,followlinks=False):
  bp=pathlib.Path(base)
  for name in list(dirs):
   p=bp/name;rel=p.relative_to(root).as_posix();st=p.lstat()
   if stat.S_ISLNK(st.st_mode):
    target=os.readlink(p);resolved=safe_resolve(root,p)
    rows.append({'path':rel,'type':'symlink','mode':stat.S_IMODE(st.st_mode),'target':target,'resolvedPath':resolved.relative_to(root).as_posix()});link_count+=1;dirs.remove(name)
   elif stat.S_ISDIR(st.st_mode):
    rows.append({'path':rel,'type':'directory','mode':stat.S_IMODE(st.st_mode)});dir_count+=1
   else:fail('non-directory entry in dependency directories: '+rel)
  for name in files:
   p=bp/name;rel=p.relative_to(root).as_posix();st=p.lstat()
   if stat.S_ISLNK(st.st_mode):
    target=os.readlink(p);resolved=safe_resolve(root,p)
    rows.append({'path':rel,'type':'symlink','mode':stat.S_IMODE(st.st_mode),'target':target,'resolvedPath':resolved.relative_to(root).as_posix()});link_count+=1
   elif stat.S_ISREG(st.st_mode):
    h,n,mode=hash_regular(p,FILE_CAP);regular_bytes+=n;regular_count+=1
    if regular_bytes>TREE_CAP:fail(f'dependency tool view exceeds256MiB regular-file custody bound at regularBytes={regular_bytes} regularFiles={regular_count}')
    rows.append({'path':rel,'type':'regular','mode':mode,'sizeBytes':n,'sha256':h})
   else:fail('nonregular dependency entry: '+rel)
  if len(rows)>250000:fail(f'dependency inventory exceeds250,000 metadata entries at entries={len(rows)} regularBytes={regular_bytes}')
 rows.sort(key=lambda r:r['path'])
 compact=canonical_json(rows)
 if len(compact)>METADATA_CAP-512*1024:fail(f'complete dependency inventory exceeds16MiB public metadata bound at entries={len(rows)} compactBytes={len(compact)} regularBytes={regular_bytes}')
 return rows,regular_bytes,regular_count,dir_count,link_count,sha_bytes(compact),len(compact)

def atomic(path: pathlib.Path, raw: bytes):
 temp=path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.tmp')
 with temp.open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 os.replace(temp,path)
 fd=os.open(path.parent,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
 try:os.fsync(fd)
 finally:os.close(fd)

def verify_admission(path: pathlib.Path, expected: str):
 if not path.is_absolute() or path.resolve(strict=True)!=path:fail('root admission path must be canonical')
 h,n,_=hash_regular(path,256*1024)
 if h!=expected:fail('root admission digest mismatch')
 adm=json.loads(path.read_bytes())
 if adm.get('profile')!='umf.g03-sdk058-dependency-preflight-admission/1' or adm.get('status')!='ROOT_ADMITTED':fail('root admission profile/status mismatch')
 if (adm.get('dependencyVolume'),adm.get('dependencySubpath'),adm.get('dependencyOriginMount'),adm.get('sourceVolume'),adm.get('producerCommit'),adm.get('producerTree'),adm.get('bunLockSha256'))!=(DEPENDENCY_VOLUME,DEPENDENCY_SUBPATH,'whole-volume-readonly-at-/dependency-origin',SOURCE_VOLUME,SOURCE_COMMIT,SOURCE_TREE,EXPECTED_LOCK):fail('root admission dependency/source identity mismatch')
 manifest_path=OWNER/'source-manifest.json';binding_path=OWNER/'binding.json';sums_path=OWNER/'SHA256SUMS'
 manifest_hash,_,_=hash_regular(manifest_path,4*1024*1024);binding_hash,_,_=hash_regular(binding_path,256*1024);sums_hash,_,_=hash_regular(sums_path,256*1024)
 if adm.get('sourceManifestSha256')!=manifest_hash or adm.get('bindingSha256')!=binding_hash or adm.get('sha256SumsSha256')!=sums_hash:fail('root admission source closure mismatch')
 binding=json.loads(binding_path.read_bytes());manifest=json.loads(manifest_path.read_bytes())
 if binding.get('sourceManifestSha256')!=manifest_hash:fail('source binding does not point to manifest')
 source_rows={row['path']:row for row in manifest.get('files',[])}
 if adm.get('preflightOperatorSha256')!=source_rows.get(str(OWNER/'preflight.py'),{}).get('sha256') or adm.get('runtimeImportCensusSha256')!=source_rows.get(str(OWNER/'runtime-import-census.json'),{}).get('sha256'):fail('root admission does not bind exact preflight operator/census')
 for line in sums_path.read_text().splitlines():
  try:expected_sum,rel=line.split('  ',1)
  except ValueError:fail('malformed frozen SHA256SUMS row')
  relpath=pathlib.PurePosixPath(rel)
  if relpath.is_absolute() or not relpath.parts or any(part in ('','.','..') for part in relpath.parts):fail('unsafe frozen SHA256SUMS path')
  sum_path=OWNER.joinpath(*relpath.parts);actual_sum,_,_=hash_regular(sum_path,64*1024*1024)
  if actual_sum!=expected_sum:fail('frozen SHA256SUMS mismatch: '+rel)
 for row in manifest.get('files',[]):
  p=pathlib.Path(row['path']);fh,fn,_=hash_regular(p,row['sizeBytes'])
  if fh!=row['sha256'] or fn!=row['sizeBytes']:fail('source closure file changed: '+str(p))
 pin_rows={row['path']:row for row in manifest.get('externalPins',[])};pins={key:row['sha256'] for key,row in pin_rows.items()}
 required={'dependencyPlanSha256':'/private/tmp/g03-sdk058-parity006-sol-existing-deps-plan002.md','sourcePrepReceiptSha256':'/private/tmp/g03-sdk058-source-volume-prep-003/result.json','typecheck002ReceiptSha256':'/private/tmp/g03-sdk058-typecheck-linux-002/result.json','typecheck002SourceReviewSha256':'/private/tmp/g03-sdk058-typecheck002-sol-actual-review001.md','parity005SourceManifestSha256':'/private/tmp/g03-sdk058-parity-005/source-manifest.json','parity005SourceReviewSha256':'/private/tmp/g03-sdk058-parity005-sol-source-review001.md','parity005OwnerFailureSha256':'/private/tmp/g03-sdk058-parity-005/combined-runs/dabcef739bac431c94eeecd93292e5fa/owner-result.json','historicalHostPackageSha256':str(HISTORICAL_HOST_ORIGIN/'package.json'),'historicalHostLockSha256':str(HISTORICAL_HOST_ORIGIN/'bun.lock'),'parity007SourceManifestSha256':'/private/tmp/g03-sdk058-parity-007-preflight/source-manifest.json','parity007AdmissionFailureSha256':'/private/tmp/g03-sdk058-parity-007-preflight/out/preflight-owner-result.json','mountpointPreparationReceiptSha256':str(MOUNTPOINT_PREP_RECEIPT),'mountpointPreparationReviewSha256':'/private/tmp/g03-sdk058-input-mount-prep001-sol-actual-review001.md','mountConfigControlReceiptSha256':str(MOUNT_CONFIG_CONTROL),'mountConfigControlReviewSha256':'/private/tmp/g03-sdk058-mount-config-control001-sol-actual-review001.md','parity008SourceManifestSha256':'/private/tmp/g03-sdk058-parity-008-preflight/source-manifest.json','parity008LaunchFailureSha256':str(PRIOR_LAUNCH_FAILURE),'mountPlanSha256':'/private/tmp/g03-sdk058-dependency-preflight009-sol-mount-plan001.md'}
 for key,external in required.items():
  if adm.get(key)!=pins.get(external):fail('admission does not bind required preflight input '+key)
  row=pin_rows.get(external)
  if row is None:fail('source closure omits required preflight input '+key)
  actual,actual_size,_=hash_regular(pathlib.Path(external),row['sizeBytes'])
  if actual!=row['sha256'] or actual_size!=row['sizeBytes']:fail('required preflight input changed: '+external)
 review=pathlib.Path(adm.get('sourceReviewPath',''))
 if not review.is_absolute() or review.resolve(strict=True)!=review or hash_regular(review,2*1024*1024)[0]!=adm.get('sourceReviewSha256'):fail('preflight source review path/hash mismatch')
 return adm,manifest

def guest(out: pathlib.Path):
 start=time.monotonic();src=pathlib.Path('/volume-producer');deps=src/'node_modules';origin=pathlib.Path('/dependency-origin')
 for p in (src,deps,origin/'package.json',origin/'bun.lock'):
  if not p.exists():fail('required readonly preflight input missing: '+str(p))
 source_pkg_raw=(src/'package.json').read_bytes();origin_pkg_raw=(origin/'package.json').read_bytes();source_lock_raw=(src/'bun.lock').read_bytes();origin_lock_raw=(origin/'bun.lock').read_bytes()
 if len(source_pkg_raw)>1024*1024 or len(origin_pkg_raw)>1024*1024 or len(source_lock_raw)>8*1024*1024 or len(origin_lock_raw)>8*1024*1024:fail('source package/lock metadata exceeds bound')
 source_pkg=json.loads(source_pkg_raw);origin_pkg=json.loads(origin_pkg_raw);source_lock=parse_bun_lock(source_lock_raw);origin_lock=parse_bun_lock(origin_lock_raw)
 if sha_bytes(source_lock_raw)!=EXPECTED_LOCK or sha_bytes(origin_lock_raw)!=EXPECTED_LOCK:fail('P and dependency-origin bun.lock must both match exact accepted lock hash')
 source_pkg_compare=dict(source_pkg);origin_pkg_compare=dict(origin_pkg);source_version=source_pkg_compare.pop('version',None);origin_version=origin_pkg_compare.pop('version',None)
 if source_pkg_compare!=origin_pkg_compare or source_pkg.get('name')!=origin_pkg.get('name') or not all(isinstance(v,str) for v in (source_version,origin_version)):fail('dependency-origin package differs beyond the admitted package version field')
 workspace=source_lock.get('workspaces',{}).get('',{})
 for field in ('dependencies','devDependencies','optionalDependencies'):
  if source_pkg.get(field,{})!=workspace.get(field,{}):fail('P package and bun.lock workspace disagree in '+field)
 census_path=pathlib.Path('/operator/runtime-import-census.json')
 census_raw=census_path.read_bytes()
 if len(census_raw)>2*1024*1024 or sha_bytes(census_raw)!=CENSUS_SHA256:fail('static source import census digest mismatch')
 census=json.loads(census_raw)
 if census.get('profile')!='umf.g03-sdk058-static-runtime-import-census/1' or census.get('roots')!=['scripts/g03-migration-corpus.ts','scripts/codegen-corpus.ts']:fail('static source import census profile/entrypoints mismatch')
 srcroot=src.resolve(strict=True)
 for row in census.get('sourceFiles',[]):
  rel=pathlib.PurePosixPath(row.get('path',''))
  if rel.is_absolute() or not rel.parts or any(part in ('','.','..') for part in rel.parts) or '\\' in row.get('path',''):fail('unsafe census source path')
  source_file=src/row['path'];resolved=source_file.resolve(strict=True)
  if not inside(srcroot,resolved):fail('census source resolves outside P volume: '+row['path'])
  h,n,_=hash_regular(resolved,8*1024*1024)
  if h!=row.get('sha256') or n!=row.get('sizeBytes'):fail('P source file differs from frozen static census: '+row['path'])
 bare,selected=selected_package_manifests(deps,source_lock,census)
 # Direct package imports must be declared in source package dependencies/devDependencies and lock workspace.
 workspace=source_lock.get('workspaces',{}).get('',{})
 declared={**workspace.get('dependencies',{}),**workspace.get('devDependencies',{})}
 for name in bare:
  if name not in declared:fail('runtime source import is undeclared by exact P package.json: '+name)
  direct=next((row for row in selected.values() if row['name']==name and row['requestedBy']=='source-import'),None)
  if direct is None:fail('direct source import has no resolved package manifest: '+name)
  actual=direct['version'];spec=declared[name]
  if spec!=actual and not (isinstance(spec,str) and spec.startswith('npm:') and spec.rsplit('@',1)[-1]==actual):fail('direct import version does not match package declaration: '+name)
 rows,byte_count,file_count,dir_count,link_count,tree_hash,metadata_bytes=inventory_tree(deps)
 result={'profile':PROFILE,'status':'METADATA_PREFLIGHT_PASS','scope':'metadata-only existing Linux dependency view; no package/runtime/product commands','source':{'volume':SOURCE_VOLUME,'commit':SOURCE_COMMIT,'tree':SOURCE_TREE,'packageVersion':source_version,'packageSha256':sha_bytes(source_pkg_raw),'lockSha256':sha_bytes(source_lock_raw)},'dependencyOrigin':{'volume':DEPENDENCY_VOLUME,'mountTarget':'/dependency-origin','packageVersion':origin_version,'packageSha256':sha_bytes(origin_pkg_raw),'lockSha256':sha_bytes(origin_lock_raw),'packageDiffFields':['version'] if source_version!=origin_version else []},'historicalHostPackageContext':{'path':str(HISTORICAL_HOST_ORIGIN),'packageSha256':HISTORICAL_HOST_PACKAGE_SHA256,'lockSha256':HISTORICAL_HOST_LOCK_SHA256,'role':'historical context only; not dependency-volume origin'},'dependencyView':{'volume':DEPENDENCY_VOLUME,'subpath':DEPENDENCY_SUBPATH,'mountTarget':'/volume-producer/node_modules','regularBytes':byte_count,'regularFileCount':file_count,'directoryCount':dir_count,'internalSymlinkCount':link_count,'metadataBytes':metadata_bytes,'inventorySha256':tree_hash,'inventoryPath':'dependency-view-inventory.json'},'runtimeImportClosure':{'censusSha256':CENSUS_SHA256,'entrypoints':census['roots'],'sourceFileCount':len(census.get('sourceFiles',[])),'barePackages':bare,'packageClosure':selected},'bounds':{'deadlineSeconds':TOTAL,'rawLogBytes':RAW_CAP,'metadataBytes':METADATA_CAP,'regularBytes':TREE_CAP,'fileBytes':FILE_CAP},'elapsedSeconds':round(time.monotonic()-start,3)}
 inv={'profile':'umf.g03-sdk058-dependency-view-inventory/1','root':'/volume-producer/node_modules','rows':rows,'regularBytes':byte_count,'regularFileCount':file_count,'directoryCount':dir_count,'internalSymlinkCount':link_count,'inventorySha256':tree_hash}
 inventory_raw=(json.dumps(inv,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
 result_raw=(json.dumps(result,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode()
 if len(inventory_raw)+len(result_raw)>METADATA_CAP-RAW_CAP-128*1024:fail(f'inventory plus metadata receipt exceeds reserved16MiB inclusive budget at inventoryBytes={len(inventory_raw)} receiptBytes={len(result_raw)}')
 out.mkdir(parents=True,exist_ok=True);atomic(out/'dependency-view-inventory.json',inventory_raw);atomic(out/'metadata-result.json',result_raw)
 print(json.dumps({'status':result['status'],'inventorySha256':tree_hash,'regularBytes':byte_count,'regularFileCount':file_count,'metadataBytes':len(inventory_raw)+len(result_raw)},sort_keys=True))

def host(admission_path: pathlib.Path, admission_sha: str):
 start=time.monotonic();deadline=start+TOTAL;rid=uuid.uuid4().hex;name='g03-sdk058-deps-'+rid[:16]
 out=OWNER/'out';out.mkdir(parents=True,exist_ok=True)
 if any(out.iterdir()):fail('preflight output directory must be empty; preserve prior output and select a fresh destination')
 logs=[out/'docker.stdout.log',out/'docker.stderr.log'];result={'profile':PROFILE,'executionId':rid,'status':'FAIL_OR_UNKNOWN','limits':{'aggregateSeconds':TOTAL,'rawLogBytes':RAW_CAP,'metadataBytes':METADATA_CAP,'regularBytes':TREE_CAP,'fileBytes':FILE_CAP},'daemon':None,'image':IMAGE,'platform':PLATFORM,'dependencyVolume':DEPENDENCY_VOLUME,'sourceVolume':SOURCE_VOLUME,'container':name}
 proc=None;failure=None;primary_failure=None;secondary_failures=[];raw=0;kept=0;files=[];sel=None
 try:
  adm,source_manifest=verify_admission(admission_path,admission_sha)
  result['rootAdmissionSha256']=admission_sha;result['sourceReviewSha256']=adm['sourceReviewSha256'];result['runtimeImportCensusSha256']=CENSUS_SHA256
  if not HISTORICAL_HOST_ORIGIN.is_absolute() or HISTORICAL_HOST_ORIGIN.resolve(strict=True)!=HISTORICAL_HOST_ORIGIN:fail('historical host context path is not canonical')
  for p in (HISTORICAL_HOST_ORIGIN/'package.json',HISTORICAL_HOST_ORIGIN/'bun.lock'):
   if p.is_symlink() or not p.is_file():fail('historical host package/lock must be regular files')
  def meta(args):
   if time.monotonic()>=deadline-30:fail('preflight deadline leaves no bounded cleanup window')
   cp=subprocess.run(['docker']+args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(8,deadline-time.monotonic()),check=False)
   if len(cp.stdout)+len(cp.stderr)>64*1024:fail('metadata command output exceeds64KiB')
   if cp.returncode:fail('metadata command failed: docker '+args[0]+' exit='+str(cp.returncode)+' stderr='+cp.stderr.decode(errors='replace')[:600])
   return cp.stdout.decode().strip()
  result['daemon']=meta(['info','--format','{{.OSType}}/{{.Architecture}}'])
  if result['daemon']!='linux/aarch64':fail('live Docker daemon differs from pinned linux/aarch64 observation')
  if meta(['image','inspect','--format','{{.Id}}',IMAGE])!=IMAGE:fail('pinned Python image ID absent/mismatched')
  if meta(['image','inspect','--format','{{.Os}}/{{.Architecture}}',IMAGE])!=PLATFORM:fail('pinned metadata image platform mismatch')
  for volume in (SOURCE_VOLUME,DEPENDENCY_VOLUME):meta(['volume','inspect','--format','{{.Name}}',volume])
  if meta(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']):fail('generated owner container name unexpectedly occupied')
  command=['docker','run','--pull=never','--platform='+PLATFORM,'--name',name,'--label','codex.g03.execution-id='+rid,'--label','codex.g03.kind=sdk058-dependency-metadata-preflight','--network=none','--read-only','--cap-drop=ALL','--cpus=2','--memory=4g','--pids-limit=2048','--tmpfs=/tmp:rw,nosuid,nodev,size=256m',
   '--mount','type=volume,source='+SOURCE_VOLUME+',target=/volume-producer,readonly',
   '--mount','type=volume,source='+DEPENDENCY_VOLUME+',target=/volume-producer/node_modules,readonly,volume-subpath='+DEPENDENCY_SUBPATH,
   '--mount','type=volume,source='+DEPENDENCY_VOLUME+',target=/dependency-origin,readonly',
   '--mount','type=bind,source='+str(OWNER)+',target=/operator,readonly',
   '--mount','type=bind,source='+str(out)+',target=/out',
   '--workdir=/volume-producer','--entrypoint=/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11',IMAGE,'-I','/operator/preflight.py','--guest','--out','/out']
  remaining=deadline-time.monotonic()
  if remaining<15:fail('preflight deadline insufficient to launch bounded metadata container')
  proc=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
  import selectors as _selectors
  sel=_selectors.DefaultSelector();files=[logs[0].open('xb'),logs[1].open('xb')]
  for i,s in enumerate((proc.stdout,proc.stderr)):os.set_blocking(s.fileno(),False);sel.register(s,_selectors.EVENT_READ,i)
  while sel.get_map() or proc.poll() is None:
   now=time.monotonic()
   if now>=deadline-60:failure='preflight-timeout';break
   for key,_ in sel.select(min(.15,max(.001,deadline-60-time.monotonic()))):
    try:block=os.read(key.fileobj.fileno(),65536)
    except BlockingIOError:continue
    if not block:sel.unregister(key.fileobj);continue
    raw+=len(block);allowed=max(0,RAW_CAP-kept);part=block[:allowed]
    if part:files[key.data].write(part);kept+=len(part)
    if len(part)<len(block):failure='preflight-raw-log-cap';break
   if failure:break
  if failure:
   try:os.killpg(proc.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:proc.wait(timeout=min(3,max(0,deadline-time.monotonic()-15)))
   except subprocess.TimeoutExpired:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
  else:proc.wait(timeout=max(.1,min(3,deadline-time.monotonic()-15)))
  result['dockerRunExitCode']=proc.poll()
  if proc.poll() not in (0,):
   launch_failure=f'docker run failed before metadata guest: exit={proc.poll()}'
   if failure is None:
    primary_failure=launch_failure;failure=launch_failure
   else:secondary_failures.append(launch_failure)
  if time.monotonic()<deadline-20:
   try:
    labels=json.loads(meta(['inspect','--format','{{json .Config.Labels}}',name]))
    config=meta(['inspect','--format','{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}',name])
    configured=json.loads(meta(['inspect','--format','{{json .HostConfig.Mounts}}',name]))
    mounts=json.loads(meta(['inspect','--format','{{json .Mounts}}',name]))
    result['containerLabels']=labels;result['containerConfig']=config
    result['configuredMountObservation']=configured;result['runtimeMountObservation']=mounts
    if labels.get('codex.g03.execution-id')!=rid or labels.get('codex.g03.kind')!='sdk058-dependency-metadata-preflight':fail('metadata container ownership label mismatch')
    if config!=IMAGE+'|none|true|2048|2000000000|4294967296':fail('metadata container resource/network/root limits differ from frozen profile')
    source_cfg=[m for m in configured if m.get('Type')=='volume' and m.get('Source')==SOURCE_VOLUME and m.get('Target')=='/volume-producer' and m.get('ReadOnly') is True]
    deps_cfg=[m for m in configured if m.get('Type')=='volume' and m.get('Source')==DEPENDENCY_VOLUME and m.get('Target')=='/volume-producer/node_modules' and m.get('ReadOnly') is True and m.get('VolumeOptions',{}).get('Subpath')==DEPENDENCY_SUBPATH]
    origin_cfg=[m for m in configured if m.get('Type')=='volume' and m.get('Source')==DEPENDENCY_VOLUME and m.get('Target')=='/dependency-origin' and m.get('ReadOnly') is True and not m.get('VolumeOptions',{}).get('Subpath')]
    source_live=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==SOURCE_VOLUME and m.get('Destination')=='/volume-producer' and m.get('RW') is False]
    deps_live=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==DEPENDENCY_VOLUME and m.get('Destination')=='/volume-producer/node_modules' and m.get('RW') is False]
    origin_live=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==DEPENDENCY_VOLUME and m.get('Destination')=='/dependency-origin' and m.get('RW') is False]
    if not all(len(x)==1 for x in (source_cfg,deps_cfg,origin_cfg,source_live,deps_live,origin_live)):fail('observed configured volume/subpath or runtime mount identity/read-only predicate failed')
   except BaseException as inspect_error:
    diagnostic=f'{type(inspect_error).__name__}: {str(inspect_error)[:400]}'
    result['inspectionFailure']=diagnostic
    if failure is None:failure='post-run inspection failed: '+diagnostic
    else:secondary_failures.append('post-run inspection failed: '+diagnostic)
 except BaseException as e:
  diagnostic=f'{type(e).__name__}: {str(e)[:240]}'
  if failure is None:failure=diagnostic;primary_failure=diagnostic
  else:secondary_failures.append(diagnostic)
 finally:
  if proc is not None and proc.poll() is None:
   try:os.killpg(proc.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:proc.wait(timeout=min(3,max(0,deadline-time.monotonic()-15)))
   except subprocess.TimeoutExpired:
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:proc.wait(timeout=max(.1,min(2,deadline-time.monotonic()-12)))
    except subprocess.TimeoutExpired:pass
  if sel is not None:
   try:sel.close()
   except BaseException:pass
  if proc is not None:
   for stream in (proc.stdout,proc.stderr):
    try:stream.close()
    except BaseException:pass
  for f in files:
   try:f.flush();os.fsync(f.fileno());f.close()
   except BaseException:pass
  try:
   if time.monotonic()<deadline:
    owned=subprocess.run(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',name],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(6,deadline-time.monotonic()),check=False)
    if owned.returncode==0 and owned.stdout.decode().strip()==rid:
     cp=subprocess.run(['docker','rm','--force',name],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(10,deadline-time.monotonic()),check=False)
     result['containerRemoveExitCode']=cp.returncode
    elif owned.returncode==1:result['containerRemoveExitCode']=0
    else:result['containerRemoveExitCode']=1
    chk=subprocess.run(['docker','ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=min(6,deadline-time.monotonic()),check=False)
    result['containerAbsent']=chk.returncode==0 and not chk.stdout.strip() and result.get('containerRemoveExitCode')==0
   else:result['containerAbsent']=False
  except BaseException as e:
   result['cleanupFailure']=type(e).__name__+': '+str(e)[:120]
   secondary_failures.append('cleanup failed: '+result['cleanupFailure'])
 if not result.get('containerAbsent') and failure is None:
  failure='owned metadata container cleanup/absence was not verified';primary_failure=failure
 if failure is not None and primary_failure is None:primary_failure=failure
 result['rawLogBytes']=raw;result['retainedLogBytes']=kept;result['failure']=failure;result['primaryFailure']=primary_failure;result['secondaryFailures']=secondary_failures;result['elapsedSeconds']=round(time.monotonic()-start,3)
 if failure and logs[1].exists():
  try:result['guestDiagnosticTail']=logs[1].read_text(errors='replace')[-1200:]
  except OSError:pass
 inventory_path=out/'dependency-view-inventory.json';metadata_path=out/'metadata-result.json'
 if not failure and result.get('containerAbsent'):
  try:
   inv_hash,inv_size,_=hash_regular(inventory_path,METADATA_CAP);meta_hash,meta_size,_=hash_regular(metadata_path,METADATA_CAP)
   inv=inventory_path.read_bytes();meta_raw=metadata_path.read_bytes()
   if len(inv)!=inv_size or sha_bytes(inv)!=inv_hash or len(meta_raw)!=meta_size or sha_bytes(meta_raw)!=meta_hash:fail('metadata output changed during physical readback')
   m=json.loads(meta_raw);i=json.loads(inv)
   if len(inv)+len(meta_raw)>METADATA_CAP:fail('public metadata output exceeds16MiB')
   if m.get('status')!='METADATA_PREFLIGHT_PASS' or i.get('inventorySha256')!=m.get('dependencyView',{}).get('inventorySha256'):fail('guest receipt/inventory binding mismatch')
   result['metadataReceiptSha256']=sha_bytes(meta_raw);result['inventoryFileSha256']=sha_bytes(inv);result['inventorySha256']=m['dependencyView']['inventorySha256'];result['inventoryBytes']=len(inv);result['metadataBytes']=len(meta_raw);result['status']='METADATA_PREFLIGHT_PASS'
  except BaseException as e:failure='output validation: '+type(e).__name__+': '+str(e)[:160];result['failure']=failure
 if time.monotonic()-start>TOTAL:result['status']='FAIL_OR_UNKNOWN';result['failure']=(result.get('failure') or '')+'; 180-second owner deadline exceeded'
 result['status']=result['status'] if result.get('status')=='METADATA_PREFLIGHT_PASS' else 'FAIL_OR_UNKNOWN'
 result_raw=(json.dumps(result,sort_keys=True,indent=2)+'\n').encode()
 if len(result_raw)>METADATA_CAP-len(result.get('metadataReceiptSha256','')):result_raw=b'{"profile":"'+PROFILE.encode()+b'","status":"FAIL_OR_UNKNOWN","failure":"owner receipt cap"}\n'
 atomic(out/'preflight-owner-result.json',result_raw)
 output_bytes=sum(p.stat().st_size for p in out.iterdir() if p.is_file() and not p.is_symlink())
 if output_bytes>METADATA_CAP:
  result_check={'profile':PROFILE,'status':'FAIL_OR_UNKNOWN','failure':f'inclusive public output exceeded16MiB at {output_bytes} bytes','evidencePublication':'refused'}
  atomic(out/'preflight-owner-result.json',(json.dumps(result_check,sort_keys=True)+'\n').encode())
 owner_hash,owner_bytes,_=hash_regular(out/'preflight-owner-result.json',64*1024)
 result_check=json.loads((out/'preflight-owner-result.json').read_bytes())
 print(json.dumps({'out':str(out),'status':result_check.get('status'),'failure':result_check.get('failure'),'inventorySha256':result_check.get('inventorySha256'),'metadataReceiptSha256':result_check.get('metadataReceiptSha256'),'inventoryFileSha256':result_check.get('inventoryFileSha256'),'ownerReceiptSha256':owner_hash,'ownerReceiptBytes':owner_bytes,'elapsedSeconds':result_check.get('elapsedSeconds')},sort_keys=True))
 return 0 if result_check.get('status')=='METADATA_PREFLIGHT_PASS' else 1

if __name__=='__main__':
 if '--guest' in sys.argv:
  a=sys.argv[1:];out=pathlib.Path(a[a.index('--out')+1]);guest(out)
 else:
  ap=argparse.ArgumentParser();ap.add_argument('--admission',type=pathlib.Path,required=True);ap.add_argument('--admission-sha256',required=True);a=ap.parse_args()
  raise SystemExit(host(a.admission,a.admission_sha256))
