"""Conditional three-field raw write fold versus independently quantified obligations."""
import hashlib,json
from pathlib import Path
import z3
Mode,(create,update,delete)=z3.EnumSort('WriteFoldMode',['Create','Update','Delete'])
Action,(read,make,edit,remove,write_id,write_owner,write_value,change_owner,change_policy)=z3.EnumSort('WriteFoldAction',['Read','Make','Edit','Remove','WriteId','WriteOwner','WriteValue','ChangeOwner','ChangePolicy'])
mode=z3.Const('mode',Mode);action=z3.Const('required_action',Action)
old_id,new_id,old_owner,new_owner,old_value,new_value=z3.Strings('old_id new_id old_owner new_owner old_value new_value')
auth=z3.Function('complete_session_bound_authority',z3.StringSort(),Action,z3.BoolSort())
object_action=z3.If(mode==create,make,z3.If(mode==update,edit,remove))
changed_id=z3.Or(mode!=update,old_id!=new_id)
changed_owner=z3.Or(mode!=update,old_owner!=new_owner)
changed_value=z3.Or(mode!=update,old_value!=new_value)
required=z3.Or(action==object_action,z3.And(changed_id,action==write_id),z3.And(changed_owner,z3.Or(action==write_owner,action==change_owner,action==change_policy)),z3.And(changed_value,action==write_value))
logical=z3.ForAll(action,z3.And(z3.Implies(z3.And(mode!=create,required),auth(old_owner,action)),z3.Implies(z3.And(mode!=delete,required),auth(new_owner,action))))
def native(drop=None):
 terms=[]
 for state,owner,selected in [('old',old_owner,mode!=create),('new',new_owner,mode!=delete)]:
  terms.append(z3.Implies(selected,auth(owner,object_action)))
  for a,changed in [(write_id,changed_id),(write_owner,changed_owner),(write_value,changed_value),(change_owner,changed_owner),(change_policy,changed_owner)]:
   if drop!=(state,a):terms.append(z3.Implies(z3.And(selected,changed),auth(owner,a)))
 return z3.And(*terms)
physical=native();cases=[]
queries=[('complete-fold-refinement',logical!=physical,z3.And(physical,mode==update,old_owner!=new_owner),z3.And(mode==update,old_owner!=new_owner,native(('new',change_policy)),z3.Not(logical)))]
for state,owner in [('old',old_owner),('new',new_owner)]:
 for name,a,changed in [('ownership',change_owner,changed_owner),('policy',change_policy,changed_owner),('identity-field',write_id,changed_id),('value-field',write_value,changed_value),('owner-field',write_owner,changed_owner)]:
  guard=z3.And(mode==update,old_owner!=new_owner,changed)
  queries.append((state+'-'+name+'-required',z3.And(guard,physical,z3.Not(auth(owner,a))),z3.And(guard,physical),z3.And(guard,native((state,a)),z3.Not(auth(owner,a)))))
for name,violation,positive,control in queries:
 outcomes=[]
 for query in [violation,positive,control]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(query);answer=solver.check()
  outcomes.append({'result':str(answer),'smt':solver.sexpr(),'model':str(solver.model()) if answer==z3.sat else None})
 if [r['result'] for r in outcomes]!=['unsat','sat','sat']:raise RuntimeError('Write fold proof failed: '+name)
 cases.append({'id':name,'violation':outcomes[0],'positivePopulation':outcomes[1],'weakenedControl':outcomes[2]})
paths=[Path(__file__),Path('src/extensions/security/write.ts'),Path('tests/security/native/pg-raw-write.sql'),Path('tests/security/native/pg-raw-field-write.sql'),Path('tests/security/native/pg-raw-field-write-oracle.json')]
receipt={'status':'conditional-proof-passed','covers':['US-057-AC1'],'solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'nativeInstallationProven':False,'scope':'Three non-null TEXT fields with unbounded exact string values; nine distinct action labels and create/update/delete modes. Independently quantified selected-state obligations equal expanded RLS/trigger action fold. Ownership, live policy, changed identity-field and changed value-field and owner-field actions are independently necessary on OLD and NEW. Complete same-cut session-bound authority, truthful field/dependency classifications, exact text equality and faithful native OLD/NEW/trigger/atomic execution are premises. The native WHERE/RETURNING wrapper additionally requires independently qualified read permission at selected write states; this algebra does not model that wrapper. This does not prove actual SQL lowering, null/absence profiles, concurrent authority, publication, compiler or whole-backend refinement.'}
Path('docs/helix/04-build/evidence/security/field-write-fold-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
