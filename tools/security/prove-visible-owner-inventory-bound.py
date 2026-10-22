"""Source-bound arithmetic proof of captured native owner output limits."""
import hashlib,json
from pathlib import Path
import z3
self_path=Path('tools/security/prove-visible-owner-inventory-bound.py')
if Path(__file__).resolve()!=self_path.resolve():raise RuntimeError('Unknown proof source')
source=Path('/Users/erik/Projects/truss/packages/postgresql/native/dataset-visible-owner-inventory.sql')
frozen={str(p):p.read_bytes() for p in [self_path,source]};sql=frozen[str(source)].decode()
fragments=['FROM truss.object x LIMIT 1001','FROM truss.edge x LIMIT 10001','jsonb_array_length(objects)>1000 OR jsonb_array_length(edges)>10000','FROM jsonb_array_elements(objects) v','FROM jsonb_array_elements(edges) v']
if any(sql.count(f)!=1 for f in fragments):raise RuntimeError('Selected SQL changed')
o,e=z3.Ints('captured_objects captured_edges');later=z3.Int('later_visible_objects')
premises=[o>=0,o<=1001,e>=0,e<=10001]
admitted=z3.And(o<=1000,e<=10000);output=o+e
cases=[('admitted_object_bound',z3.And(admitted,o>1000),z3.unsat),('admitted_edge_bound',z3.And(admitted,e>10000),z3.unsat),('admitted_combined_bound',z3.And(admitted,output>11000),z3.unsat),('overflow_refuses',z3.And(z3.Or(o==1001,e==10001),admitted),z3.unsat),('exact_combined_boundary',z3.And(admitted,o==1000,e==10000,output==11000),z3.sat),('empty_population_nonvacuity',z3.And(admitted,output==0),z3.sat),('double_scan_mutant',z3.And(admitted,o==0,later==1001,later>1000),z3.sat)]
queries=[]
for name,claim,expected in cases:
 solver=z3.Solver();solver.set(timeout=20000);solver.add(*premises,claim);result=solver.check()
 if result!=expected:raise RuntimeError(name+': '+str(result))
 smt=solver.to_smt2();replay=z3.Solver();replay.set(timeout=20000);replay.from_string(smt);observed=replay.check()
 if observed!=expected:raise RuntimeError('Replay differs')
 queries.append({'id':name,'result':str(result),'replayResult':str(observed),'smt':smt,'model':str(solver.model()) if result==z3.sat else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Proof sources changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'sourcesUnchanged':True,'selectedImplementationFragments':fragments,'queries':queries,'premises':['PostgreSQL LIMIT bounds each captured projection and JSONB aggregation preserves each projected row exactly once','Array length measures captured rows and jsonb_array_elements emits those same captured rows exactly once','Only one captured object and edge buffer are emitted; caller visibility is not authenticated by this theorem'],'scope':'Conditional row-count admission arithmetic, not proof of SQL implementation, stable visibility, bounded RLS evaluation cost, bytes/work, typed source correspondence, native population completeness or authorization','nativeImplementationQualified':False}
Path('docs/helix/04-build/evidence/security/visible-owner-inventory-bound-formal.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'queries':len(queries)}))
