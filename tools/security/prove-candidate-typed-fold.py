"""Unbounded conditional typed existential fold; not SQL emitter refinement."""
import hashlib,json
from pathlib import Path
import z3
SELF=Path('tools/security/prove-candidate-typed-fold.py')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown proof generator')
paths=[SELF,Path('/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts')]
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
W=z3.DeclareSort('Witness');w=z3.Const('w',W)
present=z3.Function('present',W,z3.BoolSort())
logical_type=z3.Function('logical_type',W,z3.IntSort())
native_type=z3.Function('native_type',W,z3.IntSort())
truth=z3.Function('child_truth',W,z3.IntSort())
selected=z3.Int('selected_type')
F,T,U=0,1,2
premises=[z3.ForAll(w,z3.And(truth(w)>=F,truth(w)<=U)),z3.ForAll(w,z3.Implies(present(w),logical_type(w)==native_type(w)))]
def exists(match,value):return z3.Exists(w,z3.And(present(w),match(w),truth(w)==value))
logical_match=lambda x:logical_type(x)==selected
native_match=lambda x:native_type(x)==selected
logical_true=exists(logical_match,T);logical_unknown=exists(logical_match,U)
# Strong Kleene existential: a True witness dominates Unknown; empty is False.
logical=z3.If(logical_true,T,z3.If(logical_unknown,U,F))
physical=z3.If(exists(native_match,T),T,z3.If(exists(native_match,U),U,F))
missing_true_selector=z3.If(exists(lambda x:z3.BoolVal(True),T),T,z3.If(exists(native_match,U),U,F))
missing_unknown_selector=z3.If(exists(native_match,T),T,z3.If(exists(lambda x:z3.BoolVal(True),U),U,F))
queries=[]
def check(name,assertion,expected,assumptions=premises):
 s=z3.Solver();s.set(timeout=20000);s.add(*assumptions,assertion);smt=s.sexpr();result=s.check()
 if str(result)!=expected:raise RuntimeError(name+': '+str(result))
 replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);replayed=str(replay.check())
 if replayed!=expected:raise RuntimeError('Saved formula replay failed: '+name)
 queries.append({'id':name,'smt':smt,'result':str(result),'replayResult':replayed,'model':str(s.model()) if result==z3.sat else None})
check('unbounded-typed-fold-correspondence',logical!=physical,'unsat')
check('nonempty-selected-positive',logical==T,'sat')
check('empty-population-is-false',z3.And(z3.ForAll(w,z3.Not(present(w))),physical!=F),'unsat')
check('selected-true-dominates-unknown',z3.And(logical_true,logical_unknown,physical!=T),'unsat')
check('foreign-unknown-does-not-poison',z3.And(z3.Not(logical_true),z3.Not(logical_unknown),exists(lambda x:logical_type(x)!=selected,U),physical!=F),'unsat')
check('missing-true-selector-false-grant',z3.And(logical==F,missing_true_selector==T),'sat')
check('missing-unknown-selector-false-unknown',z3.And(logical==F,missing_unknown_selector==U),'sat')
check('unfaithful-type-map-false-grant',z3.And(logical==F,physical==T),'sat',premises[:1])
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Captured proof source changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':sources,'sourcesUnchanged':True,'queries':queries,'nativeInstallationProven':False,'scope':'Unbounded abstract witness population and integer type tags, shared complete population and child truth, faithful logical/native type tags, strong Kleene existential semantics. Proves typed True/Unknown two-EXISTS fold algebra and necessity controls. Does not translate emitted SQL, prove AST induction, database type/collation/null semantics, codecs, native inventory, authenticated complete facts, RLS or authorization. Source digest records candidate implementation association, not a code refinement theorem.'}
Path('docs/helix/04-build/evidence/security/candidate-typed-fold-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
