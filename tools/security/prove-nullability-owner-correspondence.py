"""Conditional finite original-nullability correspondence; no JS/owner/SQL refinement."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
TRUSS=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),TRUSS/'packages/umf-bun/src/catalog-core-assertion-identities.ts',TRUSS/'packages/umf-bun/src/catalog-assertion-observations.ts',TRUSS/'tests/catalog-nullability-correspondence.test.ts']
for directory in ['/private/tmp/truss-umf-runtime-LmpSsH','/private/tmp/truss-umf-runtime-xZQtaP']:
 paths += [Path(directory)/name for name in ['producer.js','producer.ts','producer-manifest.json']]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
# Source: 0 required,1 absent-allowed,2 unspecified,3 future,4 missing Field
# member,5 absent non-Field member. Owner state:0 known,1 unknown,2 missing,3 inapplicable.
s,v,state=z3.Ints('source_nullability owner_value owner_state')
originalContext,ownerContext=z3.Ints('original_context owner_context')
present,authority,enforcement=z3.Bools('record_value_present authenticated_owner installed_enforcement')
base=[s>=0,s<=5,v>=0,v<=5,state>=0,state<=3]
expectedState=z3.If(s<=2,0,z3.If(s==3,1,z3.If(s==4,2,3)))
truth=z3.And(state==expectedState,z3.Implies(s<=3,v==s))
context=originalContext==ownerContext
full=[truth,context]
known=state==0
sourceInvalid=z3.And(s==0,z3.Not(present))
ownerInvalid=z3.And(known,v==0,z3.Not(present))
sourceComplete=z3.And(s<=1,z3.Not(sourceInvalid))
ownerComplete=z3.And(known,v<=1,z3.Not(ownerInvalid))
# Weak post-filter validation imposes truth only on emitted known meanings.
postFilter=z3.Implies(known,z3.And(s<=2,v==s))
queries=[
 ('required-positive',full+[s==0,present,known,ownerComplete],'sat'),
 ('absent-allowed-omission-positive',full+[s==1,z3.Not(present),z3.Not(ownerInvalid),ownerComplete],'sat'),
 ('unspecified-known-does-not-imply-complete',full+[s==2,known,present,z3.Not(ownerComplete)],'sat'),
 ('missing-field-member-positive',full+[s==4,state==2,z3.Not(known)],'sat'),
 ('inapplicable-record-member-positive',full+[s==5,state==3,z3.Not(known)],'sat'),
 ('future-preserved-unknown-positive',full+[s==3,state==1,z3.Not(known)],'sat'),
 ('full-guard-forbids-false-missing-required',full+[s==0,state==2],'unsat'),
 ('full-guard-forbids-changed-known-value',full+[s<=2,known,v!=s],'unsat'),
 ('full-guard-forbids-future-known-invention',full+[s==3,known],'unsat'),
 ('full-guard-forbids-absent-known-invention',full+[s==4,known],'unsat'),
 ('full-guard-forbids-context-substitution',full+[originalContext!=ownerContext],'unsat'),
 ('full-known-guard-preserves-presence-behavior',full+[s<=2,z3.Or(sourceInvalid!=ownerInvalid,sourceComplete!=ownerComplete)],'unsat'),
 ('post-filter-guard-admits-required-omission', [postFilter,s==0,state==2,z3.Not(known)],'sat'),
 ('value-only-guard-admits-context-substitution',[truth,s==0,known,originalContext!=ownerContext],'sat'),
 ('meaning-correspondence-does-not-prove-authority-or-enforcement',full+[s==0,known,z3.Not(authority),z3.Not(enforcement)],'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/nullability-owner-correspondence'/str(uuid.uuid4());out.mkdir(parents=True)
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
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Finite original 0.7 nullability model and exact source/context selection; field declaration admission and context tuple injectivity are premises','Expected owner states/value projection and abstract Record omission/completeness equations; actual producer/JavaScript refinement not proven','No defaults, value-type/facet/key/relationship obligations in this presence-only behavior model','Local Z3 installation and independent fresh-context SMT replay; not hermetic'],'scope':'Conditional pre-filter nullability classification/context correspondence and presence-only behavioral equivalence, with omission/invention/context/authority countermodels; no complete semantic family inventory or backend/report admission','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
