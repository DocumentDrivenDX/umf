"""Conditional proof of the actual Truss source-closure gate, not classifier semantics."""
import hashlib,json
from pathlib import Path
import z3
self_path=Path('tools/security/prove-source-disposition-closure.py')
if Path(__file__).resolve()!=self_path.resolve():raise RuntimeError('Unknown source-closure proof source')
self_before=self_path.read_bytes()
source=Path('/Users/erik/Projects/truss/packages/umf-bun/src/catalog-assertion-reconciliation.ts')
before=source.read_bytes();guard=b'const dispositionComplete=observations.composition!==null&&unresolvedCount===0;'
if before.count(guard)!=1:raise RuntimeError('Selected source closure guard changed')
registered=z3.Bool('registered_exact_composition')
n,a,c,m,u=z3.Ints('original_occurrences assertion_roots assertion_components metadata unresolved')
premises=[n>=0,n<=16384,a>=0,c>=0,m>=0,u>=0,n==a+c+m+u]
closed=z3.And(registered,u==0)
queries=[]
for name,claim,expected in [
 ('closed_has_registered_composition',z3.And(closed,z3.Not(registered)),z3.unsat),
 ('closed_has_total_resolved_partition',z3.And(closed,n!=a+c+m),z3.unsat),
 ('unknown_occurrence_prevents_closure',z3.And(u>0,closed),z3.unsat),
 ('missing_registration_prevents_closure',z3.And(z3.Not(registered),closed),z3.unsat),
 ('mutant_ignoring_unknowns_has_counterexample',z3.And(registered,u>0),z3.sat),
 ('mutant_ignoring_registration_has_counterexample',z3.And(z3.Not(registered),u==0),z3.sat),
]:
 solver=z3.Solver();solver.set(timeout=20000);solver.add(*premises,claim);actual=solver.check()
 if actual!=expected:raise RuntimeError(name+': '+str(actual))
 smt=solver.to_smt2();replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);replayed=replay.check()
 if replayed!=expected:raise RuntimeError(name+': replay '+str(replayed))
 queries.append({'id':name,'result':str(actual),'smt':smt,'replayResult':str(replayed),'model':str(solver.model()) if actual==z3.sat else None})
unchanged=source.read_bytes()==before and self_path.read_bytes()==self_before
if not unchanged:raise RuntimeError('Source changed during proof')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'source':str(source),'sourceSha256':hashlib.sha256(before).hexdigest(),'proofSha256':hashlib.sha256(self_before).hexdigest(),'sourcesUnchanged':unchanged,'queries':queries,'scope':'Actual selected Boolean closure gate under exact registered composition and total disjoint original-occurrence count premises. Does not prove census correctness, classification semantics, profile authenticity, complete report capacity, enforcement, publication or native authorization.','premises':['Source census and disposition enumerate the same original occurrences exactly once','Each occurrence receives one faithful assertion/component/metadata/unavailable disposition','Count arithmetic is exact within the admitted 16384-node bound'],'nativeImplementationQualified':False}
Path('docs/helix/04-build/evidence/security/source-disposition-closure-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries),'unsat':4,'sat':2,'sourcesUnchanged':unchanged}))
