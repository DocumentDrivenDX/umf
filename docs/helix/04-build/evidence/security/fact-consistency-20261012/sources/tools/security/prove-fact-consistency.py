"""Conditional unbounded projection-fold model, not TypeScript/native refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
n,stored_kind,stored_value,new_kind,new_value=z3.Ints('n stored_kind stored_value new_kind new_value')
kind=z3.Function('row_kind',z3.IntSort(),z3.IntSort());value=z3.Function('row_value',z3.IntSort(),z3.IntSort());i=z3.Int('i')
def same(ak,av,bk,bv):return z3.And(ak==bk,z3.Or(ak!=3,av==bv))
def invariant(count,sk,sv,rk,rv):
 return z3.And(count>=0,sk>=0,sk<=3,z3.ForAll([i],z3.Implies(z3.And(i>=0,i<count),z3.And(rk(i)>=0,rk(i)<=3,z3.Implies(rk(i)>0,z3.And(sk>0,same(sk,sv,rk(i),rv(i))))))))
before=invariant(n,stored_kind,stored_value,kind,value)
admitted=z3.Or(stored_kind==0,new_kind==0,same(stored_kind,stored_value,new_kind,new_value))
next_kind=z3.If(new_kind==0,stored_kind,new_kind);next_value=z3.If(new_kind==0,stored_value,new_value)
after=invariant(n+1,next_kind,next_value,lambda j:z3.If(j==n,new_kind,kind(j)),lambda j:z3.If(j==n,new_value,value(j)))
checks=[('empty-fold-consistent',z3.And(n==0,stored_kind==0,z3.Not(before)),z3.unsat),('admitted-append-preserves-all-known-projections',z3.And(before,new_kind>=0,new_kind<=3,admitted,z3.Not(after)),z3.unsat),('unchecked-overwrite-has-counterexample',z3.And(before,n==1,stored_kind==3,stored_value==0,kind(0)==3,value(0)==0,new_kind==3,new_value==1,z3.Not(after)),z3.sat),('nonempty-consistent-append-is-admitted',z3.And(before,n==1,stored_kind==3,stored_value==0,kind(0)==3,value(0)==0,new_kind==3,new_value==0,admitted,after),z3.sat)]
cases=[]
for name,formula,expected in checks:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();result=solver.check()
 if result!=expected:raise RuntimeError(name+': '+str(result))
 replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt)
 if replay.check()!=expected:raise RuntimeError('Retained SMT replay failed')
 cases.append({'id':name,'result':str(result),'smt':smt,'witness':str(solver.model()) if result==z3.sat else None})
paths=[Path(__file__),Path('src/extensions/security/evaluate.ts'),Path('src/model/schema-literals.ts')]
receipt={'status':'conditional-inductive-proof','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Unbounded sequence fold for one exact typed fact identity/field. Kind0 unknown,1 explicit absence,2 null,3 present canonical meaning. Empty initial map and admitted appends preserve agreement of all known projections. Premises: original key/field grouping is exact, typed literal equality is correct, unknown fields are not recorded as absence, and all supplied projections are traversed before authorization. This does not prove TypeScript refinement, core key/literal normalization, native provenance/snapshot authenticity, complete inventories, resource ceilings or backend admission.'}
Path(sys.argv[1]).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'unsat':2,'sat':2}))
