"""Conditional Record membership owner-result guard; no concrete runtime refinement."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
host=ROOT/'docs/helix/04-build/evidence/security/record-members-owner-inspection/178e4ea1-7ebc-4132-ab77-a334b052834b/receipt.json'
paths=[Path(__file__),host,*[ROOT/p['path'] for p in json.loads(host.read_text())['sourcePreimages']]]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
record,present,unknown,authority,enforcement=z3.Bools('explicit_record members_present opaque_member_qualifier authenticated_owner installed_enforcement')
ownerState,sourceContext,ownerContext=z3.Ints('owner_state original_context owner_context')
# State0 known,1 partial,2 missing,3 inapplicable.
expected=z3.If(z3.Not(record),3,z3.If(z3.Not(present),2,z3.If(unknown,1,0)))
Members=z3.DeclareSort('FaithfulOrderedQualifiedMemberList')
sourceMembers,ownerMembers=z3.Consts('original_members observed_members',Members)
sourceCopy,ownerCopy=z3.Ints('original_source_carrier owner_source_carrier')
closed=z3.Bool('closed_owner_result')
Paths=z3.DeclareSort('FaithfulOrderedUnknownPathList')
emptyPaths,sourcePaths,ownerPaths=z3.Consts('empty_paths original_unknown_paths observed_unknown_paths',Paths)
base=[ownerState>=0,ownerState<=3,z3.Implies(present,record),z3.Implies(unknown,present),unknown==(sourcePaths!=emptyPaths),z3.Implies(closed,z3.And(z3.Implies(ownerState==0,ownerPaths==emptyPaths),z3.Implies(ownerState==1,ownerPaths!=emptyPaths)))]
guards=[ownerState==expected,ownerContext==sourceContext,z3.Implies(present,sourceMembers==ownerMembers),sourceCopy==ownerCopy,closed,sourcePaths==ownerPaths]
queries=[
 ('known-declaration-positive',guards+[record,present,z3.Not(unknown),ownerState==0],'sat'),
 ('partial-declaration-positive',guards+[record,present,unknown,ownerState==1],'sat'),
 ('missing-declaration-positive',guards+[record,z3.Not(present),ownerState==2],'sat'),
 ('nonrecord-positive',guards+[z3.Not(record),ownerState==3],'sat'),
 ('declared-members-cannot-be-suppressed',guards+[record,present,ownerState==2],'unsat'),
 ('absent-members-cannot-invent-declaration',guards+[record,z3.Not(present),ownerState==0],'unsat'),
 ('unknown-qualifier-cannot-be-known',guards+[record,present,unknown,ownerState==0],'unsat'),
 ('nonrecord-cannot-invent-members',guards+[z3.Not(record),ownerState==0],'unsat'),
 ('member-list-substitution-forbidden',guards+[record,present,sourceMembers!=ownerMembers],'unsat'),
 ('context-substitution-forbidden',guards+[sourceContext!=ownerContext],'unsat'),
 ('opaque-source-loss-forbidden',guards+[sourceCopy!=ownerCopy],'unsat'),
 ('extra-result-member-forbidden',guards+[z3.Not(closed)],'unsat'),
 ('erase-state-guard-admits-declaration-suppression',guards[1:]+[record,present,ownerState==2],'sat'),
 ('erase-state-only-still-refuses-unknown-as-known-with-closed-schema',guards[1:]+[record,present,unknown,ownerState==0],'unsat'),
 ('erase-state-and-path-guards-admits-schema-valid-unknown-as-known',[g for i,g in enumerate(guards) if i not in [0,5]]+[record,present,unknown,ownerState==0],'sat'),
 ('erase-context-guard-admits-crossed-identity',[g for i,g in enumerate(guards) if i!=1]+[sourceContext!=ownerContext],'sat'),
 ('erase-member-guard-admits-order-or-qualifier-loss',[g for i,g in enumerate(guards) if i!=2]+[record,present,sourceMembers!=ownerMembers],'sat'),
 ('erase-source-guard-admits-opaque-loss',[g for i,g in enumerate(guards) if i!=3]+[sourceCopy!=ownerCopy],'sat'),
 ('erase-shape-guard-admits-extra-authority-field',[g for i,g in enumerate(guards) if i!=4]+[z3.Not(closed)],'sat'),
 ('unknown-path-substitution-forbidden',guards+[record,present,unknown,sourcePaths!=ownerPaths],'unsat'),
 ('erase-path-guard-admits-unknown-path-substitution',[g for i,g in enumerate(guards) if i!=5]+[record,present,unknown,sourcePaths!=ownerPaths],'sat'),
 ('correspondence-without-authority-enforcement',guards+[record,present,z3.Not(authority),z3.Not(enforcement)],'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/record-members-owner-correspondence'/str(uuid.uuid4());out.mkdir(parents=True)
checks=[]
for name,query,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*base,*query);formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise RuntimeError(name+': '+observed)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.add(z3.parse_smt2_string(formula,ctx=ctx));actual=str(replay.check())
 if actual!=expected:raise RuntimeError(name+': replay '+actual)
 checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':actual,'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Captured source changed')
with zipfile.ZipFile(out/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for i,(p,b) in enumerate(frozen.items()):archive.writestr(str(i)+'/'+Path(p).name,b)
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Validated original0.7 with explicit qualified identity; source admission/target resolution/single Record ownership are not proved','FaithfulOrderedQualifiedMemberList distinguishes complete ordered references and opaque qualifiers; FaithfulOrderedUnknownPathList distinguishes exact ordered paths and its empty constant, with source nonempty iff unknown; faithful representations are assumed, not a concrete serialization theorem','Expected state equations and guard correspondence are modeled, not extracted JavaScript/schema/compiler behavior; closed shape includes known-empty and partial-nonempty unknown-path schema relationships','Empty present membership and absent membership differ through presence; no assertion that an abstract list is empty without a faithful concrete carrier','Local Z3/fresh-context replay, not hermetic'],'scope':'Conditional original Record membership state/context/ordered opaque list/source/closed-result/exact unknown-path correspondence; no source admission, issuer, runtime refinement or native enforcement','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
