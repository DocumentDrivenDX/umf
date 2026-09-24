---
ddx:
  id: CONTRACT-006
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: US-006
      kind: informed_by
---

# CONTRACT-006: DDD-to-document projection

**Profile:** 0.1.0. **Source:** `umf.ddd` 0.1.0. **Target:** JSON Schema Draft 2020-12.

## Operation and Binding Contract

`projectDddToJsonSchema(source,bindings)` returns the result described completely
by `spec/projections/ddd-json-schema.schema.json`. Bindings require target `id`,
absolute fragment-free `schemaId`, a qualified `root`, `closedObjects`, explicit
scalar/collection encodings, relationship choices and `lossPolicy`.

The selected encodings are `integer:json-integer`, `decimal:decimal-string`,
`dateTime:string`, `bytes:hex-string` and `collection:array`. They are explicit
choices in this first profile, not inferred storage meaning. Decimal strings use
non-exponent base-ten notation; bytes use lowercase hexadecimal pairs. Date-time
meaning is not validated by the selected plain-string binding. Integer encoding
does not guarantee host precision. Instance-data conversion remains separate work.

`relations` maps `/<module>/<element>/fields/<field>` to embed or identity, using
JSON Pointer escaping on each component. `dddFieldBinding` constructs these keys.
Every reached concept field needs a choice; unused choices are errors. Embed
includes the selected concept's fields. Identity emits a closed/open object of the
referenced entity's identity fields according to the same binding policy. It needs
a context-scoped entity identity; aggregate-local identifiers require a future
owner binding and are blocked rather than treated as globally unique.

## Structural Lowering

Entity, value and event roots are data-bearing. Service/repository roots need a
separate operation binding and are blocked. Qualified concept plus mode controls
reuse of generated definitions, so same-named concepts in distinct contexts never
merge. Generated titles display their qualified origin; mappings retain exact
references and target pointers.

Cardinality one produces required properties. Optional properties may be absent.
Many maps to optional arrays, permitting empty or absent collections and adding a
physical ordering. It does not infer set uniqueness or ownership. Recursive
embedding yields references with an explicit finite-document warning; cyclic
instance graphs may require identity references. Object openness is always a
binding, never a domain rule inferred from an aggregate declaration.

## Fidelity and Recovery

The result contains status, a copied source, policy, issues and concept mappings.
Successful results also contain nativeSchema and target UMF. Issue classifications
match the directed-projection report vocabulary: representation-change,
not-enforced, unsupported and annotation-only. Strict policy blocks when any issue
remains; allow-reported-loss permits disclosed physical lowering. Shape/scope
ambiguities remain blocked regardless of loss policy.

Identity fields do not enforce uniqueness, lifecycle or referential integrity.
Embedding does not enforce aggregate consistency or transactions. Object schemas
do not implement value equality or immutability. Event shapes do not establish
occurrence, producer authority or delivery. Contexts, terms, services, repositories,
context maps/ACLs and unselected definitions remain in source. Opaque invariant
warnings travel into the result without claiming execution. Unknown source meaning
is retained with its existing diagnostics.

Original DDD recovery uses retained source. Target-only JSON Schema reimport does
not regain DDD intent. The operation projects schemas and is not a data converter.
Malformed bindings or invalid known source declarations throw; blocked results have
issues and no target. The generated schema is checked by the existing native adapter.

## Evidence

The sales fixture projects an Order with embedded OrderLine, Money and ShippingAddress
and an identity-only Customer. Switching Customer to embedding changes native shape
without changing the domain model. Independent Ajv validates positive and negative
documents, including decimal encodings and identity-only shape. A negative total
still passes native shape validation, proving that the retained invariant is not
enforced. Chromium runs the same public operation. SQL, OpenAPI, Axon and Palantir
bindings and domain-instance execution remain outside this profile.
