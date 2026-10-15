"""Conditional column-permission laws; native engine correspondence is observed separately."""
import json,z3
rows=[]
def check(name,formula,expected,scope):
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);actual=str(solver.check());assert actual==expected,(name,actual)
 rows.append(dict(id=name,result=actual,expected=expected,scope=scope,smt=solver.sexpr(),model=str(solver.model()) if actual=='sat' else None))
Role=z3.DeclareSort('Role');Column=z3.DeclareSort('Column');r=z3.Const('r',Role);c=z3.Const('c',Column)
ordinary=z3.Function('ordinary',Role,z3.BoolSort());withheld=z3.Function('withheld',Column,z3.BoolSort());table=z3.Function('tableSelect',Role,z3.BoolSort());column=z3.Function('columnSelect',Role,Column,z3.BoolSort());reachable=z3.Function('reachablePrivileged',Role,z3.BoolSort());referenced=z3.Function('referenced',Column,z3.BoolSort())
allowed=lambda r,c:z3.Or(table(r),column(r,c),reachable(r))
profile=z3.ForAll([r],z3.Implies(ordinary(r),z3.And(z3.Not(table(r)),z3.Not(reachable(r)),z3.ForAll([c],z3.Implies(withheld(c),z3.Not(column(r,c)))))))
queryAdmitted=z3.ForAll([c],z3.Implies(referenced(c),allowed(r,c)))
check('arbitrary-hidden-reference-refuses',z3.And(profile,ordinary(r),withheld(c),referenced(c),queryAdmitted),'unsat','Assumes exact native reference resolution and native checking of every referenced column before output; no SQL-parser/optimizer/kernel refinement theorem.')
rowCount=z3.Int('rowCount')
check('zero-rows-cannot-remove-reference-obligation',z3.And(profile,ordinary(r),withheld(c),referenced(c),rowCount==0,queryAdmitted),'unsat','Permission checks modeled independently of row cardinality; actual empty/LIMIT0 native controls supply finite correspondence only.')
check('table-grant-overrides-missing-column-grant',z3.And(table(r),withheld(c),z3.Not(column(r,c)),allowed(r,c)),'sat','Concrete grant-route countermodel: absence of a column grant is insufficient if table SELECT exists. Native weakening independently observes disclosure.')
check('reachable-privileged-role-countermodel',z3.And(z3.Not(table(r)),z3.Not(column(r,c)),reachable(r),allowed(r,c)),'sat','Reachability summarizes only actually inventoried grant/SET/INHERIT/owner-view routes; completeness must be established separately.')
check('permitted-nonempty-projection',z3.And(z3.Not(table(r)),z3.Not(reachable(r)),column(r,c),z3.Not(withheld(c)),referenced(c),rowCount>0,allowed(r,c)),'sat','Nonvacuity of admitted column projection; no row-membership/private-fact theorem.')
priorGrant,currentGrant,rechecked,published=z3.Bools('priorGrant currentGrant rechecked published')
check('prepared-current-privilege-recheck',z3.And(priorGrant,z3.Not(currentGrant),rechecked,published,z3.Implies(z3.And(rechecked,published),currentGrant)),'unsat','Assumes the native EXECUTE actually rechecks current privileges; same-session revoke/regrant/PID control observes this only for the authored prepared query.')
print(json.dumps(dict(status='conditional-column-permission-laws',z3=z3.get_version_string(),scope='Logical column grant/reference obligations under explicit native checking and complete reachable-authority assumptions. Finite PostgreSQL18.6 observations are separate evidence; no SQL/compiler/kernel refinement, arbitrary side-channel freedom, complete backend profile, concurrency/lifecycle/current-authority custody or general prepared-plan theorem.',queries=rows),indent=2))
