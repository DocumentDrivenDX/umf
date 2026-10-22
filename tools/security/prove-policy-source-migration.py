"""Conditional map/frame and guard models; no TS/SQL refinement theorem."""
import hashlib,json,pathlib
import z3
out=pathlib.Path('docs/helix/04-build/evidence/security/policy-v2-20261015/formal');out.mkdir(parents=True,exist_ok=True)
inputs=['tools/security/prove-policy-source-migration.py','src/extensions/security/policy-representation-v2.ts','src/extensions/security/policy-v2-legacy-access.ts','src/extensions/security/protection/references.ts','spec/extensions/security-v0.2/schema.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
pins={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in inputs}
rows=[]
def run(name,constraints,expected):
 s=z3.Solver();s.add(*constraints);actual=str(s.check());assert actual==expected,(name,actual)
 text=s.to_smt2();(out/(name+'.smt2')).write_text(text)
 replay=z3.Solver();replay.from_string(text);assert str(replay.check())==expected
 rows.append({'id':name,'expected':expected,'observed':actual,'replay':expected,'model':str(s.model()) if expected=='sat' else None})
# Integer keys abstract exact object-key identity classes;0/1 are version/revision,
#2/3 are rules/ontology. Json values are opaque, never host pointers or SQL data.
J=z3.DeclareSort('JsonValue');source=z3.Array('source',z3.IntSort(),J);v2,v1,r2,r3,changed=z3.Consts('v2 v1 r2 r3 changed',J)
up=z3.Store(z3.Store(source,0,v2),1,r2);back=z3.Store(z3.Store(up,0,v1),1,r3);key=z3.Int('other_key')
run('roundtrip-frame',[key!=0,key!=1,z3.Select(back,key)!=z3.Select(source,key)],'unsat')
wrong=z3.Store(back,2,changed)
run('weakened-frame-changes-rules',[z3.Select(wrong,2)!=z3.Select(source,2)],'sat')
facts=z3.Const('same_admitted_facts',J);outcome=z3.Function('legacy_outcome',J,J,J,z3.IntSort())
a=outcome(z3.Select(source,2),z3.Select(source,3),facts);b=outcome(z3.Select(back,2),z3.Select(back,3),facts)
run('legacy-roundtrip-outcome',[a!=b],'unsat')
view=z3.Store(up,0,v1)
forward=outcome(z3.Select(view,2),z3.Select(view,3),facts)
run('forward-legacy-view-outcome',[a!=forward],'unsat')
run('forward-original-revision',[z3.Select(view,1)!=r2],'unsat')
run('positive-permit-population',[a==1,b==1,z3.Select(source,2)!=changed],'sat')
unknownOld,unknownNew=z3.Consts('old_unknown new_unknown',z3.SetSort(z3.IntSort()));w=z3.Int('classification_witness')
promotion=z3.And(z3.IsMember(w,unknownOld),z3.Not(z3.IsMember(w,unknownNew)))
run('no-unknown-promotion',[unknownOld==unknownNew,promotion],'unsat')
run('weakened-classification-guard',[promotion],'sat')
run('positive-retained-unknown',[unknownOld==unknownNew,z3.IsMember(w,unknownOld)],'sat')
hasPin,hasCatalog,namedConstant=z3.Bools('has_pin has_catalog_tag named_constant')
strong=z3.And(z3.Not(hasPin),z3.Not(hasCatalog))
run('catalog-guard-refusal',[strong,hasCatalog],'unsat')
run('name-only-guard-countercontrol',[namedConstant,hasPin,hasCatalog],'sat')
assert pins=={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in inputs}
receipt={'status':'conditional-model-passed','z3':z3.get_version_string(),'queries':rows,'sourceDigests':pins,'scope':'Header-store frame over opaque immutable JSON maps, conditional forward legacy-view and roundtrip outcome congruence under separately admitted same facts, and classification/catalog guard laws.','limits':['No proof of TypeScript/core-copy implementation refinement, schema/walker correctness,general0.2 interpreter equivalence or executable embedding refinement, host fact attestation, native backend or permission admission.','Name-only countercontrol concerns the guard alone; remaining shape/frame checks can still refuse. It is not an actual API/native bypass.','Integer key classes abstract exact string equality; no Unicode/parser/raw-text theorem.'],'nativeImplementationQualified':False,'acceptanceCasesPromoted':[]}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'queries':len(rows),'z3':receipt['z3']}))
