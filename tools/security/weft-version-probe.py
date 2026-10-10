"""Fresh owner-compiler model-version probe; no backend/security acceptance claim."""
import gzip,hashlib,json,subprocess,os
from pathlib import Path
ROOT=Path('/Users/erik/Projects/weft')
OUT=Path('docs/helix/04-build/evidence/security/weft-version.json')
TARGET='/private/tmp/umf-security-weft-bridge-target'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
paths=sorted(p for directory in ['crates','spec','docs/helix/02-design/contracts'] for p in (ROOT/directory).rglob('*') if p.is_file() and p.suffix in ['.rs','.toml','.json'])
paths += [ROOT/'Cargo.toml',ROOT/'Cargo.lock']
sources={str(p):sha(p) for p in paths}
packet=ROOT/'docs/helix/04-build/evidence/B-007-qualified-registration/compiled-artifacts.jsonl.gz'
sources[str(packet)]=sha(packet);sources['tools/security/weft-version-probe.py']=sha(Path(__file__))
toolchain=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
env={**os.environ,'PATH':str(toolchain)+os.pathsep+os.environ.get('PATH',''),'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'}
result=subprocess.run([str(toolchain/'cargo'),'build','--offline','--locked','--package','weft-runtime','--example','compile_public_batch','--features','truss-postgresql-qualified,ashlar-databricks-qualified','--target-dir',TARGET],cwd=ROOT,env=env,text=True,capture_output=True,timeout=300)
if result.returncode:raise RuntimeError(result.stderr[-4000:])
records=[json.loads(line) for line in gzip.decompress(packet.read_bytes()).decode().splitlines()]
selected=[]
for backend in ['truss.postgresql','ashlar.databricks']:
 record=next(r for r in records if r['response']['status']=='compiled' and r['request']['target']['backendId']==backend)
 selected.append(record)
requests=[]
for record in selected:
 requests.append((record['id']+'-original',record['request'],'compiled'))
 changed=json.loads(json.dumps(record['request']))
 for module in changed['modules']:
  document=json.loads(module['documentJson']);document['umf']='0.8.0'
  module['documentJson']=json.dumps(document,ensure_ascii=False,separators=(',',':'))
  module['pin']['umfVersion']='0.8.0';module['pin']['sha256']=hashlib.sha256(module['documentJson'].encode()).hexdigest()
 requests.append((record['id']+'-core08',changed,'blocked'))
binary=Path(TARGET)/'debug/examples/compile_public_batch'
run=subprocess.run([str(binary)],input=''.join(json.dumps(r)+'\n' for _,r,_ in requests),text=True,capture_output=True,timeout=30)
if run.returncode:raise RuntimeError(run.stderr[-4000:])
responses=[json.loads(line) for line in run.stdout.splitlines()]
if len(responses)!=len(requests):raise RuntimeError('Incomplete compiler responses')
observations=[]
for (identity,request,expected),response in zip(requests,responses):
 if response['status']!=expected:raise RuntimeError('Unexpected version boundary: '+identity)
 if expected=='blocked' and any(k in response for k in ['sql','parameters','logicalPlan']):raise RuntimeError('Partial blocked artifact')
 observations.append({'id':identity,'backend':request['target']['backendId'],'expected':expected,'request':request,'observed':response})
if any(sha(Path(p))!=value for p,value in sources.items()):raise RuntimeError('Sources changed during owner build/probe')
OUT.write_text(json.dumps({'status':'passed','scope':'Two owner qualified compiler fixtures: original core07 and re-pinned core08 version refusal; no security lowering/native support','sourceDigests':sources,'binarySha256':sha(binary),'build':{'command':result.args,'exitCode':result.returncode},'observations':observations},indent=2)+'\n')
print(json.dumps({'status':'passed','observations':len(observations),'core08Diagnostics':[r['observed']['diagnostics'] for r in observations if r['expected']=='blocked']}))
