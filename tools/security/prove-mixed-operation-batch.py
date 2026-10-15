"""Conditional mixed-operation composition; no compiler, kernel or native refinement."""
import hashlib,json,pathlib,sys,z3
paths=['tools/security/prove-mixed-operation-batch.py','src/extensions/security/catalog-operation-batch-candidate.ts','src/extensions/security/catalog-runtime-candidate.ts','docs/helix/02-design/technical-designs/TD-079-security-semantics.md','docs/helix/03-test/test-plans/STP-079-security-semantics.md']
pins=lambda:{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in paths}
before=pins();out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
n,i,k=z3.Ints('operation_count index failing_index');cost=z3.Array('nonnegative_operation_cost',z3.IntSort(),z3.IntSort());prefix=z3.Array('cumulative_cost',z3.IntSort(),z3.IntSort());limit,base=z3.Ints('limit inventory_or_snapshot_base')
structural=z3.Array('leaf_structural_completion',z3.IntSort(),z3.BoolSort());permit=z3.Array('leaf_actual_permission',z3.IntSort(),z3.BoolSort());is_action=z3.Array('is_action',z3.IntSort(),z3.BoolSort())
valid=lambda x:z3.And(x>=0,x<n)
axioms=[n>=1,n<=256,limit>=1,base>=0,prefix[0]==base,z3.ForAll(i,z3.Implies(valid(i),z3.And(cost[i]>=0,prefix[i+1]==prefix[i]+cost[i])))]
all_done=z3.ForAll(i,z3.Implies(valid(i),structural[i]));within=prefix[n]<=limit
completed=z3.And(all_done,within);released=z3.If(completed,n,0)
authorized=z3.And(completed,z3.ForAll(i,z3.Implies(z3.And(valid(i),is_action[i]),permit[i])))
queries=[
 ('late-refusal-releases-no-prefix',[valid(k),z3.Not(structural[k]),released>0],'unsat'),
 ('budget-refusal-releases-no-prefix',[prefix[n]>limit,released>0],'unsat'),
 ('completed-releases-whole-ordered-list',[completed,released!=n],'unsat'),
 ('diagnostic-completion-does-not-imply-permission',[completed,valid(k),is_action[k],z3.Not(permit[k])],'sat'),
 ('denied-action-cannot-be-query-permission',[valid(k),is_action[k],z3.Not(permit[k]),authorized],'unsat'),
 ('independent-leaf-budget-reset-is-insufficient',[n==2,base==0,limit==10,cost[0]==6,cost[1]==6,cost[0]<=limit,cost[1]<=limit,z3.Not(within)],'sat'),
 ('nonnegative-next-step-cannot-recover-exhausted-budget',[valid(k),prefix[k]>limit,prefix[k+1]<=limit],'unsat'),
 ('shared-inventory-plus-visits-not-per-leaf-max',[n==2,base==5,limit==6,cost[0]==1,cost[1]==1,base+cost[0]<=limit,base+cost[1]<=limit,z3.Not(within)],'sat'),
 ('all-complete-and-in-budget-positive',[n==2,base==1,limit==10,cost[0]==2,cost[1]==3,all_done,completed,released==2],'sat'),
 ('weak-prefix-release-exposes-earlier-result',[n==2,k==1,structural[0],z3.Not(structural[1]),released==0,z3.If(structural[0],1,0)>0],'sat'),
]
# An immutable detached cut is one source across all duties; equal caller labels alone are insufficient.
cut=z3.Array('operation_cut',z3.IntSort(),z3.IntSort());same_cut=z3.ForAll(i,z3.Implies(valid(i),cut[i]==cut[0]))
queries += [('single-snapshot-forbids-mixed-cuts',[n==2,same_cut,cut[0]!=cut[1]],'unsat'),('weak-caller-cut-labels-do-not-prove-snapshot',[n==2,cut[0]!=cut[1]],'sat')]
rows=[]
for name,terms,expected in queries:
 s=z3.Solver();s.set(timeout=10000);s.add(*axioms,*terms);formula=s.to_smt2();observed=str(s.check());assert observed==expected,(name,observed)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(formula);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(formula);rows.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':expected,'formulaSha256':hashlib.sha256(formula.encode()).hexdigest(),'model':str(s.model()) if observed=='sat' else None})
after=pins();assert before==after
(out/'receipt.json').write_text(json.dumps({'status':'conditional-mixed-operation-model-passed','solverVersion':z3.get_version_string(),'checks':rows,'selectedSourceDigestsBefore':before,'selectedSourceDigests':after,'sourcesUnchanged':True,'scope':'Bounded operation count with integer cost/cut abstraction; nonnegative faithful costs, complete supplied duty enumeration, faithful leaf completion/permission and actual detached-cut provenance are external premises. Models atomic release and diagnostic completion distinct from permission. Does not prove TypeScript/kernel refinement, accounting completeness, Weft designation, native authentication, query admission or hold through release.','acceptanceCasesPromoted':[]},indent=2)+'\n')
print(json.dumps({'queries':len(rows),'unsat':sum(r['observed']=='unsat' for r in rows),'sat':sum(r['observed']=='sat' for r in rows)}))
