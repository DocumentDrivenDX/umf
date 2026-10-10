"""Run the actual gate on isolated reviewed receipt failure controls; no backend claim."""
import hashlib,json,os,subprocess,tempfile
from pathlib import Path
base=Path.cwd();gate=base/'docs/helix/02-design/spikes/security/acceptance.ts';helper=base/'tools/security/run-command.ts'
pins={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),gate,helper]}
observations=[]
for scenario in ['valid','malformed','missing-assertion','stale-source']:
 with tempfile.TemporaryDirectory(prefix='umf-gate-receipt-') as folder:
  root=Path(folder)
  for original in [gate,helper]:
   target=root/original.relative_to(base);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(original.read_bytes())
  runner="""// @covers US-079-AC1
import {createHash} from 'node:crypto';
const paths=['runner.ts','oracle.json','implementation.ts'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
const scenario=Bun.env.UMF_GATE_RECEIPT_SCENARIO;
if(scenario==='stale-source')await Bun.write('implementation.ts','export const changed=true;');
if(scenario==='malformed')console.log('zero-exit malformed JSON');
else console.log(JSON.stringify({status:'passed',id:Bun.env.UMF_SECURITY_CASE_ID,backend:'semantic',runId:Bun.env.UMF_SECURITY_RUN_ID,command:['bun','runner.ts'],covers:['US-079-AC1'],versions:{bun:Bun.version},sourceDigests,observations:[{assertionId:scenario==='missing-assertion'?'wrong':Bun.env.UMF_SECURITY_CASE_ID,expected:1,observed:1}]}));
"""
  (root/'runner.ts').write_text(runner);(root/'oracle.json').write_text('{}');(root/'implementation.ts').write_text('export const original=true;')
  case={'id':'receipt-control','backend':'semantic','required':True,'covers':['US-079-AC1'],'command':['bun','runner.ts'],'testSource':'runner.ts','oracleSource':'oracle.json','implementationSources':['implementation.ts'],'assertionIds':['receipt-control'],'timeoutMs':10000}
  plan=root/'docs/helix/03-test/security/cases.json';plan.parent.mkdir(parents=True,exist_ok=True);plan.write_text(json.dumps({'cases':[case]}))
  result=subprocess.run(['bun',str(gate)],cwd=root,env={**os.environ,'UMF_GATE_RECEIPT_SCENARIO':scenario},capture_output=True,text=True,timeout=15)
  receipt=json.loads((root/'docs/helix/04-build/evidence/security/acceptance.json').read_text())
  execution=receipt['execution']
  if len(execution)!=1 or execution[0]['exitCode']!=0 or execution[0]['timedOut']:raise RuntimeError('Control runner did not return zero cleanly')
  accepted=execution[0].get('accepted');expected=scenario=='valid'
  if accepted is not expected:raise RuntimeError('Gate incorrectly accepted '+scenario)
  observations.append({'id':scenario,'runnerExitCode':0,'accepted':accepted,'expectedAccepted':expected,'gateStatus':receipt['status']})
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Gate source changed')
Path('docs/helix/04-build/evidence/security/gate-receipt-regression.json').write_text(json.dumps({'status':'passed','sourceDigests':pins,'observations':observations,'scope':'Actual current gate executed from original source with isolated one-case plans and reviewed zero-exit runners. Valid receipt is accepted; malformed, omitted assertion and changed source are rejected. All fixture full gates intentionally remain failed because remaining criteria are unallocated. No native backend admission or runner authenticity claim.'},indent=2)+'\n')
print(json.dumps({'status':'passed','checks':len(observations)}))
