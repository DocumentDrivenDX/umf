"""Conditional strong-Kleene fold equivalence; not TypeScript/native refinement."""
import argparse,hashlib,json,pathlib,z3
p=argparse.ArgumentParser();p.add_argument('output',type=pathlib.Path);a=p.parse_args()
if a.output.exists():raise RuntimeError('Fresh receipt path required')
root=pathlib.Path.cwd();paths=['tools/security/prove-condition-short-circuit.py','src/extensions/security/catalog-runtime-candidate.ts','src/extensions/security/logic.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','tests/security/nested-graph-conditions-corpus.ts','tests/security/nested-graph-condition-vectors.json']
sha=lambda b:hashlib.sha256(b).hexdigest();pins={s:sha((root/s).read_bytes()) for s in paths}
if pathlib.Path(__file__).resolve()!=(root/paths[0]).resolve():raise RuntimeError('Exact repository proof source required')
# F=0,U=1,T=2. This ordered carrier represents the original truth tables;
# interpreting real compiled conditions as these values is an explicit premise.
x,y,z=z3.Ints('x y z');valid=lambda t:z3.And(t>=0,t<=2)
AND=lambda a,b:z3.If(a<b,a,b);OR=lambda a,b:z3.If(a>b,a,b)
queries=[]
def check(name,premises,violation,expected='unsat'):
 for suffix,formula,want in [('premises',z3.And(*premises),'sat'),('claim',z3.And(*premises,violation),expected)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();result=str(solver.check())
  if result!=want:raise RuntimeError(name+': '+suffix+' '+result)
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt)
  if str(replay.check())!=want:raise RuntimeError('SMT replay differs')
  queries.append({'id':name+'-'+suffix,'result':result,'smt':smt,'model':str(solver.model()) if result=='sat' else None})
check('and-identity',[valid(x)],AND(2,x)!=x)
check('or-identity',[valid(x)],OR(0,x)!=x)
check('and-associative',[valid(x),valid(y),valid(z)],AND(AND(x,y),z)!=AND(x,AND(y,z)))
check('or-associative',[valid(x),valid(y),valid(z)],OR(OR(x,y),z)!=OR(x,OR(y,z)))
check('false-absorbs-and',[valid(x)],AND(0,x)!=0)
check('true-absorbs-or',[valid(x)],OR(2,x)!=2)
# Mutation controls ask for an actual differing result, never the correct result.
check('stop-at-unknown-and-mutant',[valid(x)],AND(1,x)!=1,'sat')
check('stop-at-unknown-or-mutant',[valid(x)],OR(1,x)!=1,'sat')
n,k,i=z3.Ints('n k i');values=z3.Array('values',z3.IntSort(),z3.IntSort())
inside=lambda end:z3.And(i>=0,i<end)
has=lambda end,t:z3.Exists(i,z3.And(inside(end),values[i]==t))
fold_and=lambda end:z3.If(has(end,0),0,z3.If(has(end,1),1,2))
fold_or=lambda end:z3.If(has(end,2),2,z3.If(has(end,1),1,0))
base=[n>=0,k>=0,k<=n,z3.ForAll(i,z3.Implies(inside(n),valid(values[i])))]
check('arbitrary-finite-and-prefix-stop',base+[has(k,0)],fold_and(n)!=0)
check('arbitrary-finite-or-prefix-stop',base+[has(k,2)],fold_or(n)!=2)
check('arbitrary-finite-exists-prefix-stop',base+[has(k,2)],fold_or(n)!=fold_or(k))
check('exists-empty-false',[n==0],fold_or(n)!=0)
check('exists-no-true-with-unknown',base+[z3.Not(has(n,2)),has(n,1)],fold_or(n)!=1)
check('exists-no-true-or-unknown',base+[z3.Not(has(n,2)),z3.Not(has(n,1))],fold_or(n)!=0)
# Pure truth equivalence alone cannot justify skipping dependency validation.
poisoned,validated=z3.Bools('poisoned validated')
check('skip-global-preflight-mutant',[poisoned,z3.Not(validated),x==0],z3.And(AND(x,1)==0,z3.Not(validated)),'sat')
for name,h in pins.items():
 if sha((root/name).read_bytes())!=h:raise RuntimeError('Proof source changed')
receipt={'status':'conditional-proof-passed','version':'umf.security.condition-short-circuit-algebra/0.1-candidate','complete':False,'authority':False,'solverVersion':z3.get_version_string(),'sourceDigests':pins,'queries':queries,'scope':'Original F/U/T truth-table carrier and arbitrary finite complete relation denotations. Identity, associativity and absorbing prefix facts justify pure AND/OR/exists truth short-circuit after independent full dependency preflight. Every claim has SAT premises and replayed SMT; SAT controls expose early-U and skipped-validation mutants. This is not a TypeScript translation/refinement, actual preflight adequacy/termination/budget proof, authenticated source/caller/current cut, compiler/native correctness or guarded release proof.'}
a.output.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'queries':len(queries),'unsat':sum(q['result']=='unsat' for q in queries),'sat':sum(q['result']=='sat' for q in queries)}))
