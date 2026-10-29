#!/usr/bin/env python3
"""Local Linux launcher for the bounded final18 G03 Python guest; no release/publication."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, pathlib, shutil, stat, subprocess, sys, time, uuid
sys.dont_write_bytecode=True
os.environ['PYTHONDONTWRITEBYTECODE']='1'
ROOT=pathlib.Path('/private/tmp/g03-sdk058-parity-018'); RUNTIME=ROOT/'runtime'
SOURCE_VOLUME='umf-sdk058-source-855f6c486-001'; DEPENDENCY_VOLUME='umf-migration-source-267675510'; DEPENDENCY_SUBPATH='node_modules'; DEPENDENCY_OUTPUT=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight/out'); DEPENDENCY_PREFLIGHT=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight/preflight.py'); DEPENDENCY_CENSUS=pathlib.Path('/private/tmp/g03-sdk058-parity-009-preflight/runtime-import-census.json'); DEPENDENCY_REVIEW=pathlib.Path('/private/tmp/g03-sdk058-dependency-preflight009-sol-actual-review001.md'); IMAGE='sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PLATFORM='linux/amd64'; TOTAL=1200; RESERVE=60; STOP=10; LOG_CAP=1024*1024; EVIDENCE_CAP=16*1024*1024
CAPTURE=pathlib.Path('/private/tmp/sdk-057-local3600-public-h-operator-proposal011/run_public_h_docker.py')
CAPTURE_SHA='8e383bece7d44484421302f8be32fdb1ba1ed96cd895749093a58171648cf1cd'
COHORT=pathlib.Path('/private/tmp/g03-final-cohort-056-linux311-001')
GENERIC_INPUT_ROOT=pathlib.Path('/private/tmp/g03-sdk058-parity015-input')
GENERIC_LOCK=GENERIC_INPUT_ROOT/'derived-single-cell-lock.json'; GENERIC_PROVENANCE=GENERIC_INPUT_ROOT/'provenance.json'
TOOL_INPUT_ROOT=pathlib.Path('/private/tmp/g03-packaging250-tool-input-001')
TOOL_CONTROL_ROOT=pathlib.Path('/private/tmp/g03-sdk058-packaging-tool-control-source-004')
TOOL_ACTUAL_ROOT=pathlib.Path('/private/tmp/g03-sdk058-packaging-tool-control-actual-002')
TOOL_FILES={
 'qualificationToolWheelSha256':TOOL_INPUT_ROOT/'packaging-25.0-py3-none-any.whl',
 'qualificationToolLockSha256':TOOL_INPUT_ROOT/'requirements.lock',
 'qualificationToolStaticAuditSha256':TOOL_INPUT_ROOT/'static-audit.json',
 'qualificationToolAcquisitionSha256':TOOL_INPUT_ROOT/'acquisition.json',
 'qualificationToolAcquisitionSourceSha256':TOOL_INPUT_ROOT/'acquire.py',
 'qualificationToolPypiMetadataSha256':TOOL_INPUT_ROOT/'pypi-metadata.json',
 'qualificationToolInputReviewSha256':pathlib.Path('/private/tmp/g03-packaging250-tool-input001-sol-review001.md'),
 'qualificationToolControlReadmeSha256':TOOL_CONTROL_ROOT/'README.md',
 'qualificationToolControlBootstrapSha256':TOOL_CONTROL_ROOT/'bootstrap.py',
 'qualificationToolControlProbeSha256':TOOL_CONTROL_ROOT/'probe.py',
 'qualificationToolControlRunSha256':TOOL_CONTROL_ROOT/'run.py',
 'qualificationToolControlManifestSha256':TOOL_CONTROL_ROOT/'source-manifest.json',
 'qualificationToolControlBindingSha256':TOOL_CONTROL_ROOT/'binding.json',
 'qualificationToolControlSumsSha256':TOOL_CONTROL_ROOT/'SHA256SUMS',
 'qualificationToolControlSourceReviewSha256':pathlib.Path('/private/tmp/g03-sdk058-packaging-tool-control004-sol-source-review001.md'),
 'qualificationToolPlanSha256':pathlib.Path('/private/tmp/g03-sdk058-parity017-sol-isolated-tool-plan002.md'),
 'qualificationToolIntegrationPlanSha256':pathlib.Path('/private/tmp/g03-sdk058-parity017-sol-accepted-tool-integration-plan003.md'),
 'qualificationToolGlobalFailureSha256':pathlib.Path('/private/tmp/g03-sdk058-global-packaging-metadata-003/result.json'),
 'qualificationToolRuntimeObservationSha256':pathlib.Path('/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json'),
 'qualificationToolRuntimeReviewSha256':pathlib.Path('/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md'),
 'qualificationToolControlOwnerSha256':TOOL_ACTUAL_ROOT/'owner-result.json',
 'qualificationToolControlReportSha256':TOOL_ACTUAL_ROOT/'tool-result.json',
 'qualificationToolControlActualReviewSha256':pathlib.Path('/private/tmp/g03-sdk058-packaging-tool-control-actual002-sol-review001.md'),
}


def fail(s):raise RuntimeError(s)
def canonical(p):
 p=pathlib.Path(p)
 if not p.is_absolute() or p.absolute()!=p or p.resolve(strict=True)!=p:fail('noncanonical or symlink path: '+str(p))
 cur=p
 while cur!=cur.parent:
  if cur.is_symlink():fail('symlink path component: '+str(cur))
  cur=cur.parent
 return p
def hashfile(p,cap):
 st=p.lstat()
 if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_size>cap:fail('unsafe/oversized file '+str(p))
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  for b in iter(lambda:f.read(65536),b''):
   n+=len(b)
   if n>cap:fail('hash cap exceeded')
   h.update(b)
 st2=p.lstat()
 if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns) or n!=st.st_size:fail('file changed during hash')
 return h.hexdigest(),n
def inventory(root,cap):
 rows=[];total=0
 for base,dirs,files in os.walk(root,followlinks=False):
  for d in dirs:
   if (pathlib.Path(base)/d).is_symlink():fail('symlink in output tree')
  for n in files:
   q=pathlib.Path(base)/n;h,size=hashfile(q,cap);total+=size
   if total>cap:fail('output evidence cap exceeded')
   rows.append({'path':q.relative_to(root).as_posix(),'sizeBytes':size,'sha256':h})
 return sorted(rows,key=lambda r:r['path']),total
def metadata(argv,timeout=15):
 cp=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False)
 if len(cp.stdout)+len(cp.stderr)>128*1024:fail('metadata output cap')
 if cp.returncode:fail('metadata command failed: '+argv[0])
 return cp.stdout.decode().strip()

def verify_qualification_tool(admission):
 observed={}
 caps={'qualificationToolWheelSha256':1024*1024,'qualificationToolControlOwnerSha256':256*1024,
       'qualificationToolControlReportSha256':256*1024,'qualificationToolGlobalFailureSha256':256*1024}
 for key,path in TOOL_FILES.items():
  canonical(path)
  digest,size=hashfile(path,caps.get(key,2*1024*1024))
  if digest!=admission.get(key):fail('root admission does not bind qualification-tool input '+key)
  observed[key]={'path':str(path),'sha256':digest,'sizeBytes':size}
 expected_input={'packaging-25.0-py3-none-any.whl','requirements.lock','static-audit.json','acquisition.json','pypi-metadata.json','acquire.py'}
 if {x.name for x in TOOL_INPUT_ROOT.iterdir()}!=expected_input or any(x.is_symlink() or not x.is_file() for x in TOOL_INPUT_ROOT.iterdir()):
  fail('qualification-tool input directory differs from exact six-file roster')
 expected_control={'README.md','bootstrap.py','probe.py','run.py','source-manifest.json','binding.json','SHA256SUMS'}
 if {x.name for x in TOOL_CONTROL_ROOT.iterdir()}!=expected_control or any(x.is_symlink() or not x.is_file() for x in TOOL_CONTROL_ROOT.iterdir()):
  fail('qualification-tool control directory differs from exact seven-file roster')
 control_manifest=json.loads((TOOL_CONTROL_ROOT/'source-manifest.json').read_bytes())
 control_binding=json.loads((TOOL_CONTROL_ROOT/'binding.json').read_bytes())
 if (control_binding.get('sourceManifestSha256')!=hashfile(TOOL_CONTROL_ROOT/'source-manifest.json',256*1024)[0] or
     control_binding.get('status')!='SOURCE_PREPARED_PENDING_SOL_REVIEW' or len(control_manifest.get('files',[]))!=4):
  fail('frozen qualification-tool source closure/binding mismatch')
 for row in control_manifest['files']:
  path=pathlib.Path(row['path']);digest,size=hashfile(path,256*1024)
  if digest!=row.get('sha256') or size!=row.get('sizeBytes'):fail('frozen qualification-tool source changed: '+str(path))
 owner=json.loads((TOOL_ACTUAL_ROOT/'owner-result.json').read_bytes())
 report=json.loads((TOOL_ACTUAL_ROOT/'tool-result.json').read_bytes())
 report_sha=observed['qualificationToolControlReportSha256']['sha256']
 if (owner.get('status')!='PASS_METADATA_ONLY' or owner.get('containerAbsent') is not True or
     owner.get('toolReport',{}).get('sha256')!=report_sha or
     report.get('status')!='PASS_METADATA_ONLY' or report.get('wheelSha256')!='29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484' or
     report.get('packagingInventorySha256')!='5f7b4d4b87ed51ef2006d6ae801851c275dae4354385457bac21f139be70a71f' or
     report.get('selectedDistributionCount')!=18 or report.get('checkedRequirementCount')!=72 or
     report.get('productModulesImported') is not False or report.get('productDistributionsInstalled') is not False):
  fail('accepted packaging-tool owner/report are not a closed metadata-only PASS')
 return observed
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--inputs',required=True,type=pathlib.Path);ap.add_argument('--inputs-sha256',required=True);ap.add_argument('--admission',required=True,type=pathlib.Path);ap.add_argument('--admission-sha256',required=True);a=ap.parse_args()
 start=float(os.environ.get('G03_OWNER_START',time.monotonic()));owner_deadline=float(os.environ.get('G03_OWNER_DEADLINE',start+1800));ROOT.joinpath('runs').mkdir(exist_ok=True);rid=uuid.uuid4().hex;run=ROOT/'runs'/rid;run.mkdir();guest=run/'guest';guest.mkdir();outer=run/'outer';outer.mkdir()
 container='g03-sdk058-py-'+rid[:16]; volume='g03-sdk058-pyvenv-'+rid[:16]; owned=False; vowned=False; status='FAIL_OR_UNKNOWN'; failure=None
 result={'profile':'umf.g03-sdk058-python-operator/1','executionId':rid,'status':status,'sourceVolume':SOURCE_VOLUME,'image':IMAGE,'platform':PLATFORM,
  'limits':{'aggregateSeconds':TOTAL,'reserveSeconds':RESERVE,'stopGraceSeconds':STOP,'childSeconds':180,'logsBytes':LOG_CAP,'evidenceBytes':EVIDENCE_CAP},'cleanup':{}}
 try:
  for p in (ROOT,RUNTIME,a.inputs,a.admission,CAPTURE,COHORT,GENERIC_INPUT_ROOT,GENERIC_LOCK,GENERIC_PROVENANCE,DEPENDENCY_OUTPUT,DEPENDENCY_PREFLIGHT,DEPENDENCY_CENSUS,DEPENDENCY_REVIEW,TOOL_INPUT_ROOT,TOOL_CONTROL_ROOT,TOOL_ACTUAL_ROOT):canonical(p)
  ah,_=hashfile(a.admission,256*1024)
  if ah!=a.admission_sha256:fail('root admission hash mismatch')
  admission=json.loads(a.admission.read_bytes())
  for key,path in (('genericProbeLockSha256',GENERIC_LOCK),('genericProbeProvenanceSha256',GENERIC_PROVENANCE)):
   digest,size=hashfile(path,256*1024)
   if digest!=admission.get(key):fail('root admission does not bind derived generic probe input '+key)
  qualification_inputs=verify_qualification_tool(admission)
  dependency_files={'dependencyInventoryFileSha256':DEPENDENCY_OUTPUT/'dependency-view-inventory.json','dependencyMetadataReceiptSha256':DEPENDENCY_OUTPUT/'metadata-result.json','dependencyOwnerReceiptSha256':DEPENDENCY_OUTPUT/'preflight-owner-result.json','dependencyPreflightSourceSha256':DEPENDENCY_PREFLIGHT,'dependencyCensusSha256':DEPENDENCY_CENSUS,'dependencyInputReviewSha256':DEPENDENCY_REVIEW}
  byte_keys={'dependencyInventoryFileSha256':'dependencyInventoryFileBytes','dependencyMetadataReceiptSha256':'dependencyMetadataReceiptBytes','dependencyOwnerReceiptSha256':'dependencyOwnerReceiptBytes'}
  for key,path in dependency_files.items():
   canonical(path)
   digest,size=hashfile(path,8*1024*1024)
   if digest!=admission.get(key):fail('root admission does not bind dependency input '+key)
   if key in byte_keys and size!=admission.get(byte_keys[key]):fail('root admission does not bind dependency input size '+byte_keys[key])
  for key in ('dependencyPlanSha256','mountpointPreparationReceiptSha256','mountpointPreparationReviewSha256','mountConfigControlReceiptSha256','mountConfigControlReviewSha256','parity005OwnerFailureSha256'):
   if not isinstance(admission.get(key),str) or len(admission[key])!=64:fail('root admission omits required dependency lineage '+key)
  if admission.get('dependencyVolume')!=DEPENDENCY_VOLUME or admission.get('dependencySubpath')!=DEPENDENCY_SUBPATH or admission.get('dependencyOriginMount')!='whole-volume-readonly-at-/dependency-origin':fail('dependency volume/subpath identity mismatch')
  h,n=hashfile(a.inputs,128*1024)
  if h!=a.inputs_sha256 or admission.get('pythonPacketSha256')!=h or admission.get('status')!='ROOT_ADMITTED':fail('root admission does not bind immutable Python packet')
  review_path=canonical(admission['sourceReviewPath'])
  if hashfile(review_path,2*1024*1024)[0]!=admission.get('sourceReviewSha256'):fail('external source review digest mismatch')
  with a.inputs.open('rb') as stream:raw=stream.read(128*1024+1)
  if len(raw)!=n or hashlib.sha256(raw).hexdigest()!=a.inputs_sha256:fail('frozen packet changed during read')
  packet=json.loads(raw)
  if packet.get('status')!='PENDING_SOL_SOURCE_REVIEW':fail('immutable packet is not the reviewed pending preimage')
  if packet.get('profile')!='umf.g03-sdk058-python-inputs/1' or packet.get('status')!='PENDING_SOL_SOURCE_REVIEW':fail('Python immutable packet profile/status mismatch')
  if packet.get('producer')!={'commit':'855f6c48649496fc60b3303798790d0ddb55d38f','tree':'53f2bfffbc0c5780e79d76d8fd3d202239d088b2','volume':SOURCE_VOLUME}:fail('source P/tree mismatch')
  if packet.get('cohort')!={'selectedLockSha256':'cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274','indexSha256':'78026c05d3824613f0e2a3bf30cf24bd32af24de1d560f0b7fa555a1e75f8d60','mirrorManifestSha256':'809a418b9f6f97e403e3fbcc7066d23657347d1323efb6baf2d4d3bb3f17bd36','requirementsSha256':'4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51','custodySha256':'95e9493f06adefb323193f9d8fbe5577ebfa335140a9841f549d2caf098df8ed'}:fail('final18 pins mismatch')
  for p,w,c in [(COHORT/'cells/linux-x86_64-py311/cohort.lock.json',packet['cohort']['selectedLockSha256'],8*1024*1024),(COHORT/'aggregate/index.json',packet['cohort']['indexSha256'],4*1024*1024),(COHORT/'aggregate/mirror/manifest.json',packet['cohort']['mirrorManifestSha256'],4*1024*1024),(COHORT/'aggregate/mirror/requirements.lock',packet['cohort']['requirementsSha256'],1024*1024),(COHORT/'custody.json',packet['cohort']['custodySha256'],1024*1024)]:
   canonical(p)
   if hashfile(p,c)[0]!=w:fail('cohort file hash mismatch: '+str(p))
  if hashfile(CAPTURE,256*1024)[0]!=CAPTURE_SHA:fail('reusable bounded capture helper source mismatch')
  spec=importlib.util.spec_from_file_location('capture',CAPTURE);helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
  if metadata(['docker','image','inspect','--format','{{.Id}}',IMAGE])!=IMAGE:fail('pinned x64 image absent/mismatch')
  if metadata(['docker','image','inspect','--format','{{.Os}}/{{.Architecture}}',IMAGE])!=PLATFORM:fail('image platform mismatch')
  daemon_platform=metadata(['docker','info','--format','{{.OSType}}/{{.Architecture}}'])
  if daemon_platform!='linux/aarch64':fail('Docker daemon does not match the admitted Linux ARM host profile')
  result['platformObservation']={'dockerDaemon':daemon_platform,'selectedImage':IMAGE,'selectedImagePlatform':PLATFORM,'runPlatform':PLATFORM}
  if metadata(['docker','volume','inspect','--format','{{.Name}}',SOURCE_VOLUME])!=SOURCE_VOLUME:fail('source volume missing')
  if metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}']):fail('owned container name occupied')
  if metadata(['docker','volume','ls','--filter','name=^'+volume+'$','--format','{{.Name}}']):fail('owned venv volume name occupied')
  created=metadata(['docker','volume','create','--driver','local','--label','codex.g03.execution-id='+rid,'--label','codex.g03.kind=sdk058-python-venv',volume])
  if created!=volume:fail('owned venv create mismatch')
  vowned=True
  deadline=min(owner_deadline-660,start+TOTAL-RESERVE-80)
  if deadline-time.monotonic()<30:fail('shared owner leaves insufficient Python capture/cleanup window')
  guest_budget=max(0.0,deadline-time.monotonic()-15.0)
  if guest_budget<15:fail('host owner leaves insufficient guest-local duration')
  packet_sha=a.inputs_sha256
  argv=['docker','run','--pull=never','--platform='+PLATFORM,'--name',container,'--label','codex.g03.execution-id='+rid,'--read-only','--network=none','--cpus=4','--memory=8g','--pids-limit=8192','--cap-add=SYS_ADMIN','--security-opt=seccomp=unconfined','--tmpfs=/tmp:rw,nosuid,nodev,exec,size=2g',
   '--mount',f'type=volume,source={SOURCE_VOLUME},target=/volume-producer,readonly','--mount',f'type=volume,source={DEPENDENCY_VOLUME},target=/volume-producer/node_modules,readonly,volume-subpath={DEPENDENCY_SUBPATH}','--mount',f'type=volume,source={DEPENDENCY_VOLUME},target=/dependency-origin,readonly','--mount',f'type=bind,source={DEPENDENCY_OUTPUT},target=/dependency-input,readonly','--mount',f'type=bind,source={DEPENDENCY_PREFLIGHT},target=/dependency-preflight.py,readonly','--mount',f'type=bind,source={DEPENDENCY_CENSUS},target=/dependency-census.json,readonly','--mount',f'type=bind,source={DEPENDENCY_REVIEW},target=/dependency-review.md,readonly','--mount',f'type=bind,source={COHORT},target=/cohort,readonly','--mount',f'type=bind,source={GENERIC_INPUT_ROOT},target=/tmp/g03-generic-input,readonly','--mount',f'type=bind,source={GENERIC_INPUT_ROOT},target=/generic-input,readonly','--mount',f'type=bind,source={TOOL_INPUT_ROOT},target=/tool-input,readonly','--mount',f'type=bind,source={TOOL_CONTROL_ROOT},target=/control,readonly','--mount',f'type=volume,source={SOURCE_VOLUME},target=/source,readonly','--mount',f'type=bind,source=/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json,target=/runtime-observation.json,readonly','--mount',f'type=bind,source=/private/tmp/g03-sdk058-global-packaging-metadata-003/result.json,target=/global-failure.json,readonly','--mount',f'type=bind,source=/private/tmp/g03-packaging250-tool-input001-sol-review001.md,target=/tool-review.md,readonly','--mount',f'type=bind,source=/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md,target=/runtime-review.md,readonly','--mount',f'type=bind,source={TOOL_ACTUAL_ROOT}/tool-result.json,target=/accepted-tool-result.json,readonly','--mount',f'type=bind,source={a.inputs},target=/input-packet.json,readonly','--mount',f'type=bind,source={review_path},target=/source-review,readonly','--mount',f'type=bind,source={RUNTIME},target=/operator,readonly','--mount',f'type=volume,source={volume},target=/venv','--mount',f'type=bind,source={guest},target=/out','-e','G03_INPUT_PACKET_SHA256='+packet_sha,'-e','G03_SOURCE_REVIEW_SHA256='+admission['sourceReviewSha256'],'-e','G03_DERIVED_LOCK_SHA256='+admission['genericProbeLockSha256'],'-e','G03_DERIVED_PROVENANCE_SHA256='+admission['genericProbeProvenanceSha256'],'-e','G03_QUALIFICATION_TOOL_REPORT_SHA256='+admission['qualificationToolControlReportSha256'],'-e','G03_QUALIFICATION_TOOL_WHEEL_SHA256='+admission['qualificationToolWheelSha256'],'-e','PYTHONDONTWRITEBYTECODE=1','-e','G03_LOG_CAP='+str(int(os.environ.get('G03_LOG_CAP',LOG_CAP))),'-e','G03_GUEST_REMAINING_SECONDS='+str(guest_budget),'--workdir=/volume-producer',IMAGE,'/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11','-I','-B','/operator/guest_g03.py']
  helper.OUTER_STREAM_LIMIT=max(1,int(os.environ.get('G03_OUTER_LOG_CAP',LOG_CAP//4))//2)
  helper.stop_owned=lambda name: subprocess.run(['docker','stop','--time',str(STOP),container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=STOP+5,check=False) if name==container else None
  proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);owned=True
  captured=helper.bounded_capture(proc,outer,container,deadline,prefix='docker');closure=helper.verify_outer_capture(captured)
  if proc.poll() is None:proc.wait(timeout=STOP+5)
  label=metadata(['docker','inspect','--format','{{index .Config.Labels "codex.g03.execution-id"}}',container],5)
  if label!=rid:fail('container ownership label mismatch')
  config=metadata(['docker','inspect','--format','{{.Image}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}',container],5)
  if config!=IMAGE+'|none|true|8192|4000000000|8589934592':fail('Python container resource/network/root limits differ from profile')
  configured_mounts=json.loads(metadata(['docker','inspect','--format','{{json .HostConfig.Mounts}}',container],5))
  mounts=json.loads(metadata(['docker','inspect','--format','{{json .Mounts}}',container],5))
  result['configuredMounts']=configured_mounts;result['containerMounts']=[{'type':m.get('Type'),'name':m.get('Name'),'source':m.get('Source'),'destination':m.get('Destination'),'rw':m.get('RW')} for m in mounts]
  ro_source=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==SOURCE_VOLUME and m.get('Destination')=='/volume-producer' and m.get('RW') is False]
  rw_venv=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==volume and m.get('Destination')=='/venv' and m.get('RW') is True]
  rw_out=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(guest) and m.get('Destination')=='/out' and m.get('RW') is True]
  ro_cohort=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(COHORT) and m.get('Destination')=='/cohort' and m.get('RW') is False]
  ro_packet=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(a.inputs) and m.get('Destination')=='/input-packet.json' and m.get('RW') is False]
  ro_review=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(review_path) and m.get('Destination')=='/source-review' and m.get('RW') is False]
  ro_operator=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(RUNTIME) and m.get('Destination')=='/operator' and m.get('RW') is False]
  ro_dep=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==DEPENDENCY_VOLUME and m.get('Destination')=='/volume-producer/node_modules' and m.get('RW') is False]
  ro_origin=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==DEPENDENCY_VOLUME and m.get('Destination')=='/dependency-origin' and m.get('RW') is False]
  ro_dep_input=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(DEPENDENCY_OUTPUT) and m.get('Destination')=='/dependency-input' and m.get('RW') is False]
  ro_dep_tool=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(DEPENDENCY_PREFLIGHT) and m.get('Destination')=='/dependency-preflight.py' and m.get('RW') is False]
  ro_dep_census=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(DEPENDENCY_CENSUS) and m.get('Destination')=='/dependency-census.json' and m.get('RW') is False]
  ro_dep_review=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(DEPENDENCY_REVIEW) and m.get('Destination')=='/dependency-review.md' and m.get('RW') is False]
  ro_generic_input=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(GENERIC_INPUT_ROOT) and m.get('Destination')=='/tmp/g03-generic-input' and m.get('RW') is False]
  ro_generic_probe=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(GENERIC_INPUT_ROOT) and m.get('Destination')=='/generic-input' and m.get('RW') is False]
  ro_tool_input=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(TOOL_INPUT_ROOT) and m.get('Destination')=='/tool-input' and m.get('RW') is False]
  ro_tool_control=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(TOOL_CONTROL_ROOT) and m.get('Destination')=='/control' and m.get('RW') is False]
  ro_source_alias=[m for m in mounts if m.get('Type')=='volume' and m.get('Name')==SOURCE_VOLUME and m.get('Destination')=='/source' and m.get('RW') is False]
  ro_runtime_observation=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json' and m.get('Destination')=='/runtime-observation.json' and m.get('RW') is False]
  ro_global_failure=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-sdk058-global-packaging-metadata-003/result.json' and m.get('Destination')=='/global-failure.json' and m.get('RW') is False]
  ro_tool_review=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-packaging250-tool-input001-sol-review001.md' and m.get('Destination')=='/tool-review.md' and m.get('RW') is False]
  ro_runtime_review=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md' and m.get('Destination')=='/runtime-review.md' and m.get('RW') is False]
  ro_accepted_tool_report=[m for m in mounts if m.get('Type')=='bind' and m.get('Source')==str(TOOL_ACTUAL_ROOT/'tool-result.json') and m.get('Destination')=='/accepted-tool-result.json' and m.get('RW') is False]
  cfg_tool_input=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')==str(TOOL_INPUT_ROOT) and m.get('Target')=='/tool-input' and m.get('ReadOnly') is True]
  cfg_tool_control=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')==str(TOOL_CONTROL_ROOT) and m.get('Target')=='/control' and m.get('ReadOnly') is True]
  cfg_source_alias=[m for m in configured_mounts if m.get('Type')=='volume' and m.get('Source')==SOURCE_VOLUME and m.get('Target')=='/source' and m.get('ReadOnly') is True]
  cfg_generic_probe=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')==str(GENERIC_INPUT_ROOT) and m.get('Target')=='/generic-input' and m.get('ReadOnly') is True]
  cfg_runtime_observation=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json' and m.get('Target')=='/runtime-observation.json' and m.get('ReadOnly') is True]
  cfg_global_failure=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-sdk058-global-packaging-metadata-003/result.json' and m.get('Target')=='/global-failure.json' and m.get('ReadOnly') is True]
  cfg_tool_review=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-packaging250-tool-input001-sol-review001.md' and m.get('Target')=='/tool-review.md' and m.get('ReadOnly') is True]
  cfg_runtime_review=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')=='/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md' and m.get('Target')=='/runtime-review.md' and m.get('ReadOnly') is True]
  cfg_accepted_tool_report=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')==str(TOOL_ACTUAL_ROOT/'tool-result.json') and m.get('Target')=='/accepted-tool-result.json' and m.get('ReadOnly') is True]
  cfg_dep=[m for m in configured_mounts if m.get('Type')=='volume' and m.get('Source')==DEPENDENCY_VOLUME and m.get('Target')=='/volume-producer/node_modules' and m.get('ReadOnly') is True and m.get('VolumeOptions',{}).get('Subpath')==DEPENDENCY_SUBPATH]
  cfg_origin=[m for m in configured_mounts if m.get('Type')=='volume' and m.get('Source')==DEPENDENCY_VOLUME and m.get('Target')=='/dependency-origin' and m.get('ReadOnly') is True and not m.get('VolumeOptions',{}).get('Subpath')]
  cfg_generic=[m for m in configured_mounts if m.get('Type')=='bind' and m.get('Source')==str(GENERIC_INPUT_ROOT) and m.get('Target')=='/tmp/g03-generic-input' and m.get('ReadOnly') is True]
  if any(len(x)!=1 for x in (ro_source,ro_dep,ro_origin,ro_dep_input,ro_dep_tool,ro_dep_census,ro_dep_review,ro_cohort,ro_generic_input,ro_generic_probe,ro_tool_input,ro_tool_control,ro_source_alias,ro_runtime_observation,ro_global_failure,ro_tool_review,ro_runtime_review,ro_accepted_tool_report,ro_packet,ro_review,ro_operator,rw_venv,rw_out,cfg_dep,cfg_origin,cfg_generic,cfg_tool_input,cfg_tool_control,cfg_source_alias,cfg_generic_probe,cfg_runtime_observation,cfg_global_failure,cfg_tool_review,cfg_runtime_review,cfg_accepted_tool_report)):fail('Python source/dependency/tool-input/subpath/origin/cohort/generic-input/packet/review/operator/venv/output mount custody mismatch')
  if len(configured_mounts)!=23 or len(mounts)!=23 or len({m.get('Target') for m in configured_mounts})!=23 or len({m.get('Destination') for m in mounts})!=23:fail('Python configured/runtime mount roster differs from exact23 sources/output')
  result['containerConfig']=config
  guest_result=json.loads((guest/'guest-result.json').read_bytes()) if (guest/'guest-result.json').is_file() else {}
  qualification_tool=guest_result.get('qualificationTool',{})
  if qualification_tool.get('status')!='PASS_ACCEPTED_PACKAGING_TOOL_CONTROL' or qualification_tool.get('reportSha256')!=admission.get('qualificationToolControlReportSha256') or qualification_tool.get('packagingInventorySha256')!='5f7b4d4b87ed51ef2006d6ae801851c275dae4354385457bac21f139be70a71f':fail('guest isolated qualification-tool report did not match accepted control')
  verify_qualification_tool(admission)
  guest_platform=guest_result.get('platformObservation',{}).get('pythonGuest')
  expected_guest={'abi':'linux-x86_64','machine':'x86_64','pointerBits':64,'system':'Linux','version':'3.11.17'}
  if guest_platform!=expected_guest:fail('bounded Python process identity differs from selected Linux amd64 image ABI')
  result['platformObservation']['pythonGuest']=guest_platform
  guest_raw=sum(x['rawBytes'] for c in guest_result.get('commands',[]) for x in c.get('streams',[]));guest_saved=sum(x['bytes'] for c in guest_result.get('commands',[]) for x in c.get('streams',[]))
  if guest_result.get('rawLogBytes')!=guest_raw or guest_raw!=guest_saved:fail('guest raw log bytes differ from complete retained captures')
  logs=sum(captured.get('retainedBytes',[]))+guest_raw
  if logs>LOG_CAP:fail('combined raw logs exceed 1 MiB')
  if not closure.get('verified') or captured.get('timedOut') or captured.get('drainExpired') or captured.get('captureFailed') or any(captured.get('truncated',[])):fail('outer bounded capture did not close')
  if proc.returncode or guest_result.get('status')!='PASS_LOCAL_FINAL18_G03_PYTHON_PARITY':fail('Python G03 guest did not pass')
  result.update(status='PASS_LOCAL_FINAL18_G03_PYTHON_PARITY',guestResult=guest_result,qualificationTool=qualification_tool,qualificationToolInputs=qualification_inputs,logBytes=logs,outerCapture=captured,outerClosure=closure)
 except BaseException as e:failure=type(e).__name__+': '+str(e)[:300]
 finally:
  cleanup={'daemonReachable':False,'containerRemoved':False,'containerAbsent':False,'volumeRemoved':False,'volumeAbsent':False,'verified':False}; commands=[]
  try:
   cleanup['daemonReachable']=bool(metadata(['docker','info','--format','{{.OSType}}/{{.Architecture}}'],5))
   if cleanup['daemonReachable'] and owned:
    names=metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],5).splitlines()
    if names==[container]:
     cp=subprocess.run(['docker','rm','--force',container],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15);cleanup['containerRemoved']=cp.returncode==0
   cleanup['containerAbsent']=not metadata(['docker','ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}'],5).splitlines()
   if cleanup['daemonReachable'] and vowned:
    info=metadata(['docker','volume','inspect','--format','{{.Name}}|{{index .Labels "codex.g03.execution-id"}}|{{index .Labels "codex.g03.kind"}}',volume],5)
    if info==volume+'|'+rid+'|sdk058-python-venv':cleanup['volumeRemoved']=subprocess.run(['docker','volume','rm',volume],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15).returncode==0
   cleanup['volumeAbsent']=not metadata(['docker','volume','ls','--filter','name=^'+volume+'$','--format','{{.Name}}'],5).splitlines()
   cleanup['verified']=cleanup['daemonReachable'] and cleanup['containerAbsent'] and cleanup['volumeAbsent'] and (not owned or cleanup['containerRemoved']) and (not vowned or cleanup['volumeRemoved'])
  except BaseException as e:cleanup['error']=type(e).__name__+': '+str(e)[:160]
  result['cleanup']=cleanup
  if failure:result['failure']=failure
  if result.get('status','').startswith('PASS') and not cleanup['verified']:result['status']='FAIL_OR_UNKNOWN';result['failure']='owned cleanup did not close'
  result['elapsedSeconds']=round(time.monotonic()-start,3)
  if result['elapsedSeconds']>TOTAL-RESERVE and result.get('status','').startswith('PASS'):result['status']='FAIL_OR_UNKNOWN';result['failure']='aggregate deadline exceeded'
  files,total=inventory(run,EVIDENCE_CAP);result['runFilesBeforeReceipt']=files;result['runEvidenceBytesBeforeReceipt']=total
  result_path=run/'operator-result.json'
  with result_path.open('xb') as f:f.write((json.dumps(result,sort_keys=True,indent=2)+'\n').encode());f.flush();os.fsync(f.fileno())
 print(json.dumps({'run':str(run),'status':result['status'],'failure':result.get('failure')},sort_keys=True))
 return 0 if result['status'].startswith('PASS') else 1
if __name__=='__main__':raise SystemExit(main())
