from pathlib import Path
import json,hashlib,re,subprocess
F=Path('/private/tmp/umf-integrated-qualification-40e83200');R=Path('/Users/erik/.codex/worktrees/actions-requirements-design/umf');O=F/'fixtures/validation/core-check-refresh'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
native=load(O/'native-browser.json');runtime=load(O/'container-runtime.json')
assert native['complete'] and native['sourceRevision']==runtime['sourceRevision']=='40e83200c16e9daa632ed269831cf0f72002533d'
assert len(native['runs'])==174 and [r['command'] for r in native['runs']]==native['commands']
roots=['src','scripts','spec','tests','native','package.json','bun.lock']
revision=native['sourceRevision']
def tracked_inputs(root):
 rows=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*roots],cwd=root).decode().split('\0')
 return {p:sha(root/p) for p in sorted(set(rows)) if p}
assert tracked_inputs(F)==tracked_inputs(R)==native['sourceInputs'],'Complete source inventory changed'
tree=subprocess.check_output(['git','ls-tree','-r','-z',revision,'--',*roots],cwd=F).decode().split('\0')
objects={}
for row in tree:
 if not row:continue
 meta,p=row.split('\t');mode,kind,oid=meta.split();assert kind=='blob' and mode in ['100644','100755'];objects[p]=oid
assert set(objects)==set(native['sourceInputs']),'Capture differs from immutable commit inventory'
for p,oid in objects.items():
 content=(F/p).read_bytes();assert hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()==oid,('Frozen bytes differ from commit',p)
assert runtime['imageId']=='sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249' and runtime['bun']=='1.4.2' and native['expectedBrowser']=='153.0.8010.12'
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
observed=load(Path('/private/tmp/umf-integrated-execution-observation-40e83200.json'))
assert [r['stage'] for r in observed['runs']]==['native','auxiliary','regression','publish','gates','seal','actions'] and observed['sourceRevision']==revision and observed['runtimeImage']==runtime['imageId']
for row in observed['runs']:
 assert row['exitCode']==0 and sha(Path(row['log']))==row['logSha256']
 for path,h in row['generatedReports'].items():assert sha(F/path)==h,('Generated report changed',path)
finalization_root=Path('/private/tmp/umf-core08-finalization')
finalization=load(finalization_root/'runtime.json');assert observed['finalizationRuntime']==finalization
assert finalization['parentImageId']==runtime['imageId'] and finalization['imageId']=='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1'
variants=[(finalization_root,finalization)]
if revision.startswith('5c0b99e5'):
 old_root=Path('/private/tmp/umf-core08-finalization-original');old=load(old_root/'runtime.json');assert observed['priorFinalizationRuntime']==old and old['imageId']=='sha256:0fb6c23754f94db124c256b5db04c6c7cbfdc3b56f90f357a8643573bc9e86cf';variants.append((old_root,old))
for tool_root,manifest in variants:
 for name,h in manifest['files'].items():assert sha(tool_root/name)==h
 parent,child=[json.loads(subprocess.check_output(['docker','image','inspect',i]))[0] for i in [manifest['parentImageId'],manifest['imageId']]]
 assert parent['Config']==child['Config'] and child['RootFS']['Layers'][:len(parent['RootFS']['Layers'])]==parent['RootFS']['Layers'] and child['RootFS']['Layers'][len(parent['RootFS']['Layers']):]==manifest['addedLayers'] and len(manifest['addedLayers'])==2
 tool_bytes=subprocess.check_output(['docker','run','--rm','--entrypoint','sha256sum',manifest['imageId'],'/opt/replay.py','/opt/seal.py'],text=True)
 assert {Path(line.split()[1]).name:line.split()[0] for line in tool_bytes.splitlines()}=={name:manifest['files'][name] for name in ['replay.py','seal.py']}
for attempt in observed.get('failedAttempts',[]):
 row=attempt['execution'];assert row['stage']=='publish' and row['exitCode']==1 and row['imageId']==runtime['imageId']
 retained=attempt['relocation'];raw=retained['rawStageLog'];assert raw['originalPath']==row['log'] and raw['sha256']==row['logSha256'] and sha(Path(raw['retainedPath']))==row['logSha256']
 archive=Path(raw['retainedPath']).parent
 assert load(archive/'execution-observation.json')['runs'][-1]==row and load(archive/'runtime-observation.json')['publish']==attempt['runtime']
 for original,item in retained.items():assert sha(Path(item['retainedPath']))==item['sha256']
 for path,h in row['generatedReports'].items():assert retained[path]['sha256']==h and 'pre-existing' in retained[path]['meaning']
 child_failure=load(archive/'container-semantic-inputs.json');assert child_failure['command']==['bun','scripts/core-semantic-types-oracle-inputs.ts'] and child_failure['exitCode']==1 and child_failure['logSha256']==sha(archive/'container-semantic-inputs.log')
assert len(observed.get('failedActionStages',[]))==1
assert observed['failedActionStages'][0]['dispositionSha256']=='9e7e3795d45f4b6ed0bbaeb901efebea3cd5bc870c9529bf1924ff17170ec1bb'
for attempt in observed.get('failedActionStages',[]):
 archive=Path(attempt['archive']);assert sha(archive/'disposition.json')==attempt['dispositionSha256'];d=load(archive/'disposition.json');row=attempt['execution']
 assert row==d['stage'] and row['stage']=='actions' and row['exitCode']==1 and attempt['runtime']==d['runtime']
 assert load(archive/'umf-integrated-execution-observation-40e83200.json')['runs'][-1]==row and load(archive/'umf-integrated-runtime-observation-40e83200.json')['actions']==attempt['runtime']
 for name,h in d['files'].items():assert sha(archive/name)==h
 assert sha(archive/Path(row['log']).name)==row['logSha256'] and sha(archive/'reference-foundation.json')==row['generatedReports']['fixtures/actions/reference-foundation.json']
 assert 'not fresh successful output' in d['foundationMeaning']
 # Recovery is a retained operator observation, not independently captured executable proof.
 assert d['operatorRecovery']['exitCode']==0 and d['operatorRecovery']['cleanupConfirmed'] is True
if revision.startswith('5c0b99e5'):
 assert len(observed.get('supersededStages',[]))==1
 previous_seal=observed['supersededStages'][0];assert previous_seal['execution']['imageId']==previous_seal['runtime']['imageId']==old['imageId']
for superseded in observed.get('supersededStages',[]):
 row=superseded['execution'];assert row['stage']=='seal' and row['exitCode']==0
 assert sha(Path(superseded['retainedLog']))==row['logSha256']
 for path,item in superseded['retainedReports'].items():assert sha(Path(item['path']))==row['generatedReports'][path]==item['sha256']
 old_seal=load(Path(superseded['retainedReports']['fixtures/validation/core-check-refresh/final-seal.json']['path']));assert set(superseded['retainedClosure'])==set(old_seal['sha256'])
 for path,item in superseded['retainedClosure'].items():assert sha(Path(item['path']))==old_seal['sha256'][path]==item['sha256']
overlay_ref=observed['regressionFilesystemOverlay'];overlay=load(Path(overlay_ref['path']));assert sha(Path(overlay_ref['path']))==overlay_ref['sha256']
assert overlay['sourceRevision']==revision and overlay['imageId']==runtime['imageId'] and overlay['beforeMatches'] and overlay['afterMatches'] and overlay['exitCode']==0
expected_overlay_roots=['tests','scripts','docs/helix/01-frame/user-stories']
assert set(overlay['sourceFiles'])==set(expected_overlay_roots) and overlay['volumes']=={p:F.name+'-local-'+('stories' if p.startswith('docs/') else p) for p in expected_overlay_roots}
for root in expected_overlay_roots:
 entries=list((F/root).rglob('*'));assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries)
 current={str(p.relative_to(F)):sha(p) for p in sorted(entries) if p.is_file()};assert current==overlay['sourceFiles'][root]
 if root in ['tests','scripts']:assert current=={p:h for p,h in native['sourceInputs'].items() if p.startswith(root+'/')}
 else:
  paths=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',root],cwd=F,text=True).splitlines();assert set(paths)==set(current)
  for p,h in current.items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+p],cwd=F)).hexdigest()==h
overlay_mount_args=sum((['-v',overlay['volumes'][p]+':/work/'+p+':ro'] for p in expected_overlay_roots),[])
original_check_code="import json,hashlib; from pathlib import Path; roots="+repr(expected_overlay_roots)+"; print(json.dumps({p:{str(f.relative_to('/work')):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(Path('/work',p).rglob('*')) if f.is_file() and not f.is_symlink()} for p in roots},sort_keys=True))"
expected_overlay_check=['docker','run','--rm','-v',str(F)+':/work:ro',*overlay_mount_args,'--entrypoint','python',runtime['imageId'],'-c',original_check_code]
assert overlay['beforeCommand']==overlay['afterCommand']==expected_overlay_check
strict_code="import json,hashlib; from pathlib import Path; roots="+repr(expected_overlay_roots)+"; entries={p:sorted(Path('/work',p).rglob('*')) for p in roots}; assert all(not f.is_symlink() and (f.is_file() or f.is_dir()) for fs in entries.values() for f in fs); print(json.dumps({p:{str(f.relative_to('/work')):hashlib.sha256(f.read_bytes()).hexdigest() for f in fs if f.is_file()} for p,fs in entries.items()},sort_keys=True))"
strict_check=expected_overlay_check[:-1]+[strict_code]
assert json.loads(subprocess.check_output(strict_check,text=True))==overlay['sourceFiles'],'Retained read-only local volumes changed or contain special entries'

assert len(observed['failedRegressionStages'])==1
failed_stage=observed['failedRegressionStages'][0];archive=Path(failed_stage['retainedDirectory']);old_row=failed_stage['execution']
assert old_row['stage']=='regression' and old_row['exitCode']==1 and old_row['imageId']==runtime['imageId']
assert sha(archive/'regression.log')==old_row['logSha256'] and sha(archive/'regression.json')==old_row['generatedReports']['fixtures/validation/core-check-refresh/regression.json']
assert load(archive/'execution-observation.json')['runs'][-1]==old_row and load(archive/'runtime-observation.json')['regression']==failed_stage['runtime']
previous_regression=load(archive/'regression.json');current_regression=load(O/'regression.json')
assert previous_regression['runs'][:3]==current_regression['runs'][:3] and previous_regression['runs'][3]['command']==current_regression['runs'][3]['command']
assert current_regression['runs'][3]['exitCode']==0 and any(a['logSha256']==previous_regression['runs'][3]['logSha256'] and a['command']==previous_regression['runs'][3]['command'] for a in current_regression['failedAttempts'])
assert overlay['unchangedPriorShards']==[1,2,3] and overlay['freshCompleteShard']==4
runtime_observed=load(Path('/private/tmp/umf-integrated-runtime-observation-40e83200.json'))
assert set(runtime_observed)=={'native','auxiliary','regression','publish','gates','seal','actions'}
required_reports={'native':{'fixtures/validation/core-check-refresh/native-browser.json'},'auxiliary':{'fixtures/validation/core-check-refresh/auxiliary.json','fixtures/extension-package-audit.json','fixtures/json-schema-audit.json'},'regression':{'fixtures/validation/core-check-refresh/regression.json'},'publish':{'fixtures/validation/core-check-refresh/publication.json'},'gates':{'fixtures/validation/core-check-refresh/container-gates.json','fixtures/validation/core-check-refresh/container-integrity.json'},'seal':{'fixtures/validation/core-check-refresh/final-seal.json'},'actions':{'fixtures/actions/reference-foundation.json'}}
for row in observed['runs']:
 stage=row['stage'];actual=runtime_observed[stage]
 image=finalization['imageId'] if stage in ['publish','gates','seal'] else runtime['imageId']
 if revision.startswith('5c0b99e5') and stage in ['publish','gates']:image=old['imageId']
 assert set(row['generatedReports'])==required_reports[stage]
 expected_command=['docker','run']+['--network','umf-integrated-qualification-40e83200','-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK=umf-integrated-qualification-40e83200','-e','UMF_REPLAY_IMAGE_ID='+image,'--name','umf-integrated-qualification-40e83200-'+stage]+(['--entrypoint','bun',image,'scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [image,stage])
 if stage=='regression':
  expected_command[expected_command.index('-e'):expected_command.index('-e')]=sum((['-v',overlay['volumes'][p]+':/work/'+p+':ro'] for p in expected_overlay_roots),[])
  expected_command+=['--resume']
 assert row['command']==expected_command and row['imageId']==image,'Launch arguments differ from planned execution' 
 assert actual['imageId']==image and actual['pins']['UMF_REPLAY_IMAGE_ID']==image and actual['pins']['UMF_EXPECTED_CHROMIUM_VERSION']=='153.0.8010.12'
 assert actual['pins']['UMF_REFERENCE_DOCKER_NETWORK']=='umf-integrated-qualification-40e83200' and actual['networks']==['umf-integrated-qualification-40e83200']
 assert any(Path(m['source'])==F and m['destination']=='/work' and m['rw'] for m in actual['mounts'])
 assert actual['command']==(['scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [stage,'--resume'] if stage=='regression' else [stage])
 if stage=='regression':
  assert len(actual['mounts'])==5
  assert any(m['source']=='/var/run/docker.sock' and m['destination']=='/var/run/docker.sock' and m['type']=='bind' and m['rw'] is True for m in actual['mounts'])
  for p,n in overlay['volumes'].items():assert any(m['destination']=='/work/'+p and m['type']=='volume' and m['name']==n and m['rw'] is False for m in actual['mounts'])
 else:assert len(actual['mounts'])==2
 assert actual['entrypoint']==(['bun'] if stage=='actions' else ['/opt/venv/bin/python','/opt/replay.py'])
metadata=load(Path('/private/tmp/umf-integrated-handler-metadata-execution-40e83200.json'))
assert metadata['sourceRevision']==revision and metadata['exitCode']==0 and sha(Path(metadata['log']))==metadata['logSha256'] and sha(Path(metadata['command'][1]))==metadata['scriptSha256']
metadata_rows=[json.loads(line) for line in Path(metadata['log']).read_text().splitlines() if line.startswith('{')]
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
shard4_summary=summary.findall((F/reg['runs'][3]['log']).read_text())[-1];assert tuple(map(int,(shard4_summary[i] for i in [0,1,3,4])))==(1917,0,1917,369)
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
browser_run=load(Path('/private/tmp/umf-integrated-browser-execution-40e83200.json'));assert browser_run['command']==['bun','scripts/actions-browser.ts'] and browser_run['sourceRevision']==revision and browser_run['exitCode']==0 and sha(Path(browser_run['log']))==browser_run['logSha256'] and sha(F/browser_run['generatedReport']['path'])==browser_run['generatedReport']['sha256']
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
expected_criteria={'US-078-AC'+str(i) for i in range(1,10)}|{'US-056-AC'+str(i) for i in range(1,13)}
rows=[r for r in ledger['criteria'] if r['id'] in expected_criteria];assert len(rows)==21 and {r['id'] for r in rows}==expected_criteria
criteria=[]
for row in rows:
 assert row['status']=='SATISFIED' and row['evidence'];witnesses=[]
 for location in row['evidence']:
  p,line=location.rsplit(':',1);assert p in files;lines=(F/p).read_text().splitlines();assert 1<=int(line)<=len(lines)
  assert re.search(r'@covers\s+'+re.escape(row['id'])+r'(?![0-9])',lines[int(line)-1]),('Current citation missing',row['id'],location)
  witnesses.append({'location':location,'sha256':sha(F/p)})
 criteria.append({'criterion':row['id'],'status':'current cited tests executed/pass for stated bounded scope','witnesses':witnesses,'historicalCriterion':row['id'].replace('US-078','US-055')})
assert {r['criterion'] for r in criteria}=={r['criterion'].replace('US-055','US-078') for r in original['criteria']}
assert seal['uniqueTests']==tests and seal['uniqueTestFiles']==len(files)

csv_execution=load(Path('/private/tmp/umf-integrated-csv-browser-execution-40e83200.json'))
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
tutorial=load(Path('/private/tmp/umf-integrated-native-tutorial-execution-40e83200.json'))
assert tutorial['sourceRevision']==revision and tutorial['exitCode']==0 and tutorial['imageId']==runtime['imageId'] and tutorial['capturedSourceMatchesAfterExecution']
assert tutorial['capturedInputCount']==len(native['sourceInputs']) and tutorial['capturedInputInventorySha256']==hashlib.sha256(json.dumps(native['sourceInputs'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
assert tutorial['command']==['docker','run','--rm','--network',F.name,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK='+F.name,'--entrypoint','bun',runtime['imageId'],'run','docs:example:native']
assert sha(Path(tutorial['log']))==tutorial['logSha256']
tutorial_result=json.loads(next(line for line in Path(tutorial['log']).read_text().splitlines() if line.startswith('{')));assert tutorial_result==tutorial['result'] and tutorial_result['bun']=='1.4.2' and tutorial_result['postgres'].startswith('17.9 ')
for key in ['committed','replayMatches','freshNoOp','postconditionCandidateDiscarded','databaseFailureRolledBack','rollbackPreservedNativeState','durableRejectionReplayed','reorderedDeliveryPendingUntilGapClosed','visibleProjectionMatchesNativeRows','revokedReplayDenied']:assert tutorial_result[key] is True
assert tutorial_result['terminalOutcomes']==4 and tutorial_result['outboxFacts']==2
assert tutorial['cleanup']['exactContainer']==tutorial_result['ownedContainer'] and tutorial['cleanup']['dockerPsAllMatches']==[] and tutorial['cleanup']['exitCode']==0
assert subprocess.check_output(['docker','ps','-a','--filter','name='+tutorial_result['ownedContainer'],'--format','{{.ID}} {{.Names}}'],text=True).strip()==''
failed_record_path=Path('/private/tmp/umf-integrated-handler-metadata-execution-40e83200-attempt-1.json')
failed_record=load(failed_record_path)
failed_script=Path('/private/tmp/umf-integrated-handler-metadata-probe-40e83200-attempt-1.ts')
failed_log=Path('/private/tmp/umf-integrated-handler-metadata-probe-40e83200-attempt-1.log')
assert failed_record['sourceRevision']==revision and failed_record['exitCode']==1
assert failed_record['command']==['bun','/private/tmp/umf-integrated-handler-metadata-probe-40e83200.ts']
assert failed_record['log']=='/private/tmp/umf-integrated-handler-metadata-probe-40e83200.log'
assert sha(failed_script)==failed_record['scriptSha256'] and sha(failed_log)==failed_record['logSha256']
failed_lineage={'record':{'retainedName':failed_record_path.name,'sha256':sha(failed_record_path)},'script':{'originalPath':failed_record['command'][1],'retainedName':failed_script.name,'sha256':sha(failed_script)},'log':{'originalPath':failed_record['log'],'retainedName':failed_log.name,'sha256':sha(failed_log)},'status':'Failed observer adaptation before model checks; archived bytes bind original record hashes; corrected execution is separate.'}
governing_paths=['docs/helix/01-frame/user-stories/US-078-declarative-actions.md','docs/helix/01-frame/user-stories/US-056-transactional-actions.md','docs/helix/02-design/technical-designs/TD-078-declarative-actions.md','docs/helix/02-design/technical-designs/TD-056-transactional-actions.md','docs/helix/03-test/test-plans/STP-078-declarative-actions.md','docs/helix/03-test/test-plans/STP-056-transactional-actions.md','docs/helix/02-design/contracts/CONTRACT-900-declarative-actions.md','docs/helix/02-design/contracts/CONTRACT-901-transactional-action-profile.md']
governing={}
for path in governing_paths:
 committed=subprocess.check_output(['git','show',revision+':'+path],cwd=F)
 assert committed==(F/path).read_bytes()==(R/path).read_bytes(),('Governing source drift',path)
 governing[path]=sha(F/path)
report={'profile':'umf.actions.integrated-qualification-audit/1','pass':True,'sourceRevision':native['sourceRevision'],'sourceInputs':len(native['sourceInputs']),'nativeActionInputs':len(foundation['sha256']),'nativeBrowserCommands':174,'auxiliaryCommands':6,'distinctTests':tests,'distinctFiles':len(files),'assertions':assertions,'failures':0,'browserCases':44,'nativeTests':119,'criteria':21,'nativeRefinementHistories':216,'nativeRefinementTransitions':648,'actualImplementationMutantHashesVerified':5,'qualifierBufferedStreamIndependentlyVerified':False,'nativeRawExecutionEvidence':[row['log'] for row in reg['runs'] if any('/actions-reference/' in p for p in row['command'][2:])],'supplementalMetadataExecution':metadata,'scope':'Exact recorded bounded action/reference profile and integrated core prerequisites; no universal completeness or production/downstream adoption claim','csvIntegration':{'execution':csv_execution,'browserTokens':4,'browserRefusalControls':10,'historicalSourceBaseAnnotation':csv_report['sourceBase']},'regressionFilesystemOverlay':overlay,'failedActionStages':observed.get('failedActionStages',[]),'failedRegressionStages':observed['failedRegressionStages'],'regressionProvenance':{'shards1to3':'Prior recorded bind-mounted runs retained unchanged','shard4':'Complete identical 1917-test command rerun using byte-verified read-only local source overlays'},'failedRegressionAttempts':failed_regression,'nativeTutorial':tutorial,'failedMetadataAttemptLineage':failed_lineage,'finalizationTooling':{'current':finalization,'historicalVariants':[m for _,m in variants[1:]],'failedAttempts':observed.get('failedAttempts',[]),'supersededStages':observed.get('supersededStages',[])},'governingInputs':governing,'acceptanceLedgerSha256':sha(F/ledger_path),'criteriaWitnessLineage':criteria,'implementationRecords':records}
Path('/private/tmp/umf-integrated-qualification-audit-40e83200.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['criteriaWitnessLineage','implementationRecords','finalizationTooling','governingInputs','csvIntegration','nativeTutorial']}))
