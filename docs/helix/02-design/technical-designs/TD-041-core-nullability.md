---
ddx:
  id: TD-041
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
    - id: US-041
      kind: informed_by
---

# TD-041: Implement core nullability ideal

## Scope

Implement US-041 under CONTRACT-040. Architecture is the direct parent; no
separate solution design exists for this core slice. Core 0.2.0 implements the
admitted Field ideal and scalar-family metadata. Nullability remains a new
experimental slice; its five-system admission is not established.

## Technical Approach

Implement ideal availability with explicit native absence carriers. Use checked immutable TypeScript models and trusted local
bindings. A shared projection result retains copied input, provenance, residuals
and complete candidate or block; native codecs retain authority over native data.
Trade-off: consumer access improves while loss reports and native payloads remain
necessary; a core label cannot reduce the native fidelity obligation.

### Availability classification decisions

Use a three-state claim, not boolean negation of is_nullable. Each binding first
interprets its native carrier into required, absent-allowed or no assertion, then
attaches the native availability path/context. Authored unspecified supplies no
constraint; observed unspecified cannot satisfy an authored required obligation.
If two authoritative classifications disagree, retain their source claims and
report conflict rather than pick the least restrictive label. No absent member
is defaulted to required and no native default fills a missing core assertion.

TableSpec needs the selected context/runtime profile before interpreting contextual
nullability; unresolved schema/runtime disagreement stays unspecified. Avro inspects
union branches independently of reader-default rules. Parquet computes leaf
availability through ancestor definition levels instead of copying leaf repetition.
SQL bindings use explicit NULL-as-absence policies, preserving omission, default and
generated-value behavior separately. Native tests must distinguish empty container,
absent parent, present null and absent member rather than serialize all as null.

## Component Changes

- `spec/core/`: add this concept and complete result/provenance/residual schema
  branches after the semantic contract; choose and document the version/profile
  transition before reserving open members (US-041-AC1/10).
- `src/model/`, `src/validation/`: typed authoring, exact facet/reference checks,
  copied access and conflict detection (AC1/2/10); do not rewrite unrelated content.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/`: source-qualified
  classifications retaining native payloads; no derived-authority guessing (AC2/6).
- `src/projections/`: explicit strict/report native bindings, candidate atomicity
  and recoverable residuals (AC3–5).
- `tests/core/nullability-ideals.test.ts` and five native fixture directories: acceptance and boundary matrix
  (AC1–10). Use Bun host tooling in `scripts/`; portable `src/` cannot import it.

## API/Interface Design

CONTRACT-040 owns the exact ideal semantics and operation/result obligations;
CONTRACT-001 owns existing envelope/copy limits. Implement complete machine-readable
operation/report schemas before exporting new APIs. Every binding declares its
version/subset and exactness obligations; unsupported native syntax blocks safely.
Consumer selection must preserve source identity and source paths, not merge names.

## Data Model Changes

Use a separate opt-in envelope `umf: "0.3.0"`, schema ID
`urn:umf:core:0.3.0`. Versions 0.1.0 and 0.2.0 retain opaque nullability members of
any JSON shape. Version 0.3.0 interprets only nonempty string labels on explicit
`kind: field` elements: required, absent-allowed and unspecified are known;
unknown strings remain retained and uninterpreted. Missing nullability is never
filled from defaults, native flags or scalar families. Record/group elements
cannot carry this field. This version choice precedes schema publication.

Migration must be explicit from 0.2.0, archive every old nullability collision
(including known-looking strings), and preserve Field roles. A 0.1.0 source must
first use the existing Field transition. Rollback restores the retained 0.2.0
source and keeps any later 0.3.0 edits separately. Typed authoring/inspection and
operation receipts follow the envelope foundation; old 0.2.0-only operations do
not silently acquire 0.3.0 support. This is not a release or admission decision.

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

The CONTRACT-040 five-system row for nullability defines required mapping behavior.
Missing or unavailable native engines are evidence gaps, never inferred passes.

## Security and Performance

Treat all model inputs as untrusted; use existing copy limits, exact token checks,
cycle-safe reference traversal and no getters/artifact code/network execution.
A resource limit blocks atomically. Existing limits (depth 128, 100,000 nodes,
4M text) remain in force; this slice makes no throughput promise. Native services
are isolated test dependencies, never browser library dependencies.

## Testing

Implement tests/core/nullability-ideals.test.ts for authoring, conflicts, unknowns and both recovery directions.
Run the five binding matrices with native acceptance/value counterexamples and
Chromium parity, both JSON/YAML recoveries, no external browser requests and no
Node/Bun globals. AC7 retains fixtures/sqlserver/indexes-oracle.json,
fixtures/sqlserver/index-projection-oracle.json and
fixtures/avro/tablespec-oracle.json as permanent shared regression anchors;
regenerate with their existing scripts when affected, do not equate old artifacts
with evidence that the new ideal works. Distinguish present null, omission, SQL NULL, Avro reader defaults and optional Parquet ancestors; default-as-execution must not be inferred.

AC8 requires all five qualified bindings. AC9 has separate records for >=2 ideal
admission, five-system delivery and (only if pursued) native-equivalence graduation.

## Migration & Rollback

Additive does not mean collision-free: check old unknown members before reserving
names, record a version/profile transition, preserve originals and test inverse
migration. Disable new classification/projection without dropping author data.
Rollback restores the old envelope/archive plus explicit retained new assertions;
it must not fabricate those assertions in an older interpreter. Native removal
is not part of this slice and requires its own FR-28 migration/rollback decision.

## Implementation Sequence

1. Confirm CONTRACT-040 surface and document version transition; implement core
   schema/types/validators and AC1/10 before adapter changes.
2. Add five independently scoped up/down bindings with AC2–7 and retained archives.
3. Verify >=2-system admission evidence, then complete all-five AC8/9 gate before
   starting the next concept. Publish failures and residuals, not inferred support.
4. Run Bun tests/typecheck, browser build/Chromium and relevant native oracles;
   update evidence fingerprints and compatibility claims.

## Risks

Distinguish present null, omission, SQL NULL, Avro reader defaults and optional Parquet ancestors; default-as-execution must not be inferred.
The mitigation is explicit bindings, exactness/refusal and native counterexamples,
not withholding the ideal. Unsupported mappings stay in scope as qualified refusals
and follow-up bindings; report mode must never imply execution enforcement.

## Review Checklist

- [x] All story ACs have implementation/test responsibilities.
- [x] Governing meaning stays in CONTRACT-040; native refinements are retained.
- [ ] Schema/version transition, five bindings and regression evidence implemented.

### Initial envelope foundation evidence

The opt-in 0.3.0 schema, public `coreNullabilitySchema`/`NULLABILITIES` metadata,
version-qualified validation and ordinary JSON/YAML document I/O are implemented.
Older envelopes still report nullability as opaque content, including values that
look like new labels. New known/unknown availability strings require an explicit
Field; malformed values and record/group use fail atomically. Missing availability
does not inherit native flags or defaults.

`fixtures/validation/core-nullability-envelope-evidence.json` records 45 passing
core tests with 730 assertions across eight files, typecheck, all 209 schemas and
32 packages, and a 10,129,651-byte browser build. Chromium 148 matches 150
validation decisions, 218 document recoveries, 90 legacy collision cases and
41 expected refusals, with public metadata available and no external requests or
Bun/Node globals.

This is a foundation, not completion of the Nullability core bead. Authoring and
inspection receipts, explicit collision-preserving migration/rollback and 0.3.0
integration with version-qualified core operations remain required. The five
native bindings have not started. The prior Field conformance command correctly
fails its current-source fingerprint check after these changes (first mismatch:
`src/index.ts`). Its accepted 0.2.0 evidence remains historical; do not refresh
hashes alone or claim a current full regression. Reverify the affected Field
behavior before closing the Nullability core integration.
