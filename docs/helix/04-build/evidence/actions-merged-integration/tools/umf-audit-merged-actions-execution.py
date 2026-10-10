from pathlib import Path
import sys,json,subprocess,hashlib,re,ast
F=Path(sys.argv[1]).resolve();D=Path('/private/tmp')/(F.name+'-execution');O=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else D/'observation.json';v=json.loads(O.read_text());baseline='5be80ab9e71d2da9aea589e688fdc61af0a0e251';review=json.loads(Path('/private/tmp/umf-reviewed-main-delta-1d1f5eb2.json').read_text());reviewed={r['path']:r for r in review['paths']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def gitbytes(rev,p):
 result=subprocess.run(['git','show',rev+':'+p],cwd=F,capture_output=True);return result.stdout if result.returncode==0 else None
def digest(b):return hashlib.sha256(b).hexdigest() if b is not None else None
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=F,text=True).strip();assert v['complete'] is True and v['sourceRevision']==revision
assert v['coordinator']['sha256']=='90ffc5e0a951dc0886ebf4d8e4c423f0c75abe131956f0a10e9ba5c76868db3c'
assert v['semanticGenerator']['sha256']=='78ffecc59fe24319ab94e88b3792a22cad4b390968fb3717860e8529bb3c9c1a' and sha(Path(v['semanticGenerator']['path']))=='78ffecc59fe24319ab94e88b3792a22cad4b390968fb3717860e8529bb3c9c1a'
assert sha(Path(v['coordinator']['path']))==v['coordinator']['sha256']
assert subprocess.run(['git','merge-base','--is-ancestor',baseline,revision],cwd=F).returncode==0
site='docs/helix/05-deploy/microsite'
assert (F/'.venv').is_symlink() and str((F/'.venv').readlink())=='/opt/venv','Unexpected Python runtime environment'
def source_path(p):return p!='.venv' and not (p.startswith('fixtures/') or p in [site+'/dist/demo.js',site+'/dist/explorer.js',site+'/dist/schema-catalog.json'] or p.startswith(site+'/dist/pack-assets/'))
actualpaths={p for p in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','.'],cwd=F).decode().split('\0') if p and source_path(p)};gitpaths={p for p in subprocess.check_output(['git','ls-tree','-r','--name-only',revision],cwd=F,text=True).splitlines() if source_path(p)};assert actualpaths==gitpaths==set(v['sourceInputs'])
prepared='1d1f5eb2a21fd90a58b1fe52ce8fde9af23c96d2';assert review['preparedMerge']==prepared and review['baseline']==baseline
preparedpaths=subprocess.check_output(['git','diff','--name-only',baseline,prepared],cwd=F,text=True).splitlines();assert set(preparedpaths)==set(reviewed)
for p in preparedpaths:assert reviewed[p]['beforeSha256']==digest(gitbytes(baseline,p)) and reviewed[p]['afterSha256']==digest(gitbytes(prepared,p)),p
for root,files in v['sourceOverlayInputs'].items():assert files=={p:h for p,h in v['sourceInputs'].items() if p.startswith(root+'/')}
for p,h in v['sourceInputs'].items():assert (F/p).is_file() and not (F/p).is_symlink() and sha(F/p)==h and digest(gitbytes(revision,p))==h,p
paths=subprocess.check_output(['git','diff','--name-only',baseline,revision],cwd=F,text=True).splitlines();delta=[]
protected=('src/','scripts/','tests/','spec/','native/')
for p in paths:
 before,after=digest(gitbytes(baseline,p)),digest(gitbytes(revision,p));row={'path':p,'beforeSha256':before,'afterSha256':after,'kind':'added' if before is None else 'deleted' if after is None else 'changed'}
 if p.startswith(protected) or p.startswith(('python/','.github/')) or (p.startswith(site+'/') and not p.startswith(site+'/dist/')) or p in ['package.json','bun.lock','tsconfig.json','tsconfig.tools.json'] or p.startswith('patches/'):
  assert p in reviewed and before==reviewed[p]['beforeSha256'] and after==reviewed[p]['afterSha256'],('Unreviewed implementation delta',p)
  row['qualification']='Exact Astra-reviewed primary integration delta'
 else:row['qualification']='Enumerated delivery, documentation, Python or retained-proof input; fresh affected checks recorded separately'
 delta.append(row)
for p in ['package.json','bun.lock']:
 assert digest(gitbytes(baseline,p))==digest(gitbytes(revision,p)),p
# Core model, action library, native implementation and strict conformance assertions are unchanged.
for prefix in ['src/model/','src/extensions/actions/','scripts/actions-reference/','tests/actions-reference/','tests/actions/','tests/core-ideals/','scripts/core-ideals/','native/','spec/extensions/actions/']:
 assert not any(p.startswith(prefix) for p in paths),prefix
runs=v['runs'];names=[r['stage'] for r in runs];assert len(set(names))==len(names)
required=['install','python-runtime','library','postgresql','protobuf','demo','explorer','typecheck','domain-schema','schemas',*[f'regression-{i}' for i in range(1,5)],'actions-native',*[f'semantic-{i}' for i in range(1,7)],'python-tests','handler-metadata','actions-browser','csv-browser','native-tutorial','core-evolution','loader','public-company','legal-appellate','artifact-collections','formal'];assert names==required,(names,required)
expected_commands={'install':['bun','install','--frozen-lockfile'],'python-runtime':['python','-c',"from pathlib import Path; p=Path('.venv'); assert not p.exists();p.symlink_to('/opt/venv',target_is_directory=True)"],'library':['bun','run','build'],'postgresql':['bun','run','build:postgresql'],'protobuf':['bun','run','build:protobuf'],'demo':['bun','build',site+'/demo.ts','--target','browser','--minify','--outfile',site+'/dist/demo.js'],'explorer':['bun',site+'/build-explorer.ts'],'typecheck':['bun','run','typecheck'],'domain-schema':['bun','scripts/domain-pack-schema.ts','--check'],'schemas':['bun','run','test:schemas'],'actions-native':['bun','scripts/actions-reference/qualify-foundation.ts'],'handler-metadata':['bun','/work/.cache/actions-merged-metadata/probe.ts'],'actions-browser':['bun','scripts/actions-browser.ts'],'csv-browser':['bun','scripts/browser-csv-boolean-lexical.ts','.cache/actions-merged-csv'],'native-tutorial':['bun','scripts/actions-docs/native-example.ts'],'core-evolution':['bun','scripts/core-evolution-browser.ts','.cache/actions-merged-core-evolution'],'loader':['bun','scripts/loader-browser.ts'],'public-company':['bun','scripts/public-company-browser.ts'],'legal-appellate':['bun','scripts/legal-appellate-browser.ts'],'artifact-collections':['bun','scripts/artifact-collections-browser.ts'],'formal':['python3','scripts/actions-docs/reproduce-formal.py','--tlc']}
for row in runs:
 if row['stage']=='python-tests':assert row['innerCommand'][:2]==['python','-c'] and len(row['innerCommand'])==3 and hashlib.sha256(row['innerCommand'][2].encode()).hexdigest()=='15e5c29762ee4933ffca898a7d01351049561b3672858f9ffad895e81be07a52'
 elif row['stage'] in expected_commands:assert row['innerCommand']==expected_commands[row['stage']],row['stage']
logs={};I=v['runtimeImage'];assert I=='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1'
for row in runs:
 assert row['exitCode']==0 and not row.get('postcheckError') and row['sourceHeldStable'] and row['overlayHeldStable'] and row['inheritedFixturesHeldStable'] and row['sealedCacheHeldStable'],row['stage']
 assert sha(Path(row['log']))==row['logSha256'];logs[row['stage']]=Path(row['log']).read_text()
 expected_volumes={'tests':F.name+'-tests','scripts':F.name+'-scripts','docs/helix/01-frame/user-stories':F.name+'-stories'}
 if row['stage'] not in ['actions-browser','formal']:
  mounted=sum((['-v',volume+':/work/'+root+':ro'] for root,volume in expected_volumes.items()),[]);expected_outer=['docker','run','--network',F.name,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock',*mounted,'-e','UMF_REFERENCE_DOCKER_NETWORK='+F.name,'-e','UMF_REPLAY_IMAGE_ID='+I,'--entrypoint',row['innerCommand'][0],'--name',F.name+'-'+row['stage'],I,*row['innerCommand'][1:]];assert row['command']==expected_outer
 runtime=row['runtime']
 if row['stage'] in ['actions-browser','formal']:
  assert runtime['hostExecution'] is True and row['command']==row['innerCommand']
  if row['stage']=='actions-browser':assert runtime['version']=='1.4.2'
  continue
 assert runtime['imageId']==I and runtime['state']['ExitCode']==0 and not runtime['state']['Running'];assert runtime['entrypoint']==[row['innerCommand'][0]] and runtime['command']==row['innerCommand'][1:];assert runtime['networks']==[F.name] and runtime['workingDirectory']=='/work'
 mount={m['Destination']:m for m in runtime['mounts']};assert set(mount)=={'/work','/var/run/docker.sock','/work/scripts','/work/tests','/work/docs/helix/01-frame/user-stories'}
 assert mount['/work']['Source']==str(F) and mount['/work']['RW'] and mount['/var/run/docker.sock']['RW'] and mount['/var/run/docker.sock']['Source']=='/var/run/docker.sock'
 for root in ['scripts','tests','docs/helix/01-frame/user-stories']:assert not mount['/work/'+root]['RW'] and mount['/work/'+root]['Type']=='volume' and mount['/work/'+root]['Name']==expected_volumes[root]
generated_paths={str(p.relative_to(F)):sha(p) for root in ['dist',site+'/dist'] for p in sorted((F/root).rglob('*')) if p.is_file()};assert generated_paths==runs[-1]['generatedOutputs']
for row in runs:
 for p,h in row['stageProofOutputs'].items():assert (F/p).is_file() and not (F/p).is_symlink() and sha(F/p)==h,p
for stage,p in [('actions-native','fixtures/actions/reference-foundation.json'),('actions-browser','fixtures/actions/browser.json'),('schemas','fixtures/json-schema-audit.json'),('schemas','fixtures/extension-package-audit.json')]:assert runs[names.index(stage)]['fixtureOutputs'][p]==sha(F/p)
for p,h in runs[-1]['generatedOutputs'].items():assert sha(F/p)==h,p
proof_outputs={}
for root in ['.cache/actions-merged-metadata','.cache/actions-merged-semantics','.cache/actions-merged-python','.cache/actions-merged-csv','.cache/actions-merged-core-evolution','.cache/actions-merged-protobuf-observation']:
 entries=sorted((F/root).rglob('*'));assert all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in entries);proof_outputs.update({str(p.relative_to(F)):sha(p) for p in entries if p.is_file()})
formal_top=F/'.cache/actions-formal-reproduction';proof_outputs.update({str(p.relative_to(F)):sha(p) for p in formal_top.iterdir() if p.is_file() and not p.is_symlink()});assert proof_outputs==runs[-1]['stageProofOutputs']
for p,h in runs[-1]['stageProofOutputs'].items():assert sha(F/p)==h,p
fixtures={str(p.relative_to(F)):sha(p) for p in (F/'fixtures').rglob('*') if p.is_file()};exceptions={'fixtures/json-schema-audit.json','fixtures/extension-package-audit.json','fixtures/actions/reference-foundation.json','fixtures/actions/browser.json'}
assert {p:h for p,h in fixtures.items() if p not in exceptions}==v['inheritedSemanticFixtureInputs']
for p,h in v['sealedCacheInputs'].items():assert sha(F/p)==h
# Distinct behavior regression excludes all seventeen original admission tests.
groups=v['regressionGroups'];files=[p for g in groups for p in g];assert len(files)==len(set(files));allfiles=sorted(str(p.relative_to(F)) for p in (F/'tests').rglob('*.test.ts'));admission=[p for p in allfiles if '/core-ideals/' in p and p.endswith(('conformance.test.ts','evidence.test.ts'))];assert sorted(files+admission)==allfiles
counts=[]
for i,g in enumerate(groups,1):
 row=runs[names.index('regression-'+str(i))];assert row['innerCommand']==['bun','test',*g];raw=logs[row['stage']];passed=int(re.search(r'^\s*(\d+) pass$',raw,re.M)[1]);failed=int(re.search(r'^\s*(\d+) fail$',raw,re.M)[1]);assert failed==0 and not re.search(r'^\s*[1-9]\d* skip$',raw,re.M);summary=re.search(r'Ran (\d+) tests across (\d+) files',raw);assert int(summary[1])==passed and int(summary[2])==len(g);counts.append({'tests':passed,'files':len(g),'assertions':int(re.search(r'^\s*(\d+) expect\(\) calls$',raw,re.M)[1])})
a=v['semanticAllocation'];assert len(a['allOriginal17'])==17 and len({(r['path'],r['testName']) for r in a['allOriginal17']})==17
original_identities={(str(source.relative_to(F)),name) for source in sorted((F/'tests/core-ideals').glob('*.test.ts')) if source.name.endswith(('conformance.test.ts','evidence.test.ts')) for name in re.findall(r"^test\('([^']+)'",source.read_text(),re.M)};assert len(original_identities)==17 and original_identities=={(r['path'],r['testName']) for r in a['allOriginal17']}
generator_tree=ast.parse(Path(v['semanticGenerator']['path']).read_text());assignments={n.targets[0].id:n.value for n in generator_tree.body if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)}
selection=ast.literal_eval(assignments['selection']);assert [(r['path'],r['testName']) for r in a['originalSelectedTests']]==selection and len(set(selection))==5
expected_semantics=[['bun','test',p,'--test-name-pattern','^'+name+'$'] for p,name in selection]+[['bun','test','/work/.cache/actions-merged-semantics/behavior.test.ts']];assert a['commands']==expected_semantics
facet_text=(F/'tests/core-ideals/facets-conformance.test.ts').read_text();start=facet_text.index(' const coverage =');facet_body=facet_text[start:facet_text.index('\n}, 1800000);',start)]
key_text=(F/'scripts/core-ideals/key-conformance.ts').read_text();start=key_text.index(' const usefulSystems=');key_body=key_text[start:key_text.index('\n return {scope:',start)]
namespace={'facet_body':facet_body,'key_body':key_body,'imports':ast.literal_eval(assignments['imports'])};harness=eval(compile(ast.Expression(assignments['harness']),'<reviewed harness reconstruction>','eval'),{'__builtins__':{}},namespace);assert (F/'.cache/actions-merged-semantics/behavior.test.ts').read_text()==harness and hashlib.sha256(harness.encode()).hexdigest()==a['harnessSha256']
for r in a['allOriginal17']:assert sha(F/r['path'])==r['fileSha256'] and digest(gitbytes(baseline,r['path']))==r['fileSha256']
for i,command in enumerate(a['commands'],1):
 row=runs[names.index('semantic-'+str(i))];assert row['innerCommand']==command;raw=logs[row['stage']];assert int(re.search(r'^\s*(\d+) pass$',raw,re.M)[1])==(1 if i<=5 else 3);assert int(re.search(r'^\s*(\d+) fail$',raw,re.M)[1])==0
 if i<=5:
  name=a['originalSelectedTests'][i-1]['testName'];plain=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',raw);assert re.search(r'^\(pass\) '+re.escape(name)+r'(?: \[[^\]\n]+\])?$',plain,re.M) and not re.search(r'^\(skip\) '+re.escape(name)+r'(?: \[[^\]\n]+\])?$',plain,re.M)
 else:assert not re.search(r'^\s*[1-9]\d* skip$',raw,re.M)
records={}
for row in [r for r in runs if r['stage'].startswith('regression-')]:
 for s in Path(row['log']).read_text().splitlines():
  if not s.startswith('{'):continue
  try:payload=json.loads(s)
  except ValueError:continue
  for k in ['nativeRefinement','nativeMutation','nativeInvariantMutation','nativeCompositeKey','nativeUnsupportedRelationships']:
   if k in payload:assert k not in records;records[k]=payload[k]
assert (records['nativeRefinement']['traces'],records['nativeRefinement']['transitions'],records['nativeRefinement']['mismatches'])==(216,648,0)
assert records['nativeMutation']['killed']==records['nativeMutation']['total']==3 and records['nativeInvariantMutation']['killed']==records['nativeInvariantMutation']['total']==2
mutants=[('skip-replay','executor.ts','if(request.key){const replay=','if(false&&request.key){const replay=',1),('ignore-role-membership','policy.ts','if(rows.length===1)return;','return;',2),('omit-terminal-audit','executor.ts','   await tx`insert into action_audit(','   if(false)await tx`insert into action_audit(',1),('per-key-canonical-identity','state.ts',"canonical:entity?'entity:'+entity.id:","canonical:entity?'key:'+referenceAliasIdentity(identity.entity,identity.tupleHex):",1),('skip-missing-projection-prefix','projection.ts','const next=prefix+1n,id=','const next=applied===0?BigInt(request.sequence):prefix+1n,id=',1)]
w=records['nativeMutation']['witnesses']+records['nativeInvariantMutation']['witnesses'];assert len(w)==5
for ident,name,old,new,count in mutants:
 source=(F/'scripts/actions-reference'/name).read_text();assert source.count(old)==count;row=next(x for x in w if x['id']==ident);assert hashlib.sha256(source.encode()).hexdigest()==row['sourceSha256'];assert hashlib.sha256(source.replace(old,new).encode()).hexdigest()==row['mutantSha256']
generated_observations=[r for r in runs if 'generatedFixtureObservation' in r];assert len(generated_observations)==1 and generated_observations[0]['stage']=='regression-3';observation=generated_observations[0]['generatedFixtureObservation'];assert observation['path']=='fixtures/protobuf/emission-corpus-results.json' and observation['freshPath']=='.cache/actions-merged-protobuf-observation/emission-corpus-results.json' and observation['originalRestored']
original=subprocess.check_output(['git','show',revision+':'+observation['path']],cwd=F);raw=(F/observation['freshPath']).read_bytes();assert hashlib.sha256(original).hexdigest()==observation['frozenGitSha256']==sha(F/observation['path']);assert hashlib.sha256(raw).hexdigest()==observation['freshSha256']==generated_observations[0]['stageProofOutputs'][observation['freshPath']]
def normalized_protobuf_report(content):
 value=json.loads(content);matching=[x for x in value['records'] if x['root']=='google/protobuf/cpp_options.proto'];assert len(matching)==1;item=matching[0];assert item['outcome']=='unsupported';suffix=':1:11: edition value "2024" not recognized; should be one of ["2023"]';assert item['detail'] in {'Error: Emitted source does not compile: google/protobuf/'+filename+suffix for filename in ['cpp_options.proto','cpp_file_options.proto']};item['detail']='Same unsupported Edition2024 diagnostic at root or its dependent options file';return value
assert normalized_protobuf_report(original)==normalized_protobuf_report(raw)
schema_packages=json.loads((F/'fixtures/extension-package-audit.json').read_text());schema_audit=json.loads((F/'fixtures/json-schema-audit.json').read_text());assert schema_packages['packages']==schema_packages['passed']==len(schema_packages['results']) and all(x['passed'] and x['failures']==[] for x in schema_packages['results']);assert schema_audit['schemas']==schema_audit['passed']==len(schema_audit['results']) and all(x['passed'] and x['failures']==[] for x in schema_audit['results'])
foundation=json.loads((F/'fixtures/actions/reference-foundation.json').read_text());assert foundation['bun']=='1.4.2' and foundation['nativeVersionNumber']=='170009' and foundation['imageIdentity']=='sha256:2a0d0fe14825b0939f78a8cad5cd4e6aa68bf94d0e5dd96e24b6d23af4315545' and foundation['handlerEnvironment']['imageIdentity']=='sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27' and foundation['handlerEnvironment']['node']=='v24.20.0'
assert foundation['pass']==119 and foundation['fail']==0 and foundation['sourceHeldStable']
for p,h in foundation['sha256'].items():assert sha(F/p)==h,p
browser=json.loads((F/'fixtures/actions/browser.json').read_text());assert len(browser['result']['cases'])==44 and browser['bunParity'] and browser['publicBundle'] and browser['externalRequests']==[]
for p,h in browser['sha256'].items():assert sha(F/p)==h,p
# JSON witnesses are checked independently against the actual closed stage logs.
def jsonlines(stage):
 result=[]
 for line in logs[stage].splitlines():
  try:result.append(json.loads(line))
  except ValueError:pass
 return result
metadata=next(x['handlerMetadataProbe'] for x in jsonlines('handler-metadata') if 'handlerMetadataProbe' in x);assert metadata['executionVerified'] is False and metadata['independentExpectedObligations']==16 and metadata['actualInventory']==21 and metadata['omittedClaimControls']==16 and metadata['inertFetchCalls']==0
native=next(x for x in jsonlines('native-tutorial') if 'ownedContainer' in x);assert native['postgres'].startswith('17.9 ') and native['bun']=='1.4.2' and native['terminalOutcomes']==4 and native['outboxFacts']==2
for flag in ['committed','replayMatches','freshNoOp','postconditionCandidateDiscarded','databaseFailureRolledBack','rollbackPreservedNativeState','durableRejectionReplayed','reorderedDeliveryPendingUntilGapClosed','visibleProjectionMatchesNativeRows','revokedReplayDenied']:assert native[flag] is True,flag
owned=native['ownedContainer'];assert not subprocess.check_output(['docker','ps','-a','--filter','name='+owned,'--format','{{.Names}}'],text=True).strip()
csv=json.loads((F/'.cache/actions-merged-csv/report.json').read_text());assert csv['tokens']==['true','false','True','False'] and len(csv['controls'])==10 and csv['candidate']
for field,path in [('bundleSha256','umf.js'),('inputSha256','original-input.json'),('receiptsSha256','receipts.json')]:assert sha(F/'.cache/actions-merged-csv'/path)==csv[field]
core=json.loads((F/'.cache/actions-merged-core-evolution/report.json').read_text());assert core['cases']==6 and core['resourceControls']==['LIMIT','LIMIT'] and core['completeReceiptParity'] and core['libraryNativeClaims'] is False
loader=next(x for x in jsonlines('loader') if 'checks' in x);assert loader['checks']==8
company=next(x for x in jsonlines('public-company') if 'ui_checks' in x);assert company['checks']==8 and company['ui_checks']==3 and company['page_errors']==[]
legal=next(x for x in jsonlines('legal-appellate') if 'schemas' in x);assert legal['schemas']==15 and legal['checks']==20
artifacts=next(x for x in jsonlines('artifact-collections') if 'collections' in x);assert artifacts['checks']==32 and artifacts['collections']==6 and artifacts['bookmarkAliases']==4 and artifacts['externalDataRequests']==0 and artifacts['corpusRequests']==0
formal=F/'.cache/actions-formal-reproduction';manifest=json.loads((formal/'reproduction-manifest.json').read_text());assert manifest['z3']=='4.15.3.0' and manifest['tlc']=='1.7.4' and manifest['executed']==['SMT','TLC']
for p,h in manifest['files'].items():assert sha(formal/p)==h,p
formal_runtime=json.loads((formal/'runtime-observation.json').read_text());assert formal_runtime['imageReference']=='eclipse-temurin@sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5' and formal_runtime['manifestDigest']=='sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5' and formal_runtime['repoDigestVerified'] is True and formal_runtime['os']=='linux' and formal_runtime['architecture']=='arm64' and formal_runtime['exitCode']==0;assert formal_runtime['javaVersion'].startswith('openjdk 21.') and formal_runtime['javaLogSha256']==sha(formal/'java-version.log');assert formal_runtime['javaCommand']==['docker','run','--rm','--network','none','--entrypoint','java',formal_runtime['imageReference'],'--version']
assert sha(formal/'tla2tools.jar')=='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'
smt=json.loads((formal/'semantics-results.json').read_text());assert smt['solver']=='4.15.3' and len(smt['results'])==22 and len(smt['composition'])==9;assert sum(x['answer']=='sat' for x in smt['results'])==8 and sum(x['answer']=='unsat' for x in smt['results'])==8 and sum(x['answer']=='counterexample' for x in smt['results'])==3
assert smt['sourceSha256']==sha(formal/'semantics.py')==sha(F/'docs/helix/02-design/experiments/actions/formal/semantics.py')
tlc=json.loads((formal/'tlc-results.json').read_text());assert len(tlc['results'])==13;assert sum(x.get('complete') is True for x in tlc['results'])==2 and sum(bool(x.get('invariantViolation')) for x in tlc['results'])==7 and sum(x.get('positiveReachabilityWitness') is True for x in tlc['results'])==3 and sum(x.get('finiteFairProgress') is True for x in tlc['results'])==1
for outcome in tlc['results']:
 raw=(formal/(outcome['name']+'.log')).read_text()
 if outcome.get('complete') or outcome.get('finiteFairProgress'):assert outcome['exit']==0 and 'Model checking completed. No error has been found.' in raw
 elif outcome.get('invariantViolation'):assert outcome['exit']==12 and 'Invariant '+outcome['invariantViolation']+' is violated' in raw
 else:assert outcome.get('positiveReachabilityWitness') and outcome['exit']==12 and 'Invariant '+outcome['name'].removeprefix('witness-')+' is violated' in raw
assert sha(formal/'Commands.tla')==sha(F/'docs/helix/02-design/experiments/actions/formal/Commands.tla')
assert re.search(r'\b43 passed',logs['python-tests']) and not re.search(r'\b[1-9]\d* (failed|skipped|error|xfailed|xpassed)',logs['python-tests'])
python_tools=json.loads((F/'.cache/actions-merged-python/build-tools.json').read_text());assert len(python_tools['install'])==3
for entry in python_tools['install']:assert entry['download_info']['archive_info']['hashes']['sha256'] in {'d3a2f3567c4f926ea39849cdf924c7e99e6686c9c8e288ae1037c8fa2a5d937b','a0d503e138a4c123b27490a4f7beda6a01c6f288df0e4a8b79c7eb0dc7b4cc08','5f19c789d4f17f501d36c94dbbf969fb3e8c2784d008e6f5164dd2c3d6a2b07c'}
ledger=json.loads((F/'docs/helix/03-test/acceptance-criteria-ledger.json').read_text())
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
certpath=F/'docs/helix/04-build/evidence/actions-integrated-certification.json';cert=json.loads(certpath.read_text());assert cert['certified'] and cert['source']['revision']==baseline;assert cert['audit']['pass'] and cert['audit']['nativeBrowserCommands']==174
disposition=json.loads((F/'docs/helix/04-build/evidence/actions-documentation/qualification-integrated-5be80ab9/disposition.json').read_text());proof=disposition['fullProofCommit'];assert digest(gitbytes(proof,'docs/helix/04-build/evidence/actions-integrated-certification.json'))==sha(certpath)==disposition['certificateSha256']
retained_path='docs/helix/04-build/evidence/actions-integrated-qualification/retained-artifacts.json';retained=json.loads(gitbytes(proof,retained_path));assert retained['sourceRevision']==baseline
for p,h in retained['sha256'].items():assert digest(gitbytes(proof,p))==h,('Immutable baseline proof artifact',p)
seal=json.loads(gitbytes(proof,'fixtures/validation/core-check-refresh/final-seal.json'));assert seal['complete'] and seal['sourceRevision']==baseline
for p,h in seal['sha256'].items():
 target=retained['proofPathRelocations'].get(p,p);assert digest(gitbytes(proof,target))==h,('Baseline seal closure at proof Git commit',p,target)
assert v['sealedCacheInputs']=={p:h for p,h in seal['sha256'].items() if p.startswith('.cache/')}
fixture_objects={}
for raw in subprocess.check_output(['git','ls-tree','-r','-z',proof,'--','fixtures'],cwd=F).decode().split('\0'):
 if not raw:continue
 meta,path=raw.split('\t');mode,kind,oid=meta.split();assert kind=='blob' and mode in ['100644','100755'];fixture_objects[path]=oid
assert set(v['inheritedFixtureInputs'])==set(fixture_objects)
for p,oid in fixture_objects.items():
 if p in exceptions:assert v['inheritedFixtureInputs'][p]==digest(gitbytes(proof,p))
 else:
  content=(F/p).read_bytes();assert hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()==oid and v['inheritedFixtureInputs'][p]==sha(F/p),('Inherited baseline fixture changed',p)
assert v['inheritedSemanticFixtureInputs']=={p:h for p,h in v['inheritedFixtureInputs'].items() if p not in exceptions}
report={'profile':'umf.actions.merged-integration-audit/1','pass':True,'mergedSourceRevision':revision,'baselineCertificate':{'path':str(certpath.relative_to(F)),'sha256':sha(certpath),'sourceRevision':baseline,'strictNativeBrowserCommands':174,'strictAdmissionTests':17,'fullProofCommit':proof,'allRetainedArtifactHashesVerified':True,'qualification':'Inherited immutable completed baseline, not fresh merged-source executions'},'reviewedPrimaryDelta':review,'completeSourceDelta':delta,'capturedMergedInputs':len(v['sourceInputs']),'freshMergedResults':{'schemas':{'packages':schema_packages['packages'],'schemas':schema_audit['schemas']},'behaviorRegression':counts,'distinctBehaviorTests':sum(x['tests'] for x in counts),'distinctBehaviorFiles':len(files),'semanticChecks':8,'generatedFixtureObservations':[observation],'semanticAllocation':a,'nativeReferenceTests':119,'actionBrowserCases':44,'criteria':criteria,'nativeRefinement':records['nativeRefinement'],'actualImplementationMutants':records['nativeMutation']['witnesses']+records['nativeInvariantMutation']['witnesses'],'metadata':metadata,'nativeTutorial':native,'csv':csv,'affectedBrowsers':{'coreEvolution':core,'loader':loader,'publicCompany':company,'legalAppellate':legal,'artifactCollections':artifacts},'formal':{'smtChecks':22,'tlcRuns':13,'runtime':formal_runtime,'meaning':'Bounded design model probes, not native implementation qualification'},'pythonTests':43,'pythonBuildTools':python_tools,'qualifierBufferedStreamIndependentlyVerified':False,'completedStages':names},'runtimeImage':I,'executionObservation':{'path':str(O),'sha256':sha(O)},'scope':'Fresh merged-source bounded command behavior, native reference and affected UI integration. Strict core native-evidence admission remains certified only at the recorded immutable baseline; no manufactured currentEvidenceVerified or idealAdmitted flags, no universal or production claim.'}
(Path(str(O)+'.audit.json') if len(sys.argv)>2 else D/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'pass':True,'sourceRevision':revision,'distinctBehaviorTests':report['freshMergedResults']['distinctBehaviorTests'],'semanticChecks':8,'nativeReferenceTests':119,'actionBrowserCases':44}))
