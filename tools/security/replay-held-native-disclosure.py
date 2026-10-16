"""Actual reviewed Python bridge + held UMF inspector over retained native52. No new SQL."""
import pathlib,json,hashlib,zipfile,sys,struct,types,argparse,subprocess
# @covers US-056-AC6 @covers US-056-AC10
if not __debug__:raise RuntimeError('Replay requires enabled assertions')
parser=argparse.ArgumentParser()
for name in ['umf-root','bundle-root','wheel','wheel-manifest','pipe-source','native-receipt','output']:
 parser.add_argument('--'+name,type=pathlib.Path,required=True)
parser.add_argument('--bun',required=True)
a=parser.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
frozen_script=pathlib.Path(__file__).read_bytes();root=a.umf_root.resolve();bundle_root=a.bundle_root.resolve()
version_run=subprocess.run([a.bun,'--version'],capture_output=True,timeout=5,check=True)
assert version_run.stdout.strip()==b'1.4.2'
manifest_bytes=(bundle_root/'manifest.json').read_bytes();manifest=json.loads(manifest_bytes);assert manifest['profile']=='umf.security.private-disclosure-child/0.2-candidate' and manifest['bun']=='1.4.2';bundle=bundle_root/'current-native-disclosure-child.mjs'
version='umf.security.private-disclosure-child/0.2-candidate'
sha=lambda b:hashlib.sha256(b).hexdigest()
wire=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
framed=lambda b:struct.pack('>I',len(b))+b
wheel_manifest_bytes=a.wheel_manifest.read_bytes();wheel_manifest=json.loads(wheel_manifest_bytes)['wheels']['combined']
wheel=a.wheel;assert sha(wheel.read_bytes())==wheel_manifest['sha256']=='2b5806d53cb50b95b56f0dda0dee8ea79e6f1d72b839f5ec74304943fe3022ad'
installed=out/'wheel';installed.mkdir()
with zipfile.ZipFile(wheel) as archive:
 for name in archive.namelist():
  target=installed/name;assert target.resolve().is_relative_to(installed.resolve())
  if not name.endswith('/'):
   target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(name))
sys.path.insert(0,str(installed));import weft.weft as native
assert pathlib.Path(native.__file__).resolve()==(installed/'weft/weft.abi3.so').resolve()
for name,h in wheel_manifest['members'].items():assert sha((installed/name).read_bytes())==h
pipe_source=a.pipe_source;pipe_bytes=pipe_source.read_bytes();pipe_digest=sha(pipe_bytes);assert pipe_digest=='39c7ab62660f64241f59008f5cb0b16b721f741657c44d321189237655031d7f'
pipe=types.ModuleType('pinned_truss_current_query_pipe');pipe.__file__=str(pipe_source);exec(compile(pipe_bytes,str(pipe_source),'exec'),pipe.__dict__)
raw_native=a.native_receipt;assert sha(raw_native.read_bytes())=='c1a0299242907ad79fc4437ae5ced9b67a36d9e305be455121b5149a2177f49d'
vectors_path=root/'tests/security/protection/native-disclosure-child-vectors.json';vectors_frozen=vectors_path.read_bytes();vectors=json.loads(vectors_frozen);packets={p['id']:p for p in vectors['packets']}
def pins():
 assert len(manifest['sourcePins'])<=4096
 assert all(type(p) is str and not pathlib.PurePosixPath(p).is_absolute() and '..' not in pathlib.PurePosixPath(p).parts for p in manifest['sourcePins'])
 return {path:sha((root/path).read_bytes()) for path in manifest['sourcePins']}
assert pins()==manifest['sourcePins'];assert sha(bundle.read_bytes())==manifest['bundleSha256']
records=[]
for number,operation in enumerate(json.loads(raw_native.read_bytes())['operations']):
 ident=operation['id'];packet=packets['mixed:'+ident.removeprefix('review-') if ident.startswith('review-') else ident];source=vectors['sources'][packet['sourceIndex']]
 original_request=json.loads(operation['requestJson'])
 for role in ['policy','catalog','ontology','owner']:
  opaque=[x for x in original_request['opaqueSources'] if x['role']==role];assert len(opaque)==1 and json.loads(opaque[0]['utf8'])==source[role]
 assert json.loads(operation['bindingJson'])['header']=={k:v for k,v in packet['result']['batch'].items() if k!='rows'}
 initial=wire(dict(version=version,kind='initialize',requestId='init',sources={**{k:source[k] for k in ['policy','catalog','closure','ontology']},'associationBindings':[]},owner=source['owner'],selection=packet['selection']))
 receipt=sha(framed(initial));evaluation=wire(dict(version=version,kind='evaluate-disclosure',requestId='eval',sourceReceipt=receipt,cut=packet['cut']))
 parent=native.prepare_application_lineage(operation['requestJson']);current=parent.prepare_current_presence()
 assert native.CurrentPresencePreparation.source_preparation(current) is parent
 assert json.loads(native.CurrentPresencePreparation.json(current))==json.loads(operation['preparationJson'])
 compiled=native.CurrentPresencePreparation.lower_postgresql_current_presence_candidate_json(current,operation['bindingJson'])
 assert compiled==operation['artifactJson']
 with pipe.CurrentQueryPipe((a.bun,str(bundle)),timeout_seconds=20) as child:
  initialized=json.loads(child.exchange(initial,source_receipt=receipt));assert initialized==dict(version=version,kind='initialized',requestId='init',sourceReceipt=receipt)
  evaluated=json.loads(child.exchange(evaluation,source_receipt=receipt));assert evaluated==dict(version=version,kind='disclosure-evaluated',requestId='eval',sourceReceipt=receipt,result=packet['result'])
  frame=wire(operation['frame']).decode();negative=operation['negative'];record={'ordinal':number,'id':ident,'negative':negative,'parentHeldThroughInspection':True,'preparationJson':native.CurrentPresencePreparation.json(current),'artifactJson':compiled,'evaluationReply':evaluated,'actualDriverRows':operation['actualDriverRows'],'checkerFrameJson':frame}
  if negative in ('missing-result','extra-result','scalar-null-collapse','changed-header'):
   try:native.CurrentPresencePreparation.check_postgresql_current_presence_candidate_json(current,operation['bindingJson'],frame)
   except ValueError as error:record.update(outcome='structural-refusal',checkerError=str(error),inspectionInvoked=False)
   else:raise AssertionError('Corrupt checker frame matched')
  else:
   report_json=native.CurrentPresencePreparation.check_postgresql_current_presence_candidate_json(current,operation['bindingJson'],frame)
   assert report_json==operation['checker']['reportJson'];report=json.loads(report_json);assert report['matched'] and report['authority'] is False and report['securityReady'] is False
   artifact=json.loads(compiled);assert operation['driverColumnNames']==['output_0','__weft_source_rows'];by_key={}
   for cells in operation['actualDriverRows']:
    assert len(cells)==2 and all(type(c) is str for c in cells);side=json.loads(cells[-1]);assert set(side)=={'version','rows'} and side['version']=='weft.stage-row-tuple/0.1-candidate' and len(side['rows'])==1
    contribution=side['rows'][0];assert set(contribution)=={'scan','key'} and contribution['scan']=='s0';key=contribution['key'];assert key not in by_key;by_key[key]=json.loads(cells[0])
   keys=[json.dumps(resource,ensure_ascii=False,sort_keys=True,separators=(',',':')) for resource in evaluated['result']['resources']]
   assert sorted(keys)==sorted(by_key)
   batch={**artifact['disclosureHeader'],'rows':[[by_key[key]] for key in keys]};assert batch==operation['nativeBatch']
   inspection=wire(dict(version=version,kind='inspect-native-disclosure',requestId='inspect',sourceReceipt=receipt,batch=batch));reply=json.loads(child.exchange(inspection,source_receipt=receipt))
   if negative=='invalid-selected-occurrence':assert reply==dict(version=version,kind='refused',requestId='inspect',sourceReceipt=receipt,code='UMF_NATIVE_DISCLOSURE_CHILD_REFUSED');outcome='whole-v2-refusal'
   else:
    assert reply==dict(version=version,kind='native-disclosure-inspected',requestId='inspect',sourceReceipt=receipt,evaluationFrameSha256=sha(framed(evaluation)),inspectionFrameSha256=sha(framed(inspection)),status='validated-disclosure',complete=False,authority=False);outcome='validated-data-only'
   record.update(outcome=outcome,checkerReportJson=report_json,reconstructedBatch=batch,inspectionFrameSha256=sha(framed(inspection)),inspectionReply=reply,inspectionInvoked=True)
  assert native.CurrentPresencePreparation.source_preparation(current) is parent
 assert child._cleanup_complete and child._child.poll() is not None
 record['childCleanupConfirmed']=True;records.append(record)
assert len(records)==52 and sum(r['outcome']=='validated-data-only' for r in records)==47 and sum(r['outcome']=='structural-refusal' for r in records)==4 and sum(r['outcome']=='whole-v2-refusal' for r in records)==1
assert pins()==manifest['sourcePins']
assert (bundle_root/'manifest.json').read_bytes()==manifest_bytes and sha(bundle.read_bytes())==manifest['bundleSha256']
for name,h in wheel_manifest['members'].items():assert sha((installed/name).read_bytes())==h
assert pathlib.Path(__file__).read_bytes()==frozen_script
assert vectors_path.read_bytes()==vectors_frozen
assert sha(raw_native.read_bytes())=='c1a0299242907ad79fc4437ae5ced9b67a36d9e305be455121b5149a2177f49d'
assert sha(wheel.read_bytes())==wheel_manifest['sha256']
assert pipe_source.read_bytes()==pipe_bytes
assert a.wheel_manifest.read_bytes()==wheel_manifest_bytes
result={'status':'passed','profile':version,'records':records,'bundleSha256':manifest['bundleSha256'],'bundleManifestSha256':sha((bundle_root/'manifest.json').read_bytes()),'sourcePins':manifest['sourcePins'],'nativeReceiptSha256':sha(raw_native.read_bytes()),'vectorsSha256':sha(vectors_path.read_bytes()),'replayScriptSha256':sha(pathlib.Path(__file__).read_bytes()),'python':sys.version,'weftWheel':wheel_manifest,'trussPipeSha256':pipe_digest,'weftWheelManifestSha256':sha(wheel_manifest_bytes),'trussPipeInputLimitBytes':4194304,'scope':'Actual local reviewed Python bridge and same held UMF 0.2 producer/inspector process over all52 retained native records. Reconstructed actual captured rows, original key bag, live typed parent/context/lowerer/checker and closing data inspector are exercised. Four checker-frame negatives cancel without inspection; source-invalid999/999 passes structural matching and refuses wholeV2. No fresh SQL, native source/caller/Subject/current authority/guarded release, installed Truss adoption or acceptance promotion.'}
(out/'receipt.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'status':'passed','operations':len(records),'positive':47,'structuralRefusals':4,'wholeV2Refusals':1,'sourcePins':len(manifest['sourcePins']),'nativeDatabaseExecuted':False}))
