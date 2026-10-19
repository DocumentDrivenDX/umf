"""Actual Rust mapping inspection transport; not security compile activation."""
import copy,hashlib,json,os,subprocess
from pathlib import Path
root=Path('/Users/erik/Projects/weft');tool=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
def text(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def sha(v):return hashlib.sha256(v).hexdigest()
paths=[Path(__file__),Path('tests/security/weft-source-fixture.json'),root/'Cargo.toml',root/'Cargo.lock']
paths+=sorted(p for p in (root/'crates/weft-core').rglob('*') if p.is_file() and p.suffix in ['.rs','.toml'])
paths+=sorted(p for base in ['spec/upstream','docs/helix/02-design/contracts'] for p in (root/base).rglob('*.json'))
sources={str(p):sha(p.read_bytes()) for p in paths}
env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ.get('PATH',''),'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'}
command=[str(tool/'cargo'),'build','--offline','--locked','-p','weft-core','--example','security_mapping_handoff','--target-dir','/private/tmp/umf-security-weft-bridge-target']
build=subprocess.run(command,cwd=root,env=env,text=True,capture_output=True,timeout=300)
if build.returncode:raise RuntimeError(build.stderr[-4000:])
binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff')
f=json.loads(Path('tests/security/weft-source-fixture.json').read_text());doc=copy.deepcopy(f['resolution']['documents'][0]['document'])
for e in doc['modules'][0]['elements']:
 e['name']=e['id']
 if e.get('scalarType')=='integer':e['facets']={'integerWidth':{'bits':64,'signed':True}}
doc_json=text(doc);pin={'documentId':'domain','revision':'schema-1','umfVersion':'0.8.0','sha256':sha(doc_json.encode())}
policy_json=text(f['policy']);ontology_json=text(f['resolution']['ontology']);binding='{"version":"unqualified-mapping-fixture/0.1.0"}'
profile={'version':'weft.security.query-profile/0.1.0','id':'inspection-profile','revision':'1','action':'read','modelPins':[pin],'policySha256':sha(policy_json.encode()),'ontologySha256':sha(ontology_json.encode()),'binding':{'backendId':'fixture','backendVersion':'unqualified','targetProfile':'inspection-only','sha256':sha(binding.encode())},'targets':[{'documentId':'domain','moduleId':'m','elementId':'Resource'}],'bindings':[]}
base={'version':'weft.security.mapping-input/0.1.0','modules':[{'documentJson':doc_json,'pin':pin,'selectedModuleIds':['m']}],'policyJson':policy_json,'ontologyJson':ontology_json,'queryProfileJson':text(profile),'bindingJson':binding,'backendId':'fixture','backendVersion':'unqualified','targetProfile':'inspection-only','sql':"SELECT r.resourceId FROM Resource r WHERE r.resourceId='RA'",'parameters':{},'readProfile':None}
cases=[('scalar',base,True)]
count=copy.deepcopy(base);count['sql']='SELECT COUNT(*) FROM Resource r JOIN Resource s ON r.resourceId=s.resourceId';cases.append(('count-self-join',count,True))
# A separately selected natural-key model; never repair the surrogate model in place.
natural=copy.deepcopy(count);natural_doc=json.loads(natural['modules'][0]['documentJson'])
for entity in natural_doc['modules'][0]['elements']:
 if entity['id'] in ['Assignment','Ownership']:
  removed='assignmentId' if entity['id']=='Assignment' else 'ownerId'
  fields=['assignmentStaff','assignmentProject'] if entity['id']=='Assignment' else ['ownerResource','ownerProject']
  entity['members']=[m for m in entity['members'] if m['element']!=removed]
  entity['keys'][0]['fields']=[{'module':'m','element':field} for field in fields]
natural['modules'][0]['documentJson']=text(natural_doc)
natural_pin=natural['modules'][0]['pin'];natural_pin['revision']='schema-natural-1';natural_pin['sha256']=sha(natural['modules'][0]['documentJson'].encode())
natural_ontology=json.loads(natural['ontologyJson']);natural_ontology['revision']='ontology-natural-1';natural_ontology['documents'][0]['revision']='schema-natural-1'
for association in natural_ontology['associations']:
 removed='assignmentId' if association['type']['elementId']=='Assignment' else 'ownerId'
 association['fields']=[field for field in association['fields'] if field['ref']['elementId']!=removed]
natural['ontologyJson']=text(natural_ontology)
natural_policy=json.loads(natural['policyJson']);natural_policy['revision']='policy-natural-1';natural_policy['ontology']['revision']='ontology-natural-1';natural['policyJson']=text(natural_policy)
natural_profile=json.loads(natural['queryProfileJson']);natural_profile['id']='natural-key-inspection-profile';natural_profile['modelPins']=[natural_pin];natural_profile['ontologySha256']=sha(natural['ontologyJson'].encode());natural_profile['policySha256']=sha(natural['policyJson'].encode());natural['queryProfileJson']=text(natural_profile)
cases.append(('natural-count-self-join',natural,True))
for identifier,field,value in [('protected-use','sql','SELECT r.resourceId FROM Resource r WHERE r.salary=100'),('backend-change','backendVersion','changed'),('unknown-version','version','unknown'),('unknown-member','claimedAuthority',True)]:
 request=copy.deepcopy(base);request[field]=value;cases.append((identifier,request,False))
changed=copy.deepcopy(base);changed['modules'][0]['documentJson']+=' ';changed['modules'][0]['pin']['sha256']=sha(changed['modules'][0]['documentJson'].encode());cases.append(('changed-model-with-repin',changed,False))
observations=[];artifacts=[]
for identifier,request,expected in cases:
 raw=text(request);run=subprocess.run([str(binary)],input=raw,text=True,capture_output=True,timeout=10)
 if expected:
  if run.returncode or run.stderr:raise AssertionError(identifier)
  packet=json.loads(run.stdout)
  if packet['version']!='weft.security.mapping-handoff/0.2.0' or packet['sqlSha256']!=sha(request['sql'].encode()):raise AssertionError(identifier)
  wanted=2 if identifier in ['count-self-join','natural-count-self-join'] else 1
  if len(packet['scans'])!=wanted:raise AssertionError(identifier)
  if any(a['ruleIds']!=['membership','reader'] or len(a['keys'])!=5 or len(a['associations'])!=2 for s in packet['scans'] for a in s['actions']):raise AssertionError('Incomplete emitted dependencies')
  artifacts.append({'id':identifier,'request':request,'handoff':packet})
 else:
  if run.returncode==0 or run.stdout.strip() or not json.loads(run.stderr)['code'].startswith('WFT-'):raise AssertionError(identifier)
 observations.append({'id':identifier,'expectedExport':expected,'exitCode':run.returncode,'diagnostic':json.loads(run.stderr) if run.stderr else None})
raw=text(base)[:-1]+',"version":"weft.security.mapping-input/0.1.0"}'
run=subprocess.run([str(binary)],input=raw,text=True,capture_output=True,timeout=10)
if run.returncode==0 or run.stdout.strip() or json.loads(run.stderr)['code']!='WFT-SECURITY-MAPPING-INPUT':raise AssertionError('Duplicate member accepted')
observations.append({'id':'duplicate-member','expectedExport':False,'exitCode':run.returncode,'diagnostic':json.loads(run.stderr)})
run=subprocess.run([str(binary)],input=' '*32_000_001,text=True,capture_output=True,timeout=10)
if run.returncode==0 or run.stdout.strip() or json.loads(run.stderr)['code']!='WFT-SECURITY-MAPPING-INPUT':raise AssertionError('Over-budget transport accepted')
observations.append({'id':'over-budget-input','expectedExport':False,'exitCode':run.returncode,'diagnostic':json.loads(run.stderr)})
if any(sha(Path(p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Sources changed during probe')
receipt={'status':'passed','sourceDigests':sources,'binarySha256':sha(binary.read_bytes()),'buildCommand':command,'observations':observations,'artifacts':artifacts,'scope':'Actual Rust example executable exports three source-qualified scalar/count-self-join mapping inputs and refuses seven unsupported/stale/ambiguous/over-budget inputs with no stdout artifact. The fixture has explicit authored names and signed64 integer domain selection. No backend lowering, native data execution, host authority or public compile-envelope activation.'}
Path('docs/helix/04-build/evidence/security/weft-handoff.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','observations':len(observations),'actualCompilerArtifacts':len(artifacts)}))
