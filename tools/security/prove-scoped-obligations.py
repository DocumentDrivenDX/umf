"""Conditional finite scoped-obligation laws; no Rust/profile/native refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf')
SELF=ROOT/'tools/security/prove-scoped-obligations.py'
OWNER=Path('/Users/erik/Projects/weft')
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:
    raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/security/scoped-obligation-matching-v0.2.md',OWNER/'crates/weft-core/src/security_obligation_custody.rs']
frozen={str(p):p.read_bytes() for p in paths}
admitted=z3.Bool('admitted')
# Paired subjects are atomic coordinates: these cells retain source/scope pairing.
r00,r01,r10,r11=z3.Bools('required_s0_q0 required_s0_q1 required_s1_q0 required_s1_q1')
d00,d01,d10,d11=z3.Bools('declared_s0_q0 declared_s0_q1 declared_s1_q0 declared_s1_q1')
required=z3.And(r00,z3.Not(r01),z3.Not(r10),r11)
swapped=z3.And(z3.Not(d00),d01,d10,z3.Not(d11))
exact=z3.And(r00==d00,r01==d01,r10==d10,r11==d11)
marginals=z3.And(z3.Or(r00,r01)==z3.Or(d00,d01),z3.Or(r10,r11)==z3.Or(d10,d11),z3.Or(r00,r10)==z3.Or(d00,d10),z3.Or(r01,r11)==z3.Or(d01,d11))
# One zero-edge origin has no semantic requirement, but does have selected-wide duty.
selected,semantic_edge,profile_entry,deployment=z3.Bools('selected_zero_edge semantic_edge profile_entry deployment_match')
selected_duty=z3.Implies(selected,z3.And(profile_entry,deployment))
edge_only=z3.Implies(semantic_edge,z3.And(profile_entry,deployment))
# Selected A qualifies, selected B remains mandatory even if unchosen.
a,b,chosen_a,chosen_b=z3.Bools('originA_match originB_match chooseA chooseB')
all_origins=z3.And(a,b)
chosen_only=z3.And(z3.Implies(chosen_a,a),z3.Implies(chosen_b,b))
# Full contracts retain independent failure behavior and original prerequisites.
atoms,owner,failure,prerequisites=z3.Bools('atoms_match owner_match failure_match prerequisite_edges_match')
full=z3.And(atoms,owner,failure,prerequisites)
# Typed subject variants must not collide even with identical identifier text.
variant_match,identifier_match=z3.Bools('variant_match identifier_match')
typed=z3.And(variant_match,identifier_match)
# Complete capability before all required sources: finite 2x2 source/cap fixture.
x00,x01,x10,x11=z3.Bools('source0_capA source0_capB source1_capA source1_capB')
whole=z3.Or(z3.And(x00,x10),z3.And(x01,x11))
fragments=z3.And(z3.Or(x00,x01),z3.Or(x10,x11))
diagonal=z3.And(x00,z3.Not(x01),z3.Not(x10),x11)
correspondence,native,authenticated,authority=z3.Bools('correspondence native authenticated_profile current_authority')
release=z3.And(correspondence,native,authenticated,authority)
checks=[
 ('paired-subjects-cannot-collapse-to-marginals',z3.And(admitted==exact,required,swapped,admitted),z3.And(admitted==marginals,required,swapped,admitted),z3.And(admitted==exact,required,d00,z3.Not(d01),z3.Not(d10),d11,admitted)),
 ('zero-edge-selection-keeps-independent-deployment-duty',z3.And(admitted==selected_duty,selected,z3.Not(semantic_edge),z3.Not(profile_entry),z3.Not(deployment),admitted),z3.And(admitted==edge_only,selected,z3.Not(semantic_edge),z3.Not(profile_entry),z3.Not(deployment),admitted),z3.And(admitted==selected_duty,selected,z3.Not(semantic_edge),profile_entry,deployment,admitted)),
 ('unchosen-selected-origin-remains-mandatory',z3.And(admitted==all_origins,a,z3.Not(b),chosen_a,z3.Not(chosen_b),admitted),z3.And(admitted==chosen_only,a,z3.Not(b),chosen_a,z3.Not(chosen_b),admitted),z3.And(admitted==all_origins,a,b,chosen_a,z3.Not(chosen_b),admitted)),
 ('exact-atoms-do-not-substitute-full-contract',z3.And(admitted==full,atoms,owner,z3.Not(failure),prerequisites,admitted),z3.And(admitted==z3.And(atoms,owner,prerequisites),atoms,owner,z3.Not(failure),prerequisites,admitted),z3.And(admitted==full,atoms,owner,failure,prerequisites,admitted)),
 ('original-prerequisite-edges-cannot-be-removed',z3.And(admitted==full,atoms,owner,failure,z3.Not(prerequisites),admitted),z3.And(admitted==z3.And(atoms,owner,failure),atoms,owner,failure,z3.Not(prerequisites),admitted),z3.And(admitted==full,atoms,owner,failure,prerequisites,admitted)),
 ('subject-variant-is-an-identity-coordinate',z3.And(admitted==typed,identifier_match,z3.Not(variant_match),admitted),z3.And(admitted==identifier_match,identifier_match,z3.Not(variant_match),admitted),z3.And(admitted==typed,identifier_match,variant_match,admitted)),
 ('one-complete-capability-per-scope',z3.And(admitted==whole,diagonal,admitted),z3.And(admitted==fragments,diagonal,admitted),z3.And(admitted==whole,x00,x10,admitted)),
 ('correspondence-does-not-establish-release',z3.And(admitted==release,correspondence,z3.Not(native),authenticated,authority,admitted),z3.And(admitted==correspondence,correspondence,z3.Not(native),authenticated,authority,admitted),z3.And(admitted==release,correspondence,native,authenticated,authority,admitted)),
]
checks.extend([
 ('zero-edge-profile-entry-is-independently-required',z3.And(admitted==selected_duty,selected,z3.Not(profile_entry),deployment,admitted),z3.And(admitted==z3.Implies(selected,deployment),selected,z3.Not(profile_entry),deployment,admitted),z3.And(admitted==selected_duty,selected,profile_entry,deployment,admitted)),
 ('zero-edge-deployment-match-is-independently-required',z3.And(admitted==selected_duty,selected,profile_entry,z3.Not(deployment),admitted),z3.And(admitted==z3.Implies(selected,profile_entry),selected,profile_entry,z3.Not(deployment),admitted),z3.And(admitted==selected_duty,selected,profile_entry,deployment,admitted)),
])
# Arbitrary-cardinality exact relation, independently supplied as a premise.
# Distinct typed coordinates prevent source/scope/variant erasure by construction.
Identity=z3.DeclareSort('Identity')
Scope=z3.Datatype('Scope')
Scope.declare('Application')
Scope.declare('ScanAction',('scan',Identity),('action',Identity))
Scope=Scope.create()
Subject=z3.Datatype('Subject')
Subject.declare('Semantic',('source',Identity),('scope',Scope))
Subject.declare('SelectedCapability',('profileRequirement',Identity))
Subject=Subject.create()
Atom=z3.Datatype('Atom')
Atom.declare('atom',('obligation',Identity),('origin',Identity),('subject',Subject),('site',Identity),('case',Identity))
Atom=Atom.create()
R=z3.Function('Required',Atom,z3.BoolSort());D=z3.Function('Declared',Atom,z3.BoolSort())
a=z3.Const('arbitrary_atom',Atom);w=z3.Const('witness_atom',Atom)
extensional=z3.ForAll([a],D(a)==R(a))
# Mere nonempty population equality forgets atom identity.
population_only=z3.Exists([a],R(a))==z3.Exists([a],D(a))
# Populated origin/case swap retains every coordinate's marginal population.
oid,oa,ob,ca,cb,source,site=z3.Consts('obligation_id origin_a origin_b case_a case_b source_id site_id',Identity)
subject=Subject.Semantic(source,Scope.Application)
r1=Atom.atom(oid,oa,subject,site,ca);r2=Atom.atom(oid,ob,subject,site,cb)
d1=Atom.atom(oid,oa,subject,site,cb);d2=Atom.atom(oid,ob,subject,site,ca)
closed_swap=z3.And(z3.Distinct(oa,ob),z3.Distinct(ca,cb),
    z3.ForAll([a],R(a)==z3.Or(a==r1,a==r2)),
    z3.ForAll([a],D(a)==z3.Or(a==d1,a==d2)))
projection_terms=[]
for coordinate in [Atom.obligation,Atom.origin,Atom.subject,Atom.site,Atom.case]:
    for left,right in [([r1,r2],[d1,d2]),([d1,d2],[r1,r2])]:
        for atom in left:projection_terms.append(z3.Or(*[coordinate(atom)==coordinate(other) for other in right]))
all_marginals=z3.And(*projection_terms)
checks.extend([
 ('unbounded-exact-relation-cannot-omit-required-atom',z3.And(extensional,R(w),z3.Not(D(w))),z3.And(closed_swap,all_marginals,R(r1),z3.Not(D(r1))),z3.And(extensional,R(w),D(w))),
 ('unbounded-exact-relation-cannot-add-surplus-atom',z3.And(extensional,D(w),z3.Not(R(w))),z3.And(closed_swap,all_marginals,D(d1),z3.Not(R(d1))),z3.And(extensional,R(w),D(w))),
])
rows=[]
for name,violation,weak,population in checks:
    row={'id':name,'covers':['US-056-AC7','US-056-AC10']}
    for kind,formula,expected in [('violation',violation,'unsat'),('negativeControl',weak,'sat'),('positivePopulation',population,'sat')]:
        solver=z3.Solver();solver.set(timeout=10000);solver.add(formula)
        smt=solver.sexpr();observed=str(solver.check())
        ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);actual=str(replay.check())
        if observed!=expected or actual!=expected:raise RuntimeError(name+'/'+kind)
        row[kind]={'smt':smt,'result':observed,'replayResult':actual,'witness':str(solver.model()) if expected=='sat' else None}
    rows.append(row)
if any(Path(p).read_bytes()!=data for p,data in frozen.items()):raise RuntimeError('Sources changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'sourcesUnchanged':True,'cases':rows,'nativeImplementationQualified':False,'acceptanceCasesPromoted':[], 'scope':'Ten conditional finite Boolean laws plus two arbitrary-cardinality exact-relation laws over a typed Atom(obligation,origin,subject,site,case), where Semantic subject preserves source/scope and SelectedCapability carries its requirement identity. Pointwise extensional equality is an explicitly supplied independent premise. Unbounded issuer completeness, quantified whole-capability assignment, Rust parser/matcher refinement, source extraction, DAG algorithm correctness, physical enforcement and native case sufficiency are not proved.'}
out=ROOT/'docs/helix/04-build/evidence/security/scoped-obligations-formal.json'
if out.exists():
    old=out.read_bytes();archive=out.parent/'archive';archive.mkdir(exist_ok=True);(archive/('scoped-obligations-formal-'+hashlib.sha256(old).hexdigest()+'.json')).write_bytes(old)
out.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'laws':len(rows),'formulas':len(rows)*3}))
