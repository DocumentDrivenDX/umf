---
ddx:
  id: umf.evidence.rust-migration.r5-binding-index-projection
  type: execution-evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-042
      kind: verifies
    - id: ADR-006
      kind: references
---

# R5 binding-family symbol census and index projection Gate0

This packet freezes a narrow predecessor profile for a future Rust port of the
pure `projectBindingIndexes(binding, logical, lossPolicy)` operation exported
from `src/extensions/binding/index.ts`. The operation is publicly reachable
through the package root (`src/index.ts`) and is used directly by the Delta and
Iceberg projections. This is Gate0 predecessor evidence only: it does not claim
Rust implementation, cross-host binding behavior, browser qualification, or
native DDL/catalog equivalence.

## Binding-family census

The live `src/extensions/binding/` directory contains eleven TypeScript modules.
The public algorithm surface is not counted by module: the table lists the
exported operations identified during this symbol-level review. Nested local
helpers and types are omitted from the operation list. All eleven modules and
the activation/caller sources are pinned in `source-hashes.json`; no canonical
R8 census artifact existed at this snapshot, so the module and symbol map here
is a source review, not a claim derived from a completed R8 census.

| Module | Exported operations | Rust status at this source snapshot |
| --- | --- | --- |
| `index.ts` | `bindingRegistry`, `inspectBinding`, `readBindingDocument`, `writeBindingDocument`, `getBinding`, `projectBindingIndexes`, `migrateBindingRelationships`, `rollbackBindingRelationships` | Binding declarations are partly checked inside typed access codegen; the generic target capability projection, strict/report result, and exact-only candidate are absent. |
| `raw-profiles.ts` | `inspectRawTableBinding` | Typed-access admission has related raw table/profile checks; this is partial overlap, not a standalone Rust port of this exported inspector. |
| `bit128.ts` | `inspectBit128Binding`, `encodeBit128CarrierValue`, `decodeBit128CarrierValue` | `umf-core` has the opaque `umf-128/1` bit/UUID codec; that codec does not resolve binding layouts or these model carrier operations. |
| `bit128-layout.ts` | `resolveBit128ModelLayout` | No corresponding binding-layout resolver found. |
| `bit128-record.ts` | `encodeBit128Record`, `decodeBit128Record` | No corresponding model-record carrier operations found. |
| `model-associations.ts` | `expandAssociations` | No corresponding association expansion found. |
| `model-dataset.ts` | `validateBit128Dataset` | No corresponding dataset validator found. |
| `model-scalar.ts` | `checkModelScalar`, `encodeModelScalar`, `decodeModelScalar`, `scalarSqlType` | No corresponding model-scalar carrier operations found. |
| `model-shape-values.ts` | `encodeShape`, `decodeShape`, `decodeStoredShape` | No corresponding composite-shape value codec found. |
| `model-shape.ts` | `modelShapes` | No corresponding model-shape resolver found. |
| `model-source.ts` | `resolveBit128ModelSources` | No corresponding paired model-source resolver found. |

Rust overlap was checked in `crates/umf-core/src/bit128.rs`,
`crates/umf-codegen/src/access/inspection.rs`, `crates/umf-core-wire/src/lib.rs`,
and the current `bindings/core` sources. `inspection.rs` contains typed-access
binding declaration validation, index shape/reference checks, and a raw table
profile path. That path requires an empty index list for the checked subset; it
does not classify arbitrary declared indexes against target capabilities or
return `BindingIndexProjection`. This distinction prevents the source census
from overstating either the Rust coverage or the remaining work.

## Gate0 operation profile

The operation takes a binding document, its paired logical document, and
`'strict' | 'report'`. It validates the binding first. If validation reports
`BINDING_UNKNOWN`, it throws `BINDING_INCOMPLETE`; unknown content is retained
in the caller's input and never silently projected. Invalid binding or logical
identity is refused by `BINDING_DOCUMENT` with its serialized diagnostics.
Otherwise it returns the complete source and logical copies, declared target,
all ordered per-index outcomes including exact `name`, `path`, `outcome`, and
optional `reason` fields, plus the complete candidate array when allowed. A
non-exact outcome blocks the candidate under `strict`; `report` returns a report
and only exact candidate entries. This packet tests the generic
capability-planning result, not later target emission or native observation.

The frozen fixture profile is:

| Fixture | Target profile | Expected behavior |
| --- | --- | --- |
| `postgresql-indexes/case.json` | PostgreSQL 17.4 | Seven declared kinds exact; clustering not expressible; strict blocks and report retains seven exact candidate indexes in declaration order. |
| `sqlserver-indexes/case.json` | SQL Server 2022 | btree, unique, and T-SQL partial exact; five other kinds not expressible. |
| `delta/case.json` | Delta 3.2 liquid clustering | Direct-column clustering exact; changing the pinned profile to 3.1 makes it unknown. |
| `iceberg/case.json` | Iceberg 3.0 metadata sort order | Clustering is approximated because sort order is a writer hint, not enforced indexing; no exact candidate. |
| `parquet/case.json` | Parquet 2.9 file schema | All eight declared kinds not expressible; an unqualified future target yields unknown outcomes. |

`frozen-projections.json` retains complete TypeScript results for both loss
policies over all five fixture pairs: source and logical documents, target,
status, every ordered outcome and reason, and the full candidate or its absence.
`tests/rust-migration/r5-binding-index-projection-capture.ts` records the
predecessor capture procedure. Do not rerun it to refresh a changed baseline; a
source change requires an explicit new predecessor capture and review. The Gate0
test checks each complete result against this frozen file, including unchanged
input documents. It also checks exact `{code,message,path}` host errors, including
a valid unknown qualifier crossed with a semantic index error, and exact paired
logical-identity diagnostics. Boundary variants cover PostgreSQL predicate
language and version, Delta pinned version / four-column / include /
document-path limits, and Iceberg pinned version / include / document-path
limits.

`source-hashes.json` pins 200 SHA-256 inputs: the eleven binding modules; the
registry, model, validation, and core-ideal source closure; generated core model
and validator resources; binding package manifests and schemas; the core schema;
activation/caller modules; exact fixtures; package/runtime lock; capture program;
frozen reports; Rust partial-overlap sources; and CONTRACT-042. The test also
walks every relative import reachable from `src/extensions/binding/index.ts`
and fails if any discovered source or JSON resource lacks a pin. The current
closure contains 51 files, including the generated domain policy/constraint
resources and all core, binding, and binding-128 schemas/manifests. It verifies
all hashes and the exact Bun 1.4.3 runtime recorded in both the manifest and
frozen output. The test harness itself is intentionally not self-hashed.

Run the focused suites with:

```sh
bun test tests/rust-migration/r5-binding-index-projection-gate0.test.ts tests/binding/indexes.test.ts
```

Result on Bun 1.4.3: **13 tests passed, 323 assertions**. This Gate0 packet does
not replace the broader TypeScript tests or establish Rust or host parity.

## Activation and native boundary

`src/index.ts` re-exports the binding extension API. `src/projections/binding-delta/index.ts`
and `src/projections/binding-iceberg/index.ts` call this generic projection.
Delta and Iceberg then apply their own target-specific construction and
verification. CONTRACT-042 scopes Delta to its qualified liquid-clustering
metadata shape; a reader loading metadata does not prove independent writer
clustering enforcement. Iceberg's mapped sort order remains an approximation,
not an index guarantee. PostgreSQL catalog and SQL Server DDL/catalog evidence
are separate target-specific paths. None of those native claims is inferred
from this pure projection result.

The source/fixture/contract snapshot and inspected Rust overlap are pinned by
the SHA-256 values in `source-hashes.json`, captured 2026-10-24. The Gate0
operation-profile snapshot is frozen in `frozen-projections.json`; its exact
file digest is also asserted through the hash manifest. Later source changes
require a fresh predecessor capture before this packet can serve as a porting
baseline. No Rust implementation or cross-host result is asserted here.

## Opt-in Rust profile

`umf-core` now exposes `binding_index_projection::project_binding_indexes`
under the separate profile `umf-r5-binding-index-projection/0.1.0`. Callers
prepare a `BindingIndexProjectionResources` value once, then pass it to each
projection call. It owns immutable compiled core and binding schemas; no
operation Context or mutable callback is retained. Each call uses its own live
Context for source copies, core model admission, binding schema validation,
ordered outcomes and diagnostic serialization. Callers may share the prepared
value across calls without a lock held during validation or callbacks. The
prepared-resource construction cost is cold setup; per-call source and result
work remains metered. A failed call does not poison later calls, as tested by
reusing the same prepared value after a refusal.

Projection remains explicit; Delta and Iceberg activation and host bindings
remain unchanged. The Rust integration test compares all five frozen fixtures
and both loss policies against the complete predecessor JSON. Negative cases
cover unknown-content precedence, invalid index kinds, empty/malformed targets,
paired logical identity, invalid model admission, PostgreSQL predicate profile,
and Delta/Iceberg version, column, include, and document-path limits. Delta
version selection matches the predecessor regex, including refusal for `3.02`
and `03.2`. Meter denial during diagnostic serialization propagates as a host
control error. This does not establish native catalog/DDL behavior or general
`inspectBinding` parity. The TS source hashes and frozen predecessor remain the
immutable Gate0 baseline; this Rust addition does not refresh or alter them.

Focused verification on Rust 1.90.0:

```sh
cargo test --offline -p umf-core --test r5_binding_index_projection
```

Result on Rust 1.90.0: **9 tests passed**. Rust implementation/test source
hashes are reported with the change and are not part of the TypeScript Gate0
manifest.
