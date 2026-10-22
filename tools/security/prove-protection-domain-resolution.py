"""Conditional exact-reference/guard laws, not a core validator or implementation theorem."""
import hashlib,json,pathlib,z3
out=pathlib.Path('docs/helix/04-build/evidence/security/protection-domains-20261015/formal');out.mkdir(parents=True,exist_ok=True)
files=['tools/security/prove-protection-domain-resolution.py','src/extensions/security/protection/domains.ts','spec/extensions/security-protection/domain-resolution.schema.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
pins={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in files};rows=[]
def run(name,conditions,want):
 s=z3.Solver();s.add(*conditions);got=str(s.check());assert got==want,(name,got)
 text=s.to_smt2();(out/(name+'.smt2')).write_text(text);replay=z3.Solver();replay.from_string(text);assert str(replay.check())==want
 rows.append({'id':name,'expected':want,'observed':got,'replay':want,'model':str(s.model()) if got=='sat' else None})
I=z3.DeclareSort('ExactIdentity');R=z3.DeclareSort('Revision');Q=z3.Datatype('QualifiedField');Q.declare('field',('document',I),('module',I),('element',I));Q=Q.create()
a,b=z3.Consts('requested selected',Q);actual,pinned=z3.Consts('actual_revision pinned_revision',R)
hasPin,isField,knownCore,knownSource=z3.Bools('has_pin is_explicit_field known_core known_source')
admit=z3.And(a==b,actual==pinned,hasPin,isField,knownCore,knownSource)
run('exact-qualified-selection',[admit,z3.Or(Q.document(a)!=Q.document(b),Q.module(a)!=Q.module(b),Q.element(a)!=Q.element(b))],'unsat')
run('weakened-name-only-collision',[Q.element(a)==Q.element(b),Q.document(a)!=Q.document(b)],'sat')
run('stale-revision-refuses',[admit,actual!=pinned],'unsat')
run('weakened-revision-guard',[a==b,hasPin,isField,knownCore,knownSource,actual!=pinned],'sat')
run('non-field-refuses',[admit,z3.Not(isField)],'unsat')
run('unknown-meaning-refuses',[admit,z3.Or(z3.Not(knownCore),z3.Not(knownSource))],'unsat')
run('positive-qualified-definition',[admit],'sat')
# Exact identity selects the same definition under any permutation of source coordinates.
Lookup=z3.Function('original_definition',Q,z3.IntSort());run('coordinate-order-does-not-change-definition',[a==b,Lookup(a)!=Lookup(b)],'unsat')
failed=z3.Bool('any_occurrence_failed');before=z3.Int('partial_count');returned=z3.If(failed,0,before)
run('atomic-refusal-no-coordinates',[before>=0,failed,returned>0],'unsat')
run('weakened-partial-return',[failed,before>0],'sat')
authenticated=z3.Bool('authenticated_original_source');run('matching-labels-not-authentication',[admit,z3.Not(authenticated)],'sat')
assert pins=={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in files}
j={'status':'conditional-domain-model-passed','z3':z3.get_version_string(),'queries':rows,'sourceDigests':pins,'scope':'Exact abstract qualified identities, revision/Field/known-meaning guards, immutable lookup extensionality and atomic refusal.','limits':['Core validation, JSON snapshot/tuple encoding, Unicode/parser behavior, source-map/permutation construction and TypeScript implementation are assumed, not proved.','Known core definitions do not establish literal/function applicability, domain equivalence, ontology validity or native permissions.','Matching caller revision labels does not authenticate the original source; positive unauthenticated model is deliberately SAT.'],'nativeImplementationQualified':False,'acceptanceCasesPromoted':[]}
(out/'receipt.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps({'status':j['status'],'queries':len(rows),'z3':j['z3']}))
