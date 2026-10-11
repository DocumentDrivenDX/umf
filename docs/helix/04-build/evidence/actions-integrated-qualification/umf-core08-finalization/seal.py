"""Seal current core 0.8 execution; no semantic-type 0.9 acceptance is inferred."""
import hashlib,json,os,re,subprocess
from pathlib import Path
O=Path('fixtures/validation/core-check-refresh')
def load(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def checked(p):
 r=load(p);assert r['exitCode']==0 and sha(r['log'])==r['logSha256'],('Unsuccessful or changed execution',str(p));return r
def summary(r):
 m=re.findall(r'\n\s*(\d+) pass\n\s*(\d+) fail\n\s*(\d+) expect\(\) calls\nRan (\d+) tests across (\d+) files\.',Path(r['log']).read_text())
 assert m;passed,failed,assertions,tests,files=map(int,m[-1]);assert failed==0 and passed==tests and files==len(r['command'])-2
 return {'passed':passed,'failed':failed,'assertions':assertions,'tests':tests,'files':files}
def prior(p,revision):
 result=subprocess.run(['git','show',revision+':'+str(p)],capture_output=True)
 if result.returncode:return {'status':'new artifact; absent from frozen source commit','sourceRevision':revision}
 return {'revision':revision,'path':str(p),'sha256':hashlib.sha256(result.stdout).hexdigest()}
native=load(O/'native-browser.json');runtime=load(O/'container-runtime.json');revision=runtime['sourceRevision']
assert native['complete'] and native['sourceRevision']==revision and len(native['runs'])==174 and native['commands']==[r['command'] for r in native['runs']]
for p,h in native['sourceInputs'].items():assert sha(p)==h,('Source changed',p)
for r in native['runs']+load(O/'auxiliary.json')['runs']+load(O/'regression.json')['runs']:
 assert r['exitCode']==0 and sha(r['log'])==r['logSha256']
publication=load(O/'publication.json');assert publication['complete'] and publication['nativeBrowserCommands']==174
for name in ['container-publication','container-schema-properties-inputs','container-schema-properties-oracle']:checked(O/(name+'.json'))
gate=checked(O/'container-gates.json');counts=summary(gate);integrity=checked(O/'container-integrity.json');affected=checked(O/'container-affected.json')
assert affected['command']==['bun','test',*sorted(str(p) for d in ['tests/core','tests/consumers','tests/ddd'] for p in Path(d).glob('*.test.ts'))]
summary(affected)
closures=[json.loads(s) for s in Path(integrity['log']).read_text().splitlines() if s.startswith('{')]
assert {r['concept'] for r in closures}=={'field','nullability','cardinality','facets','key','relationship'} and all(r['currentEvidenceVerified'] for r in closures)
browser=load('fixtures/validation/core-schema-properties-browser.json');oracle=load('fixtures/validation/core-schema-properties-oracle.json');inputs=load('fixtures/validation/core-schema-properties-oracle-inputs.json')
assert browser['browser']==native['expectedBrowser'] and browser['externalRequests']==[]
assert browser['bundleSha256']==sha('dist/umf.js')
assert browser['checks']=={'cases':38,'recoveries':4,'refusals':12,'getterCalls':0,'extensionChecks':6,'unknownUnitChecks':4}
for p,h in browser['sha256'].items():assert sha(p)==h
assert oracle['probes']==oracle['agreed']==58 and len(oracle['observations'])==len(inputs['probes'])==58
assert oracle['inputSha256']==sha('fixtures/validation/core-schema-properties-oracle-inputs.json')
assert all(r['agrees'] and r['accepted']==r['pythonAccepted'] and {k:r[k] for k in ['domain','token','accepted']}==i for r,i in zip(oracle['observations'],inputs['probes']))
gates_path=O/'gates.json';gates={'complete':True,'sourceRevision':revision,'uniqueTests':counts['tests'],'files':counts['files'],'failed':0,'runs':[{**gate,'results':counts}],'previousEvidence':prior(gates_path,revision),'scope':'Complete eight-file admission run; overlapping auxiliary and affected checks excluded.'}
gates_path.write_text(json.dumps(gates,indent=2)+'\n')
reg=publication['regression'];seal_path=O/'final-seal.json'
paths=[O/name for name in ['native-browser.json','auxiliary.json','regression.json','publication.json','gates.json','container-runtime.json','container-gates.json','container-integrity.json','container-affected.json','container-schema-properties-inputs.json','container-schema-properties-oracle.json','container-publication.json']]
paths += [Path('dist/umf.js')]+[Path(r['log']) for r in [gate,integrity,affected]]+[Path('fixtures/validation')/name for name in ['core-schema-properties-browser.json','core-schema-properties-oracle.json','core-schema-properties-oracle-inputs.json']]
for name in ['container-schema-properties-inputs','container-schema-properties-oracle','container-publication']:paths.append(Path(load(O/(name+'.json'))['log']))
seal={'complete':True,'sourceRevision':revision,'uniqueTests':reg['passed']+counts['tests'],'uniqueTestFiles':reg['files']+counts['files'],'regressionTests':reg['passed'],'gateTests':counts['tests'],'nativeBrowserInventoryCommands':174,'currentProofConcepts':6,'sealingRuntime':{'imageId':os.environ['UMF_REPLAY_IMAGE_ID'],'replayScriptSha256':sha('/opt/replay.py'),'sealScriptSha256':sha('/opt/seal.py')},'previousEvidence':prior(seal_path,revision),'schemaProperties':{'browser':browser['checks'],'independentLiteralOracle':{'probes':58,'agreed':58}},'notApplicableHistoricalPaths':['scripts/core-semantic-types-oracle-inputs.ts','scripts/core-semantic-types-oracle.py','fixtures/validation/core-semantic-types-acceptance.json','tests/semantic-types/core.test.ts','tests/semantic-types/semantic-types.test.ts'],'scope':'Fresh exact-source native/browser inventory, disjoint regression, complete admission gates and current core0.8 schema-properties browser/literal oracle. Auxiliary/affected overlap excluded; no core0.9 semantic-type claim, native-equivalence claim or universal correctness claim.','sha256':{str(p):sha(p) for p in paths}}
for p in seal['notApplicableHistoricalPaths']:assert not Path(p).exists()
seal_path.write_text(json.dumps(seal,indent=2)+'\n');print(json.dumps({'sealed':True,'uniqueTests':seal['uniqueTests'],'gateTests':counts['tests'],'schemaPropertiesOracleProbes':58}))
