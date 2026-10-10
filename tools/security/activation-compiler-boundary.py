"""Actual compiler factory-boundary evidence; no native installation acceptance."""
import copy,hashlib,json,os,subprocess
from pathlib import Path

SELF=Path(__file__)
source=Path('tools/security/activation-compiler-witness.rs')
handoff_path=Path('docs/helix/04-build/evidence/security/weft-handoff.json')
owner_cases=Path('/Users/erik/Projects/weft/docs/helix/03-test/fixtures/cases.json')
crate=Path('/private/tmp/umf-activation-compiler-witness')
binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/umf-activation-compiler-witness')
handoff=json.loads(handoff_path.read_text())
if handoff['status']!='passed':raise RuntimeError('Compiler handoff not current')
paths=[SELF,source,handoff_path,owner_cases,crate/'Cargo.toml',crate/'Cargo.lock',crate/'src/main.rs',*map(Path,handoff['sourceDigests'])]
frozen={p:p.read_bytes() for p in paths}
if frozen[source]!=frozen[crate/'src/main.rs']:raise RuntimeError('Witness build source differs')
if any(hashlib.sha256(frozen[Path(p)]).hexdigest()!=h for p,h in handoff['sourceDigests'].items()):raise RuntimeError('Compiler handoff source changed')
manifest='[package]\nname="umf-activation-compiler-witness"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nweft-core={path="/Users/erik/Projects/weft/crates/weft-core"}\nserde_json="1"\n'
if frozen[crate/'Cargo.toml'].decode()!=manifest:raise RuntimeError('Unexpected witness dependency manifest')
tool=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
build_command=[str(tool/'cargo'),'build','--offline','--locked','--manifest-path',str(crate/'Cargo.toml'),'--target-dir','/private/tmp/umf-security-weft-bridge-target']
build=subprocess.run(build_command,env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ.get('PATH',''),'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'},text=True,capture_output=True,timeout=300)
if build.returncode:raise RuntimeError('Original compiler witness build failed: '+build.stderr[-3000:])
frozen[binary]=binary.read_bytes()
def encoded(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False)
def sha(text):return hashlib.sha256(text.encode()).hexdigest()
a=next(x['request'] for x in handoff['artifacts'] if x['id']=='natural-count-self-join')
base={'interfaceVersion':'weft-compile/0.3.0','dialect':'weft-sql/0.2.0','modules':a['modules'],'sql':a['sql'],'parameters':{},'options':{'allowCandidate':False},'security':{'version':'umf.security/0.1.0','policyJson':a['policyJson'],'ontologyJson':a['ontologyJson'],'queryProfileJson':a['queryProfileJson']},'target':{k:a[k] for k in ['backendId','backendVersion','targetProfile','bindingJson']}}
base['target']['bindingSha256']=sha(a['bindingJson'])
positive=next(x['request'] for x in json.loads(frozen[owner_cases]) if x['expected']['status']=='compiled')
cases=[('factory-positive',positive,True),('unsupported-public-security',base,False)]
candidate=copy.deepcopy(base);candidate['options']['allowCandidate']=True;cases.append(('candidate-does-not-bypass',candidate,False))
for label in ['path','mask']:
 q=copy.deepcopy(candidate);policy=json.loads(q['security']['policyJson'])
 if label=='path':policy['rules'][0]['condition']={'op':'recursive-path','value':True}
 else:policy['rules'][0]['disclosure'][0]['disposition']={'kind':'transformed','transform':'unsupported-mask','version':'0.1.0','field':policy['rules'][0]['disclosure'][0]['field'],'value':{'integerToken':'1'}}
 q['security']['policyJson']=encoded(policy)
 profile=json.loads(q['security']['queryProfileJson']);profile['policySha256']=sha(q['security']['policyJson']);q['security']['queryProfileJson']=encoded(profile)
 cases.append(('unsupported-'+label,q,False))
 if label=='mask':
  supported=copy.deepcopy(q);p=json.loads(supported['security']['policyJson']);p['rules'][0]['disclosure'][0]['disposition']['transform']='constant';supported['security']['policyJson']=encoded(p)
  profile=json.loads(supported['security']['queryProfileJson']);profile['policySha256']=sha(supported['security']['policyJson']);supported['security']['queryProfileJson']=encoded(profile)
  cases.append(('supported-mask-source-still-no-activation',supported,False))
history=copy.deepcopy(candidate);history['readProfile']={'version':'weft-application-read/0.2.0','subset':'historical'};cases.append(('invalid-history-profile-input',history,False))
composition=copy.deepcopy(candidate);composition['sql']='SELECT r.resourceId FROM Resource r WHERE r.salary=100';cases.append(('prohibited-original-filter',composition,False))
report=copy.deepcopy(candidate);report['options']['mode']='report';cases.append(('unknown-report-option',report,False))
observations=[]
expected_codes={'factory-positive':'UMF-WITNESS-FACTORY','unsupported-public-security':'WFT-SECURITY-UNSUPPORTED','candidate-does-not-bypass':'WFT-SECURITY-UNSUPPORTED','unsupported-path':'WFT-SECURITY-SOURCE','unsupported-mask':'WFT-SECURITY-SOURCE','supported-mask-source-still-no-activation':'WFT-SECURITY-UNSUPPORTED','invalid-history-profile-input':'WFT-INPUT','prohibited-original-filter':'WFT-SECURITY-QUERY-PROFILE','unknown-report-option':'WFT-INPUT'}
for label,request,expected_factory in cases:
 run=subprocess.run([str(binary)],input=encoded(request),text=True,capture_output=True,timeout=10)
 if run.returncode or run.stderr:raise RuntimeError('Compiler witness transport failed: '+label)
 result=json.loads(run.stdout);response=result['response']
 if type(result['backendFactoryInvoked']) is not bool or result['backendFactoryInvoked']!=expected_factory or response.get('status')!='blocked' or any(k in response for k in ['sql','parameters','logicalPlan']):raise AssertionError(label)
 code=response['diagnostics'][0]['code']
 if code!=expected_codes[label]:raise AssertionError(label+': '+code)
 observations.append({'id':label,'request':request,'expectedFactoryInvoked':expected_factory,'expectedDiagnosticCode':expected_codes[label],'observed':result})
if any(p.read_bytes()!=data for p,data in frozen.items()):raise RuntimeError('Compiler witness source changed during execution')
receipt={'status':'compiler-boundary-component-passed','buildCommand':build_command,'buildExitCode':build.returncode,'buildStdout':build.stdout,'buildStderr':build.stderr,'sourceDigests':{str(p):hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'sourcesUnchanged':True,'observations':observations,'nativeImplementationQualified':False,'scope':'Actual Weft Compiler::compile_json_with_factory with a noninstalling observation callback. Legacy positive control reaches the factory; current security source, allowCandidate, unsupported path/mask, invalid history profile input, prohibited original filter and unknown report option refuse without callback or executable output. Unknown report options are transport refusal, not implemented report-mode semantics. This witness does not prove native preservation, executable source-to-binary correspondence, public activation, supported security lowering or B09 acceptance.'}
Path('docs/helix/04-build/evidence/security/activation-compiler-boundary.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations)}))
