"""Finite generated-guard equivalence with actual API observations, not universal/native refinement."""
import hashlib,json,pathlib,sys,z3
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False)
raw=(root/'input.json').read_bytes();receipt=json.loads((root/'receipt.json').read_text());assert hashlib.sha256(raw).hexdigest()==receipt['inputSha256'];assert receipt['sourcesUnchanged'] is True
paths={**receipt['selectedSourceDigests'],str(root/'input.json'):hashlib.sha256(raw).hexdigest(),str(root/'receipt.json'):hashlib.sha256((root/'receipt.json').read_bytes()).hexdigest()}
assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in paths.items())
x=json.loads(raw);source=x['source'];plan=x['plan'];branches=plan['branches'];assert plan['status']=='inspected' and plan['authority'] is False and len(branches)==5
rules=source['policy']['rules'];assert len(rules)==7
for i in range(6):assert rules[i]['condition']=={'op':'eq','left':{'kind':'context','field':{'documentId':'domain','moduleId':'m','elementId':'guard'+str(i)}},'right':{'kind':'constant','field':{'documentId':'domain','moduleId':'m','elementId':'guard'+str(i)},'value':{'boolean':True}}}
# Actual runtime outputs are independently checked from all64 Boolean assignments.
ref=lambda field:{'documentId':'domain','moduleId':'m','elementId':field}
assert len(x['observations'])==64
for mask,row in enumerate(x['observations']):
 flags=[bool(mask&(1<<i)) for i in range(6)];assert row['mask']==mask and row['flags']==flags
 a=flags[0] or flags[1];b=flags[2];w=flags[4];eligible=any(flags)
 expected='denied' if not eligible else 'withheld' if w else 'conflict' if a and b else 'mask-A' if a else 'mask-B' if b else 'original' if flags[3] else 'missing'
 status='refused' if expected in ['conflict','missing'] else 'rendered';cells=[]
 if expected=='withheld':cells=[[{'field':ref('salary'),'disposition':'withheld'}]]
 elif expected=='original':cells=[[{'field':ref('salary'),'disposition':'original','value':{'integerToken':'100'}}]]
 elif expected in ['mask-A','mask-B']:cells=[[{'field':ref('salary'),'disposition':'transformed','outputType':ref('salaryMaskLabel'),'value':{'string':'[private]' if expected=='mask-A' else '[alternate]'}}]]
 assert row['actualRead']['status']==status and row['actualRead']['rows']==cells
 assert row['rowRead']['status']=='rendered' and row['rowRead']['rows']==([[]] if eligible else [])
flags=z3.Bools('rule0 rule1 rule2 rule3 rule4 rule5');eligible=z3.Or(*flags);a=z3.Or(flags[0],flags[1]);b=flags[2];w=flags[4]
roles={};active={}
for branch in branches:
 i=branch['index'];assert i not in active
 indices=[o['ruleIndex'] for o in branch['sourceOccurrences']];assert all(0<=n<6 for n in indices)
 active[i]=z3.Or(*[flags[n] for n in indices])
 d=branch['representativeDisposition'];role='missing' if d is None else ('mask-A' if d.get('transform')=='salary-label' else 'mask-B') if d['kind']=='transformed' else d['kind'];assert role not in roles;roles[role]=branch
 assert branch['queryValue']=={'origin':'live-field','field':ref('salary')} and branch['status']=='requires-original-action'
 assert 'exact-weft-issued-designation' in branch['requirements'] and 'separate-current-action-permission' in branch['requirements']
assert set(active)==set(range(5))
def actual(branch,omit=()):
 guard=branch['guard'];assert guard['readDecision']=='permit' and guard['anyActiveContributorGroup']==branch['index'];excluded=guard['noActiveGroups'];assert len(set(excluded))==len(excluded) and all(i in active and i!=branch['index'] for i in excluded)
 return z3.And(eligible,active[branch['index']],*[z3.Not(active[i]) for i in excluded if i not in omit])
expected={'withheld':z3.And(eligible,w),'mask-A':z3.And(eligible,z3.Not(w),a,z3.Not(b)),'mask-B':z3.And(eligible,z3.Not(w),b,z3.Not(a)),'original':z3.And(eligible,z3.Not(w),z3.Not(a),z3.Not(b),flags[3]),'missing':z3.And(eligible,z3.Not(w),z3.Not(a),z3.Not(b),z3.Not(flags[3]),flags[5])}
queries=[('generated-'+role+'-matches-independent-fold',[z3.Xor(actual(roles[role]),expr)],'unsat') for role,expr in expected.items()]
all_actual=[actual(branch) for branch in branches];conflict=z3.And(eligible,z3.Not(w),a,b)
queries += [('generated-guards-cover-every-nonconflicting-read-state',[z3.Xor(z3.Or(*all_actual),z3.And(eligible,z3.Not(conflict)))],'unsat'),('generated-guards-never-select-two-alternatives',[z3.Sum(*[z3.If(v,1,0) for v in all_actual])>1],'unsat'),('withholding-suppresses-competing-transform-branches',[w,z3.Not(actual(roles['withheld']))],'unsat')]
queries += [('omit-withholding-exclusion',[actual(roles['mask-A'],[roles['withheld']['index']]),w],'sat'),('omit-other-transform-exclusion',[actual(roles['mask-A'],[roles['mask-B']['index']]),a,b,z3.Not(w)],'sat'),('missing-disclosure-must-exclude-original',[actual(roles['missing'],[roles['original']['index']]),actual(roles['original'])],'sat'),('drop-equivalent-recipe-contributor',[z3.Xor(z3.And(eligible,flags[0],z3.Not(w),z3.Not(b)),expected['mask-A'])],'sat')]
grant=z3.Bool('current_original_action_permission');queries += [('diagnostic-inspection-is-not-permission',[actual(roles['missing']),z3.Not(grant)],'sat')]
checks=[]
for name,terms,result in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*terms);smt=solver.to_smt2();observed=str(solver.check());assert observed==result,(name,observed)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(smt);assert str(replay.check())==result
 (out/(name+'.smt2')).write_text(smt);checks.append({'id':name,'expected':result,'observed':observed,'freshContextReplay':result,'formulaSha256':hashlib.sha256(smt.encode()).hexdigest(),'model':str(solver.model()) if result=='sat' else None})
assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in paths.items())
(out/'receipt.json').write_text(json.dumps({'status':'finite-generated-guard-equivalence-passed','solverVersion':z3.get_version_string(),'checks':checks,'actualContextValuations':64,'actualApiResultsIndependentlyRechecked':128,'selectedSourceDigests':paths,'sourcesUnchanged':True,'scope':'Exact generated guard metadata for the named six-Boolean-context fixture, equivalent to an independently expressed finite fold for all Boolean assignments; actual field-free/read API results independently rechecked for all64 assignments. Rule truth outside this fixture, arbitrary expressions, full source/custody completeness, mode/property scalar admission, exact Weft designations, native SQL/current authority and guarded release are not proved. SAT weakenings show necessary exclusions/contributors and the absence of permission from inspection.','acceptanceCasesPromoted':[]},indent=2)+'\n')
print(json.dumps({'queries':len(checks),'unsat':sum(c['observed']=='unsat' for c in checks),'sat':sum(c['observed']=='sat' for c in checks),'actualValuations':64}))
