from pathlib import Path
import json,hashlib,re,subprocess
F=Path('/private/tmp/umf-integrated-qualification-5be80ab9');R=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf');O=F/'fixtures/validation/core-check-refresh'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
native=load(O/'native-browser.json');runtime=load(O/'container-runtime.json')
assert native['complete'] and native['sourceRevision']==runtime['sourceRevision']=='5be80ab9e71d2da9aea589e688fdc61af0a0e251'
assert len(native['runs'])==174 and [r['command'] for r in native['runs']]==native['commands']
roots=['src','scripts','spec','tests','native','package.json','bun.lock']
revision=native['sourceRevision']
def tracked_inputs(root):
 rows=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*roots],cwd=root).decode().split('\0')
 paths=sorted(set(p for p in rows if p));assert all((root/p).is_file() and not (root/p).is_symlink() for p in paths)
 return {p:sha(root/p) for p in paths}
assert tracked_inputs(F)==tracked_inputs(R)==native['sourceInputs'],'Complete source inventory changed'
tree=subprocess.check_output(['git','ls-tree','-r','-z',revision,'--',*roots],cwd=F).decode().split('\0')
objects={}
for row in tree:
 if not row:continue
 meta,p=row.split('\t');mode,kind,oid=meta.split();assert kind=='blob' and mode in ['100644','100755'];objects[p]=oid
assert set(objects)==set(native['sourceInputs']),'Capture differs from immutable commit inventory'
for p,oid in objects.items():
 content=(F/p).read_bytes();assert hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()==oid,('Frozen bytes differ from commit',p)
assert runtime['imageId']=='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1' and runtime['bun']=='1.4.2' and native['expectedBrowser']=='153.0.8010.12'
# Reconstruct the planned command inventory from its immutable baseline and current relationship declaration.
plan=[]
for name in ['field-gate-refresh-evidence','key-native-refresh','key-gate-refresh-evidence']:
 baseline=json.loads(subprocess.check_output(['git','show','cc1446fdf919107ec2782d6eaa85cc8bf38fffa6:fixtures/validation/'+name+'.json'],cwd=F));plan += [r['command'] for r in baseline['runs']]
relationship=json.loads(subprocess.check_output(['bun','-e',"import {relationshipRefreshCommands} from './scripts/core-ideals/relationship-gate-inputs'; process.stdout.write(JSON.stringify(relationshipRefreshCommands));"],cwd=F))
plan+=relationship;seen=set();expected_plan=[]
for c in plan:
 c=list(c)
 if len(c)>1 and c[1]=='test':continue
 if c[0].endswith('/python'):c[0]='.venv/bin/python'
 key=tuple(c)
 if key not in seen:seen.add(key);expected_plan.append(c)
expected_plan=[c for c in expected_plan if c[:2]==['bun','run']]+[c for c in expected_plan if c[:2]!=['bun','run']]
assert native['commands']==expected_plan and len({tuple(c) for c in expected_plan})==174
observed=load(Path('/private/tmp/umf-integrated-execution-observation-5be80ab9.json'))
assert [r['stage'] for r in observed['runs']]==['prepare','native','auxiliary','regression','publish','gates','seal','actions'] and observed['sourceRevision']==revision and observed['runtimeImage']==runtime['imageId']
for row in observed['runs']:
 assert row['exitCode']==0 and sha(Path(row['log']))==row['logSha256']
 for path,h in row['generatedReports'].items():assert sha(F/path)==h,('Generated report changed',path)
finalization_root=Path('/private/tmp/umf-core08-finalization')
finalization=load(finalization_root/'runtime.json');assert observed['finalizationRuntime']==finalization
assert finalization['parentImageId']=='sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249' and finalization['imageId']==runtime['imageId'] and finalization['imageId']=='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1'
variants=[(finalization_root,finalization)]
if revision.startswith('5c0b99e5'):
 old_root=Path('/private/tmp/umf-core08-finalization-original');old=load(old_root/'runtime.json');assert observed['priorFinalizationRuntime']==old and old['imageId']=='sha256:0fb6c23754f94db124c256b5db04c6c7cbfdc3b56f90f357a8643573bc9e86cf';variants.append((old_root,old))
for tool_root,manifest in variants:
 for name,h in manifest['files'].items():assert sha(tool_root/name)==h
 parent,child=[json.loads(subprocess.check_output(['docker','image','inspect',i]))[0] for i in [manifest['parentImageId'],manifest['imageId']]]
 assert parent['Config']==child['Config'] and child['RootFS']['Layers'][:len(parent['RootFS']['Layers'])]==parent['RootFS']['Layers'] and child['RootFS']['Layers'][len(parent['RootFS']['Layers']):]==manifest['addedLayers'] and len(manifest['addedLayers'])==2
 tool_bytes=subprocess.check_output(['docker','run','--rm','--entrypoint','sha256sum',manifest['imageId'],'/opt/replay.py','/opt/seal.py'],text=True)
 assert {Path(line.split()[1]).name:line.split()[0] for line in tool_bytes.splitlines()}=={name:manifest['files'][name] for name in ['replay.py','seal.py']}
# The prior 01a campaign failed; its complete historical closure is immutable.
history_path='docs/helix/04-build/evidence/actions-documentation/qualification-failed-01a391b6'
history=F/history_path; historical=load(history/'disposition.json')
assert historical['sourceRevision']=='01a391b6110a6c9bcede51caf46ce2921795e727' and historical['status']=='failed and superseded; not certified'
paths=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',history_path],cwd=F,text=True).splitlines()
assert set(paths)=={str(p.relative_to(F)) for p in history.rglob('*') if p.is_file()}
for path in paths:
 assert (F/path).read_bytes()==(R/path).read_bytes()==subprocess.check_output(['git','show',revision+':'+path],cwd=F)
for path,h in historical['files'].items():assert sha(history/path)==h
for folder,failed_stage in [('prepare-stage-failed','prepare'),('native-stage-failed','native')]:
 archive=history/folder;inventory=load(archive/'inventory.json')
 assert set(inventory['files'])=={p.name for p in archive.iterdir() if p.is_file()}-{'inventory.json'}
 for name,h in inventory['files'].items():assert sha(archive/name)==h
 prior=load(archive/'umf-integrated-execution-observation-01a391b6.json');prior_runtime=load(archive/'umf-integrated-runtime-observation-01a391b6.json');row=prior['runs'][-1]
 assert row['stage']==failed_stage and row['exitCode']==1 and prior_runtime[failed_stage]['imageId']==row['imageId']==runtime['imageId']
 assert sha(archive/Path(row['log']).name)==row['logSha256']
 for path,h in row['generatedReports'].items():
  retained='pre-existing-'+Path(path).name
  assert sha(archive/retained)==h
  original='fixtures/validation/core-check-refresh/'+('container-runtime.json' if failed_stage=='prepare' else 'native-browser.json')
  assert hashlib.sha256(subprocess.check_output(['git','show',historical['sourceRevision']+':'+original],cwd=F)).hexdigest()==h
 assert 'stale' in inventory['preExistingReportMeaning']
last_failed=load(history/'umf-integrated-execution-observation-01a391b6.json')['runs'][-1]
assert last_failed['stage']=='native' and last_failed['exitCode']==1 and sha(history/Path(last_failed['log']).name)==last_failed['logSha256']
prior_native=load(history/'fixtures/validation/core-check-refresh/native-browser.json')
assert prior_native['complete'] is False and len(prior_native['runs'])==2 and [r['exitCode'] for r in prior_native['runs']]==[0,1]
for row in prior_native['runs']:assert sha(history/row['log'])==row['logSha256']
assert 'Embedded and standalone payload schemas differ' in (history/'fixtures/validation/core-check-refresh/002.log').read_text()
assert sha(R/'docs/helix/04-build/evidence/actions-documentation/qualification-integrated-40e83200/actions-integrated-certification.json')=='994223f919f346b09cf87c0beecfce89f278e46916b8892692671d2184867fa1'

stages=['prepare','native','auxiliary','regression','publish','gates','seal','actions']
overlay_ref=observed['filesystemOverlay'];overlay=load(Path(overlay_ref['path']));assert sha(Path(overlay_ref['path']))==overlay_ref['sha256']
assert overlay['profile']=='umf.actions.container-local-source-overlay/2' and overlay['sourceRevision']==revision and overlay['imageId']==runtime['imageId'] and overlay['beforeMatches']
assert overlay['completeSourceInputs']==native['sourceInputs'] and set(overlay['beforeEachStage'])==set(overlay['afterEachStage'])==set(stages)
assert all(overlay['beforeEachStage'].values()) and all(overlay['afterEachStage'].values())
assert observed['coordinator']=={'path':'/private/tmp/umf-strict-primary-qualification-5be80ab9.py','sha256':'1b381cc9e8cab1308c4c664b0b47e46212dcf1b931f2f77090ac9ddfb7a2bc12'}
assert sha(Path(observed['coordinator']['path']))==observed['coordinator']['sha256']
expected_overlay_roots=['tests','scripts','docs/helix/01-frame/user-stories']
assert set(overlay['sourceFiles'])==set(expected_overlay_roots) and overlay['volumes']=={p:F.name+'-local-'+('stories' if p.startswith('docs/') else p) for p in expected_overlay_roots}
for root in expected_overlay_roots:
 entries=list((F/root).rglob('*'));assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries)
 current={str(p.relative_to(F)):sha(p) for p in sorted(entries) if p.is_file()};assert current==overlay['sourceFiles'][root]
 if root in ['tests','scripts']:assert current=={p:h for p,h in native['sourceInputs'].items() if p.startswith(root+'/')}
 else:
  paths=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',root],cwd=F,text=True).splitlines();assert set(paths)==set(current)
  for p,h in current.items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+p],cwd=F)).hexdigest()==h
mount_args=sum((['-v',overlay['volumes'][p]+':/work/'+p+':ro'] for p in expected_overlay_roots),[])
strict_code="import json,hashlib; from pathlib import Path; roots="+repr(expected_overlay_roots)+"; entries={p:sorted(Path('/work',p).rglob('*')) for p in roots}; assert all(not f.is_symlink() and (f.is_file() or f.is_dir()) for fs in entries.values() for f in fs); print(json.dumps({p:{str(f.relative_to('/work')):hashlib.sha256(f.read_bytes()).hexdigest() for f in fs if f.is_file()} for p,fs in entries.items()},sort_keys=True))"
check=['docker','run','--rm','-v',str(F)+':/work:ro',*mount_args,'--entrypoint','python',runtime['imageId'],'-c',strict_code]
assert overlay['checkCommand']==check and json.loads(subprocess.check_output(check,text=True))==overlay['sourceFiles']
copy=['docker','run','--rm','-v',str(F)+':/source:ro']+sum((['-v',overlay['volumes'][p]+':/copy/'+p] for p in expected_overlay_roots),[])+['--entrypoint','python',runtime['imageId'],'-c',"import shutil; roots="+repr(expected_overlay_roots)+"; [shutil.copytree('/source/'+p,'/copy/'+p,dirs_exist_ok=True) for p in roots]"]
assert overlay['copyCommand']==copy
runtime_observed=load(Path('/private/tmp/umf-integrated-runtime-observation-5be80ab9.json'));assert set(runtime_observed)==set(stages)
required_reports={'prepare':{'fixtures/validation/core-check-refresh/prepare-runtime-observation.json'},'native':{'fixtures/validation/core-check-refresh/native-browser.json'},'auxiliary':{'fixtures/validation/core-check-refresh/auxiliary.json','fixtures/extension-package-audit.json','fixtures/json-schema-audit.json'},'regression':{'fixtures/validation/core-check-refresh/regression.json'},'publish':{'fixtures/validation/core-check-refresh/publication.json'},'gates':{'fixtures/validation/core-check-refresh/container-gates.json','fixtures/validation/core-check-refresh/container-integrity.json'},'seal':{'fixtures/validation/core-check-refresh/final-seal.json'},'actions':{'fixtures/actions/reference-foundation.json'}}
for row in observed['runs']:
 stage=row['stage'];actual=runtime_observed[stage];image=runtime['imageId'];assert set(row['generatedReports'])==required_reports[stage] and row['inputChecks']=={'before':{'pass':True},'after':{'pass':True}}
 command=['docker','run','--network',F.name,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock',*mount_args,'-e','UMF_REFERENCE_DOCKER_NETWORK='+F.name,'-e','UMF_REPLAY_IMAGE_ID='+image,'--name',F.name+'-'+stage]+(['--entrypoint','bun',image,'scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [image,stage])
 assert row['command']==command and row['imageId']==actual['imageId']==image
 assert actual['pins']=={'UMF_REFERENCE_DOCKER_NETWORK':F.name,'UMF_REPLAY_IMAGE_ID':image,'UMF_EXPECTED_CHROMIUM_VERSION':'153.0.8010.12'} and actual['networks']==[F.name]
 assert len(actual['mounts'])==5 and any(Path(m['source'])==F and m['destination']=='/work' and m['type']=='bind' and m['rw'] is True for m in actual['mounts'])
 assert any(m['source']=='/var/run/docker.sock' and m['destination']=='/var/run/docker.sock' and m['type']=='bind' and m['rw'] is True for m in actual['mounts'])
 for p,n in overlay['volumes'].items():assert any(m['destination']=='/work/'+p and m['type']=='volume' and m['name']==n and m['rw'] is False for m in actual['mounts'])
 assert actual['command']==(['scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [stage]) and actual['entrypoint']==(['bun'] if stage=='actions' else ['/opt/venv/bin/python','/opt/replay.py'])
prepare=load(O/'prepare-runtime-observation.json');assert prepare=={k:v for k,v in runtime.items() if k!='finalizationPublisher'}
for name in ['container-install','container-protobuf']:
 row=load(O/(name+'.json'));assert row['exitCode']==0 and sha(F/row['log'])==row['logSha256']
 assert row['command']==(['bun','install','--frozen-lockfile'] if name=='container-install' else ['bun','run','build:protobuf'])
metadata=load(Path('/private/tmp/umf-integrated-handler-metadata-execution-5be80ab9.json'))
assert metadata['command']==['bun','/private/tmp/umf-integrated-handler-metadata-probe-5be80ab9.ts'] and metadata['scriptSha256']=='658d23f998420e6dc22a30c94fa402b8b534afdfab31e1920f3ce56ae9115713'
assert metadata['sourceRevision']==revision and metadata['exitCode']==0 and sha(Path(metadata['log']))==metadata['logSha256'] and sha(Path(metadata['command'][1]))==metadata['scriptSha256']
metadata_rows=[json.loads(line) for line in Path(metadata['log']).read_text().splitlines() if line.startswith('{')]
m=metadata_rows[0]['handlerMetadataProbe'];assert m['bun']=='1.4.2' and m['fullActionAndSourcePreserved'] and m['jsonYamlRecoveries']==2 and m['declaredAuthoringExact'] and m['independentExpectedObligations']==16 and m['actualInventory']==21 and m['omittedClaimControls']==16 and m['unknownUnsupportedControls']==2
assert metadata_rows[-1]['probeSha256']==metadata['scriptSha256']
assert metadata_rows[0]['handlerMetadataProbe']['inertFetchCalls']==0 and metadata_rows[0]['handlerMetadataProbe']['executionVerified'] is False and metadata_rows[-1]['sourceHeldStable'] and metadata_rows[-1]['capturedInputs']==len(native['sourceInputs'])
seal=load(O/'final-seal.json');assert seal['complete'] and seal['sourceRevision']==revision
for path,h in seal['sha256'].items():assert sha(F/path)==h
assert seal['sealingRuntime']=={'imageId':finalization['imageId'],'replayScriptSha256':finalization['files']['replay.py'],'sealScriptSha256':finalization['files']['seal.py']}
assert sha(F/'dist/umf.js')==load(F/'fixtures/validation/core-schema-properties-browser.json')['bundleSha256'] and 'dist/umf.js' in seal['sha256']
assert seal['schemaProperties']=={'browser':{'cases':38,'recoveries':4,'refusals':12,'getterCalls':0,'extensionChecks':6,'unknownUnitChecks':4},'independentLiteralOracle':{'probes':58,'agreed':58}}
for name in ['container-publication','container-schema-properties-inputs','container-schema-properties-oracle','container-affected']:
 row=load(O/(name+'.json'));assert row['exitCode']==0 and sha(F/row['log'])==row['logSha256']
publication=load(O/'publication.json');assert publication['complete'] and publication['nativeBrowserCommands']==174

aux=load(O/'auxiliary.json');reg=load(O/'regression.json');gate=load(O/'container-gates.json');integrity=load(O/'container-integrity.json')
assert len(aux['runs'])==6 and len(reg['runs'])==4
expected_aux=[c for c in relationship if c[:2]==['bun','test']]+[['.venv/bin/python','scripts/core-ideals/field-tablespec-oracle.py'],['.venv/bin/python','scripts/core-ideals/field-tablespec-projection-oracle.py'],['bun','scripts/core-schema-properties-browser.ts'],['bun','run','typecheck'],['bun','run','test:schemas']]
assert [r['command'] for r in aux['runs']]==expected_aux
all_current=sorted(str(p.relative_to(F)) for p in (F/'tests').rglob('*.test.ts'))
assert len(all_current)==456 and len(native['sourceInputs'])==7915
paths=[p for p in all_current if not ('/core-ideals/' in p and p.endswith(('conformance.test.ts','evidence.test.ts')))];groups=[[],[],[],[]]
for path in paths:
 category=path.split('/')[1]
 if category in ['rdf','rdfxml','jsonld','shacl']:index=sum(len(g) for g in groups[:2])%2
 elif category in ['typespec','smithy','openapi','json-schema','protobuf','projections','graphql']:index=2
 else:index=3
 groups[index].append(path)
assert [r['command'] for r in reg['runs']]==[['bun','test',*group] for group in groups]
expected_gate=sorted(str(p.relative_to(F)) for p in (F/'tests/core-ideals').glob('*.test.ts') if p.name.endswith(('conformance.test.ts','evidence.test.ts')))
assert gate['command']==['bun','test',*expected_gate] and len(expected_gate)==8
assert integrity['command']==['bun','scripts/verify-current-core-evidence.ts']
runs=native['runs']+aux['runs']+reg['runs']+[gate,integrity]
for row in runs:assert row['exitCode']==0 and sha(F/row['log'])==row['logSha256'],('Failed or changed execution',row['log'])
failed_regression=reg.get('failedAttempts',[])
for attempt in failed_regression:
 assert attempt['exitCode']!=0 and attempt['command'] in [r['command'] for r in reg['runs']]
 path=Path(attempt['log']);assert str(path).startswith('fixtures/validation/core-check-refresh/regression-serial-failed-') and '..' not in path.parts
 assert sha(F/path)==attempt['logSha256']
 assert '(fail)' in (F/path).read_text(), 'Failed retry history missing actual failure'
summary=re.compile(r'\n\s*(\d+) pass\n\s*(\d+) fail\n\s*(\d+) expect\(\) calls\nRan (\d+) tests across (\d+) files\.')
gate_summary=summary.findall((F/gate['log']).read_text())[-1];assert tuple(map(int,(gate_summary[i] for i in [0,1,3,4])))==(17,0,17,8)
files=[];tests=assertions=0
for row in reg['runs']+[gate]:
 assert row['command'][:2]==['bun','test'];inventory=row['command'][2:]
 text=(F/row['log']).read_text();ok,bad,calls,total,size=map(int,summary.findall(text)[-1]);assert bad==0 and ok==total and size==len(inventory)
 assert not re.search(r'\b[1-9][0-9]* skip\b',text),'Skipped tests'
 files+=inventory;tests+=ok;assertions+=calls
expected={str(p.relative_to(F)) for p in (F/'tests').rglob('*.test.ts')}
assert len(files)==len(set(files)) and set(files)==expected
closures=[json.loads(s) for s in (F/integrity['log']).read_text().splitlines() if s.startswith('{')]
assert {r['concept'] for r in closures}=={'field','nullability','cardinality','facets','key','relationship'} and all(r['currentEvidenceVerified'] for r in closures)
browser_run=load(Path('/private/tmp/umf-integrated-browser-execution-5be80ab9.json'));assert browser_run['generatedReport']['path']=='fixtures/actions/browser.json' and browser_run['command']==['bun','scripts/actions-browser.ts'] and browser_run['sourceRevision']==revision and browser_run['exitCode']==0 and sha(Path(browser_run['log']))==browser_run['logSha256'] and sha(F/browser_run['generatedReport']['path'])==browser_run['generatedReport']['sha256']
browser=load(F/'fixtures/actions/browser.json');assert len(browser['result']['cases'])==44 and browser['bunParity'] and browser['externalRequests']==[]
for p,h in browser['sha256'].items():assert sha(F/p)==h,('Browser input changed',p)
foundation=load(F/'fixtures/actions/reference-foundation.json');assert foundation['sourceHeldStable'] and foundation['fail']==0 and foundation['pass']==119
assert browser['browser']=='153.0.8010.12' and browser['playwright']=='1.63.0' and browser['bun']=='1.4.2'
assert foundation['bun']=='1.4.2' and foundation['nativeVersionNumber']=='170009' and foundation['imageIdentity']=='sha256:2a0d0fe14825b0939f78a8cad5cd4e6aa68bf94d0e5dd96e24b6d23af4315545'
assert foundation['handlerEnvironment']['imageIdentity']=='sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27' and foundation['handlerEnvironment']['node']=='v24.20.0'
def action_inputs(root):
 fixed=['fixtures/actions/create-link.json','fixtures/actions/graph-oracle.json','package.json','bun.lock','src/model/json.ts','src/model/types.ts','src/model/schema-literals.ts','src/model/key-tuple.ts','fixtures/actions/composite-key.json','docs/helix/02-design/contracts/CONTRACT-900-declarative-actions.md','docs/helix/02-design/contracts/CONTRACT-901-transactional-action-profile.md','docs/helix/02-design/technical-designs/TD-056-transactional-actions.md','docs/helix/03-test/test-plans/STP-056-transactional-actions.md','docs/helix/01-frame/user-stories/US-056-transactional-actions.md','fixtures/actions/approve.json']
 paths=set(fixed)
 for directory in ['scripts/actions-reference','tests/actions-reference','src']:
  paths.update(str(p.relative_to(root)) for p in (root/directory).rglob('*') if p.is_file() and not any(x.startswith('.') for x in p.relative_to(root).parts))
 paths.update(str(p.relative_to(root)) for p in (root/'spec').rglob('*.json') if not any(x.startswith('.') for x in p.relative_to(root).parts))
 return {p:sha(root/p) for p in sorted(paths)}
assert action_inputs(F)==action_inputs(R)==foundation['sha256'],'Exact native action source inventory changed'
# Qualifier buffers its child streams: their digest is recorded, not independently verified.
# Entire fresh native test output is independently retained in the disjoint regression logs.

records={}
for row in reg['runs']:
 for s in (F/row['log']).read_text().splitlines():
  if not s.startswith('{'):continue
  try:v=json.loads(s)
  except ValueError:continue
  for k in ['nativeRefinement','nativeMutation','nativeInvariantMutation','nativeCompositeKey','nativeUnsupportedRelationships']:
   if k in v:assert k not in records;records[k]=v[k]
assert (records['nativeRefinement']['traces'],records['nativeRefinement']['transitions'],records['nativeRefinement']['mismatches'])==(216,648,0)
assert records['nativeMutation']['killed']==records['nativeMutation']['total']==3 and records['nativeInvariantMutation']['killed']==records['nativeInvariantMutation']['total']==2
mutants=[('skip-replay','executor.ts','if(request.key){const replay=','if(false&&request.key){const replay=',1),('ignore-role-membership','policy.ts','if(rows.length===1)return;','return;',2),('omit-terminal-audit','executor.ts','   await tx`insert into action_audit(','   if(false)await tx`insert into action_audit(',1),('per-key-canonical-identity','state.ts',"canonical:entity?'entity:'+entity.id:","canonical:entity?'key:'+referenceAliasIdentity(identity.entity,identity.tupleHex):",1),('skip-missing-projection-prefix','projection.ts','const next=prefix+1n,id=','const next=applied===0?BigInt(request.sequence):prefix+1n,id=',1)]
w=records['nativeMutation']['witnesses']+records['nativeInvariantMutation']['witnesses'];assert len(w)==5
for ident,name,old,new,count in mutants:
 source=(F/'scripts/actions-reference'/name).read_text();assert source.count(old)==count;row=next(x for x in w if x['id']==ident);assert hashlib.sha256(source.encode()).hexdigest()==row['sourceSha256'];assert hashlib.sha256(source.replace(old,new).encode()).hexdigest()==row['mutantSha256']
original=load(R/'docs/helix/04-build/evidence/actions-certification.json')
assert sha(R/'docs/helix/04-build/evidence/actions-certification.json')=='807a379eae15cf49998890c3ac02f16837192dfde46f1730d438fd1dda7c18da'
ledger_path='docs/helix/03-test/acceptance-criteria-ledger.json'
assert subprocess.check_output(['git','show',revision+':'+ledger_path],cwd=F)==(F/ledger_path).read_bytes()==(R/ledger_path).read_bytes(), 'Acceptance ledger drift'
ledger=load(F/ledger_path)
expected_criteria={'US-900-AC'+str(i) for i in range(1,10)}|{'US-056-AC'+str(i) for i in range(1,13)}
rows=[r for r in ledger['criteria'] if r['id'] in expected_criteria];assert len(rows)==21 and {r['id'] for r in rows}==expected_criteria
criteria=[]
for row in rows:
 assert row['status']=='SATISFIED' and row['evidence'];witnesses=[]
 for location in row['evidence']:
  p,line=location.rsplit(':',1);assert p in files;lines=(F/p).read_text().splitlines();assert 1<=int(line)<=len(lines)
  assert re.search(r'@covers\s+'+re.escape(row['id'])+r'(?![0-9])',lines[int(line)-1]),('Current citation missing',row['id'],location)
  witnesses.append({'location':location,'sha256':sha(F/p)})
 criteria.append({'criterion':row['id'],'status':'current cited tests executed/pass for stated bounded scope','witnesses':witnesses,'historicalCriterion':row['id'].replace('US-900','US-055')})
assert {r['criterion'] for r in criteria}=={r['criterion'].replace('US-055','US-900') for r in original['criteria']}
assert seal['uniqueTests']==tests and seal['uniqueTestFiles']==len(files)

csv_execution=load(Path('/private/tmp/umf-integrated-csv-browser-execution-5be80ab9.json'))
assert csv_execution['sourceRevision']==revision and csv_execution['exitCode']==0 and csv_execution['sourceHeldStable'] and csv_execution['sourceInputs']==native['sourceInputs']
csv_root=Path(csv_execution['outputRoot']);assert csv_execution['command']==['bun','scripts/browser-csv-boolean-lexical.ts',str(csv_root)]
assert sha(Path(csv_execution['log']))==csv_execution['logSha256'] and set(csv_execution['reports'])=={'umf.js','original-input.json','receipts.json','report.json'}
for path,h in csv_execution['reports'].items():assert sha(csv_root/path)==h
csv_report=load(csv_root/'report.json');csv_receipts=load(csv_root/'receipts.json')
assert csv_report['browserVersion']=='153.0.8010.12' and csv_report['tokens']==['true','false','True','False'] and len(csv_report['controls'])==10
assert csv_report['bundleSha256']==sha(csv_root/'umf.js') and csv_report['inputSha256']==sha(csv_root/'original-input.json') and csv_report['receiptsSha256']==sha(csv_root/'receipts.json')
assert csv_report['modelSha256']==sha(F/'spec/domain-packs/medical/ontology.json')
assert len(csv_receipts['receipts'])==4 and csv_receipts['invalid']['validation']['valid'] is False and csv_receipts['incomplete']['validation']['complete'] is False
assert 'tests/csv-boolean-lexical.test.ts' in files
tutorial=load(Path('/private/tmp/umf-integrated-native-tutorial-execution-5be80ab9.json'))
assert tutorial['sourceRevision']==revision and tutorial['exitCode']==0 and tutorial['imageId']==runtime['imageId'] and tutorial['capturedSourceMatchesAfterExecution']
assert tutorial['capturedInputCount']==len(native['sourceInputs']) and tutorial['capturedInputInventorySha256']==hashlib.sha256(json.dumps(native['sourceInputs'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
assert tutorial['command']==['docker','run','--rm','--network',F.name,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK='+F.name,'--entrypoint','bun',runtime['imageId'],'run','docs:example:native']
assert sha(Path(tutorial['log']))==tutorial['logSha256']
tutorial_result=json.loads(next(line for line in Path(tutorial['log']).read_text().splitlines() if line.startswith('{')));assert tutorial_result==tutorial['result'] and tutorial_result['bun']=='1.4.2' and tutorial_result['postgres'].startswith('17.9 ')
for key in ['committed','replayMatches','freshNoOp','postconditionCandidateDiscarded','databaseFailureRolledBack','rollbackPreservedNativeState','durableRejectionReplayed','reorderedDeliveryPendingUntilGapClosed','visibleProjectionMatchesNativeRows','revokedReplayDenied']:assert tutorial_result[key] is True
assert tutorial_result['terminalOutcomes']==4 and tutorial_result['outboxFacts']==2
assert tutorial['cleanup']['exactContainer']==tutorial_result['ownedContainer'] and tutorial['cleanup']['dockerPsAllMatches']==[] and tutorial['cleanup']['exitCode']==0
assert subprocess.check_output(['docker','ps','-a','--filter','name='+tutorial_result['ownedContainer'],'--format','{{.ID}} {{.Names}}'],text=True).strip()==''
demonstration_tool=Path('/private/tmp/umf-actions-demonstration-runner-5be80ab9.py')
assert sha(demonstration_tool)=='e8499a8fa5a6054732017b6652ad963292c2928eb92af30864ad4f4596dca50c'
for name,record in [('actions-browser',browser_run),('csv-browser',csv_execution),('native-tutorial',tutorial)]:
 sidecar=load(Path('/private/tmp/umf-integrated-qualification-5be80ab9-'+name+'.log.execution.json'))
 assert sidecar['coordinator']=={'path':str(demonstration_tool),'sha256':'e8499a8fa5a6054732017b6652ad963292c2928eb92af30864ad4f4596dca50c'} and sidecar['postcheckError'] is None
 for key in ['command','sourceRevision','exitCode','log','logSha256']:assert sidecar[key]==record[key]
 assert sidecar['sourceHeldStable'] is True
failed_lineage=[] # New campaign metadata preparation has no known failed attempt.
supplement=load(Path('/private/tmp/umf-integrated-supplementary-execution-5be80ab9.json'))
assert supplement['profile']=='umf.actions.current-primary-supplementary-browser/1' and supplement['sourceRevision']==revision and supplement['runtimeImage']==runtime['imageId'] and supplement['sourceInputs']==native['sourceInputs']
expected_scripts=['scripts/core-evolution-browser.ts','scripts/loader-browser.ts','scripts/public-company-browser.ts','scripts/legal-appellate-browser.ts']
supp_tool=Path('/private/tmp/umf-integrated-supplementary-runner-5be80ab9.py')
assert supplement['coordinator']=={'path':str(supp_tool),'sha256':'52d4996865a45cad1fdbf7bdf04a75a0623793b2b384ffb95c6f001bf6ca55ee'} and sha(supp_tool)==supplement['coordinator']['sha256']
v=supplement['bunVersionObservation'];assert v['command']==['docker','run','--rm','--entrypoint','bun',runtime['imageId'],'--version'] and v['exitCode']==0 and v['version']=='1.4.2' and Path(v['log']).read_text().strip()=='1.4.2' and sha(Path(v['log']))==v['logSha256']
def check_supp_runtime(row,inner,name):
 image=runtime['imageId'];owned=F.name+'-supp-'+name
 outer=['docker','run','--network',F.name,'-v',str(F)+':/work',*mount_args,'--entrypoint','bun','--name',owned,image,*inner[1:]]
 assert row['innerCommand']==inner and row['command']==outer and row['ownedContainer']==owned
 actual=row['runtime'];assert actual['imageId']==row['imageId']==image and actual['command']==inner[1:] and actual['entrypoint']==['bun'] and actual['workingDirectory']=='/work' and actual['networks']==[F.name]
 assert len(actual['mounts'])==4 and any(Path(m['source'])==F and m['destination']=='/work' and m['type']=='bind' and m['rw'] is True for m in actual['mounts'])
 for path,name in overlay['volumes'].items():assert any(m['destination']=='/work/'+path and m['type']=='volume' and m['name']==name and m['rw'] is False for m in actual['mounts'])
for script,name,row in zip(expected_scripts,['core-evolution','loader','public-company','legal-appellate'],supplement['runs']):check_supp_runtime(row,['bun',script,*(['.cache/primary-supplementary/core-evolution'] if name=='core-evolution' else [])],name)
for name,inner,row in zip(['library-build','demo-build','explorer-build'],[['bun','run','build'],['bun','build','docs/helix/05-deploy/microsite/demo.ts','--target','browser','--minify','--outfile','docs/helix/05-deploy/microsite/dist/demo.js'],['bun','docs/helix/05-deploy/microsite/build-explorer.ts']],supplement['builds']):check_supp_runtime(row,inner,name)
assert [r['script'] for r in supplement['runs']]==expected_scripts
for row in supplement['runs']:
 assert row['exitCode']==0 and row['sourceHeldStable'] and row['servedArtifactsHeldStable'] and row['imageId']==runtime['imageId'] and row['bun']=='1.4.2' and sha(Path(row['log']))==row['logSha256']
 assert row['innerCommand'][:2]==['bun',row['script']]
 result=row['result'];assert result['browser']=='153.0.8010.12'
 if row['script']=='scripts/core-evolution-browser.ts':
  expected_reports={'.cache/primary-supplementary/core-evolution/'+n for n in ['entry.ts','browser.js','receipts.json','report.json']}
  assert set(row['generatedReports'])==expected_reports and result==load(F/'.cache/primary-supplementary/core-evolution/report.json')
  assert len(load(F/'.cache/primary-supplementary/core-evolution/receipts.json'))==6
 else:
  actual_results=[]
  for line in Path(row['log']).read_text().splitlines():
   try:value=json.loads(line)
   except ValueError:continue
   if isinstance(value,dict) and 'browser' in value:actual_results.append(value)
  assert actual_results==[result] and row['generatedReports']=={}
 for path,h in row.get('generatedReports',{}).items():assert sha(F/path)==h
results={r['script']:r['result'] for r in supplement['runs']}
e=results[expected_scripts[0]];assert e['cases']==6 and e['resourceControls']==['LIMIT','LIMIT'] and e['completeReceiptParity'] is True
assert results[expected_scripts[1]]['checks']==8
assert results[expected_scripts[2]]['checks']==8 and results[expected_scripts[2]]['ui_checks']==3 and results[expected_scripts[2]]['page_errors']==[]
assert results[expected_scripts[3]]['schemas']==15 and results[expected_scripts[3]]['checks']==20
for row in supplement['builds']:
 assert row['exitCode']==0 and row['sourceHeldStable'] and row['imageId']==runtime['imageId'] and sha(Path(row['log']))==row['logSha256']
assert [r['innerCommand'] for r in supplement['builds']]==[['bun','run','build'],['bun','build','docs/helix/05-deploy/microsite/demo.ts','--target','browser','--minify','--outfile','docs/helix/05-deploy/microsite/dist/demo.js'],['bun','docs/helix/05-deploy/microsite/build-explorer.ts']]
outside='docs/helix/05-deploy/microsite';outside_files=set();closure=supplement['buildInputClosure'];expected_catalog_roots=[outside,'domain-packs','packs','examples/domain-packs'];assert set(closure['roots'])==set(expected_catalog_roots)
for root in expected_catalog_roots:
 entries=list((F/root).rglob('*')) if (F/root).exists() else [];assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries)
 paths={str(p.relative_to(F)) for p in entries if p.is_file() and not(root==outside and '/dist/' in str(p.relative_to(F)))}
 committed=set(subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',root],cwd=F,text=True).splitlines());committed={p for p in committed if not(root==outside and '/dist/' in p)}
 assert paths==committed and closure['roots'][root]=={'present':(F/root).exists(),'files':{path:sha(F/path) for path in sorted(paths)}};outside_files|=paths
fixed='fixtures/core/schema-properties.json';assert closure['fixed']=={fixed:sha(F/fixed)};outside_files.add(fixed)
research=F/outside/'dist/research';release=research/'release.json';research_files={}
if release.exists():
 assert not release.is_symlink();research_files[str(release.relative_to(F))]=sha(release)
 for artifact in load(release)['artifacts']:
  if not artifact['reference'].endswith('.py'):continue
  path=research/artifact['reference'];assert path.resolve().is_relative_to(research.resolve()) and path.is_file() and not path.is_symlink();h=sha(path);assert h==artifact['sha256'];research_files[str(path.relative_to(F))]=h
assert closure['research']=={'present':release.exists(),'files':research_files};outside_files|=set(research_files)
static={};dist=F/outside/'dist'
for path in dist.rglob('*'):
 relative=str(path.relative_to(dist))
 if not path.is_file() or relative in ['demo.js','explorer.js','schema-catalog.json'] or relative.startswith('pack-assets/'):continue
 assert not path.is_symlink();static[str(path.relative_to(F))]=sha(path)
committed_static=set(subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',outside+'/dist'],cwd=F,text=True).splitlines())
prefix=outside+'/dist/'
committed_static={p for p in committed_static if p[len(prefix):] not in ['demo.js','explorer.js','schema-catalog.json'] and not p[len(prefix):].startswith('pack-assets/')}
assert set(static)==committed_static,'Static site inventory differs from frozen Git'
assert closure['staticSiteInputs']==static;outside_files|=set(static)
assert outside_files==set(supplement['outsideCoreBuildInputs'])
site_files={str(p.relative_to(F)) for p in (F/outside/'dist').rglob('*') if p.is_file()}
assert set(supplement['servedArtifacts'])==site_files|{'dist/umf.js'}
assert all(not (F/p).is_symlink() for p in outside_files|site_files|{'dist/umf.js'})
for path,h in supplement['outsideCoreBuildInputs'].items():
 assert sha(F/path)==h and hashlib.sha256(subprocess.check_output(['git','show',revision+':'+path],cwd=F)).hexdigest()==h
for path,h in supplement['servedArtifacts'].items():assert sha(F/path)==h
assert 'dist/umf.js' in supplement['servedArtifacts'] and 'docs/helix/05-deploy/microsite/dist/explorer.html' in supplement['servedArtifacts']
governing_paths=['docs/helix/01-frame/user-stories/US-900-declarative-actions.md','docs/helix/01-frame/user-stories/US-056-transactional-actions.md','docs/helix/02-design/technical-designs/TD-900-declarative-actions.md','docs/helix/02-design/technical-designs/TD-056-transactional-actions.md','docs/helix/03-test/test-plans/STP-900-declarative-actions.md','docs/helix/03-test/test-plans/STP-056-transactional-actions.md','docs/helix/02-design/contracts/CONTRACT-900-declarative-actions.md','docs/helix/02-design/contracts/CONTRACT-901-transactional-action-profile.md']
governing={}
for path in governing_paths:
 committed=subprocess.check_output(['git','show',revision+':'+path],cwd=F)
 assert committed==(F/path).read_bytes()==(R/path).read_bytes(),('Governing source drift',path)
 governing[path]=sha(F/path)
report={'profile':'umf.actions.integrated-qualification-audit/1','pass':True,'sourceRevision':native['sourceRevision'],'sourceInputs':len(native['sourceInputs']),'nativeActionInputs':len(foundation['sha256']),'nativeBrowserCommands':174,'auxiliaryCommands':6,'distinctTests':tests,'distinctFiles':len(files),'assertions':assertions,'failures':0,'browserCases':44,'nativeTests':119,'criteria':21,'nativeRefinementHistories':216,'nativeRefinementTransitions':648,'actualImplementationMutantHashesVerified':5,'qualifierBufferedStreamIndependentlyVerified':False,'nativeRawExecutionEvidence':[row['log'] for row in reg['runs'] if any('/actions-reference/' in p for p in row['command'][2:])],'supplementalMetadataExecution':metadata,'primarySupplementaryBrowsers':supplement,'scope':'Exact recorded bounded action/reference profile and integrated core prerequisites; no universal completeness or production/downstream adoption claim','csvIntegration':{'execution':csv_execution,'browserTokens':4,'browserRefusalControls':10,'historicalSourceBaseAnnotation':csv_report['sourceBase']},'filesystemOverlay':overlay,'failedActionStages':observed.get('failedActionStages',[]),'historicalFailedCampaign':historical,'regressionProvenance':{'allFourShards':'Fresh complete current-source commands using byte-verified read-only local source overlays'},'failedRegressionAttempts':failed_regression,'nativeTutorial':tutorial,'failedMetadataAttemptLineage':failed_lineage,'finalizationTooling':{'current':finalization,'historicalVariants':[m for _,m in variants[1:]],'failedAttempts':observed.get('failedAttempts',[]),'supersededStages':observed.get('supersededStages',[])},'governingInputs':governing,'acceptanceLedgerSha256':sha(F/ledger_path),'criteriaWitnessLineage':criteria,'implementationRecords':records}
Path('/private/tmp/umf-integrated-qualification-audit-5be80ab9.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['pass','sourceRevision','sourceInputs','nativeActionInputs','nativeBrowserCommands','auxiliaryCommands','distinctTests','distinctFiles','assertions','failures','browserCases','nativeTests','criteria']}))
