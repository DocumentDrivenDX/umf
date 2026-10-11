"""Conditional source-census release algebra; not native catalog/SQL refinement."""
import hashlib,json,uuid,zipfile
from pathlib import Path
import z3
paths=[Path(__file__),Path('tools/security/pg-inventory.py'),Path('tools/security/pg-query-source-census.py'),Path('/private/tmp/truss-security-main-integration/packages/postgresql/native/security-query-source-census.sql')]
frozen={str(p):p.read_bytes() for p in paths}
Source=z3.DeclareSort('SourceInterpretation');Image=z3.DeclareSort('CensusImage');Data=z3.DeclareSort('DataCut')
expected,pre,executing,post=z3.Consts('expected_source pre_source execution_source release_source',Source)
observe=z3.Function('truthful_complete_source_image',Source,Image)
faithful=z3.ForAll([pre,post],z3.Implies(observe(pre)==observe(post),pre==post))
pre_pass=observe(pre)==observe(expected);post_pass=observe(post)==observe(expected)
release=z3.And(pre_pass,post_pass)
# Coordination must constrain the interior, not merely compare the endpoints.
stable_cut=z3.And(pre==executing,executing==post)
old_data,new_data=z3.Consts('old_data new_data',Data)
partial_observe=z3.Function('dependency_edges_only_image',Source,Image)
cases=[
 ('complete-image-and-held-cut-preserve-execution-source','unsat',[faithful,stable_cut,release,executing!=expected]),
 ('complete-image-rejects-drift-before-execution','unsat',[faithful,pre!=expected,pre_pass]),
 ('complete-image-rejects-drift-after-buffering','unsat',[faithful,post!=expected,release]),
 ('endpoint-equality-alone-permits-source-aba','sat',[faithful,release,pre==post,executing!=expected]),
 ('dependency-edges-alone-may-hide-source-body-change','sat',[pre!=expected,partial_observe(pre)==partial_observe(expected)]),
 ('faithful-data-update-does-not-require-source-change','sat',[faithful,stable_cut,release,old_data!=new_data]),
]
queries=[]
for name,expected_result,formula in cases:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*formula);smt=solver.to_smt2();result=str(solver.check())
 if result!=expected_result:raise RuntimeError(name+': '+result)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);replayed=str(replay.check())
 if replayed!=expected_result:raise RuntimeError('Fresh replay differs')
 queries.append({'id':name,'expected':expected_result,'result':result,'freshContextReplay':replayed,'smt2':smt,'witness':str(solver.model()) if result=='sat' else None})
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Analysis source changed')
folder=Path('docs/helix/04-build/evidence/security/query-source-census-formal')/str(uuid.uuid4());folder.mkdir(parents=True)
(folder/'proof.json').write_text(json.dumps({'status':'conditional-proof-passed','z3Version':z3.get_version_string(),'sourceDigests':pins,'queries':queries,'scope':'Uninterpreted source-interpretation/image/data-cut algebra. Injective truthful complete observation, independently qualified expected interpretation and interior stable-cut coordination are premises. Pre/post comparison under those premises excludes execution under a changed source; endpoint equality alone permits ABA. Data cuts may change without changing source interpretation. Not proved: completeness or injectivity of the selected native catalog census, native JSON/SQL/collation refinement, original installer/provider authentication, catalog/MVCC snapshot freshness, host buffering or transport behavior, dynamic external executable/fact routing, writer participation, graph mappings or backend admission.'},indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for index,(path,data) in enumerate(frozen.items()):archive.writestr(str(index)+'/'+Path(path).name,data)
print(json.dumps({'status':'conditional-proof-passed','queries':len(queries),'evidence':str(folder)}))
