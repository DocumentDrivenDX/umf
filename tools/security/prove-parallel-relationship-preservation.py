"""Conditional bag/set correspondence and explicit lossy-lowering witnesses."""
import hashlib,json
from pathlib import Path
import z3
paths=[Path(__file__),Path('/Users/erik/Projects/truss/docs/helix/02-design/contracts/reference-relationship-binding.proposal.md'),Path('/Users/erik/Projects/truss/docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql')]
frozen={str(p):p.read_bytes() for p in paths}
if b'Count edge occurrences, including parallel edges' not in frozen[str(paths[1])]:raise RuntimeError('Occurrence contract changed')
if b'CREATE UNIQUE INDEX edge_out' not in frozen[str(paths[2])]:raise RuntimeError('Selected native layout changed')
n,bound=z3.Ints('original_same_tuple_occurrences maximum_participation')
physical=z3.If(n>0,1,0)
premises=[n>=0,bound>=0]
cases=[
 ('endpoint_existence_preserved',z3.Xor(n>0,physical>0),z3.unsat),
 ('counts_preserved_when_tuple_unique',z3.And(n<=1,n!=physical),z3.unsat),
 ('parallel_occurrence_loss',z3.And(n==2,n!=physical),z3.sat),
 ('maximum_bound_false_admission',z3.And(n==2,bound==1,n>bound,physical<=bound),z3.sat),
 ('minimum_bound_false_refusal',z3.And(n==2,bound==2,n>=bound,physical<bound),z3.sat),
]
# General participation counts: each distinct related Record has at least one edge.
distinct,total=z3.Ints('distinct_related_records total_edge_occurrences')
count_premises=z3.And(distinct>=0,total>=distinct,(distinct==0)==(total==0))
cases.extend([
 ('occurrence_max_implies_distinct_max',z3.And(count_premises,total<=bound,distinct>bound),z3.unsat),
 ('distinct_min_implies_occurrence_min',z3.And(count_premises,distinct>=bound,total<bound),z3.unsat),
 ('distinct_max_does_not_imply_occurrence_max',z3.And(count_premises,distinct==1,total==2,bound==1,distinct<=bound,total>bound),z3.sat),
 ('occurrence_min_does_not_imply_distinct_min',z3.And(count_premises,distinct==1,total==2,bound==2,total>=bound,distinct<bound),z3.sat),
 ('count_equivalence_under_no_parallel',z3.And(count_premises,total==distinct,z3.Or((total<=bound)!=(distinct<=bound),(total>=bound)!=(distinct>=bound))),z3.unsat),
])
# A two-edge witness suffices to refute general edge-specific authorization preservation.
a,b=z3.Bools('first_edge_active second_edge_active')
cases.append(('selected_representative_loses_membership',z3.And(n==2,z3.Not(a),b,z3.Or(a,b)!=a),z3.sat))
queries=[]
for name,claim,expected in cases:
 solver=z3.Solver();solver.set(timeout=20000);solver.add(*premises,claim)
 result=solver.check()
 if result!=expected:raise RuntimeError(name+': '+str(result))
 smt=solver.to_smt2();replay=z3.Solver();replay.from_string(smt)
 if replay.check()!=expected:raise RuntimeError('Replay differs')
 queries.append({'id':name,'result':str(result),'smt':smt,'model':str(solver.model()) if result==z3.sat else None})
if any(Path(p).read_bytes()!=data for p,data in frozen.items()):raise RuntimeError('Sources changed')
receipt={'status':'conditional-analysis-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'queries':queries,'assumptions':['One fixed typed endpoint/relationship tuple; logical bag size is a nonnegative integer','maximum_bound_false_admission and minimum_bound_false_refusal use occurrence-count bounds only, as in the Truss proposal; registered UMF multiplicity counts distinct related Records','General count-transfer checks assume distinct related Records <= edge occurrences and equivalent zero populations; no native mapping establishes these premises here','Hypothetical deduplication retains one representative when the tuple is nonempty; this is NOT the native insertion behavior','Existence equivalence applies only to predicates depending solely on the fixed tuple, without edge-specific attributes or identity'],'scope':'Unbounded integer bag/set count correspondence; two-edge attribute counterexample. Native edge_out rejects parallel inserts rather than deduplicating them. No general graph mapping, compiler correctness or backend qualification proved.','requiredLoweringDecision':'Preserve every occurrence in an admitted occurrence-capable physical profile, or refuse the incompatible source/dataset. Never silently deduplicate or advertise general predicate equivalence.','nativeImplementationQualified':False}
Path('docs/helix/04-build/evidence/security/parallel-relationship-preservation-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
