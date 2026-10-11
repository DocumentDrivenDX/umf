"""Conditional two-way source population algebra; no SQL/identity refinement proof."""
import hashlib,json,uuid,zipfile
from pathlib import Path
import z3
paths=[Path(__file__),Path('/private/tmp/truss-security-main-integration/packages/postgresql/src/security-source-completeness.ts'),Path('/private/tmp/truss-security-main-integration/packages/postgresql/src/security-query-use.ts'),Path('tools/security/pg-query-carrier-eligibility.py')]
frozen={str(p):p.read_bytes() for p in paths}
Root=z3.DeclareSort('Root');Carrier=z3.DeclareSort('Carrier')
r,other_root=z3.Consts('r other_root',Root);c,d=z3.Consts('c d',Carrier)
eligible=z3.Function('eligible',Root,z3.BoolSort());selected=z3.Function('selected_carrier',Carrier,z3.BoolSort());valid=z3.Function('required_fields_available',Carrier,z3.BoolSort());matches=z3.Function('faithful_key_match',Carrier,Root,z3.BoolSort())
exact_one=lambda root:z3.Exists(c,z3.And(selected(c),matches(c,root),valid(c),z3.ForAll(d,z3.Implies(z3.And(selected(d),matches(d,root)),d==c))))
complete=z3.ForAll(r,z3.Implies(eligible(r),exact_one(r)))
contained=z3.ForAll(c,z3.Implies(selected(c),z3.Exists(r,z3.And(eligible(r),matches(c,r)))))
reverse_anti_exists=z3.Not(z3.Exists(c,z3.And(selected(c),z3.Not(z3.Exists(r,z3.And(eligible(r),matches(c,r)))))))
admitted=z3.And(complete,reverse_anti_exists)
root_a,root_b=z3.Consts('eligible_root ineligible_root',Root);carrier_a,leak=z3.Consts('original_carrier extra_carrier',Carrier)
world=[root_a!=root_b,carrier_a!=leak,z3.ForAll(r,eligible(r)==(r==root_a)),z3.ForAll(c,selected(c)==z3.Or(c==carrier_a,c==leak)),z3.ForAll(r,matches(carrier_a,r)==(r==root_a)),z3.ForAll(r,matches(leak,r)==(r==root_b)),valid(carrier_a),valid(leak)]
no_eligible_match=z3.ForAll(r,z3.Implies(eligible(r),z3.Not(matches(leak,r))))
application_selects=z3.Function('application_selects',Carrier,z3.BoolSort());empty_application=z3.ForAll(c,z3.Not(application_selects(c)))
cases=[
 ('reverse-universal-equals-anti-existence','unsat',[contained!=reverse_anti_exists]),
 ('admission-excludes-selected-ineligible-carrier','unsat',[admitted,selected(leak),no_eligible_match]),
 ('empty-root-population-cannot-admit-a-carrier','unsat',[admitted,selected(leak),z3.ForAll(r,z3.Not(eligible(r)))]),
 ('duplicate-eligible-carriers-refuse','unsat',[admitted,eligible(root_a),selected(carrier_a),selected(leak),carrier_a!=leak,matches(carrier_a,root_a),matches(leak,root_a)]),
 ('one-way-completeness-admits-extra-ineligible-carrier','sat',[complete,*world]),
 ('empty-application-does-not-establish-source-admission','sat',[complete,*world,empty_application,z3.Not(admitted)]),
 ('populated-exact-source-admits','sat',[admitted,eligible(root_a),selected(carrier_a),valid(carrier_a),matches(carrier_a,root_a)]),
 ('empty-source-and-root-populations-admit','sat',[admitted,z3.ForAll(r,z3.Not(eligible(r))),z3.ForAll(c,z3.Not(selected(c)))]),
]
queries=[]
for name,expected,formula in cases:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*formula);smt=solver.to_smt2();result=str(solver.check())
 if result!=expected:raise RuntimeError(name+': '+result)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);replayed=str(replay.check())
 if replayed!=expected:raise RuntimeError('Fresh replay differs')
 queries.append({'id':name,'expected':expected,'result':result,'freshContextReplay':replayed,'smt2':smt,'witness':str(solver.model()) if result=='sat' else None})
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Analysis source changed')
folder=Path('docs/helix/04-build/evidence/security/query-carrier-eligibility-formal')/str(uuid.uuid4());folder.mkdir(parents=True)
(folder/'proof.json').write_text(json.dumps({'status':'conditional-proof-passed','z3Version':z3.get_version_string(),'sourceDigests':pins,'queries':queries,'scope':'First-order arbitrary Root/Carrier populations with faithful key matching, complete selected carriers and required-field truth. Two-way universal population specification equals the added reverse anti-existence condition. Independent empty application selection cannot establish admission. Premises include truthful native eligible-root RLS, exact identity/domain/selector correspondence and one stable source/authority cut through application/final release. Not proved: SQL generation or PostgreSQL refinement, NULL/collation/domain conversion, source authenticity, dependency/callable/DDL closure, concurrent authority, graph mappings or full backend admission.'},indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for index,(path,data) in enumerate(frozen.items()):archive.writestr(str(index)+'/'+Path(path).name,data)
print(json.dumps({'status':'conditional-proof-passed','queries':len(queries),'evidence':str(folder)}))
