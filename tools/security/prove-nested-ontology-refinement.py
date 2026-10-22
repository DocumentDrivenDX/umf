"""Conditional nested ontology F/U/T correspondence; no implementation admission."""
import argparse,hashlib,json
from pathlib import Path
import z3

parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
Identity=z3.DeclareSort('CompleteQualifiedTypeAndKeyIdentity')
Witness=z3.DeclareSort('NativeRelationshipOccurrence')
Rel,rels=z3.EnumSort('SelectedDirectedRelationship',['StaffAssignment','AssignmentProject','OwnershipResource','OwnershipProject'])
SA,AP,OR,OP=rels
RecordKind,(STAFF,PROJECT,ASSIGNMENT,OWNERSHIP,RESOURCE)=z3.EnumSort('QualifiedRecordKind',['Staff','Project','Assignment','Ownership','Resource'])
recordKind=z3.Function('qualified_identity_record_kind',Identity,RecordKind)
Truth,(F,U,T)=z3.EnumSort('Truth',['F','U','T'])
memberL=z3.Function('logical_member',Rel,Witness,z3.BoolSort());memberN=z3.Function('native_member',Rel,Witness,z3.BoolSort())
srcL=z3.Function('logical_source',Rel,Witness,Identity);dstL=z3.Function('logical_target',Rel,Witness,Identity)
srcN=z3.Function('projected_native_source',Rel,Witness,Identity);dstN=z3.Function('projected_native_target',Rel,Witness,Identity)
activeL=z3.Function('logical_assignment_active',Identity,Truth);activeN=z3.Function('projected_native_assignment_active',Identity,Truth)
r=z3.Const('relationship',Rel);e=z3.Const('occurrence',Witness);a=z3.Const('assignment',Identity)
complete=z3.ForAll([r,e],memberL(r,e)==memberN(r,e))
endpoints=z3.ForAll([r,e],z3.Implies(memberL(r,e),z3.And(srcL(r,e)==srcN(r,e),dstL(r,e)==dstN(r,e))))
attributes=z3.ForAll(a,activeL(a)==activeN(a))
staff,resource=z3.Consts('selected_staff selected_resource',Identity)
s,o,p,q=z3.Consts('staff_assignment assignment_project ownership_resource ownership_project',Witness)
variables=[s,o,p,q]
def branches(member,src,dst,active):
    joined=z3.And(member(SA,s),member(AP,o),member(OR,p),member(OP,q),src(SA,s)==staff,
                  dst(SA,s)==src(AP,o),dst(AP,o)==dst(OP,q),src(OR,p)==src(OP,q),dst(OR,p)==resource)
    return [z3.Exists(variables,z3.And(joined,active(dst(SA,s))==truth)) for truth in (T,U)]
def truth(branch):return z3.If(branch[0],T,z3.If(branch[1],U,F))
L=truth(branches(memberL,srcL,dstL,activeL));N=truth(branches(memberN,srcN,dstN,activeN))
def neg(x):return z3.If(x==T,F,z3.If(x==F,T,U))
# Deliberately weakened joins are independent executable SAT controls.
def weakened(split_owner=False,split_attribute=False):
    y=z3.Const('unrelated_assignment',Identity)
    joined=z3.And(memberN(SA,s),memberN(AP,o),memberN(OR,p),memberN(OP,q),srcN(SA,s)==staff,
       dstN(SA,s)==srcN(AP,o),dstN(AP,o)==dstN(OP,q),dstN(OR,p)==resource,
       z3.BoolVal(True) if split_owner else srcN(OR,p)==srcN(OP,q))
    activity=z3.And(recordKind(y)==ASSIGNMENT,activeN(y)==T) if split_attribute else activeN(dstN(SA,s))==T
    return z3.Exists(variables+([y] if split_attribute else []),z3.And(joined,activity))
selection=z3.And(recordKind(staff)==STAFF,recordKind(resource)==RESOURCE)
welltyped=z3.ForAll([r,e],z3.Implies(memberL(r,e),z3.And(*[
    z3.Implies(r==relationship,z3.And(recordKind(srcL(r,e))==source_kind,recordKind(dstL(r,e))==target_kind))
    for relationship,source_kind,target_kind in [(SA,STAFF,ASSIGNMENT),(AP,ASSIGNMENT,PROJECT),(OR,OWNERSHIP,RESOURCE),(OP,OWNERSHIP,PROJECT)]])))
base=[selection,welltyped]
premises=[*base,complete,endpoints,attributes]
queries=[]
def check(name,conditions,expected):
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*conditions);smt=solver.sexpr();result=solver.check()
 replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt);again=replay.check()
 if str(result)!=expected or str(again)!=expected:raise RuntimeError(name+':'+str(result)+'/'+str(again))
 queries.append({'id':name,'smt':smt,'result':str(result),'replayResult':str(again),'model':str(solver.model()) if result==z3.sat else None})
check('premises-nonvacuous',premises,'sat')
check('nested-truth-mismatch',premises+[L!=N],'unsat')
check('nested-negation-mismatch',premises+[neg(L)!=neg(N)],'unsat')
for name,value in [('permit',T),('unknown',U),('deny',F)]:
 check('nonvacuous-'+name,premises+[L==value,N==value],'sat')
empty=z3.ForAll([r,e],z3.Not(memberL(r,e)))
check('empty-population-is-false',premises+[empty,L==F,N==F],'sat')
check('empty-population-nonfalse',premises+[empty,z3.Or(L!=F,N!=F)],'unsat')
lb=branches(memberL,srcL,dstL,activeL)
check('mixed-unknown-and-true-preserves-true',premises+[lb[0],lb[1],L==T,N==T],'sat')
check('early-unknown-dominance-false-result',premises+[lb[0],lb[1],z3.If(lb[1],U,z3.If(lb[0],T,F))!=L],'sat')
check('unknown-never-permits',premises+[L==U,N==T],'unsat')
check('inactive-never-permits',premises+[L==F,N==T],'unsat')
check('split-owner-false-permit',premises+[weakened(split_owner=True),L!=T],'sat')
check('split-attribute-false-permit',premises+[weakened(split_attribute=True),L!=T],'sat')
check('unknown-treated-as-true',premises+[L==U,N!=F],'sat')
check('missing-incidence-false-permit-under-negation',[*base,endpoints,attributes,L==T,N==F,neg(N)==T],'sat')
check('missing-endpoint-correspondence',[*base,complete,attributes,L!=N],'sat')
check('missing-attribute-correspondence',[*base,complete,endpoints,L!=N],'sat')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'queries':queries,'scope':'Unbounded first-order complete qualified type/key identities and relationship occurrences. Well-typed logical relationship endpoints and selected Staff/Resource identities, complete sound incidence, exact directed endpoint identity and total F/U/T activity correspondence are explicit premises. A four-relationship same-assignment/same-owner nested membership expression and its negation preserve three-valued truth; unknown and false cannot become permits. Independent split-owner, unrelated-active-assignment, unknown-as-true and omitted-correspondence SAT controls expose weakened conditions. No Python/TypeScript/SQL refinement, native binding, codec equivalence, completeness/authority/custody establishment, limits/termination, multiplicity or guarded release is proved. No backend case promotion.'}
Path(args.output).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
