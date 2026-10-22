"""Conditional unbounded disclosure algebra; not an emitter-refinement proof."""
import hashlib,json
from pathlib import Path
import z3
SELF=Path('tools/security/prove-candidate-disclosure-fold.py')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown disclosure proof source')
paths=[SELF,Path('/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts'),Path('docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md')]
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
R=z3.DeclareSort('DisclosureRule');M=z3.DeclareSort('SemanticTransformIdentity')
r,s=z3.Consts('r s',R)
present=z3.Function('present',R,z3.BoolSort());scoped=z3.Function('scoped',R,z3.BoolSort());permit=z3.Function('permit',R,z3.BoolSort())
truth=z3.Function('truth',R,z3.IntSort());kind=z3.Function('kind',R,z3.IntSort());mask=z3.Function('mask',R,M)
protected=z3.Bool('protected')
# Truth F/T/U = 0/1/2. Obligation none/original/withheld/transformed = 0/1/2/3.
# One requested field; base policy decision is already permit. Complete faithful
# rules and exact transform equivalence are premises, not established facts.
premises=[z3.ForAll(r,z3.And(truth(r)>=0,truth(r)<=2,kind(r)>=0,kind(r)<=3,z3.Implies(z3.And(present(r),scoped(r)),truth(r)!=2)))]
def active(x):return z3.And(present(x),scoped(x),permit(x),truth(x)==1)
def contributes(x,k):return z3.And(active(x),kind(x)==k)
obligation=z3.Exists(r,z3.And(active(r),kind(r)!=0))
withhold=z3.Exists(r,contributes(r,2));transformed=z3.Exists(r,contributes(r,3))
pair_conflict=z3.Exists([r,s],z3.And(contributes(r,3),contributes(s,3),mask(r)!=mask(s)))
# Independently stated semantic compatibility: an active transform can be chosen
# whose identity agrees with every contributing transform.
consensus=z3.Exists(r,z3.And(contributes(r,3),z3.ForAll(s,z3.Implies(contributes(s,3),mask(s)==mask(r)))))
# Outcome missing/original/withheld/transformed/conflict = 0/1/2/3/4.
semantic=z3.If(z3.And(protected,z3.Not(obligation)),0,z3.If(withhold,2,z3.If(transformed,z3.If(consensus,3,4),1)))
native_algebra=z3.If(z3.And(protected,z3.Not(obligation)),0,z3.If(withhold,2,z3.If(pair_conflict,4,z3.If(transformed,3,1))))
queries=[]
def check(name,assertion,expected):
 solver=z3.Solver();solver.set(timeout=20000);solver.add(*premises,assertion);smt=solver.sexpr();result=str(solver.check())
 if result!=expected:raise RuntimeError(name+': '+result)
 replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);replayed=str(replay.check())
 if replayed!=expected:raise RuntimeError('Replay differs: '+name)
 queries.append({'id':name,'smt':smt,'result':result,'replayResult':replayed,'model':str(solver.model()) if result=='sat' else None})
check('unbounded-consensus-pair-conflict-correspondence',semantic!=native_algebra,'unsat')
check('active-withhold-dominates-conflicting-transforms',z3.And(withhold,pair_conflict,native_algebra!=2),'unsat')
check('protected-missing-obligation-refuses',z3.And(protected,z3.Not(obligation),native_algebra!=0),'unsat')
check('unprotected-empty-obligation-defaults-original',z3.And(z3.Not(protected),z3.Not(obligation),native_algebra!=1),'unsat')
check('inactive-withhold-cannot-cancel-conflict',z3.And(pair_conflict,z3.Not(withhold),z3.Exists(r,z3.And(present(r),z3.Not(active(r)),kind(r)==2)),native_algebra!=4),'unsat')
check('equivalent-active-transforms-do-not-conflict',z3.And(consensus,z3.Not(withhold),native_algebra!=3),'unsat')
check('active-original-does-not-cancel-transform',z3.And(z3.Exists(r,contributes(r,1)),transformed,z3.Not(withhold),native_algebra==1),'unsat')
check('inactive-conflicting-transform-does-not-poison',z3.And(consensus,z3.Not(withhold),z3.Exists([r,s],z3.And(contributes(r,3),present(s),z3.Not(active(s)),kind(s)==3,mask(r)!=mask(s))),native_algebra!=3),'unsat')
unfiltered_withhold=z3.Exists(r,z3.And(present(r),kind(r)==2))
unfiltered_mutant=z3.If(unfiltered_withhold,2,native_algebra)
conflict_first_mutant=z3.If(pair_conflict,4,native_algebra)
protected_original_mutant=z3.If(z3.And(protected,z3.Not(obligation)),1,native_algebra)
check('removed-active-filter-false-withhold-control',z3.And(pair_conflict,z3.Not(withhold),unfiltered_mutant!=semantic),'sat')
check('conflict-before-withhold-mutant-control',z3.And(withhold,pair_conflict,conflict_first_mutant!=semantic),'sat')
check('protected-default-original-mutant-control',z3.And(protected,z3.Not(obligation),protected_original_mutant!=semantic),'sat')
check('nonempty-protected-original-positive',z3.And(protected,z3.Exists(r,contributes(r,1)),z3.Not(withhold),z3.Not(transformed),native_algebra==1),'sat')
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Captured source changed')
receipt={'status':'conditional-proof-passed','sourcesUnchanged':True,'sourceDigests':sources,'solverVersion':z3.get_version_string(),'queries':queries,'nativeImplementationQualified':False,'covers':['US-056-AC2'],'scope':'Unbounded abstract rule population for one requested field, with complete faithful rule scope/effect/truth/disposition and exact semantic transform-identity equality. Base policy permit is a premise. Universal transform consensus is equivalent to existential unequal-pair conflict; active withholding, protected omissions, unprotected defaults, original-versus-transform and inactive obligations follow declared precedence. SAT controls retain states where removing active filtering, prioritizing conflict over withholding or defaulting protected omissions to original changes the result. Does not translate emitted SQL, prove source/compiler/interpreter/emitter refinement, native JSON/array behavior, transform normalization or released values, requested-field error order, base rule-fold refinement, authenticated facts, RLS, privacy or authority.'}
Path('docs/helix/04-build/evidence/security/candidate-disclosure-fold-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
