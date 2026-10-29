#!/usr/bin/env python3
"""Guarded pinned Linux ARM Chromium run of the unchanged SDK G03 adapter."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, pathlib, stat, subprocess, sys, time, uuid
sys.dont_write_bytecode=True
os.environ['PYTHONDONTWRITEBYTECODE']='1'
ROOT=pathlib.Path('/private/tmp/g03-sdk058-parity-019'); CAPTURE=pathlib.Path('/private/tmp/sdk-057-local3600-public-h-operator-proposal011/run_public_h_docker.py')
CAPTURE_SHA='8e383bece7d44484421302f8be32fdb1ba1ed96cd895749093a58171648cf1cd'
SOURCE_VOLUME='umf-sdk058-source-855f6c486-001'; IMAGE='sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'; PLATFORM='linux/arm64'
BUN=pathlib.Path('/private/tmp/g03-linux-arm-bun143-001/bun'); BUN_SHA='029ece746ac9f970c76d8f48bdd1b1d0c52f3636b74d19f546f5e7c1165c0abe'
BUN_RECEIPT_SHA='9414f1649385221c6640f1a9c59ecd3b4e0c5bac900d9864127106d7c6bfdd5f'; BUN_STARTUP_SHA='3fcc5a52f7f447dc6fd229847a5f0f26fd88f92f383c4e08e077b7fd3fa01896'
PW_ROOT=pathlib.Path('/private/tmp/g03-sdk-playwright163-linux-export-001/packages'); PW_RECEIPT=pathlib.Path('/private/tmp/g03-sdk-playwright163-linux-export-001/export-receipt.json')
PW_SHA='e6d4741f8c96bea601637b427fb27171996a4c739b155d89bdeb0963b9e8b822'
CHROMIUM='/ms-playwright/chromium-1243/chrome-linux-arm64/chrome'; CHROMIUM_SHA='839efe5fd8b6a773dd81b2e10afdc15f3c0a17316fb82b5908c0533306c4ed9e'
TOTAL=1800; RESERVE=60; STOP=10; CHILD=600; LOG_CAP=1024*1024; EVIDENCE_CAP=16*1024*1024
SOURCE_TS_SHA='136e43410f5d58e7259cc0edc23ff1e20e59ef0e16ccf5789031e5868ce32805'


def fail(s):raise RuntimeError(s)
def canonical(p):
 p=pathlib.Path(p)
 if not p.is_absolute() or p.absolute()!=p or p.resolve(strict=True)!=p:fail('noncanonical or symlink path: '+str(p))
 cur=p
 while cur!=cur.parent:
  if cur.is_symlink():fail('symlink component: '+str(cur))
  cur=cur.parent
 return p
def hashfile(p,cap):
 st=p.lstat()
 if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>cap:fail('unsafe/oversized file: '+str(p))
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  for b in iter(lambda:f.read(65536),b''):
   n+=len(b)
   if n>cap:fail('file grew beyond cap')
   h.update(b)
 st2=p.lstat()
 if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns) or n!=st.st_size:fail('file changed during hashing')
 return h.hexdigest(),n
def metadata(argv,timeout=15):
 cp=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False)
 if len(cp.stdout)+len(cp.stderr)>128*1024 or cp.returncode:fail('bounded metadata command failed: '+argv[0])
 return cp.stdout.decode().strip()
def tree_inventory(root):
 rows=[];total=0
 for base,dirs,files in os.walk(root,followlinks=False):
  for d in dirs:
   if (pathlib.Path(base)/d).is_symlink():fail('symlink in Playwright export')
  for n in files:
   p=pathlib.Path(base)/n;h,size=hashfile(p,4*1024*1024);total+=size
   if total>24*1024*1024:fail('Playwright export exceeds bound')
   rows.append({'path':p.relative_to(root).as_posix(),'bytes':size,'sha256':h})
 return sorted(rows,key=lambda r:r['path']),total
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--sdk-inputs',required=True,type=pathlib.Path);ap.add_argument('--sdk-inputs-sha256',required=True);ap.add_argument('--admission',required=True,type=pathlib.Path);ap.add_argument('--admission-sha256',required=True);ap.add_argument('--python-result',required=True,type=pathlib.Path);ap.add_argument('--sdk-install-host',required=True,type=pathlib.Path);ap.add_argument('--sdk-archive-host',required=True,type=pathlib.Path);a=ap.parse_args()
 start=float(os.environ.get('G03_OWNER_START',time.monotonic()));owner_deadline=float(os.environ.get('G03_OWNER_DEADLINE',start+1800));rid=uuid.uuid4().hex;run=ROOT/'browser-runs'/rid;run.mkdir(parents=True);outer=run/'outer';outer.mkdir();out=run/'out';out.mkdir()
 container='g03-sdk058-arm-browser-'+rid[:14];owned=False;status='FAIL_OR_UNKNOWN';failure=None;result={'profile':'umf.g03-sdk058-browser-operator/1','executionId':rid,'status':status,'image':IMAGE,'platform':PLATFORM,'limits':{'aggregateSeconds':TOTAL,'reserveSeconds':RESERVE,'stopGraceSeconds':STOP,'browserChildSeconds':CHILD,'logsBytes':LOG_CAP,'evidenceBytes':EVIDENCE_CAP}}
 try:
  for p in (ROOT,CAPTURE,BUN,PW_ROOT,PW_RECEIPT,a.sdk_inputs,a.admission,a.python_result,a.sdk_install_host,a.sdk_archive_host):canonical(p)
  if hashfile(CAPTURE,256*1024)[0]!=CAPTURE_SHA:fail('capture helper source changed')
  if hashfile(BUN,100*1024*1024)[0]!=BUN_SHA:fail('official ARM Bun executable digest mismatch')
  bun_receipt=json.loads((BUN.parent/'receipt.json').read_bytes());startup=json.loads((BUN.parent/'startup-receipt.json').read_bytes())
  if hashfile(BUN.parent/'receipt.json',1024*1024)[0]!=BUN_RECEIPT_SHA or hashfile(BUN.parent/'startup-receipt.json',1024*1024)[0]!=BUN_STARTUP_SHA:fail('Bun acquisition/startup receipt digest mismatch')
  if bun_receipt.get('binary',{}).get('path')!=str(BUN) or bun_receipt.get('binary',{}).get('sha256')!=BUN_SHA or bun_receipt.get('binary',{}).get('elfMachine')!=183:fail('Bun receipt is not the retained AArch64 executable')
  if (bun_receipt.get('releaseTag')!='bun-v1.4.3' or bun_receipt.get('publisherChecksumMatched') is not True or bun_receipt.get('apiDigestMatched') is not True or
      startup.get('startup',{}).get('version')!='1.4.3' or startup.get('startup',{}).get('imageId')!=IMAGE or startup.get('startup',{}).get('network')!='none' or
      startup.get('startup',{}).get('platform')!='linux/arm64' or startup.get('startup',{}).get('exitCode')!=0 or startup.get('startup',{}).get('ownedContainerAbsent') is not True):fail('Bun acquisition/startup receipts do not match pinned isolated ARM inputs')
  if hashfile(PW_RECEIPT,4*1024*1024)[0]!=PW_SHA:fail('Playwright export receipt digest mismatch')
  receipt=json.loads(PW_RECEIPT.read_bytes())
  if receipt.get('profile')!='umf.g03-linux-portable-playwright-input/1' or receipt.get('version')!='1.63.0' or receipt.get('fileCount')!=176 or receipt.get('totalBytes')!=18547881:fail('portable Playwright export identity mismatch')
  for name in ('playwright','playwright-core'):
   meta=json.loads((PW_ROOT/name/'package.json').read_bytes())
   if meta.get('name')!=name or meta.get('version')!='1.63.0':fail('portable Playwright package version mismatch: '+name)
  actual,total=tree_inventory(PW_ROOT)
  expected=sorted(({'path':r['path'],'bytes':r['bytes'],'sha256':r['sha256']} for r in receipt['files']),key=lambda row:row['path'])
  if actual!=expected or total!=receipt['totalBytes']:fail('Playwright package file roster/hash closure mismatch')
  pw_inventory_sha=hashlib.sha256(json.dumps(actual,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  ah,_=hashfile(a.admission,256*1024)
  if ah!=a.admission_sha256:fail('root admission hash mismatch')
  admission=json.loads(a.admission.read_bytes())
  ph,pn=hashfile(a.sdk_inputs,128*1024)
  if ph!=a.sdk_inputs_sha256 or admission.get('browserPacketSha256')!=ph or admission.get('status')!='ROOT_ADMITTED':fail('root admission does not bind immutable browser packet')
  raw=a.sdk_inputs.read_bytes()
  if len(raw)!=pn or hashlib.sha256(raw).hexdigest()!=ph:fail('SDK/browser packet changed during read')
  pkt=json.loads(raw)
  if pkt.get('status')!='PENDING_SOL_SOURCE_REVIEW':fail('immutable browser packet is not the reviewed pending preimage')
  review_path=canonical(admission['sourceReviewPath'])
  if hashfile(review_path,2*1024*1024)[0]!=admission.get('sourceReviewSha256'):fail('external source review digest mismatch')
  if pkt.get('profile')!='umf.g03-sdk058-browser-inputs/1' or pkt.get('status')!='PENDING_SOL_SOURCE_REVIEW':fail('SDK/browser immutable packet profile/status mismatch')
  if pkt.get('producer')!={'commit':'855f6c48649496fc60b3303798790d0ddb55d38f','tree':'53f2bfffbc0c5780e79d76d8fd3d202239d088b2','volume':SOURCE_VOLUME}:fail('browser producer P/tree mismatch')
  sdk=pkt.get('sdk',{})
  if sdk.get('archivePath')!='/tmp/umf-source/.cache/sdk-distribution/umf-sdk.tgz' or sdk.get('installPath')!='/out/sdk-install':fail('SDK custody path identity differs from reviewed path')
  archive_sha,archive_size=hashfile(a.sdk_archive_host,512*1024*1024)
  if str(a.sdk_archive_host)!=sdk.get('archiveHostPath') or str(a.sdk_install_host)!=sdk.get('installHostPath'):fail('host SDK custody path differs from the frozen packet')
  if archive_sha!=sdk.get('archiveSha256') or archive_size!=sdk.get('archiveSizeBytes'):fail('actual SDK archive digest/size mismatch')
  distribution_manifest=a.sdk_archive_host.parent/'manifest.json'
  if hashfile(distribution_manifest,4*1024*1024)!=(sdk.get('distributionManifestSha256'),sdk.get('distributionManifestSizeBytes')):fail('producer distribution manifest digest/size mismatch')
  dist_names={p.name for p in a.sdk_archive_host.parent.iterdir()}
  if dist_names!={'manifest.json','umf-sdk.tgz'}:fail('SDK distribution source mount contains an unexpected entry')
  install=a.sdk_install_host
  cust=install/'g03-sdk-install-custody.json';ch,cn=hashfile(cust,4*1024*1024);cr=json.loads(cust.read_bytes())
  if ch!=sdk.get('installCustodySha256') or ch!=sdk.get('custodyReceiptSha256') or cr.get('archivePath')!='/tmp/umf-source/.cache/sdk-distribution/umf-sdk.tgz' or cr.get('archiveSha256')!=archive_sha or cr.get('installedPackageRoot')!='/out/sdk-install/node_modules/@umf/core' or cr.get('existing139ConsumerChecks')!='passed':fail('139-consumer SDK custody receipt is not exact')
  if hashfile(a.python_result,128*1024)[1]>128*1024:fail('Python result exceeds metadata cap')
  python_result=json.loads(a.python_result.read_bytes())
  if python_result.get('status')!='PASS_LOCAL_FINAL18_G03_PYTHON_PARITY' or python_result.get('producer')!=pkt.get('producer'):fail('paired final18 Python report is not passing for the same producer P')
  expected_cohort={'selectedLockSha256':'cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274','indexSha256':'78026c05d3824613f0e2a3bf30cf24bd32af24de1d560f0b7fa555a1e75f8d60','mirrorManifestSha256':'809a418b9f6f97e403e3fbcc7066d23657347d1323efb6baf2d4d3bb3f17bd36','requirementsSha256':'4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51','custodySha256':'95e9493f06adefb323193f9d8fbe5577ebfa335140a9841f549d2caf098df8ed'}
  if python_result.get('cohort')!=expected_cohort:fail('Python result cohort does not match exact final18 pins')
  # Require the corpus/report paths to be members of the completed Python run and bind their physical bytes.
  pyroot=a.python_result.parent
  corpus=canonical(pyroot/'g03-corpus.json'); report=canonical(pyroot/'g03-python-report.json')
  if not corpus.is_file() or not report.is_file():fail('paired G03 corpus/report missing')
  if hashlib.sha256(corpus.read_bytes()).hexdigest()!=python_result.get('g03CorpusSha256'):fail('Python result does not bind shared corpus bytes')
  if hashfile(report,8*1024*1024)[0]!=python_result.get('pythonReportSha256'):fail('Python report digest differs from Python result')
  if metadata(['docker','image','inspect','--format','{{.Id}}',IMAGE])!=IMAGE or metadata(['docker','image','inspect','--format','{{.Os}}/{{.Architecture}}',IMAGE])!=PLATFORM:fail('pinned ARM browser image mismatch')
  if metadata(['docker','volume','inspect','--format','{{.Name}}',SOURCE_VOLUME])!=SOURCE_VOLUME:fail('exact source volume missing')
  if metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}']):fail('owned browser container name occupied')
  helper_spec=importlib.util.spec_from_file_location('capture',CAPTURE);helper=importlib.util.module_from_spec(helper_spec);helper_spec.loader.exec_module(helper)
  archive_container='/tmp/umf-source/.cache/sdk-distribution/umf-sdk.tgz'; install_container='/out/sdk-install'
  argv=['docker','run','--pull=never','--platform='+PLATFORM,'--name',container,'--label','codex.g03.execution-id='+rid,'--read-only','--network=none','--cpus=4','--memory=8g','--pids-limit=8192','--tmpfs=/tmp:rw,nosuid,nodev,exec,size=1g',
   '--mount',f'type=volume,source={SOURCE_VOLUME},target=/volume-producer,readonly','--mount',f'type=bind,source={PW_ROOT},target=/volume-producer/node_modules,readonly','--mount',f'type=bind,source={review_path},target=/source-review.md,readonly',
   '--mount',f'type=bind,source={corpus},target=/inputs/g03-corpus.json,readonly','--mount',f'type=bind,source={report},target=/inputs/g03-python-report.json,readonly',
   '--mount',f'type=bind,source={a.sdk_archive_host.parent},target=/tmp/umf-source/.cache/sdk-distribution,readonly','--mount',f'type=bind,source={install},target={install_container},readonly','--mount',f'type=bind,source={out},target=/result',
   '-e','HOME=/tmp/home','-e','BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-cache','-e','UMF_G03_SDK_INSTALL='+install_container,'-e','UMF_G03_SDK_ARCHIVE='+archive_container,'-e','UMF_CHROMIUM_PATH='+CHROMIUM,'--workdir=/volume-producer',IMAGE,'/tools/bun','scripts/g03-sdk-browser.ts','/inputs/g03-corpus.json','/inputs/g03-python-report.json','/result/g03-sdk-browser-report.json']
  # Mount Bun read-only at its fixed guest path after the pinned image and environment have been checked.
  argv[argv.index('--workdir=/volume-producer'):argv.index(IMAGE)]=['--mount',f'type=bind,source={BUN},target=/tools/bun,readonly','--workdir=/volume-producer']
  preflight="mkdir -p /tmp/home /tmp/bun-cache; test \"$(uname -m)\" = aarch64; test \"$(sha256sum /source-review.md | cut -d' ' -f1)\" = \"%s\"; test \"$(sha256sum scripts/g03-sdk-browser.ts | cut -d' ' -f1)\" = \"%s\"; test \"$(sha256sum /tools/bun | cut -d' ' -f1)\" = \"%s\"; test \"$(sha256sum %s | cut -d' ' -f1)\" = \"%s\"; test \"$(/tools/bun --version)\" = 1.4.3; /tools/bun scripts/g03-sdk-browser.ts /inputs/g03-corpus.json /inputs/g03-python-report.json /result/g03-sdk-browser-report.json"%(admission['sourceReviewSha256'],SOURCE_TS_SHA,BUN_SHA,CHROMIUM,CHROMIUM_SHA)
  argv[-5:]=['sh','-euc',preflight]
  helper.OUTER_STREAM_LIMIT=max(1,int(os.environ.get('G03_OUTER_LOG_CAP',LOG_CAP//4))//2)
  helper.stop_owned=lambda name: subprocess.run(['docker','stop','--time',str(STOP),container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=STOP+5,check=False) if name==container else None
  proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);owned=True
  captured=helper.bounded_capture(proc,outer,container,min(owner_deadline-60,time.monotonic()+CHILD-STOP-5),prefix='browser');closure=helper.verify_outer_capture(captured)
  if proc.poll() is None:proc.wait(timeout=STOP+5)
  label=metadata(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',container],5)
  if label!=rid:fail('browser container ownership label mismatch')
  config=metadata(['docker','inspect','--format','{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}',container],5)
  if config!=IMAGE+'|none|true|8192|4000000000|8589934592':fail('browser container resource/network/root limits differ from profile')
  mounts=json.loads(metadata(['docker','inspect','--format','{{json .Mounts}}',container],5))
  required=[('/volume-producer',SOURCE_VOLUME,'volume',False),('/volume-producer/node_modules',str(PW_ROOT),'bind',False),('/tmp/umf-source/.cache/sdk-distribution',str(a.sdk_archive_host.parent),'bind',False),('/out/sdk-install',str(install),'bind',False),('/result',str(out),'bind',True),('/tools/bun',str(BUN),'bind',False),('/inputs/g03-corpus.json',str(corpus),'bind',False),('/inputs/g03-python-report.json',str(report),'bind',False),('/source-review.md',str(review_path),'bind',False)]
  for target,source,kind,rw in required:
   def matches(m):
    identity=(m.get('Name')==source) if kind=='volume' else (m.get('Source')==source)
    return m.get('Destination')==target and identity and m.get('Type')==kind and m.get('RW') is rw
   if len([m for m in mounts if matches(m)])!=1:fail('browser mount custody mismatch at '+target)
  result['containerConfig']=config;result['containerMounts']=[{'type':m.get('Type'),'name':m.get('Name'),'source':m.get('Source'),'destination':m.get('Destination'),'rw':m.get('RW')} for m in mounts]
  if proc.returncode or captured.get('timedOut') or captured.get('drainExpired') or captured.get('captureFailed') or any(captured.get('truncated',[])) or not closure.get('verified'):fail('browser container/capture did not close')
  actual_after,pw_after=tree_inventory(PW_ROOT)
  if actual_after!=actual or pw_after!=total:fail('portable Playwright file roster changed during browser route')
  out_report=out/'g03-sdk-browser-report.json'
  if not out_report.is_file():fail('browser adapter did not emit report')
  browser=json.loads(out_report.read_bytes())
  if browser.get('profile')!='umf.sdk-g03-browser-parity/0.1' or browser.get('sdkVersion')!='0.5.8' or browser.get('browser')!='153.0.8010.12' or browser.get('sdkInputs',{}).get('archiveSha256')!=archive_sha or browser.get('sdkInputs',{}).get('installReceiptSha256')!=ch or browser.get('sdkInputs',{}).get('corpusSha256')!=python_result['g03CorpusSha256'] or browser.get('sdkInputs',{}).get('pythonReportSha256')!=python_result['pythonReportSha256'] or browser.get('externalRequests')!=[]:fail('browser report identity/parity/external-request condition mismatch')
  source_hashes=browser.get('sdkInputs',{}).get('sourceHashes',{})
  for row in pkt.get('sourceFiles',[]):
   if row.get('path') in source_hashes and source_hashes[row['path']]!=row.get('sha256'):fail('browser source hash mismatch: '+str(row.get('path')))
  if source_hashes.get('scripts/g03-sdk-browser.ts')!=SOURCE_TS_SHA:fail('browser adapter source hash mismatch')
  out_files,out_bytes=tree_inventory(out)
  if out_bytes>EVIDENCE_CAP or {r['path'] for r in out_files}!={'g03-sdk-browser-report.json'}:fail('browser output evidence roster/cap mismatch')
  result.update(status='PASS_LOCAL_G03_INSTALLED_SDK_CHROMIUM_PARITY',sdkInputsSha256=ph,browserOutputFiles=out_files,browserOutputBytes=out_bytes,sdkArchiveSha256=archive_sha,sdkInstallCustodySha256=ch,pythonCorpusSha256=python_result['g03CorpusSha256'],playwrightReceiptSha256=PW_SHA,playwrightRosterSha256=pw_inventory_sha,browserReportSha256=hashfile(out_report,8*1024*1024)[0],browser=browser,outerCapture=captured,outerClosure=closure)
 except BaseException as e:failure=type(e).__name__+': '+str(e)[:300]
 finally:
  cleanup={'daemonReachable':False,'containerRemoved':False,'containerAbsent':False,'verified':False}
  try:
   cleanup['daemonReachable']=bool(metadata(['docker','info','--format','{{.OSType}}/{{.Architecture}}'],5))
   if cleanup['daemonReachable'] and owned:
    names=metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],5).splitlines()
    if names==[container]:cleanup['containerRemoved']=subprocess.run(['docker','rm','--force',container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15).returncode==0
   cleanup['containerAbsent']=not metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],5).splitlines()
   cleanup['verified']=cleanup['daemonReachable'] and cleanup['containerAbsent'] and (not owned or cleanup['containerRemoved'])
  except BaseException as e:cleanup['error']=type(e).__name__+': '+str(e)[:160]
  result['cleanup']=cleanup
  if failure:result['failure']=failure
  if result.get('status','').startswith('PASS') and not cleanup['verified']:result['status']='FAIL_OR_UNKNOWN';result['failure']='owned container cleanup did not close'
  result['elapsedSeconds']=round(time.monotonic()-start,3)
  if result['elapsedSeconds']>TOTAL-RESERVE and result.get('status','').startswith('PASS'):result['status']='FAIL_OR_UNKNOWN';result['failure']='aggregate deadline exceeded'
  files,total=tree_inventory(run)
  if total>EVIDENCE_CAP:result['status']='FAIL_OR_UNKNOWN';result['failure']='browser evidence closure exceeds 16 MiB'
  result['runFilesBeforeReceipt']=files;result['runEvidenceBytesBeforeReceipt']=total
  with (run/'operator-result.json').open('xb') as f:f.write((json.dumps(result,sort_keys=True,indent=2)+'\n').encode());f.flush();os.fsync(f.fileno())
 print(json.dumps({'run':str(run),'status':result['status'],'failure':result.get('failure')},sort_keys=True))
 return 0 if result['status'].startswith('PASS') else 1
if __name__=='__main__':raise SystemExit(main())
