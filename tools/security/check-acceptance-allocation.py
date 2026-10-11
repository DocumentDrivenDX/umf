"""Exercise the original acceptance gate's criterion mapping; no backend claim."""
import hashlib,json,re,subprocess,tempfile,uuid,zipfile
from pathlib import Path
base=Path.cwd()
gate=base/'docs/helix/02-design/spikes/security/acceptance.ts'
helper=base/'tools/security/run-command.ts'
stories=[base/'docs/helix/01-frame/user-stories'/name for name in [
 'US-079-security-semantics.md','US-056-security-bindings.md','US-057-security-lifecycle.md']]
plan_path=base/'docs/helix/03-test/security/cases.json'
paths=[Path(__file__).resolve(),gate,helper,plan_path,*stories]
frozen={str(p.relative_to(base)):p.read_bytes() for p in paths}
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
required=[]
for story in stories:
 text=frozen[str(story.relative_to(base))].decode()
 ids=re.findall(r'\*\*(US-\d+-AC\d+)\*\*',text)
 if len(ids)!=len(set(ids)) or not ids:raise RuntimeError('Ambiguous authoritative criteria')
 required.extend(ids)
if len(required)!=28:raise RuntimeError('Governing story criterion count changed')
plan=json.loads(frozen[str(plan_path.relative_to(base))])
allocated={ac for case in plan['cases'] for ac in case['covers']}
if allocated!=set(required):raise RuntimeError('Actual case plan does not match governing security stories')
observations=[]
scenarios=[('complete',required,[]),
 ('missing-semantic',[x for x in required if x!='US-079-AC8'],['unallocated US-079-AC8']),
 ('retired-semantic',[x.replace('US-079','US-055') for x in required],
  ['allocation-control: unrelated or unknown acceptance criterion US-055-AC'+str(i) for i in range(1,11)]+['unallocated US-079-AC'+str(i) for i in range(1,11)]),
 ('unrelated',required+['US-055-AC1'],['allocation-control: unrelated or unknown acceptance criterion US-055-AC1']),
 ('unknown',required+['US-079-AC11'],['allocation-control: unrelated or unknown acceptance criterion US-079-AC11'])]
for name,covers,expected in scenarios:
 with tempfile.TemporaryDirectory(prefix='umf-gate-allocation-') as folder:
  root=Path(folder)
  for original in [gate,helper]:
   relative=str(original.relative_to(base));target=root/relative
   target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(frozen[relative])
  target=root/'docs/helix/03-test/security/cases.json';target.parent.mkdir(parents=True,exist_ok=True)
  target.write_text(json.dumps({'cases':[{'id':'allocation-control','backend':'semantic','required':True,'covers':covers}]}))
  result=subprocess.run(['bun',str(root/gate.relative_to(base))],cwd=root,capture_output=True,text=True,timeout=15)
  if result.returncode!=1:raise RuntimeError('Nonexecuting plan must fail regardless of allocation')
  receipt=json.loads((root/'docs/helix/04-build/evidence/security/acceptance.json').read_text())
  errors=receipt['errors'];binding='allocation-control: required reviewed runner/oracle/implementation binding not implemented'
  if sorted(errors)!=sorted([binding,*expected]) or receipt['execution']!=[]:raise AssertionError({'scenario':name,'errors':errors})
  if receipt['allocatedAcceptanceCriteria']!=len(set(covers)&set(required)):raise AssertionError('Unrelated criteria counted')
  observations.append({'id':name,'expectedErrors':[binding,*expected],'observedErrors':errors,'allocated':receipt['allocatedAcceptanceCriteria'],'gateStatus':receipt['status'],'gateExit':result.returncode})
# Reach the final receipt-admission branch with synthetic metadata-only runners.
with tempfile.TemporaryDirectory(prefix='umf-gate-allocation-executing-') as folder:
 root=Path(folder)
 for original in [gate,helper]:
  relative=str(original.relative_to(base));target=root/relative
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(frozen[relative])
 runner='\n'.join('// @covers '+ac for ac in [*required,'US-079-AC11'])+'''\nimport {createHash} from 'node:crypto';
const paths=['runner.ts','oracle.json','implementation.ts'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
const id=Bun.env.UMF_SECURITY_CASE_ID;
const covers=JSON.parse(Bun.env.UMF_ALLOCATION_REQUIRED!);
if(id==='unknown-execution')covers.push('US-079-AC11');
console.log(JSON.stringify({status:'passed',id,backend:'semantic',runId:Bun.env.UMF_SECURITY_RUN_ID,command:['bun','runner.ts'],covers,versions:{bun:Bun.version},sourceDigests,observations:[{assertionId:id,expected:1,observed:1}]}));
'''
 (root/'runner.ts').write_text(runner);(root/'oracle.json').write_text('{}');(root/'implementation.ts').write_text('export const metadataFixture=true;')
 cases=[]
 for identifier,covers in [('unknown-execution',required+['US-079-AC11']),('valid-after-error',required),('valid-after-error',required)]:
  cases.append({'id':identifier,'backend':'semantic','required':True,'covers':covers,'command':['bun','runner.ts'],'testSource':'runner.ts','oracleSource':'oracle.json','implementationSources':['implementation.ts'],'assertionIds':[identifier],'timeoutMs':10000})
 target=root/'docs/helix/03-test/security/cases.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps({'cases':cases}))
 import os
 result=subprocess.run(['bun',str(root/gate.relative_to(base))],cwd=root,env={**os.environ,'UMF_ALLOCATION_REQUIRED':json.dumps(required)},capture_output=True,text=True,timeout=15)
 receipt=json.loads((root/'docs/helix/04-build/evidence/security/acceptance.json').read_text())
 if result.returncode!=1 or receipt['allocatedAcceptanceCriteria']!=28:raise AssertionError('Invalid allocation execution must fail')
 if receipt['errors']!=['unknown-execution: unrelated or unknown acceptance criterion US-079-AC11','duplicate case valid-after-error']:raise AssertionError(receipt['errors'])
 executions=receipt['execution']
 if len(executions)!=3:raise AssertionError('All original fixture runners must execute')
 for label,row,expected in zip(['unknown-execution','valid-after-error','duplicate-execution'],executions,[False,True,False]):
  if row['exitCode']!=0 or row['timedOut'] or row['accepted'] is not expected:raise AssertionError({'label':label,'execution':row})
  observations.append({'id':label,'expectedAccepted':expected,'observedAccepted':row['accepted'],'runnerExit':row['exitCode'],'runId':row['runId']})
 executing_evidence={'gate':receipt,'runner':runner,'plan':cases,'oracle':'{}','implementation':'export const metadataFixture=true;'}

if any(hashlib.sha256((base/p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Sources changed during allocation controls')
run=base/'docs/helix/04-build/evidence/security/acceptance-allocation'/str(uuid.uuid4());run.mkdir(parents=True)
receipt={'status':'passed','sourceDigests':pins,'requiredCriteria':required,'observations':observations,'scope':'Exact original gate on isolated nonexecuting plans; authoritative story criterion extraction and actual plan equality. Allocation metadata only, not exercising behavior or backend qualification.'}
(run/'executing-controls.json').write_text(json.dumps(executing_evidence,indent=2)+'\n')
(run/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
with zipfile.ZipFile(run/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for path,data in frozen.items():archive.writestr(path,data)
print(json.dumps({'status':'passed','checks':len(observations),'evidence':str(run.relative_to(base))}))
