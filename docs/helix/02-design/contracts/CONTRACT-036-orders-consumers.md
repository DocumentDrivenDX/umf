---
ddx:
  id: CONTRACT-036
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-030
      kind: informed_by
    - id: CONTRACT-033
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# CONTRACT-036: Orders metadata consumer demonstration

FR-41/B-014 has a runnable, authored example in
`scripts/examples/orders-consumers.ts`. One UMF document contains a TableSpec
orders table, OpenAPI 3.1.1 request operation and the existing sales/support DDD
model. Explicit bindings rename order_id, quantity and active to orderId, quantity
and isActive. Core scalarType supplies portable metadata; native TableSpec types
and explicit policies determine representation. Core links declare request/service
associations, not equality between a table, DTO and aggregate.

The example produces all seven consumer classes:

- An executable exact-key rename with no coercion or discarded input fields.
- An escaped SVG of selected core elements and explicit core-reference edges.
- A pipeline proposal with select, rename, validate and delivery steps.
- A DTO validator generated through TableSpec → Avro → JSON Schema, plus a check
  against the explicitly bound OpenAPI request schema.
- Form metadata with descriptions, source pointers, controls, presence and
  nullability. Chromium renders and reads the three controls.
- Agent context containing operation and DDD definitions, with pointers to full
  source context and interpretation limits.
- Plain-text documentation, rendered with textContent rather than HTML parsing.

`generateOrdersConsumers` returns the bundle described by
`spec/examples/orders-consumers.schema.json`. Native operation/schema objects
remain open because their languages permit arbitrary keywords; DDD definitions
reference the DDD schema. Structural validation does not prove source/output
consistency, native semantic completeness or SVG safety for arbitrary bundles.
The browser script consumes its own generated SVG. This is not a public generic API.

`compileOrdersTransform` snapshots the source and mapping, compiles validators
once and returns a local runner. Invalid rows return rejection without a candidate
output; non-JSON/unsafe numeric input throws at the existing JSON boundary without
invoking getters. Rows retain copied input. Mutating the returned bundle cannot
alter the compiled rename mapping. Native adapters check their own contracts
before generation; core validation alone is insufficient.

Complete source context retains DDD native references that core traversal does not
follow. An unfamiliar example.future vocabulary survives unchanged. Copied
TableSpec description edits propagate to form, documentation and target schema;
inconsistent derived core fields fail native preflight. Metadata extraction rejects
unsafe numbers rather than rounding them.

## Scope and limits

This is one authored binding, not a general model merger, row codec, UI framework
or service client. Unmapped columns and changed service bindings fail. The DTO
covers a request, not the complete Order aggregate. Domain invariants, TableSpec
length/coercion, authentication and execution semantics are not enforced. Bundles
retain projection issues and explicit limits. Delivery is never executed. A false
boolean is present; checkbox checked-state is not a presence requirement. Unknown
content has no inferred meaning. Production pipeline/UI execution and accessibility
require further design.

## Evidence and reproduction

`bun test tests/consumers/orders.test.ts tests/core/selection.test.ts`: 7 tests,
122 assertions. Both UMF formats regenerate identical outputs and recover native
meaning. Tests cover integer bounds, missing/extra fields, coercion rejection,
copy isolation, edited metadata and escaped labels. Long-string/negative-quantity
acceptance explicitly demonstrates the DTO validator's enforcement limits.

`bun scripts/orders-consumers-browser.ts` with UMF_CHROMIUM_PATH configured:
six SVG nodes, four edges, three form controls, accepted/rejected rows, rendered
documentation, retained unknown vocabulary, no external requests or Node globals.

`.venv/bin/python scripts/orders-consumers-oracle.py`: six independently checked
renames and JSON Schema validations; binary/value agreement in Apache Avro 1.12.0
and fastavro 1.12.2. Run `scripts/orders-consumers-source-oracle.py` with the
TableSpec Python environment: both variants validate against the captured Pydantic
schema model, whose source hash is recorded. No native row execution is claimed.
Evidence lives under `fixtures/validation/orders-consumers*.json`.

Type checking, 167 schema and 32 package audits pass. Regenerate the result schema
with `bun scripts/orders-consumer-schema.ts`. This focused evidence follows the
718-test full-suite baseline; that baseline does not cover these new files.
Broader ingestion, native reconstruction and reusable consumers/value conversion
remain unfinished. The five-system priority remains; RDF expansion stays deferred.
