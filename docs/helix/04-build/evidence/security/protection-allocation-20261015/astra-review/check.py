import json,hashlib,re,subprocess,os,shutil,copy
from pathlib import Path
root=Path('/Users/erik/.codex/worktrees/security-main-integration/umf');out=Path(__file__).resolve().parent
files=['tools/security/check-acceptance-allocation.py','tools/security/validate-evidence.py','docs/helix/02-design/spikes/security/acceptance.ts','tools/security/run-command.ts','docs/helix/03-test/security/cases.json',*[f'docs/helix/01-frame/user-stories/{n}' for n in ['US-079-security-semantics.md','US-056-security-bindings.md','US-057-security-lifecycle.md']],'docs/helix/01-frame/features/FEAT-008-shared-security.md','docs/helix/03-test/test-plans/STP-079-security-semantics.md','docs/helix/04-build/security-field-protection-plan.md','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md']
frozen={f:(root/f).read_bytes() for f in files};pins={f:hashlib.sha256(b).hexdigest() for f,b in frozen.items()}
for f,b in frozen.items():
    p=out/'sources'/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
plan=json.loads(frozen['docs/helix/03-test/security/cases.json']);before=json.loads(subprocess.check_output(['git','show','HEAD:docs/helix/03-test/security/cases.json'],cwd=root))
(out/'before-cases.json').write_text(json.dumps(before,indent=2)+'\n')
prior={x['id']:x for x in before['cases']};now={x['id']:x for x in plan['cases']}
assert len(prior)==145 and len(now)==158 and len(now)==len(plan['cases'])
assert all(now[id]==case for id,case in prior.items())
new=[x for x in plan['cases'] if x['id'] not in prior]
assert {x['id'] for x in new}=={f'S{i}' for i in range(13,26)}
assert all(x['required'] is True and x['status']=='not-run' and x['backend']=='semantic' and x['command'] is None and x['evidence'] is None and x['testSource'] is None and x['oracleSource'] is None and x['implementationSources']==[] and x['assertionIds']==[x['id']] and 'US-079-AC10' in x['covers'] for x in new)
criteria=[]
for f in files:
    if '/user-stories/' in f:criteria+=re.findall(r'\*\*(US-\d+-AC\d+)\*\*',frozen[f].decode())
assert len(criteria)==34 and len(set(criteria))==34
assert {a for c in plan['cases'] for a in c['covers']}==set(criteria)
stp=frozen['docs/helix/03-test/test-plans/STP-079-security-semantics.md'].decode()
for case in new:
    line=next(x for x in stp.splitlines() if x.startswith('| '+case['id']+' |'))
    listed=re.findall(r'US-\d+-AC\d+',line)
    assert set(listed)|{'US-079-AC10'}==set(case['covers'])
    assert line.split('|')[3].strip() in case['assertion']
summary={'status':'passed','originalRowsUnchanged':145,'newRequiredCases':13,'totalCases':158,'criteria':34,'allNewCasesNotRunWithoutBindings':True,'stpMachineAssertionsCorrespond':True}
(out/'inventory-results.json').write_text(json.dumps(summary,indent=2)+'\n')
env={**os.environ,'PATH':'/opt/homebrew/bin:'+os.environ['PATH'],'PYTHONDONTWRITEBYTECODE':'1'}
# Unmodified owner allocation script runs in an owned mirror; all output stays here.
result=subprocess.run(['/private/tmp/truss-security-pg18-r2-20261011/bin/python','tools/security/check-acceptance-allocation.py'],cwd=out/'sources',env=env,text=True,capture_output=True,timeout=60)
(out/'owner-allocation.log').write_text(result.stdout+result.stderr)
assert result.returncode==0,(result.returncode,result.stderr)
owner=json.loads(result.stdout);assert owner['checks']==9
# Run actual gate over current plan with all bindings suppressed: zero native work.
observations=[]
for scenario,criterion in [('current-null-plan',None)]+[(f'missing-{i}',f'US-079-AC{i}') for i in range(11,17)]:
    sandbox=out/scenario;sandbox.mkdir(exist_ok=True)
    for f in ('docs/helix/02-design/spikes/security/acceptance.ts','tools/security/run-command.ts'):
        p=sandbox/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(frozen[f])
    mutated=copy.deepcopy(plan)
    for row in mutated['cases']:
        row['command']=None
        if criterion:row['covers']=[x for x in row['covers'] if x!=criterion]
    p=sandbox/'docs/helix/03-test/security/cases.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(mutated))
    result=subprocess.run(['/opt/homebrew/bin/bun','docs/helix/02-design/spikes/security/acceptance.ts'],cwd=sandbox,env=env,text=True,capture_output=True,timeout=15)
    (sandbox/'run.log').write_text(result.stdout+result.stderr)
    receipt=json.loads((sandbox/'docs/helix/04-build/evidence/security/acceptance.json').read_bytes())
    expected=[f"{c['id']}: required reviewed runner/oracle/implementation binding not implemented" for c in plan['cases']]
    if criterion:expected.append('unallocated '+criterion)
    assert result.returncode==1 and receipt['errors']==expected and receipt['execution']==[]
    assert receipt['requiredCases']==158 and receipt['allocatedAcceptanceCriteria']==(33 if criterion else 34)
    observations.append({'scenario':scenario,'status':'passed','errorCount':len(expected),'executed':0})
(out/'gate-results.json').write_text(json.dumps({'status':'passed','controls':observations,'scope':'Actual original gate over isolated synthetic no-command plans. No native or semantic implementation execution.'},indent=2)+'\n')
assert all(hashlib.sha256((root/f).read_bytes()).hexdigest()==h for f,h in pins.items())
(out/'source-pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print(json.dumps({'inventory':summary,'ownerAllocationControls':9,'independentGateControls':len(observations),'allSourcePinsUnchanged':True}))
