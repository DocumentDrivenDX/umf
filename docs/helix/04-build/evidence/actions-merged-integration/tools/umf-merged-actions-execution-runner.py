from pathlib import Path
import sys,subprocess,json,hashlib,re
F=Path(sys.argv[1]).resolve();I='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1';P=F.name;D=Path('/private/tmp')/(P+'-execution');D.mkdir(exist_ok=False);O=D/'observation.json';revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=F,text=True).strip()
roots=['.']
site='docs/helix/05-deploy/microsite'
def source_path(p):return p!='.venv' and not (p.startswith('fixtures/') or p in [site+'/dist/demo.js',site+'/dist/explorer.js',site+'/dist/schema-catalog.json'] or p.startswith(site+'/dist/pack-assets/'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def capture():
 environment=F/'.venv'
 if environment.exists() or environment.is_symlink():assert environment.is_symlink() and str(environment.readlink())=='/opt/venv','Unexpected Python environment path'
 paths=sorted(set(p for p in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*roots],cwd=F).decode().split('\0') if p and source_path(p)));assert all((F/p).is_file() and not (F/p).is_symlink() for p in paths);return {p:sha(F/p) for p in paths}
expected=capture();objects={}
for row in subprocess.check_output(['git','ls-tree','-r','-z',revision,'--',*roots],cwd=F).decode().split('\0'):
 if not row:continue
 meta,path=row.split('\t');mode,kind,oid=meta.split()
 if not source_path(path):continue
 assert kind=='blob' and mode in ['100644','100755'];objects[path]=oid
assert set(objects)==set(expected)
for path,oid in objects.items():
 content=(F/path).read_bytes();assert hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()==oid,(path,'Frozen Git source differs')
def tree(root):
 entries=sorted((F/root).rglob('*'));assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries);return {str(p.relative_to(F)):sha(p) for p in entries if p.is_file()}
fixtures=tree('fixtures')
seal=json.loads((F/'fixtures/validation/core-check-refresh/final-seal.json').read_text());sealed_cache={p:sha(F/p) for p in seal['sha256'] if p.startswith('.cache/')};assert all(sha(F/p)==h for p,h in seal['sha256'].items())
def fixture_closure():return {p:h for p,h in tree('fixtures').items() if p not in {'fixtures/json-schema-audit.json','fixtures/extension-package-audit.json','fixtures/actions/reference-foundation.json','fixtures/actions/browser.json'}}
inherited_closure=fixture_closure()
generated={}
def output_closure():
 result={}
 for root in ['dist',site+'/dist']:
  if (F/root).exists():result.update(tree(root))
 return result
record={'profile':'umf.actions.merged-execution/1','sourceRevision':revision,'runtimeImage':I,'sourceInputs':expected,'inheritedFixtureInputs':fixtures,'coordinator':{'path':str(Path(__file__).resolve()),'sha256':sha(Path(__file__))},'runs':[]}
def dump():O.write_text(json.dumps(record,indent=2)+'\n')
dump()
subprocess.run(['docker','network','create',P],check=True,stdout=subprocess.DEVNULL)
volumes={root:P+'-'+('stories' if root.startswith('docs/') else root) for root in ['tests','scripts','docs/helix/01-frame/user-stories']}
for volume in volumes.values():subprocess.run(['docker','volume','create',volume],check=True,stdout=subprocess.DEVNULL)
overlay_inputs={}
for root in volumes:
 entries=sorted((F/root).rglob('*'));assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries)
 overlay_inputs[root]={str(p.relative_to(F)):sha(p) for p in entries if p.is_file()};assert overlay_inputs[root]=={p:h for p,h in expected.items() if p.startswith(root+'/')},'RO overlay input is not exactly frozen Git source'
record['sourceOverlayInputs']=overlay_inputs;dump()
copy=['docker','run','--rm','-v',str(F)+':/source:ro']+sum((['-v',v+':/copy/'+r] for r,v in volumes.items()),[])+['--entrypoint','python',I,'-c',"import shutil; roots="+repr(list(volumes))+"; [shutil.copytree('/source/'+r,'/copy/'+r,dirs_exist_ok=True) for r in roots]"]
subprocess.run(copy,check=True);record['sourceOverlayCopyCommand']=copy;dump();mounts=sum((['-v',v+':/work/'+r+':ro'] for r,v in volumes.items()),[])
check_code="import json,hashlib; from pathlib import Path; roots="+repr(list(volumes))+"; entries={p:sorted(Path('/work',p).rglob('*')) for p in roots}; assert all(not f.is_symlink() and (f.is_file() or f.is_dir()) for fs in entries.values() for f in fs); print(json.dumps({p:{str(f.relative_to('/work')):hashlib.sha256(f.read_bytes()).hexdigest() for f in fs if f.is_file()} for p,fs in entries.items()},sort_keys=True))"
check_command=['docker','run','--rm','-v',str(F)+':/work:ro',*mounts,'--entrypoint','python',I,'-c',check_code]
def check_overlay():assert json.loads(subprocess.check_output(check_command))==overlay_inputs,'Actual RO execution volume differs from frozen source'
record['sourceOverlayCheckCommand']=check_command;check_overlay();dump()
def run(inner,name,env=None,host=False):
 assert capture()==expected and sha(Path(__file__))==record['coordinator']['sha256'];check_overlay();assert fixture_closure()==inherited_closure;assert all((F/p).is_file() and not (F/p).is_symlink() and sha(F/p)==h for p,h in sealed_cache.items());assert output_closure()==generated
 owned=P+'-'+name;command=['docker','run','--network',P,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock',*mounts,'-e','UMF_REFERENCE_DOCKER_NETWORK='+P,'-e','UMF_REPLAY_IMAGE_ID='+I]
 for key,value in (env or {}).items():command+=['-e',key+'='+value]
 command+=['--entrypoint',inner[0],'--name',owned,I,*inner[1:]]
 if host:command=inner
 log=D/(name+'.log');print(json.dumps({'started':name,'command':inner}),flush=True)
 with log.open('wb') as stream:code=subprocess.run(command,cwd=F,stdout=stream,stderr=subprocess.STDOUT).returncode
 row={'stage':name,'command':command,'innerCommand':inner,'exitCode':code,'log':str(log),'logSha256':sha(log),'ownedContainer':owned};record['runs'].append(row);dump()
 try:
  if name=='regression-3':
   report_path='fixtures/protobuf/emission-corpus-results.json';raw=(F/report_path).read_bytes();original=subprocess.check_output(['git','show',revision+':'+report_path],cwd=F)
   def normalize_report(content):
    value=json.loads(content);matching=[r for r in value['records'] if r['root']=='google/protobuf/cpp_options.proto'];assert len(matching)==1;item=matching[0];assert item['outcome']=='unsupported';suffix=':1:11: edition value "2024" not recognized; should be one of ["2023"]';allowed={'Error: Emitted source does not compile: google/protobuf/'+filename+suffix for filename in ['cpp_options.proto','cpp_file_options.proto']};assert item['detail'] in allowed;item['detail']='Same unsupported Edition2024 diagnostic at root or its dependent options file';return value
   assert normalize_report(raw)==normalize_report(original),'Protobuf report changed beyond the two exact unsupported diagnostic filenames'
   target=F/'.cache/actions-merged-protobuf-observation/emission-corpus-results.json';target.parent.mkdir(parents=True,exist_ok=False);target.write_bytes(raw)
   row['generatedFixtureObservation']={'path':report_path,'freshPath':str(target.relative_to(F)),'freshSha256':sha(target),'frozenGitSha256':hashlib.sha256(original).hexdigest(),'equivalence':'Entire JSON equal except exactly one unsupported Edition2024 diagnostic filename: cpp_options.proto or cpp_file_options.proto','originalRestored':False};dump();(F/report_path).write_bytes(original);assert sha(F/report_path)==inherited_closure[report_path];row['generatedFixtureObservation']['originalRestored']=True;dump()
  inspected=json.loads(subprocess.check_output(['docker','inspect',owned]))[0] if not host else None;row['runtime']={'imageId':inspected['Image'],'command':inspected['Config']['Cmd'],'entrypoint':inspected['Config']['Entrypoint'],'workingDirectory':inspected['Config']['WorkingDir'],'state':inspected['State'],'mounts':inspected['Mounts'],'networks':sorted(inspected['NetworkSettings']['Networks'])} if not host else {'hostExecution':True,'executable':subprocess.check_output(['which',inner[0]],text=True).strip(),'version':subprocess.check_output([inner[0],'--version'],text=True).strip()};dump();check_overlay();row['overlayHeldStable']=True;row['sourceHeldStable']=capture()==expected and sha(Path(__file__))==record['coordinator']['sha256'];dump()
  row['generatedOutputs']=output_closure();row['fixtureOutputs']={p:sha(F/p) for p in ['fixtures/json-schema-audit.json','fixtures/extension-package-audit.json','fixtures/actions/reference-foundation.json','fixtures/actions/browser.json'] if (F/p).exists()};row['inheritedFixturesHeldStable']=fixture_closure()==inherited_closure;row['sealedCacheHeldStable']=all((F/p).is_file() and not (F/p).is_symlink() and sha(F/p)==h for p,h in sealed_cache.items());row['stageProofOutputs']={}
  for root in ['.cache/actions-merged-metadata','.cache/actions-merged-semantics','.cache/actions-merged-python','.cache/actions-merged-csv','.cache/actions-merged-core-evolution','.cache/actions-merged-protobuf-observation']:
   if (F/root).exists():row['stageProofOutputs'].update(tree(root))
  formal=F/'.cache/actions-formal-reproduction'
  if formal.exists():row['stageProofOutputs'].update({str(p.relative_to(F)):sha(p) for p in sorted(formal.iterdir()) if p.is_file() and not p.is_symlink()})
  dump()
  assert (host or (inspected['Image']==I and not inspected['State']['Running'] and inspected['State']['ExitCode']==code)) and row['sourceHeldStable'] and row['inheritedFixturesHeldStable'] and row['sealedCacheHeldStable']
  if name not in ['library','postgresql','protobuf','demo','explorer']:assert row['generatedOutputs']==generated,'Generated output changed during non-build stage'
  generated.clear();generated.update(row['generatedOutputs'])
 except Exception as error:row['postcheckError']=repr(error);dump();raise
 assert code==0,(name,code)
 if not host:subprocess.run(['docker','rm',owned],check=True,stdout=subprocess.DEVNULL)
generated.update(output_closure());record['sealedCacheInputs']=sealed_cache;record['inheritedSemanticFixtureInputs']=inherited_closure;record['initialGeneratedOutputs']=dict(generated);dump()
run(['bun','install','--frozen-lockfile'],'install')
run(['python','-c',"from pathlib import Path; p=Path('.venv'); assert not p.exists();p.symlink_to('/opt/venv',target_is_directory=True)"],'python-runtime')
for command,name in [(['bun','run','build'],'library'),(['bun','run','build:postgresql'],'postgresql'),(['bun','run','build:protobuf'],'protobuf'),(['bun','build',site+'/demo.ts','--target','browser','--minify','--outfile',site+'/dist/demo.js'],'demo'),(['bun',site+'/build-explorer.ts'],'explorer'),(['bun','run','typecheck'],'typecheck'),(['bun','scripts/domain-pack-schema.ts','--check'],'domain-schema'),(['bun','run','test:schemas'],'schemas')]:run(command,name)
all_tests=sorted(str(p.relative_to(F)) for p in (F/'tests').rglob('*.test.ts'));groups=[[],[],[],[]]
for path in all_tests:
 if '/core-ideals/' in path and path.endswith(('conformance.test.ts','evidence.test.ts')):continue
 category=path.split('/')[1]
 if category in ['rdf','rdfxml','jsonld','shacl']:index=sum(len(g) for g in groups[:2])%2
 elif category in ['typespec','smithy','openapi','json-schema','protobuf','projections','graphql']:index=2
 else:index=3
 groups[index].append(path)
record['regressionGroups']=groups;dump()
for index,group in enumerate(groups,1):run(['bun','test',*group],'regression-'+str(index))
run(['bun','scripts/actions-reference/qualify-foundation.ts'],'actions-native')
generator=Path('/private/tmp/umf-generate-merged-semantic-harness.py');record['semanticGenerator']={'path':str(generator),'sha256':sha(generator),'command':['python3',str(generator),str(F)]};dump();subprocess.run(record['semanticGenerator']['command'],check=True);assert sha(generator)==record['semanticGenerator']['sha256'];allocation=json.loads((F/'.cache/actions-merged-semantics/allocation.json').read_text());record['semanticAllocation']=allocation;dump()
fixture_exceptions={'fixtures/json-schema-audit.json','fixtures/extension-package-audit.json','fixtures/actions/reference-foundation.json','fixtures/actions/browser.json'}
inherited_semantic_fixtures={p:h for p,h in fixtures.items() if p not in fixture_exceptions};record['inheritedSemanticFixtureInputs']=inherited_semantic_fixtures;dump()
for index,command in enumerate(allocation['commands'],1):
 assert all((F/p).is_file() and not (F/p).is_symlink() and sha(F/p)==h for p,h in inherited_semantic_fixtures.items()),'Inherited fixture bytes changed before semantic replay'
 run(command,'semantic-'+str(index))
 assert all((F/p).is_file() and not (F/p).is_symlink() and sha(F/p)==h for p,h in inherited_semantic_fixtures.items()),'Inherited fixture bytes changed after semantic replay'
 record['runs'][-1]['inheritedFixturesHeldStable']=True;dump()
python_script="import subprocess,sys,json,importlib.metadata as m\nfrom pathlib import Path\nexpected={'pydantic':'2.11.10','jsonschema':'4.25.1','ruamel.yaml':'0.19.1','pytest':'9.1.1','packaging':'26.3','pluggy':'1.6.0'}\nassert {p:m.version(p) for p in expected}==expected\nprint(json.dumps({'runtimeDependencies':expected}),flush=True)\nd=Path('.cache/actions-merged-python');d.mkdir(parents=True,exist_ok=False)\nrequirements='hatchling==1.27.0 --hash=sha256:d3a2f3567c4f926ea39849cdf924c7e99e6686c9c8e288ae1037c8fa2a5d937b\\npathspec==0.12.1 --hash=sha256:a0d503e138a4c123b27490a4f7beda6a01c6f288df0e4a8b79c7eb0dc7b4cc08\\ntrove-classifiers==2025.1.15.22 --hash=sha256:5f19c789d4f17f501d36c94dbbf969fb3e8c2784d008e6f5164dd2c3d6a2b07c\\n'\n(d/'requirements.txt').write_text(requirements)\nsubprocess.run([sys.executable,'-m','pip','install','--no-deps','--only-binary=:all:','--require-hashes','-r',str(d/'requirements.txt'),'--report',str(d/'build-tools.json')],check=True)\nassert m.version('hatchling')=='1.27.0' and m.version('pathspec')=='0.12.1' and m.version('trove-classifiers')=='2025.1.15.22'\nsubprocess.run([sys.executable,'-m','pip','install','--no-deps','--no-build-isolation','--no-cache-dir','./python','--report',str(d/'package-install.json')],check=True)\nsubprocess.run([sys.executable,'-m','pytest','python/tests','-q'],check=True)\nprint(json.dumps({'buildTools':{p:m.version(p) for p in ['hatchling','pathspec','trove-classifiers']}}),flush=True)\n"
run(['python','-c',python_script],'python-tests')

metadata=F/'.cache/actions-merged-metadata';metadata.mkdir(parents=True,exist_ok=False);metadata_script='import assert from \'node:assert/strict\';\nimport {createHash} from \'node:crypto\';\nimport * as u from \'/work/src/index.ts\';\nimport fixture from \'/work/fixtures/actions/approve.json\';\nconst root=\'/work/\';\nconst captured=await Bun.file(root+\'.cache/actions-merged-metadata/inputs.json\').json();\nassert.equal(captured.sourceRevision,\'5be80ab9e71d2da9aea589e688fdc61af0a0e251\');\nconst inputs=captured.sourceInputs as Record<string,string>;\nconst hash=async(path:string)=>createHash(\'sha256\').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest(\'hex\');\nfor(const [path,sha] of Object.entries(inputs))assert.equal(await hash(root+path),sha,path);\nconst source=structuredClone(fixture) as unknown as u.Document;\nconst a=(source.modules[0]!.extensions![\'umf.actions\'] as any).actions[0];\na.authorization.profile={id:\'umf.actions.roles\',version:\'1\'};\na.binding={kind:\'handler\',profile:{id:\'opaque.handler.profile\',version:\'7\'},handler:{id:\'javascript:must-not-run\',version:\'9\'}};\na.outputs=[{id:\'order-result\',kind:\'entity\',target:{module:\'sales\',element:\'order\',key:\'pk\'},required:true}];\na.preconditions=[{id:\'pre-check\',rule:{language:\'opaque.rules\',version:\'3\',expression:\'fetch("https://invalid.example/pre"); throw "must-not-run"\',references:[]},failure:{code:\'PRE_FAILURE\',message:\'Exact precondition reason\'}}];\na.postconditions=[{id:\'post-check\',rule:{language:\'opaque.rules\',version:\'4\',expression:\'opaque output assertion — keep exact\',references:[{output:\'order-result\'}]},failure:{code:\'POST_FAILURE\',message:\'Exact postcondition reason\'}}];\na.failures=[{code:\'PRE_FAILURE\',message:\'Exact precondition reason\',retryable:true},{code:\'POST_FAILURE\',message:\'Exact postcondition reason\',retryable:false}];\nconst before=JSON.stringify(source),identity={module:\'sales\',action:\'approve\'},registry=u.registerActions(new u.Registry());\nconst base=\'/modules/0/extensions/umf.actions/actions/0\';\nconst expected=[[\'binding\',\'binding\'],[\'binding/handler\',\'handler\'],[\'preconditions/0\',\'condition\'],[\'preconditions/0/rule\',\'condition\'],[\'postconditions/0\',\'condition\'],[\'postconditions/0/rule\',\'condition\'],[\'outputs/0\',\'output\'],[\'failures/0\',\'failure\'],[\'failures/1\',\'failure\'],[\'authorization\',\'authorization\'],[\'attribution\',\'attribution\'],[\'atomicity\',\'atomicity\'],[\'idempotency\',\'idempotency\'],[\'result\',\'result\'],[\'writes/0\',\'frame\'],[\'writes/0/selector\',\'selector\']];\nconst dataEqual=(actual:unknown,wanted:unknown)=>assert.deepEqual(u.copyJson(actual),u.copyJson(wanted));\nlet fetchCalls=0;const previousFetch=globalThis.fetch;globalThis.fetch=(()=>{fetchCalls++;throw Error(\'NETWORK_MUST_NOT_RUN\');}) as typeof fetch;\ntry {\n const inspection=u.inspectActions(source,registry);assert.equal(inspection.validation.valid,true);assert.equal(inspection.validation.complete,false);\n const inspected=inspection.actions[0]!;dataEqual(inspection.source,source);dataEqual(inspected.action,a);\n assert.equal(new Set(inspected.obligations.map(o=>o.id)).size,inspected.obligations.length);\n for(const [suffix,kind] of expected){const o=inspected.obligations.find(o=>o.id===base+\'/\'+suffix);assert.ok(o,\'Missing \'+suffix);assert.equal(o.kind,kind,suffix);assert.equal(o.path,o.id);}\n for(const suffix of [\'binding/handler\',\'preconditions/0/rule\',\'postconditions/0/rule\'])assert.equal(inspected.obligations.find(o=>o.id===base+\'/\'+suffix)!.status,\'unchecked\');\n for(const format of [\'json\',\'yaml\'] as const){const back=u.readDocument(u.writeDocument(source,format),format);dataEqual(back,source);dataEqual(u.inspectActions(back,registry).actions[0]!.action,a);}\n const empty=structuredClone(source);delete empty.modules[0]!.extensions![\'umf.actions\'];dataEqual(u.declareAction(empty,\'sales\',a,registry),source);\n const profile:u.ActionExecutorProfile={id:\'declaration-only\',version:\'1\',actionVersion:\'0.1.0\',coreVersion:\'0.8.0\',source,identity,claims:inspected.obligations.map(o=>({obligation:o.id,status:\'supported\',evidence:[\'inert://not-execution-proof\']}))};\n const assessment=u.assessAction(source,identity,profile,registry);assert.equal(assessment.declaredCompatible,true);assert.equal(assessment.executionVerified,false);dataEqual(assessment.outcomes.map(o=>o.obligation),inspected.obligations.map(o=>o.id));assert.ok(assessment.outcomes.every(o=>o.status===\'supported\'));\n for(const [suffix] of expected){const omitted={...profile,claims:profile.claims.filter(c=>c.obligation!==base+\'/\'+suffix)},r=u.assessAction(source,identity,omitted,registry);assert.equal(r.outcomes.find(o=>o.obligation===base+\'/\'+suffix)!.status,\'unknown\');assert.equal(r.declaredCompatible,false);assert.equal(r.executionVerified,false);}\n for(const status of [\'unknown\',\'unsupported\'] as const){const changed=structuredClone(profile);changed.claims.find(c=>c.obligation===base+\'/binding/handler\')!.status=status;const r=u.assessAction(source,identity,changed,registry);assert.equal(r.outcomes.find(o=>o.obligation===base+\'/binding/handler\')!.status,status);assert.equal(r.declaredCompatible,false);}\n assert.equal(JSON.stringify(source),before);assert.equal(fetchCalls,0);\n console.log(JSON.stringify({handlerMetadataProbe:{profile:\'independent-portable-handler-inventory/1\',bun:Bun.version,fullActionAndSourcePreserved:true,jsonYamlRecoveries:2,declaredAuthoringExact:true,independentExpectedObligations:expected.length,actualInventory:inspected.obligations.length,omittedClaimControls:expected.length,unknownUnsupportedControls:2,inertFetchCalls:fetchCalls,executionVerified:false,scope:\'One synthetic handler with opaque pre/post rules, entity output and two failure policies; public library only; no native handler execution or universal proof\'}}));\n} finally {globalThis.fetch=previousFetch;}\nfor(const [path,sha] of Object.entries(inputs))assert.equal(await hash(root+path),sha,path);\nconsole.log(JSON.stringify({sourceHeldStable:true,capturedInputs:Object.keys(inputs).length,probeSha256:await hash(import.meta.path)}));\n'.replace('5be80ab9e71d2da9aea589e688fdc61af0a0e251',revision);(metadata/'probe.ts').write_text(metadata_script);(metadata/'inputs.json').write_text(json.dumps({'sourceRevision':revision,'sourceInputs':expected},indent=2)+'\n');record['metadataProbeInputs']=tree('.cache/actions-merged-metadata');dump();run(['bun','/work/.cache/actions-merged-metadata/probe.ts'],'handler-metadata')
for script,name,args in [('scripts/actions-browser.ts','actions-browser',[]),('scripts/browser-csv-boolean-lexical.ts','csv-browser',['.cache/actions-merged-csv']),('scripts/actions-docs/native-example.ts','native-tutorial',[]),('scripts/core-evolution-browser.ts','core-evolution',['.cache/actions-merged-core-evolution']),('scripts/loader-browser.ts','loader',[]),('scripts/public-company-browser.ts','public-company',[]),('scripts/legal-appellate-browser.ts','legal-appellate',[]),('scripts/artifact-collections-browser.ts','artifact-collections',[])]:run(['bun',script,*args],name,host=name=='actions-browser')
run(['python3','scripts/actions-docs/reproduce-formal.py','--tlc'],'formal',host=True)

record['complete']=True;dump();print(json.dumps({'completed':True,'sourceRevision':revision,'runs':len(record['runs']),'record':str(O)}),flush=True)
