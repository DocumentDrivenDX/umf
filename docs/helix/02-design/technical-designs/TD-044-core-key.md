---
ddx:
  id: TD-044
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: US-044
      kind: informed_by
---

# TD-044: Implement core key ideal

## Scope

Implement US-044 under CONTRACT-040. Architecture is the direct parent; no
separate solution design exists for this core slice. Experimental core 0.5.0
includes Field, Nullability, Cardinality and author-stated facets alongside
scalar-family metadata. Field, Nullability and Cardinality have passed their
qualified five-system gates, including the completed facet delivery gate. Key
implementation now begins with the explicit 0.6.0 representation decision below.
Candidate schema/validation has bounded evidence; public operations, migration,
tuple encoding, native bindings and core-task acceptance remain pending.

## Technical Approach

Implement author identity plus qualified native enforcement observations. Use checked immutable TypeScript models and trusted local
bindings. A shared projection result retains copied input, provenance, residuals
and complete candidate or block; native codecs retain authority over native data.
Trade-off: consumer access improves while loss reports and native payloads remain
necessary; a core label cannot reduce the native fidelity obligation.

### Identity and enforcement decisions

Reserve `Record.keys` as a list of named key definitions, each with an opaque
stable `id`, distinct `name`, ordered nonempty `fields` and optional `primary`.
At most one key is primary; none is permitted. Reject duplicate IDs or names,
duplicate field sets even in a different order, and missing/mismatched target-key
IDs. Resolve each authored field reference against its owning record, then validate
singular required availability and defined comparator domains. Field order is
retained for tuple encoding and native column order, but does not justify a
different uniqueness result. A key rename keeps its ID; changing its tuple under
the same ID is a conflicting semantic edit. No native index classifier writes
author key intent. Instead, attach a separate enforcement observation with scope,
predicate, enabled/trust state, null treatment and comparator evidence; reconcile
that observation with each authored key separately.

Implement `umf-key-tuple-v1` only over validated key definitions and exact lexical
values. Its binary frame, tags and shortest length rules are normative in
CONTRACT-040; `fixtures/key/tuple-encoding-v1.json` supplies golden vectors.
Compute fixed-scale decimal coefficients exactly from raw tokens/string input,
without JavaScript-number rounding. Validate Unicode scalar sequences and UTF-8
without normalization. Return a single atomic error for missing/null, float,
temporal or invalid components. Caller namespaces the bytes by document, record
and stable key ID; the encoded tuple itself is revision-independent.

For SQL targets choose at most one primary key and unconditional enabled UNIQUE
constraints for alternates, each with NOT NULL components, only after
comparator/domain compatibility checks. Native constraint names remain physical
bindings, not authored key IDs. A filtered predicate is never an
exact substitute even when a sample currently lies inside it. Disabled constraints
cannot enforce the ideal; trusted/enforced status and existing-data validation require
native evidence. SQL collation/padding cannot silently substitute for exact equality.

TableSpec primary_key is a declaration until runtime enforcement is demonstrated;
it cannot by itself carry alternate keys or stable key IDs. Avro and Parquet have
no collection uniqueness enforcement and must preserve per-key residuals.
The reverse path restores author intent from its retained report, not inference from
native uniqueness. Execute duplicate insertion outside a filter and against disabled
indexes alongside an actual unconditional-key rejection control to avoid vacuous gates.

## Component Changes

- `spec/core/`: add the plural key shape and complete result/provenance/residual
  schema branches after the semantic contract; choose and document the
  version/profile transition before reserving open members (US-044-AC1/10/11).
- `src/model/`, `src/validation/`: typed authoring, exact facet/reference checks,
  copied access and conflict detection (AC1/2/10); do not rewrite unrelated content.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/`: source-qualified
  classifications retaining native payloads; no derived-authority guessing (AC2/6).
- `src/projections/`: explicit strict/report native bindings, candidate atomicity
  and recoverable residuals (AC3–5).
- `tests/core/key-ideals.test.ts`, a key tuple encoding test and five native
  fixture directories: acceptance and boundary matrix (AC1–13). Use Bun host
  tooling in `scripts/`; portable `src/` cannot import it.

## API/Interface Design

CONTRACT-040 owns the exact ideal semantics and operation/result obligations;
CONTRACT-001 owns existing envelope/copy limits. Implement complete machine-readable
operation/report schemas before exporting new APIs. Every binding declares its
version/subset and exactness obligations; unsupported native syntax blocks safely.
Consumer selection must preserve source identity and source paths, not merge names.

## Data Model Changes

Add this concept incrementally, retaining author/classification provenance and
native extension data. An absent member on an old model asserts nothing. No
schema file changes are made in this documentation evolution. No database migration
is implicit; native DDL is reviewable output, executed only by isolated test harnesses.

## Integration Points

| Binding | Integration obligation |
| --- | --- |
| TableSpec | Pin model and checked-in schema separately; contextual/runtime discrepancies remain explicit |
| PostgreSQL | Distinguish raw declared DDL from catalog-resolved observations; use pinned native engine |
| SQL Server | Retain alias, enabled/trust/filter and comparator details; use pinned catalog capture/native oracle |
| Avro | Preserve union/default/name-resolution meaning and verify with both existing independent codecs |
| Parquet | Preserve original bytes and embedded Arrow refinements; verify with existing PyArrow/native wire oracles |

The CONTRACT-040 five-system row for key defines required mapping behavior.
Missing or unavailable native engines are evidence gaps, never inferred passes.

## Security and Performance

Treat all model inputs as untrusted; use existing copy limits, exact token checks,
cycle-safe reference traversal and no getters/artifact code/network execution.
A resource limit blocks atomically. Existing limits (depth 128, 100,000 nodes,
4M text) remain in force; this slice makes no throughput promise. Native services
are isolated test dependencies, never browser library dependencies.

## Testing

Implement tests/core/key-ideals.test.ts for authoring, conflicts, unknowns and both recovery directions.
Add normative key tuple vectors for scale-preserving decimal identity, Unicode
normalization distinctions, empty versus absent, and float/temporal refusals.
Run the same vectors in Bun and Chromium; do not claim native oracle agreement
from these design fixtures alone. Test two named keys, an optional primary,
name/order-preserving stable IDs, duplicate field-set refusal and explicit
target-key lookup as a prerequisite for the relationship slice.
Run the five binding matrices with native acceptance/value counterexamples and
Chromium parity, both JSON/YAML recoveries, no external browser requests and no
Node/Bun globals. AC7 retains fixtures/sqlserver/indexes-oracle.json,
fixtures/sqlserver/index-projection-oracle.json and
fixtures/avro/tablespec-oracle.json as permanent shared regression anchors;
regenerate with their existing scripts when affected, do not equate old artifacts
with evidence that the new ideal works. Require singular present key components and compatible equality. Native primary-key observations cannot invent author identity intent; Avro/Parquet retain key residuals.

AC8 requires all five qualified bindings. AC9 has separate records for >=2 ideal
admission, five-system delivery and (only if pursued) native-equivalence graduation.

## Migration & Rollback

Additive does not mean collision-free: check old unknown `key` and `keys`
members before reserving the plural name, record a version/profile transition,
preserve originals and test inverse migration. The earlier singular `Record.key`
was proposed but never published as a schema member, so no document may be
silently upgraded from it. Disable new classification/projection without dropping
author data.
Rollback restores the old envelope/archive plus explicit retained new assertions;
it must not fabricate those assertions in an older interpreter. Native removal
is not part of this slice and requires its own FR-28 migration/rollback decision.

## Implementation Sequence

1. Confirm CONTRACT-040 plural-key surface and document version transition;
   implement core schema/types/validators, stable key-ID lookup, atomic tuple
   encoder and AC1/10–12 before adapter changes.
2. Add five independently scoped up/down bindings with AC2–7/13 and retained archives.
3. Verify >=2-system admission evidence, then complete all-five AC8/9 gate before
   starting the next concept. Publish failures and residuals, not inferred support.
4. Run Bun tests/typecheck, browser build/Chromium and relevant native oracles;
   update evidence fingerprints and compatibility claims.

## Risks

Require singular present key components and compatible equality. Native primary-key observations cannot invent author identity intent; Avro/Parquet retain key residuals.
The mitigation is explicit bindings, exactness/refusal and native counterexamples,
not withholding the ideal. Unsupported mappings stay in scope as qualified refusals
and follow-up bindings; report mode must never imply execution enforcement.

## Review Checklist

- [x] All story ACs have implementation/test responsibilities.
- [x] Governing meaning stays in CONTRACT-040; native refinements are retained.
- [ ] Schema/version transition, five bindings and regression evidence implemented.

## Experimental 0.6.0 implementation decision

CONTRACT-040 now reserves plural keys and explicit Record membership in 0.6.0.
Use `spec/core/key-document.schema.json` for the candidate and
`src/validation/keys.ts` for portable whole-document semantic validation. Begin
with a candidate validator; keep public `validateDocument` and authoring on the
existing versions until versioned operation schemas and migration are integrated.

Add explicit `Record.members` to supply the ownership check required by Key.
Generic reference roles remain uninterpreted. Validate identity resolution, unique
ownership, per-record key IDs/names, duplicate component sets, optional primary,
required singular components and exact scalar domains. Preserve unknown qualifiers
and diagnose them separately from invalid declarations. Exercise these checks in
Bun and Chromium with copied input and both JSON/YAML recoveries.

Then add key authoring/inspection and stable-ID lookup, exact tuple encoding,
0.5.0-to-0.6.0 migration/rollback, versioned earlier operations and selection.
Changing a key tuple under an existing ID is an explicit conflict; renaming a key
or reordering the keys list preserves identity. Public candidate support is not
admission. Refresh compatibility evidence after the integrated physical-binding
work and Key implementation; earlier gate fingerprints identify their historical
execution commits and must not be relabeled as current native runs.

### Candidate tuple implementation

Implement `src/model/key-tuple.ts` against the candidate validator and complete
`spec/core/key-tuple-operation.schema.json` before public exports. Encode exact
numeric coefficients without Number conversion; retain lexical inputs in the
receipt. Bound exponent expansion and byte output, and never allocate a power
based only on a potentially enormous integer-width facet. Validate Unicode scalar
sequences before UTF-8 encoding. Receipt verification recomputes canonical framing
and current source context before bytes are read. Test the normative vectors,
explicit boundaries/refusals, stable IDs after renaming/reordering, forged frames,
unknown qualifiers, no-getter behavior and Bun/Chromium parity.

### Candidate transition checkpoint

Internal `upgradeKeyEnvelope` and `rollbackKeyEnvelope` now implement the chosen
0.5.0/0.6.0 collision boundary with complete operation schemas and Bun/Chromium
evidence. Receipts are checked by recomputation; the original and later envelopes
remain separately recoverable. See the [implementation evidence](../../04-build/evidence/key-core-implementation.md#explicit-key-migration-and-rollback-candidate).
Public activation and versioned operations remain pending; this checkpoint does
not substitute for their compatibility refresh or native Key bindings.

### Public integration boundary

Publish key authoring/inspection and stable-ID lookup with complete operation
schemas, then activate 0.6.0 document validation/serialization. Preserve custom
Registry extension validation when checking the inherited 0.5.0 meanings. Keep
old schemas immutable and add kind/record-type operation v5, nullability v4,
cardinality v3 and facets v2 for 0.6.0. Target validation must reject older core
operations that would invalidate a key component or Record membership.

Add a 0.6.0 selection schema with separate membership and key-component boundary
arrays. Export the key document, operation, transition, tuple and selection
schemas/APIs through the public browser entry point. Verify new operations, older
receipt compatibility and a real public browser build before reporting this
integration; core-task acceptance still requires the compatibility/native refresh.
