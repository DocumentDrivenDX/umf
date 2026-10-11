"""Conditional selected report-basis correspondence; no native codec/refinement proof."""
import hashlib, json, uuid
from pathlib import Path
import z3
ROOT = Path(__file__).resolve().parents[2]
if Path.cwd() != ROOT:
    raise SystemExit('Exact root invocation required')
T = Path('/private/tmp/truss-security-main-integration')
paths = [Path(__file__), ROOT/'tools/security/prove-binding-publication-order.py',
 ROOT/'docs/helix/02-design/contracts/security-association-binding.proposal.md',
 T/'packages/postgresql/native/catalog-pending-association-stage.sql',
 T/'packages/postgresql/native/catalog-generation-observer.sql',
 T/'packages/postgresql/native/catalog-input-custody.sql',
 ROOT/'tools/security/truss-binding-catalog-stage.py']
frozen = {str(p): p.read_bytes() for p in paths}
sha = lambda b: hashlib.sha256(b).hexdigest()
# Exact uninterpreted original-byte carriers; no hash or lossy parser quotient.
Bytes = z3.DeclareSort('OriginalBytes')
Id = z3.DeclareSort('MetadataIdentity')
Value = z3.DeclareSort('FullNativeValue')
inputs = z3.Consts('input_before input_after', Bytes)
bindings = z3.Consts('binding_before binding_after', Bytes)
documents = z3.Consts('documents_before documents_after', Bytes)
images = z3.Consts('image_before image_after', z3.ArraySort(Id, Value))
identity_sets = z3.Consts('identities_before identities_after', z3.ArraySort(Id, z3.BoolSort()))
gens = z3.Ints('generation_before generation_after')
writers = z3.Ints('writer_before writer_after')
ordinals = z3.Ints('ordinal_before ordinal_after')
revisions = z3.Ints('revision_before revision_after')
operation_rows = z3.Consts('remaining_operation_members_before remaining_operation_members_after', Bytes)
selected_id = z3.Const('selected_identity', Id)
selected_value_parity = z3.ForAll(selected_id, z3.Implies(z3.Select(identity_sets[0], selected_id),
 z3.Select(images[0], selected_id) == z3.Select(images[1], selected_id)))
# Coordinates remain separately visible: full-row carrier is not presumed decoded.
guards = {'generation': gens[0] == gens[1], 'writer': writers[0] == writers[1],
 'ordinal': ordinals[0] == ordinals[1], 'revision': revisions[0] == revisions[1],
 'operation': z3.And(operation_rows[0] == operation_rows[1], inputs[0] == inputs[1],
 gens[0] == gens[1], writers[0] == writers[1], ordinals[0] == ordinals[1]),
 'input': inputs[0] == inputs[1], 'binding': bindings[0] == bindings[1],
 'documents': documents[0] == documents[1], 'identities': identity_sets[0] == identity_sets[1],
 'values': selected_value_parity}
complete = z3.And(*guards.values())
id_witness = z3.Const('substituted_identity', Id)
source_drift = z3.Or(inputs[0] != inputs[1], bindings[0] != bindings[1], documents[0] != documents[1])
value_drift = z3.And(z3.Select(identity_sets[0], id_witness),
 z3.Select(images[0], id_witness) != z3.Select(images[1], id_witness))
# Abstract codec outputs: byte equality is not presumed injective for a real codec.
encoded = z3.Consts('encoded_basis_before encoded_basis_after', Bytes)
# Candidate0.2 carries the complete operation snapshot in its packet.
packet_projection = complete
operation_erased_projection = z3.And(*[v for k,v in guards.items() if k != 'operation'])
operation_erased_codec = z3.Implies(encoded[0] == encoded[1], operation_erased_projection)
codec_correspondence = z3.Implies(encoded[0] == encoded[1], packet_projection)
authority, registered = z3.Bools('authenticated_original_owner registered_semantic_profile')
def without(*names):
    return [v for k, v in guards.items() if k not in names]
specs = [
 ('complete-selected-cut-has-execution', [complete, z3.Select(identity_sets[0], id_witness), gens[0]>=0, writers[0]>0, ordinals[0]>=0, revisions[0]>0], z3.BoolVal(True), 'sat'),
 ('complete-cut-forbids-source-substitution', [complete], source_drift, 'unsat'),
 ('complete-cut-forbids-arbitrary-value-substitution', [complete], value_drift, 'unsat'),
 ('complete-cut-forbids-coordinate-drift', [complete], z3.Or(*[a != b for a,b in [gens,writers,ordinals,revisions]]), 'unsat'),
 ('generation-only-admits-coherent-source-substitution', [guards['generation'],guards['values'],guards['identities']], z3.And(inputs[0]!=inputs[1], bindings[0]!=bindings[1]), 'sat'),
 ('identity-only-admits-full-value-substitution', [guards['identities']], value_drift, 'sat'),
 ('omit-input-and-full-operation-comparisons-admits-input-substitution', without('input','operation'), inputs[0]!=inputs[1], 'sat'),
 ('omit-binding-comparison-admits-binding-substitution', without('binding'), bindings[0]!=bindings[1], 'sat'),
 ('omit-document-comparison-admits-document-substitution', without('documents'), documents[0]!=documents[1], 'sat'),
 ('omit-full-operation-comparison-admits-unmodeled-operation-change', without('operation'), operation_rows[0]!=operation_rows[1], 'sat'),
 ('omit-generation-and-full-operation-comparisons-admits-generation-change', without('generation','operation'), gens[1]>gens[0], 'sat'),
 ('exact-encoded-recheck-forbids-drift-under-codec-premise', [codec_correspondence,encoded[0]==encoded[1]], z3.Or(source_drift,value_drift,operation_rows[0]!=operation_rows[1],gens[0]!=gens[1],writers[0]!=writers[1],ordinals[0]!=ordinals[1],revisions[0]!=revisions[1]), 'unsat'),
 ('encoded-equality-without-codec-premise-admits-collision', [encoded[0]==encoded[1]], source_drift, 'sat'),
 ('full-operation-encoded-equality-forbids-remaining-operation-drift', [codec_correspondence, encoded[0]==encoded[1]], operation_rows[0]!=operation_rows[1], 'unsat'),
 ('operation-erased-codec-admits-remaining-operation-drift', [operation_erased_codec, encoded[0]==encoded[1]], operation_rows[0]!=operation_rows[1], 'sat'),
 ('selected-correspondence-does-not-prove-authority', [complete], z3.And(z3.Not(authority),z3.Not(registered)), 'sat'),
]
# Captured endpoints alone cannot detect an intervening change restored before end.
middle = z3.Const('intermediate_input', Bytes)
specs.append(('endpoint-equality-admits-intermediate-aba', [complete], middle != inputs[0], 'sat'))
# A witness changed event has a strict increment; all later events preserve it.
# These are observer/privilege premises, not implied by an end comparison.
middle_generation = z3.Int('generation_after_intermediate_changed_event')
observed_change = middle_generation > gens[0]
monotone_tail = gens[1] >= middle_generation
specs.extend([
 ('equal-generation-forbids-observed-change-under-monotone-closure',
  [guards['generation'], observed_change, monotone_tail], z3.BoolVal(True), 'unsat'),
 ('generation-reset-without-monotone-closure-admits-hidden-change',
  [guards['generation'], observed_change], z3.BoolVal(True), 'sat'),
])
out = ROOT/'docs/helix/04-build/evidence/security/report-basis-correspondence'/str(uuid.uuid4())
out.mkdir(parents=True)
checks = []
for name, premises, query, expected in specs:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,query)
 formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise ValueError(name+': '+observed)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000)
 replay.add(z3.parse_smt2_string(formula,ctx=ctx)); replay_result=str(replay.check())
 if replay_result!=expected:raise ValueError(name+': replay '+replay_result)
 checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':replay_result,
  'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
for p,b in frozen.items():
 target=out/'preimages'/p.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
 if target.read_bytes()!=b or Path(p).read_bytes()!=b:raise ValueError('Source changed')
receipt={'status':'pass','z3Version':z3.get_version_string(),'sourceSha256':{p:sha(b) for p,b in frozen.items()},
 'observations':checks,'scope':'Conditional exact selected source/full-value and operation-coordinate correspondence over unbounded uninterpreted byte carriers and metadata identity/value arrays',
 'limitations':['Guard-to-SQL correspondence is inspected and separately tested, not formally refined',
 'Exact native serialization correspondence/injectivity is an explicit premise for the packet projection only; no real JSON codec theorem',
 'Full-operation equality separately includes modeled input/generation/writer/ordinal and remaining opaque members; decoding and field coverage are not proven',
 'Complete physical database inventory, data constraints, authenticated authority and registered semantics are not derived',
 'Endpoint equality admits intervening ABA; immutable custody and complete monotone effect observer closure remain external obligations',
 'No concurrency, liveness, aggregate resource, report persistence, promotion or publication theorem'], 'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'proof':str(out/'proof.json'),'observations':len(checks),'sourcePins':len(paths),'sha256':sha((out/'proof.json').read_bytes())}))
