"""Exact frozen host/tool dependency and immutable pair custody for selected grant proof."""
import hashlib,json,os,subprocess,zipfile,tarfile,io
from pathlib import Path
ROOT=Path('/private/tmp/sdk-r26-native-frozen-host-34c95068');ENV=Path('/private/tmp/sdk-r26-r22-314-env');OUT=Path('/private/tmp/sdk-search-privilege-r26-r5');GENERATED=Path('/private/tmp/sdk-search-privilege-r26-r5-generated-r3')
PROOF=Path('/private/tmp/sdk-r26-r22-byte-correspondence.json');proof=json.loads(PROOF.read_text());OUT.mkdir()
HOST=Path('/private/tmp/sdk-r26-native-host-34c95068.json');NATIVE=Path('/private/tmp/sdk-r26-r5-native-support.json');DEPS=Path('/private/tmp/sdk-r26-r5-node-dependencies.json')
source=subprocess.run(['git','archive',proof['commit'],'python/umf_access/src'],cwd='/Users/erik/.codex/worktrees/typed-sdk-recovery/umf',capture_output=True,check=True).stdout;(OUT/'sdk-source.tar').write_bytes(source)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def snapshot():
 files={}
 for manifest in (HOST,NATIVE,DEPS):
  obj=json.loads(manifest.read_text());root=Path(obj['root']) if manifest==DEPS else ROOT
  for name,expected in obj['files'].items():
   path=root/name;assert sha(path)==expected,(str(manifest),name);files[str(path)]=expected
  for name,expected in obj.get('links',{}).items():assert os.readlink(root/name)==expected
  files[str(manifest)]=sha(manifest)
 payloads=[];site=ENV/'lib/python3.14/site-packages'
 for key,hkey in [('sdkWheel','sdkWheelSHA256'),('weftWheel','weftWheelSHA256')]:
  wheel=Path(proof[key]);assert sha(wheel)==proof[hkey];files[str(wheel)]=sha(wheel)
  with zipfile.ZipFile(wheel) as archive:
   for name in archive.namelist():
    if name.startswith(('umf_access/','weft/')) and not name.endswith('/'):
     data=archive.read(name);p=site/name;assert p.read_bytes()==data;files[str(p)]=sha(p);payloads.append(name)
     if name.startswith('umf_access/'):
      with tarfile.open(fileobj=io.BytesIO(source)) as original:assert original.extractfile('python/umf_access/src/'+name).read()==data
 manifest=GENERATED/'search_docs/_umf/manifest.json';files[str(manifest)]=sha(manifest)
 for item in json.loads(manifest.read_text())['inventory']:
  path=GENERATED/item['path'];assert sha(path)==item['sha256'];files[str(path)]=sha(path)
 for p in (GENERATED/'stage-one-request.json',Path(__file__),PROOF,OUT/'sdk-source.tar'):files[str(p)]=sha(p)
 assert len(payloads)==49
 return {'files':files,'payloads':payloads,'payloadCount':49,'sourceCut':json.loads(HOST.read_text())['inputCommit'],'sdkSource':proof['commit'],'weftSource':proof['weftSource']}
before=snapshot();(OUT/'before.json').write_text(json.dumps(before,indent=2))
env=dict(os.environ,UMF_SEARCH_GENERATED_ROOT=str(GENERATED),UMF_PGVECTOR_CONTROL_ROOT='/private/tmp/sdk-pgvector-control',UMF_SEARCH_VECTOR_VERSION='0.8.7',UMF_SEARCH_CATALOG_FENCE='1',UMF_PRIVILEGE_WORKFLOW_OUT=str(OUT/'workflow'),UMF_PRIVILEGE_SDK_WHEEL=proof['sdkWheel'],UMF_PRIVILEGE_SDK_SHA256=proof['sdkWheelSHA256'],UMF_PRIVILEGE_PROBE_APIS='compile_search_json')
command=[str(ENV/'bin/python'),'-I','-B',str(ROOT/'scripts/record-access-pg-runtime.py'),'--out',str(OUT/'runtime.json'),'--compile-recorder',str(ROOT/'scripts/record-access-privilege-build.py'),str(ROOT/'scripts/run-access-search-privilege-workflow.py')]
(OUT/'launch.json').write_text(json.dumps({'command':command,'generated':str(GENERATED),'sourceRoot':str(ROOT),'pairProof':proof,'nativeAuthority':False},indent=2))
with (OUT/'campaign.log').open('w') as log:result=subprocess.run(command,env=env,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=False)
after=snapshot();(OUT/'after.json').write_text(json.dumps(after,indent=2));text=(OUT/'campaign.log').read_text();receipt={'exitCode':result.returncode,'sourceAndPayloadUnchanged':before==after,'ownedServerStopped':'ownedServerStopped=true' in text,'payloadCount':49,'nativeAuthority':False,'inventoryComplete':False,'temporal':'HELD'};(OUT/'result.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt));assert result.returncode==0 and before==after and receipt['ownedServerStopped']
