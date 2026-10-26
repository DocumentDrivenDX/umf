---
ddx:
  id: umf.evidence.rust-migration.r8-post-facets-family-audit
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-next-route-queue
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-058
      kind: informed_by
---

# R8 post-Facets next-family audit

This is a prioritization packet, not a route change or retirement disposition.
It audits the current 864 executable names without an accepted Rust mapping
against the current default V4 roots and existing Rust-owned model slices. The
ledger snapshot is `gap-ledger.json` SHA-256
`035ce31bd7f69a2834f6434322a1a8115207b11289aeb6ca20b09ddd4f91671e`.
It records 922 logical Node-root gaps and 922 browser-root gaps; source selection
or opt-in evidence does not reduce those counts. This queue follows Facets,
Cardinality and Compact Dataset work and excludes already selected/key-staged
families. All named operations below still have `acceptedRustOperation: null`
and `bindingRouteStatus: unproven` in both default-root rows.

The recommendation favors cohesive public operation families with a Rust
semantic owner and an immutable predecessor packet. Existing opt-in host runs
are predecessor evidence only; final default qualification still needs a
fixed-point installed archive, complete public-root path, exact resource
closure, host reflection/error-order replay, and coordinated ledger review.

## 1. Core Schema Properties — four operations

Public exports, all owned by `model:schema-properties` from
`src/model/schema-properties.ts`, are `inspectCoreSchemaProperties`,
`declareCoreSchemaProperties`, `validateCoreFieldValue`, and
`resolveCoreDefault`. The Rust owner is
`crates/umf-core/src/schema_properties.rs` and its tagged-wire dispatch. Prior
R5 packet and predecessor are
[`r5-schema-properties/README.md`](../r5-schema-properties/README.md) and
[`frozen-typescript.json`](../r5-schema-properties/frozen-typescript.json),
SHA-256 `2427c2eb140226a93ac32e25d49a1f60a91582758c620d238dcdd9aaf8506e4a`.
They cover inspection/declaration, refusal order, unknown qualifiers, copied
source, JSON/YAML round trips, numeric-literal diagnostics, metering and
cancellation. CONTRACT-049 states declaration returns a copied validated
Document; it creates no persistent receipt. Its shared Field-value rules
preserve unknown unrelated meanings and refuse unknown relevant qualifiers.

The operation schema/resource authority is not established by the frozen
packet; the source should inventory the exact shared Engine resources and
schemas consumed by the Rust runtime before an installed replay. The available
R5 note identifies a host-admission-order gap: wrappers admit the entire host
request before Rust sees an invalid patch, allowing a source accessor to run
before the predecessor's patch-first refusal. The packet also does not qualify
an installed package or current default-root behavior. Preserve exact source,
identity, patch, and accessor order; verify no getter re-entry, caller-copy
isolation, unknown qualifier preservation/refusal, cumulative controls, and
both JSON/YAML serialization. CONTRACT-049's numeric adapter is a separate
surface; do not claim native numeric coercion or storage semantics.

Maximum potential impact: four logical names, or eight Node/browser route
rows, only after the current R8 ledger and full retirement review are updated.

## 2. Core Record Type — two operations

Public exports are `declareCoreRecordType` and
`verifyCoreRecordTypeDeclaration`, from `src/model/record-type.ts`; Rust owns
them in `crates/umf-core/src/core_record_type.rs` with the retained runtime in
`crates/umf-core-wire/src/core_record_type_verification_binding.rs`. The exact
predecessor is
[`r5-core-record-type/frozen-typescript.json`](../r5-core-record-type/frozen-typescript.json),
SHA-256 `c4e49ee65d25abb8b7f68a189dc809ca444b6e4960cf4c4d15cfaa33560225d5`.
It covers three declaration/verification pairs and nine refusal outcomes.
CONTRACT-040 governs the ideal; the plan requires receipt-first verification
as two stages with an engine-bound, one-use handle and cumulative context
across preparation and finish. The generic tagged request, which already
contains both values, cannot establish that host ordering.

Retained runtime authority is exactly five resources: `coreSchema`,
`referenceSchema`, `packageSchema`, `constraints`, and `domainPolicy`; it
compiles the v6 receipt schema from repository source. However, R8's
versioned-resource review explicitly leaves
`spec/core/record-type-operation-v6.schema.json` authority unresolved. Default
qualification is blocked until receipt/current host order, one-use/cross-engine
handle behavior, cumulative limits, exact resource bytes/authority, and Node,
Bun, and Chromium installed behavior are replayed on a fixed-point archive.
Preserve the historical v6 receipt shape and unknown source content; no native
record interpretation or transactional-write claim follows.

Maximum potential impact: two names, or four default-root route rows.

## 3. Core Element Selection — one operation

The operation is `selectCoreElements` from `src/model/selection.ts`, owned by
`crates/umf-core/src/selection.rs`. Its frozen predecessor is
[`fixtures/validation/core-selection.json`](../../../../../../fixtures/validation/core-selection.json),
SHA-256 `f75ba587ed078e6f042b3ad584c4ad14b876f76c10e4df591b13b4fe746c10f3`,
with exact refusal cases in
[`frozen-refusals.json`](../../../../../../scripts/rust-migration/r5/selection/frozen-refusals.json).
The selection binding packet records opt-in Node/Bun/Chromium comparison;
all remain separate from installed default qualification. CONTRACT-001 and
CONTRACT-040 govern copied full-source/query results, validation before
selection, stable order, explicit `references:none|transitive`, unknown scalar
selectability by exact spelling, and cycle-safe traversal without extension
payload reference discovery.

The primary result schema `spec/core/element-selection.schema.json` is rebuilt
by `scripts/core-selection-schema.ts`; that script is the current generator.
Do not infer authority for the specialized historical Key, Relationship, or
Schema-Properties selection schemas from this operation. Host controls in the
predecessor include source/query copy limits, work-meter refusal and caller
registry validation; installed replay should retain their ordering and
zero-work/cancel/deadline preflight, raw UTF-16 identities, lone-surrogate
paths, unknown extensions, repeated edges/cycles, and no partial result.

Maximum potential impact: one name, or two default-root route rows. This is
the lowest-blocker narrow slice after the larger operation families, not a
claim that the selectors or Rust implementation are currently default-owned.

## Deferred despite Rust ownership

`inspectCoreEvolution` and `verifyCoreEvolution` have a Rust owner and a seven-
case frozen predecessor (`r5-core-evolution/frozen-typescript-0.10.json`, SHA
`672213c111d51899c0a537faae22ead1e39921538810abc30401aed4d815b3e0`). Defer
them behind the contract mismatch: CONTRACT-058 specifies a 0.8.0
precondition/profile, while the implementation packet admits current core
0.10.0 and retains a `core-0.8-absent-string-additions/0.1` compatibility
spelling. The duplicate CONTRACT-058 ID elsewhere is also unresolved. Existing
Node/Bun/Chromium opt-in artifacts are historical to later Rust wire changes.
Two exports (four route rows) are only a possible future scope after contract
reconciliation, fresh installed replay, and source/schema authority review.

Do not promote nearby core-ideal work based only on family resemblance. The
separate Avro Record Type inventory says its classifier/recovery semantics have
no Rust owner today; adapter-level Avro preservation does not satisfy that
condition. Likewise exclude Core Record Members because its default route is
already Rust-selected in the current roots and has its own staged installed
qualification; exclude key tuple work while that source family is actively
staged.

## Execution order and stop conditions

Start with Schema Properties because it has the broadest coherent four-name
Rust slice and a mature frozen predecessor. Stop before default routing if
its host-admission precedence, current exact resources, or any JSON/YAML/copy
control differs. Next qualify Record Type only after its staged host interface
and v6 schema authority are reviewable. Use Selection as a bounded lower-risk
follow-on once the fixed-point public package replay can retain the predecessor
controls. Evolution waits on contract reconciliation. Every family remains
within CONTRACT-001's preservation/resource boundaries; CONTRACT-040 does not
make native systems equivalent. Nothing in this recommendation changes the
ledger's 864 unmapped names or 922 logical default-route gaps.

## Governing inputs

- Rust migration plan SHA-256: `84dec630e2ffe57d336918684366a1b60adfd577f4270fa78b57bb270f3a296f`.
- CONTRACT-001 SHA-256: `000747cf9c84697333bb55a18c5a8a4eebd5f5c953ad08d580378d950ce9612d`.
- CONTRACT-040 SHA-256: `58b5f07693618b91f73da98fba04ba14b222285e84b33b8639eb057be7c3abd0`.
- CONTRACT-049 SHA-256: `6ced1294f64710b4a70edcaec1d470b17834b5b1a63c10ed3df70e07be1bd9f1`.
- CONTRACT-058 core evolution SHA-256: `9e97307bc2af112be54e5b103790051ce8cebdb651c0f7181e852df9502adeff`.
- R8 resource review: [`versioned-core-operation-resource-authority.md`](../r8-symbol-inventory/versioned-core-operation-resource-authority.md).
- R8 selection schema review: [`core-selection-schema-authority.md`](../r8-symbol-inventory/core-selection-schema-authority.md).

The inventory and ledger are moving inputs. Re-hash them and re-check source
route rows before any later implementation or retirement decision.
