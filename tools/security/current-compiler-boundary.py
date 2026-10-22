"""Current-main compiler refusal witness; never native backend acceptance."""
import argparse,copy,hashlib,json,os,subprocess
from pathlib import Path
CURRENT_CORE_VERSION = json.loads(Path('spec/metamodel/generated/python-shapes.json').read_text())['currentVersion']
p=argparse.ArgumentParser();p.add_argument('--weft-root',type=Path,required=True);p.add_argument('--expected-weft-commit',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=a.weft_root.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
if git('rev-parse','HEAD')!=a.expected_weft_commit:raise RuntimeError('Wrong original compiler commit')
if git('diff','HEAD','--name-only'):raise RuntimeError('Tracked compiler source is dirty')
paths=[root/n for n in git('ls-files').splitlines() if not n.startswith('docs/helix/04-build/evidence/')]
paths += [Path(__file__).resolve(),Path(__file__).with_name('current-compiler-witness.rs').resolve()]
paths += [Path('spec/metamodel/generated/python-shapes.json').resolve()]
frozen={p:p.read_bytes() for p in paths if p.is_file()}
crate=Path('/private/tmp/umf-current-compiler-boundary-20261012');(crate/'src').mkdir(parents=True,exist_ok=True)
manifest='[package]\nname="umf-current-compiler-boundary"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nweft-core={path='+json.dumps(str(root/'crates/weft-core'))+'}\nserde_json="1"\n'
(crate/'Cargo.toml').write_text(manifest);(crate/'src/main.rs').write_bytes(frozen[Path(__file__).with_name('current-compiler-witness.rs').resolve()])
tool=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin');env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ.get('PATH',''),'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'}
lock=subprocess.run([str(tool/'cargo'),'generate-lockfile','--offline','--manifest-path',str(crate/'Cargo.toml')],env=env,text=True,capture_output=True,timeout=60);(out/'lock.stdout.log').write_text(lock.stdout);(out/'lock.stderr.log').write_text(lock.stderr);lock.check_returncode()
frozen.update({p:p.read_bytes() for p in [crate/'Cargo.toml',crate/'Cargo.lock',crate/'src/main.rs']})
target=Path('/private/tmp/weft-042-release-target-a');command=[str(tool/'cargo'),'build','--release','--offline','--locked','--manifest-path',str(crate/'Cargo.toml'),'--target-dir',str(target)]
build=subprocess.run(command,env=env,text=True,capture_output=True,timeout=300);(out/'build.stdout.log').write_text(build.stdout);(out/'build.stderr.log').write_text(build.stderr);build.check_returncode();binary=target/'release/umf-current-compiler-boundary';frozen[binary]=binary.read_bytes()
fixtures=json.loads((root/'docs/helix/03-test/fixtures/cases.json').read_text());ordinary=next(x['request'] for x in fixtures if x['expected']['status']=='compiled')
f=json.loads((root/'crates/weft-core/tests/security-source-fixture.json').read_text());source=f['resolution']['documents'][0];doc=copy.deepcopy(source['document'])
if doc.get('umf') != CURRENT_CORE_VERSION:raise RuntimeError('Current-core native qualification unavailable: upstream source fixture uses a retired core envelope')
for e in doc['modules'][0]['elements']:
 e['name']=e['id']
 if e.get('scalarType')=='integer':e['facets']={'integerWidth':{'bits':64,'signed':True}}
def encoded(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False)
text=encoded(doc);pin={'documentId':doc['id'],'revision':source['revision'],'umfVersion':CURRENT_CORE_VERSION,'sha256':sha(text.encode())}
base=copy.deepcopy(ordinary);base.update(interfaceVersion='weft-security-compile/0.2.0',dialect='weft-sql/0.2.0',sql='SELECT r.resourceId FROM Resource r',modules=[{'documentJson':text,'pin':pin,'selectedModuleIds':['m']}])
base['security']={'version':'umf.security/0.1.0','policyJson':encoded(f['policy']),'ontologyJson':encoded(f['resolution']['ontology'])}
profile={'version':'weft.security.query-profile/0.1.0','id':'current-refusal-witness','revision':'p1','action':'read','modelPins':[pin],'policySha256':sha(base['security']['policyJson'].encode()),'ontologySha256':sha(base['security']['ontologyJson'].encode()),'binding':{'backendId':base['target']['backendId'],'backendVersion':base['target']['backendVersion'],'targetProfile':base['target']['targetProfile'],'sha256':sha(base['target']['bindingJson'].encode())},'targets':[{'documentId':'domain','moduleId':'m','elementId':'Resource'}],'bindings':[]}
base['security']['queryProfileJson']=encoded(profile)
def policy_case(change):
 req=copy.deepcopy(base);policy=json.loads(req['security']['policyJson']);change(policy);req['security']['policyJson']=encoded(policy);q=copy.deepcopy(profile);q['policySha256']=sha(req['security']['policyJson'].encode());req['security']['queryProfileJson']=encoded(q);return req
cases=[('ordinary-factory-positive','ordinary',ordinary,True,False,'WFT-WITNESS-ORDINARY'),('current-registration-missing','security-empty',base,False,True,'WFT-SECURITY-BACKEND-REQUIRED'),('current-registered-still-blocked','security-registered',base,False,True,'WFT-SECURITY-LOWERING-UNSUPPORTED')]
for supported in [False,True]:
 def mask(policy):policy['rules'][0]['disclosure'][0]['disposition']={'kind':'transformed','transform':'constant' if supported else 'unknown','version':'0.1.0','field':{'documentId':'domain','moduleId':'m','elementId':'salary'},'value':{'integerToken':'1'}}
 cases.append(('supported-mask-source' if supported else 'unsupported-mask','security-registered',policy_case(mask),False,supported,'WFT-SECURITY-LOWERING-UNSUPPORTED' if supported else 'WFT-SECURITY-SOURCE'))
path=policy_case(lambda x:x['rules'][1]['condition'].update(op='unknown-path'));cases.append(('unsupported-path','security-registered',path,False,False,'WFT-SECURITY-SOURCE'))
query=copy.deepcopy(base);query['sql']='SELECT r.resourceId FROM Resource r WHERE r.salary=100';cases.append(('prohibited-original-filter','security-registered',query,False,False,'WFT-SECURITY-QUERY-PROFILE'))
report=copy.deepcopy(base);report['options']['mode']='report';cases.append(('unknown-report-option','security-registered',report,False,False,'WFT-INPUT'))
history=copy.deepcopy(base);history['readProfile']={'version':'weft-application-read/0.2.0','subset':'historical'};cases.append(('invalid-history-input','security-registered',history,False,False,'WFT-INPUT'))
observations=[]
for name,mode,request,expected_ordinary,expected_security,code in cases:
 request_json=encoded(request);run=subprocess.run([str(binary)],input=encoded({'mode':mode,'requestJson':request_json}),text=True,capture_output=True,timeout=10)
 item={'id':name,'mode':mode,'requestJson':request_json,'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr,'expected':{'ordinaryFactoryInvoked':expected_ordinary,'securityFactoryInvoked':expected_security,'lowerInvoked':False,'diagnosticCode':code}}
 observations.append(item);(out/'observations.json').write_text(json.dumps(observations,indent=2)+'\n');run.check_returncode();result=json.loads(run.stdout);response=result['response']
 assert not run.stderr and result['ordinaryFactoryInvoked'] is expected_ordinary and result['securityFactoryInvoked'] is expected_security and result['lowerInvoked'] is False,name
 assert response['status']=='blocked' and response['diagnostics'][0]['code']==code and not any(k in response for k in ['sql','parameters','logicalPlan']),name
if git('rev-parse','HEAD')!=a.expected_weft_commit or any(p.read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Original inputs changed during witness')
receipt={'status':'current-compiler-refusal-component-passed','weftCommit':a.expected_weft_commit,'buildCommand':command,'buildExitCode':build.returncode,'observations':len(observations),'sourcesUnchanged':True,'sourceDigests':{str(p):sha(b) for p,b in frozen.items()},'scope':'Original current compiler factory/refusal behavior with noninstalling observers; not native preservation, SQL lowering, profile authentication or B09 acceptance.'}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'observations':len(observations)}))
