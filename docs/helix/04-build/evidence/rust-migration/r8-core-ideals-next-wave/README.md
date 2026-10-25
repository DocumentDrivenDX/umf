---
ddx:
  id: umf.evidence.rust-migration.r8-core-ideals-next-wave
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-avro-document-core
      kind: references
    - id: umf.evidence.rust-migration.r5-avro-full-predecessor
      kind: references
---

# R8 next core-ideals operation: Avro Record Type

This is a read-only candidate selection against the current R8 gap ledger. It
does not accept an operation mapping, change the ledger, or establish a Rust
implementation or default route. The shared source cohort is moving; the
hashes below identify the inspected bytes only.

## Recommendation

Take `src/core-ideals/avro-record-type.ts` as the next small, high-value
core-ideals candidate after Record Members and security: the coherent public
operation pair is `classifyAvroRecordType` and `recoverAvroRecordTypeBundle`.
Both are already public through `src/index.ts:270` and are explicit TypeScript
reference implementations. The current gap ledger records two unique
executable declarations, no accepted Rust operation mapping, and no proven
binding route. This recommendation is for an opt-in candidate only; a default
root override remains unqualified.

The operation identifies a direct or qualified Avro `record`/`error` type for
an Avro field, then reconciles the parent Field and nested Record into a UMF
document. Its frozen binding descriptor identifies Avro 1.12.0 and explicitly
limits support to direct record/error definitions and qualified named record
references; unions and containers are separate bindings. Inputs include an
already imported UMF `Document`, explicit root `nativeSource`, caller-ordered
dependency schemas, mode and record identity. It performs no filesystem,
network, database or artifact-supplied callback access. It does require exact
named-reference resolution, recursion handling, dependency identity, and
source/target recomputation; those are semantic requirements, not simple
schema copies.

## Governing semantics and current Rust foundation

CONTRACT-007 governs lossless Avro 1.12.0 schema representation and makes clear
that structural schema admission is not complete native semantic validation.
CONTRACT-040 governs core Field/Record identity, author-versus-classified
provenance, residuals and loss-aware classification. CONTRACT-001 requires
unknown extension content and original native meaning to survive. The binding
must not infer author intent from a native record link, erase an existing scalar
or record-type assertion, or silently interpret union/container cases.

Rust already has an opt-in Avro document preservation core, Avro field
derivation, semantic inspection and candidate-edit wire operations. The R5
document receipt covers lossless source trees, ordered dependencies, materialized
field consistency, unknown representation refusal and caller `Context`
resource controls. These are useful foundations, but no current Rust module or
wire operation implements this core-ideal classifier/recovery pair. In
particular, the R5 receipts do not establish classification of a field into a
record type, construction of the corresponding target UMF Record, author
conflict handling, nor the R8 recovery contract. The ledger therefore correctly
leaves this pair unmapped.

## Predecessor packet and qualification needed

The strongest existing focused predecessor is
`tests/core-ideals/avro-record-type.test.ts`, using
`scripts/core-ideals/avro-record-type-cases.ts` and current Avro fixtures. It
checks direct, qualified, recursive and dependency-defined links; it expects 10
successful classifications and blocked unions/containers/scalars; it exercises
both `strict` and `report`, JSON/YAML receipt round-trips, native-source recovery,
author conflict/duplicate controls, missing dependencies, stale target and
tampered mapping refusals. This is a useful capture source, but the existing test
does not itself store a complete source-pinned serialized expected-output packet
with per-case error code/message/order.

Before Rust implementation, freeze the exact current TypeScript outcomes rather
than using a recaptured Rust result as the oracle. The packet should bind the
TypeScript source, case builder, test, schema, fixtures and relevant adapter/core
helpers. It should contain all success and refusal outputs in both modes,
including exact target document, mappings, native fragments, residuals,
diagnostics, source/dependency preservation, and the recovery output. Add
negative cases for ambiguous/missing qualified names, same-name dependencies,
recursive references, invalid/unavailable author provenance, duplicate or
unrelated author receipts, existing scalar/record-type meaning, unknown native
representation fields, modified source/target/receipt, and resource-boundary
refusal. Capture raw JS host getters/proxies and exception order for the Node and
browser wrappers before selecting any default route.

Rust and wire tests should then prove the same pinned outcomes, work/constraint
charging, cancellation/deadline refusal, output limits, and no-partial-result
behavior. Binding tests need Node and real Chromium with host-read ordering and
copy isolation. The operation is presently absent from the V4 default roots;
an opt-in wire pass does not count as root selection. A source-pinned private
installed SDK replay is required after any route promotion, and all remaining
TypeScript reference declarations stay open in the ledger until reviewed.

## Source pins and limits

| Source | SHA-256 |
|---|---|
| `docs/helix/04-build/rust-migration-plan.md` | `457ca339f413f4e073200fc524385f825953c23cf95c19582763e702389d25c7` |
| `docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md` | `000747cf9c84697333bb55a18c5a8a4eebd5f5c953ad08d580378d950ce9612d` |
| `docs/helix/02-design/contracts/CONTRACT-007-avro.md` | `7db5553878fda5fd8552ee9c0e2bc5d56f80e3a1c35b0bfeaefde4618f3fd1d1` |
| `docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md` | `58b5f07693618b91f73da98fba04ba14b222285e84b33b8639eb057bc7e3abd0` |
| `docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json` | `6c967ab20be1efb9097895969c223928f427f30d080a401255cee32f3b56b499` |
| `src/core-ideals/avro-record-type.ts` | `e7f19566f986f808976ee7b170241249d5d950dcc139ff00a74db9660146aff3` |
| `tests/core-ideals/avro-record-type.test.ts` | `5e786e0fddc7998e2a3929a1e972a51edc487cb2227a37f92c0f3a2d07150c21` |
| `scripts/core-ideals/avro-record-type-cases.ts` | `eedd595c6c50f57255630f89e7686cd04bc0732706ff5368463a6d6e4dd08e77` |
| `spec/core/avro-record-type-classification.schema.json` | `51297a6a7ca2f4cd78c7653e79681af86a91cf1e7ff0c9c936532738c7508c27` |
| `crates/umf-core/src/avro_document.rs` | `d61092202ac0e826e63c8fd36cb25ebb2185e6861e97f31713c4a8049e496ad4` |
| `crates/umf-core/src/avro_semantics.rs` | `02ddc5c245e59b80273ba2865a5099846d3d471967a6d6c61ca71720ab55ed8c` |
| `crates/umf-core/src/avro_fields.rs` | `b78ace9d77f74ae1f0bbdc9e8ce852bf3fad20079aea02f200808ea89bc6985c` |
| `crates/umf-core-wire/src/lib.rs` | `56991e5a080e2de46cda6f3c63ebb44d55c4178023cc9583d86dec4f238d24e0` |
| `src/index.ts` | `acfc8529b437fc6daa279a6586acb25644bae4c3c0b0fe15541d07eba20658da` |
| `src/index-node-v4.ts` | `1050612322e5ba33a58add2f156762c2d01f8114dba6d410c28e009160881417` |
| `src/index-browser-v4.ts` | `ca52a58aa57b0ee8e45a0e403bc49c109aa1c302e30e50fb30d7ced96edfd084` |
| `docs/helix/04-build/evidence/rust-migration/r5-avro-document-core/README.md` | `59473ab6b1115c248a0ddc6f068e4b38d28d03414981de26a944a4d9cf70bef4` |
| `docs/helix/04-build/evidence/rust-migration/r5-avro-full-predecessor/README.md` | `6d96a85eaf88e1c84d55f277cd885df30e57695d0d2cb096f253d4b5a223777d` |

This note does not change the 922 logical executable gap count, establish a
native oracle, prove Node/WASM bindings, or qualify an installed SDK or release.
