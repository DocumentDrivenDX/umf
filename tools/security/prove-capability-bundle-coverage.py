"""Conditional matching laws for owner-derived bundles; no Rust/native refinement."""
import hashlib,json
from pathlib import Path
import z3
SELF=Path('tools/security/prove-capability-bundle-coverage.py')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown proof source')
paths=[SELF,Path('docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md'),Path('/Users/erik/Projects/weft/crates/weft-core/src/security_requirements.rs'),Path('/Users/erik/Projects/weft/crates/weft-core/src/security_backend.rs')]
frozen={str(p):p.read_bytes() for p in paths}
R,C,F=z3.DeclareSort('RequirementBundle'),z3.DeclareSort('Capability'),z3.DeclareSort('SemanticFeature')
r,s=z3.Consts('r s',R);c,d=z3.Consts('c d',C);f,g=z3.Consts('f g',F)
r0,r1=z3.Consts('r0 r1',R);c0,c1=z3.Consts('c0 c1',C);f0,f1=z3.Consts('f0 f1',F)
required=z3.Function('owner_required',R,z3.BoolSort())
selected=z3.Function('selected',C,z3.BoolSort())
needs=z3.Function('owner_bundle_needs',R,F,z3.BoolSort())
offers=z3.Function('capability_understands',C,F,z3.BoolSort())
mapping=z3.Function('exact_binding_matches_bundle',R,C,z3.BoolSort())
status=z3.Function('declared_status',C,z3.IntSort())
tuple_match=z3.Function('exact_source_target_tuple',C,z3.BoolSort())
constraints=z3.Function('all_selected_constraints_understood',C,z3.BoolSort())
allow=z3.Bool('explicit_allow_candidate');grammar,binding=z3.Bools('known_selected_grammar exact_complete_binding')
def valid(cap):return z3.And(tuple_match(cap),constraints(cap),z3.Or(status(cap)==0,z3.And(status(cap)==1,allow)))
def eligible(cap):return z3.And(selected(cap),valid(cap))
profile=z3.Function('interpreted_semantic_profile_tuple',C,z3.IntSort())
selections_valid=z3.ForAll(c,z3.Implies(selected(c),valid(c)))
coherent=z3.ForAll([c,d],z3.Implies(z3.And(selected(c),selected(d)),profile(c)==profile(d)))
def whole(bundle,cap):return z3.And(mapping(bundle,cap),z3.ForAll(f,z3.Implies(needs(bundle,f),offers(cap,f))))
def covered(bundle):return z3.Exists(c,z3.And(eligible(c),whole(bundle,c)))
coverage=z3.ForAll(r,z3.Implies(required(r),covered(r)))
header=z3.And(grammar,binding,selections_valid,coherent)
admit=z3.And(header,coverage)
anti=z3.And(header,z3.Not(z3.Exists(r,z3.And(required(r),z3.Not(covered(r))))))
# Finite counterexample populations isolate two features and two occurrences;
# the principal equivalence itself does not restrict the requirement population.
base=[grammar,binding,r0!=r1,c0!=c1,f0!=f1,
 z3.ForAll(r,required(r)==(r==r0)),z3.ForAll(c,selected(c)==(c==c0)),
 z3.ForAll(c,z3.And(tuple_match(c),constraints(c),status(c)==0)),
 z3.ForAll([r,c],mapping(r,c)),
 z3.ForAll([r,f],needs(r,f)==(f==f0)),z3.ForAll([c,f],offers(c,f))]
coherence_population=z3.ForAll(c,profile(c)==0)
base.append(coherence_population)
def altered(*replacement):
 # Build each population explicitly; replace only the chosen predicates.
 keys={key for key,_ in replacement};defaults={'required':base[5],'selected':base[6],'eligibility':base[7],'mapping':base[8],'needs':base[9],'offers':base[10]}
 return base[:5]+[coherence_population]+[formula for key,formula in defaults.items() if key not in keys]+[formula for _,formula in replacement]
# Alternative order: independently quantify absence of one complete covering
# capability. No source truth, label or application row count enters this test.
weak_features=z3.And(header,z3.ForAll([r,f],z3.Implies(z3.And(required(r),needs(r,f)),z3.Exists(c,z3.And(eligible(c),mapping(r,c),offers(c,f))))))
split=altered(('selected',z3.ForAll(c,selected(c)==z3.Or(c==c0,c==c1))),('needs',z3.ForAll([r,f],needs(r,f)==z3.Or(f==f0,f==f1))),('offers',z3.ForAll([c,f],offers(c,f)==z3.Or(z3.And(c==c0,f==f0),z3.And(c==c1,f==f1)))))
missing=altered(('offers',z3.ForAll([c,f],z3.Not(offers(c,f)))))
occurrences=altered(('required',z3.ForAll(r,required(r)==z3.Or(r==r0,r==r1))),('mapping',z3.ForAll([r,c],mapping(r,c)==(r==r0))))
false_branch=altered(('needs',z3.ForAll([r,f],needs(r,f)==z3.Or(f==f0,f==f1))),('offers',z3.ForAll([c,f],offers(c,f)==(f==f0))))
candidate=altered(('eligibility',z3.ForAll(c,z3.And(tuple_match(c),constraints(c),status(c)==1))))
unsupported=altered(('eligibility',z3.ForAll(c,z3.And(tuple_match(c),constraints(c),status(c)==2))))
unknown=altered(('eligibility',z3.ForAll(c,z3.And(tuple_match(c),z3.Not(constraints(c)),status(c)==0))))
# Abstract exact mapping is an independent premise, not implied by feature
# names. The weaker checker drops that premise while keeping the feature test.
live=z3.Function('current_branch_live',R,F,z3.BoolSort())
weak_live=z3.And(header,z3.ForAll(r,z3.Implies(required(r),z3.Exists(c,z3.And(eligible(c),mapping(r,c),z3.ForAll(f,z3.Implies(z3.And(needs(r,f),live(r,f)),offers(c,f))))))))
false_branch.append(z3.ForAll([r,f],live(r,f)==(f==f0)))
wrong_mapping=altered(('mapping',z3.ForAll([r,c],z3.Not(mapping(r,c)))))
weak_binding=z3.And(header,z3.ForAll(r,z3.Implies(required(r),z3.Exists(c,z3.And(eligible(c),z3.ForAll(f,z3.Implies(needs(r,f),offers(c,f))))))))
compatible=altered(('required',z3.ForAll(r,required(r)==z3.Or(r==r0,r==r1))),('selected',z3.ForAll(c,selected(c)==z3.Or(c==c0,c==c1))),('mapping',z3.ForAll([r,c],mapping(r,c)==z3.Or(z3.And(r==r0,c==c0),z3.And(r==r1,c==c1)))),('needs',z3.ForAll([r,f],needs(r,f)==z3.Or(z3.And(r==r0,f==f0),z3.And(r==r1,f==f1)))),('offers',z3.ForAll([c,f],offers(c,f)==z3.Or(z3.And(c==c0,f==f0),z3.And(c==c1,f==f1)))))
incompatible=[axiom for axiom in compatible if not axiom.eq(coherence_population)]+[profile(c0)!=profile(c1)]
def weakened_eligibility(kind):
 def mutant(cap):
  status_ok=z3.Or(status(cap)==0,z3.And(status(cap)==1,allow))
  if kind=='candidate':status_ok=z3.Or(status(cap)==0,status(cap)==1)
  if kind=='status':status_ok=z3.BoolVal(True)
  return z3.And(tuple_match(cap),z3.BoolVal(True) if kind=='constraints' else constraints(cap),status_ok)
 return z3.And(grammar,binding,coherent,z3.ForAll(c,z3.Implies(selected(c),mutant(c))),z3.ForAll(r,z3.Implies(required(r),z3.Exists(c,z3.And(selected(c),mutant(c),whole(r,c))))))
unused_unknown=altered(('selected',z3.ForAll(c,selected(c)==z3.Or(c==c0,c==c1))),('eligibility',z3.ForAll(c,z3.And(tuple_match(c),constraints(c)==(c!=c1),status(c)==0))))
checks=[
 ('unbounded-whole-bundle-coverage-equivalence',[],admit!=anti,z3.And(weak_features,z3.Not(admit)),admit,base),
 ('action-fold-cannot-union-incompatible-rule-features',split,admit,z3.And(weak_features,z3.Not(admit)),admit,base),
 ('distinct-required-occurrences-cannot-coalesce',occurrences,admit,z3.And(covered(r0),z3.Not(admit)),admit,base),
 ('false-branch-dependencies-cannot-be-pruned',false_branch,admit,z3.And(weak_live,z3.Not(admit)),admit,base),
 ('candidate-requires-explicit-option',candidate,z3.And(admit,z3.Not(allow)),z3.And(z3.Not(allow),weakened_eligibility('candidate'),z3.Not(admit)),z3.And(admit,allow),candidate),
 ('unsupported-status-never-upgrades',unsupported,admit,z3.And(weakened_eligibility('status'),z3.Not(admit)),admit,base),
 ('unknown-selected-constraints-refuse',unknown,admit,z3.And(weakened_eligibility('constraints'),z3.Not(admit)),admit,base),
 ('exact-binding-not-implied-by-feature-coverage',wrong_mapping,admit,z3.And(weak_binding,z3.Not(admit)),admit,base),
 ('cross-capability-semantic-profiles-must-agree',incompatible,admit,z3.And(grammar,binding,selections_valid,coverage,z3.Not(admit)),admit,compatible),
 ('unknown-selected-capability-cannot-hide-behind-coverage',unused_unknown,admit,z3.And(grammar,binding,coherent,coverage,z3.Not(admit)),admit,base),
]
cases=[]
for name,premises,violation,control,positive,positive_premises in checks:
 case={'id':name,'covers':['US-056-AC6','US-056-AC7']}
 for kind,formula,expected,assumptions in [('violation',violation,'unsat',premises),('negativeControl',control,'sat',split if name=='unbounded-whole-bundle-coverage-equivalence' else premises),('positivePopulation',positive,'sat',positive_premises)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(*assumptions,formula);smt=solver.sexpr();result=str(solver.check())
  if result!=expected:raise RuntimeError(name+'/'+kind+': '+result)
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt);replayed=str(replay.check())
  if replayed!=expected:raise RuntimeError(name+'/'+kind+' replay: '+replayed)
  case[kind]={'result':result,'replayResult':replayed,'smt':smt,'witness':str(solver.model()) if result=='sat' else None}
 cases.append(case)
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Proof sources changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'sourcesUnchanged':True,'cases':cases,'scope':'Abstract first-order admission laws over owner-derived complete semantic bundles and trusted interpreted capability predicates. Unbounded coverage equivalence plus explicit finite two-feature/two-occurrence weakened controls. Whole action-composition, operator/output dependencies, exact binding, source/target tuple and constraint understanding are assumptions of the modeled predicates, not proved implementations. Does not establish the matching grammar, Rust derivation/dispatch, native type/domain/key correspondence, meaningful evidence labels, authenticated issuers, installed enforcement, current authority or release. No backend acceptance promoted.','nativeImplementationQualified':False,'acceptanceCasesPromoted':[]}
out=Path('docs/helix/04-build/evidence/security/capability-bundle-coverage-formal.json');out.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'laws':len(cases),'formulas':3*len(cases)}))
