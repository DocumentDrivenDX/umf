"""Conditional unbounded declared-scalar preflight algebra, not SQL refinement."""
import hashlib,json
from pathlib import Path
import z3
SELF=Path('tools/security/prove-candidate-scalar-guard.py')
if Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unknown scalar guard proof source')
paths=[SELF,Path('/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts')]
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
F,T,U=0,1,2
W=z3.DeclareSort('ScalarRow');w=z3.Const('w',W)
present=z3.Function('present',W,z3.BoolSort());logical_type=z3.Function('logical_type',W,z3.IntSort());native_type=z3.Function('native_type',W,z3.IntSort());valid=z3.Function('valid',W,z3.IntSort())
selected=z3.Int('selected');parameters=z3.Int('parameter_validity');authored=z3.Int('authored_truth')
premises=[parameters>=F,parameters<=U,authored>=F,authored<=U,z3.ForAll(w,z3.And(valid(w)>=F,valid(w)<=U)),z3.ForAll(w,z3.Implies(present(w),logical_type(w)==native_type(w)))]
logical=z3.And(parameters==T,z3.ForAll(w,z3.Implies(z3.And(present(w),logical_type(w)==selected),valid(w)==T)))
native=z3.And(parameters==T,z3.Not(z3.Exists(w,z3.And(present(w),native_type(w)==selected,valid(w)!=T))))
guarded=z3.If(native,authored,U)
selected_bad=z3.Exists(w,z3.And(present(w),logical_type(w)==selected,valid(w)!=T))
queries=[]
def check(name,assertion,expected):
 s=z3.Solver();s.set(timeout=20000);s.add(*premises,assertion);smt=s.sexpr();result=str(s.check())
 if result!=expected:raise RuntimeError(name+': '+result)
 replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);replayed=str(replay.check())
 if replayed!=expected:raise RuntimeError('Replay differs: '+name)
 queries.append({'id':name,'smt':smt,'result':result,'replayResult':replayed,'model':str(s.model()) if result=='sat' else None})
check('unbounded-selected-preflight-correspondence',logical!=native,'unsat')
check('invalid-preflight-cannot-produce-true',z3.And(z3.Not(logical),guarded==T),'unsat')
check('valid-preflight-preserves-authored-truth',z3.And(logical,guarded!=authored),'unsat')
check('invalid-selected-row-overrides-authored-true',z3.And(selected_bad,authored==T,guarded!=U),'unsat')
check('removed-guard-selected-row-false-grant',z3.And(parameters==T,selected_bad,authored==T,guarded==U),'sat')
check('foreign-invalid-row-cannot-poison',z3.And(parameters==T,z3.ForAll(w,z3.Implies(present(w),logical_type(w)!=selected)),z3.Exists(w,z3.And(present(w),valid(w)!=T)),z3.Not(native)),'unsat')
check('nonempty-selected-valid-positive',z3.And(native,authored==T,z3.Exists(w,z3.And(present(w),logical_type(w)==selected,valid(w)==T))),'sat')
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Captured source changed')
receipt={'status':'conditional-proof-passed','sourcesUnchanged':True,'sourceDigests':sources,'solverVersion':z3.get_version_string(),'queries':queries,'nativeImplementationQualified':False,'covers':['US-056-AC2'],'scope':'Unbounded abstract declared scalar rows with complete stable population, faithful logical/native selected type tags and truthful native domain-validity results; parameter validity summarizes every declared scalar parameter. Proves whole-condition guard algebra, selected invalid row isolation from authored truth and foreign-row exclusion. Invalid maps to diagnostic Unknown, not admission or authorization. Does not prove numeric validity SQL, query evaluation order, native column types, Key/endpoints, AST/emitter refinement, authenticated complete facts or policy composition.'}
Path('docs/helix/04-build/evidence/security/candidate-scalar-guard-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
