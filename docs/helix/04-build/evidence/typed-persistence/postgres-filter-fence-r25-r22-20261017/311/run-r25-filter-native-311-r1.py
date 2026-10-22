"""Frozen66 source and exact R25/R22 wheel custody for functional native tests."""
import hashlib,json,os,shutil,subprocess,zipfile,tarfile,io
from pathlib import Path
FROZEN=Path('/private/tmp/sdk-r25-frozen-frontend-inputs');ROOT=Path('/private/tmp/sdk-r25-native-input-root-66-311-r1');ENV=Path('/private/tmp/sdk-r25-r22-311-env');OUT=Path('/private/tmp/sdk-search-filter-native-r25-311-r1');GENERATED=Path('/private/tmp/sdk-search-filter-native-r25-generated-311-r1');PROOF=Path('/private/tmp/sdk-r25-r22-byte-correspondence.json');MANIFEST=Path('/private/tmp/sdk-r25-filter-source-before.json');proof=json.loads(PROOF.read_text());inputs=json.loads(MANIFEST.read_text());assert inputs['inputCommit']=='66f982086185966a481c20f2d9e063a3da4a7eaa'
OUT.mkdir();shutil.copytree(FROZEN,ROOT);host_archive=subprocess.run(['git','archive',inputs['inputCommit'],'scripts'],cwd='/Users/erik/.codex/worktrees/typed-sdk-recovery/umf',capture_output=True,check=True).stdout;(OUT/'host-scripts-source.tar').write_bytes(host_archive);host_files={}
with tarfile.open(fileobj=io.BytesIO(host_archive)) as archive:
 for member in archive.getmembers():
  if not member.isfile():continue
  path=ROOT/member.name;body=archive.extractfile(member).read()
  if path.exists():assert path.read_bytes()==body,member.name
  else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
  host_files[member.name]=hashlib.sha256(body).hexdigest()
(OUT/'host-source-manifest.json').write_text(json.dumps({'commit':inputs['inputCommit'],'archiveSha256':hashlib.sha256(host_archive).hexdigest(),'files':host_files},indent=2))
runtime_archive=subprocess.run(['git','archive',proof['commit'],'python/umf_access/src'],cwd='/Users/erik/.codex/worktrees/typed-sdk-recovery/umf',capture_output=True,check=True).stdout;(OUT/'runtime-source.tar').write_bytes(runtime_archive);shutil.copytree('/private/tmp/sdk-r25-filter-generated',GENERATED);SITE=ENV/'lib/python3.11/site-packages'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def snapshot():
 files={}
 for name,expected in inputs['files'].items():
  path=ROOT/name;actual=sha(path);assert actual==expected,(name,actual,expected);files[str(path)]=actual
 for name,expected in host_files.items():
  path=ROOT/name;actual=sha(path);assert actual==expected;files[str(path)]=actual
 payloads=[]
 for key,hashkey in [('sdkWheel','sdkWheelSHA256'),('weftWheel','weftWheelSHA256')]:
  wheel=Path(proof[key]);assert sha(wheel)==proof[hashkey];files[str(wheel)]=sha(wheel)
  with zipfile.ZipFile(wheel) as archive:
   for name in archive.namelist():
    if name.startswith(('umf_access/','weft/')) and not name.endswith('/'):
     path=SITE/name;assert path.read_bytes()==archive.read(name),name;files[str(path)]=sha(path);payloads.append(name)
     if name.startswith('umf_access/'):
      with tarfile.open(fileobj=io.BytesIO(runtime_archive)) as git_source:
       member=git_source.extractfile('python/umf_access/src/'+name);assert member is not None and member.read()==archive.read(name),name
 manifest=GENERATED/'search_docs/_umf/manifest.json';files[str(manifest)]=sha(manifest)
 for item in json.loads(manifest.read_text())['inventory']:
  path=GENERATED/item['path'];assert sha(path)==item['sha256'];files[str(path)]=sha(path)
 for path in (GENERATED/'stage-one-request.json',Path(__file__).resolve(),PROOF,MANIFEST,OUT/'runtime-source.tar',OUT/'host-scripts-source.tar',OUT/'host-source-manifest.json'):files[str(path)]=sha(path)
 assert len(payloads)==49
 return {'files':files,'runtimePayloads':payloads,'sourceInputCount':len(inputs['files']),'sourceCut':inputs['inputCommit'],'wheelInstalledAndGitSdkSourceEqual':True,'sdkGitCommit':proof['commit'],'sdkGitArchiveSha256':hashlib.sha256(runtime_archive).hexdigest()}
before=snapshot();(OUT/'before.json').write_text(json.dumps(before,indent=2));shutil.copyfile(PROOF,OUT/'pair-proof.json');shutil.copyfile(MANIFEST,OUT/'source-input-manifest.json')
env=dict(os.environ,UMF_FILTER_GENERATED_ROOT=str(GENERATED),UMF_FILTER_RECEIPTS=str(OUT/'fixture'),UMF_PGVECTOR_CONTROL_ROOT='/private/tmp/sdk-pgvector-control',UMF_PRIVILEGE_PROBE_APIS='compile_raw_read_json,compile_search_json');env.pop('UMF_FILTER_BUILD_ONLY',None)
command=[str(ENV/'bin/python'),'-I','-B',str(ROOT/'scripts/record-access-pg-runtime.py'),'--out',str(OUT/'runtime.json'),'--compile-recorder',str(ROOT/'scripts/record-access-privilege-build.py'),str(ROOT/'python/umf_access/tests/search_filter_parameters_e2e.py')];(OUT/'launch.json').write_text(json.dumps({'command':command,'generated':str(GENERATED),'sourceRoot':str(ROOT),'sdkSource':proof['commit'],'weftSource':proof['weftSource']},indent=2))
with (OUT/'campaign.log').open('w') as log:response=subprocess.run(command,env=env,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=False)
after=snapshot();(OUT/'after.json').write_text(json.dumps(after,indent=2));native=OUT/'fixture/result.json';receipt={'exitCode':response.returncode,'sourceAndPayloadUnchanged':before==after,'runtimePayloadCount':49,'ownedServerStopped':not(OUT/'fixture/data/postmaster.pid').exists(),'nativeResult':json.loads(native.read_text()) if native.exists() else None,'temporal':'HELD','nativeAuthority':False,'inventoryComplete':False};(OUT/'result.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({key:value for key,value in receipt.items() if key!='nativeResult'}));assert response.returncode==0 and before==after and receipt['ownedServerStopped'] and receipt['nativeResult']['status']=='pass'
