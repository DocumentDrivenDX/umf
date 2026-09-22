---
ddx:
  id: TD-042
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
    - id: US-042
      kind: informed_by
---

# TD-042: Implement core cardinality ideal

## Scope

Implement US-042 under CONTRACT-040. Architecture is the direct parent; no
separate solution design exists for this core slice. Field and Nullability have passed their qualified five-system gates. Cardinality
implementation starts from core 0.3.0; the native Cardinality bindings and their
admission/delivery evidence remain unfinished.

## Technical Approach

Implement container shape and referenced item/value metadata. Use checked immutable TypeScript models and trusted local
bindings. A shared projection result retains copied input, provenance, residuals
and complete candidate or block; native codecs retain authority over native data.
Trade-off: consumer access improves while loss reports and native payloads remain
necessary; a core label cannot reduce the native fidelity obligation.

### Container classification decisions

Walk checked native schema roles recursively and maintain separate container and
item/value identities. Avro arrays/maps provide explicit item/value schemas;
Parquet uses the existing interpreted LIST/MAP tree rather than the raw repeated
bit. Validate shape before descending and retain physical wrapper paths and embedded
Arrow refinements. A legacy repeated node or unknown union reports unknown until a
binding establishes its interpretation; do not assign one as a fallback.

For SQL arrays retain dimensions and lower bounds as native refinements; the ideal
sequence's position order needs an explicit rank/bounds conversion policy. For maps
retain native duplicate-key and ordering evidence: a duplicate-bearing Parquet map
cannot satisfy unique ideal keys. Down-projection may emit a declared container
encoding, but text/JSON or child-table encodings require shape/enforcement residuals.
Refresh field metadata atomically so changing one to array removes any obsolete
container scalar assertion while preserving item semantics and the original source.

## Component Changes

- `spec/core/`: add this concept and complete result/provenance/residual schema
  branches after the semantic contract; choose and document the version/profile
  transition before reserving open members (US-042-AC1/10).
- `src/model/`, `src/validation/`: typed authoring, exact facet/reference checks,
  copied access and conflict detection (AC1/2/10); do not rewrite unrelated content.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/`: source-qualified
  classifications retaining native payloads; no derived-authority guessing (AC2/6).
- `src/projections/`: explicit strict/report native bindings, candidate atomicity
  and recoverable residuals (AC3–5).
- `tests/core/cardinality-ideals.test.ts` and five native fixture directories: acceptance and boundary matrix
  (AC1–10). Use Bun host tooling in `scripts/`; portable `src/` cannot import it.

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

The CONTRACT-040 five-system row for cardinality defines required mapping behavior.
Missing or unavailable native engines are evidence gaps, never inferred passes.

## Security and Performance

Treat all model inputs as untrusted; use existing copy limits, exact token checks,
cycle-safe reference traversal and no getters/artifact code/network execution.
A resource limit blocks atomically. Existing limits (depth 128, 100,000 nodes,
4M text) remain in force; this slice makes no throughput promise. Native services
are isolated test dependencies, never browser library dependencies.

## Testing

Implement tests/core/cardinality-ideals.test.ts for authoring, conflicts, unknowns and both recovery directions.
Run the five binding matrices with native acceptance/value counterexamples and
Chromium parity, both JSON/YAML recoveries, no external browser requests and no
Node/Bun globals. AC7 retains fixtures/sqlserver/indexes-oracle.json,
fixtures/sqlserver/index-projection-oracle.json and
fixtures/avro/tablespec-oracle.json as permanent shared regression anchors;
regenerate with their existing scripts when affected, do not equate old artifacts
with evidence that the new ideal works. Repeated Parquet fields and SQL array bounds need checked interpretation; an array or map must never acquire a container scalarType.

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

Repeated Parquet fields and SQL array bounds need checked interpretation; an array or map must never acquire a container scalarType.
The mitigation is explicit bindings, exactness/refusal and native counterexamples,
not withholding the ideal. Unsupported mappings stay in scope as qualified refusals
and follow-up bindings; report mode must never imply execution enforcement.

## Review Checklist

- [x] All story ACs have implementation/test responsibilities.
- [x] Governing meaning stays in CONTRACT-040; native refinements are retained.
- [ ] Schema/version transition, five bindings and regression evidence implemented.


## Core 0.4.0 implementation decision

CONTRACT-040 reserves `cardinality` and optional `itemType` only through an explicit
0.3.0-to-0.4.0 transition. The initial schema/validator foundation checks Field
applicability, known container/scalar conflicts and exact item reference identity.
An item reference targets a Field and is permitted only for known arrays/maps;
its target may itself describe a nested container or a record-valued Field.
Recursive definitions are checked by identity without recursive expansion.

Do not silently relocate an existing scalarType onto an item or discard it when
setting array/map. Authoring must either receive an explicit consistent model or
return a conflict; original assertions remain in receipts. Old cardinality/itemType
members are opaque even when they look valid. Upgrade archives/removes both;
rollback restores the original and retains later content separately.

After the schema/transition foundation, add complete author/inspection/result
schemas, provenance verification, copied consumer selection, and versioned
Field/Nullability/record-type API integration for 0.4.0. Existing operation versions
must continue to validate their original envelopes. Run real Chromium checks and
refresh both Field and Nullability gate evidence after public library changes.
The core task stays open until those operations and acceptance checks are complete.


### Schema and transition foundation evidence

The [foundation checkpoint](../../../../fixtures/validation/core-cardinality-foundation-evidence.json)
records the new 0.4.0 document schema and complete upgrade/rollback receipt schemas.
Validation rejects scalar-labelled arrays/maps, non-Field use and unresolved or
non-Field item targets. Known-looking legacy members are archived without becoming
assertions; unknown labels, extension payloads and nested/cross-module/recursive
references retain their explicit meanings. Recursive identity checks do not expand
the type graph. Transition recovery preserves both the original and later model.

The focused suite passes 15 tests / 660 assertions. The explicitly enumerated
`tests/core/` regression passes 60 tests / 1,217 assertions across 11 files (including
those focused tests). Chromium 148 passes 18 model recoveries, 16 serialized
transition recoveries and 14 invalid-model/receipt refusals with no host globals,
external requests or invoked getters. Typechecking, 232 schema audits, 37 package
audits and the browser build pass. A prior `bun test tests/core` substring-filter
run also selected `core-ideals`; it was cancelled and is not regression evidence.

This is a foundation checkpoint, not completion of the core task or ideal admission.
Explicit Cardinality authoring/inspection, provenance/result operations, consumer
selection and versioned Field/Nullability/record-type integration still need 0.4.0
support. Existing operation versions retain their original envelope profiles.
Native Cardinality bindings and the separate admission/delivery gate are unfinished.
Prior Field/Nullability evidence fingerprints are now historical until their
required native/browser refresh follows these library changes. No native meaning
has been replaced.


### Explicit authoring and inspection checkpoint

`inspectCoreCardinality`, `declareCoreCardinality` and
`verifyCoreCardinalityDeclaration` now have complete versioned operation/result
schemas. Authoring requires core 0.4.0 and an explicit Field; inspection preserves
older lookalike content as legacy meaning. Known inspection includes a copied
item/value reference when present, but reports provenance as unverified.

The request distinguishes omitted itemType (preserve), a supplied reference (set)
and null (explicit clear). Incompatible scalar/container or item/shape combinations
fail atomically. The source archive retains replaced references, including unknown
metadata, and every unrelated extension payload stays in the target. Verification
recomputes source/request/target/provenance and refuses stale or modified receipts.
No native classification or native enforcement follows from an author assertion.

The [operation checkpoint](../../../../fixtures/validation/core-cardinality-operations-evidence.json)
records focused authoring/refusal/recovery tests and the explicitly enumerated core
regression. Chromium checks inspection, verified JSON/YAML author receipts, explicit
clear and scalar conflict alongside the earlier schema/transition matrix. This
supersedes the authoring/inspection-pending status above. Consumer selection,
versioned Field/Nullability/record-type operations, fresh prior-gate evidence and
full core-task acceptance remain unfinished, as do all five native bindings.


### Versioned existing-operation integration

Core 0.4.0 uses kind/record-type operation version 3.0.0 and Nullability operation
version 2.0.0. Prior schemas remain unchanged: kind/record-type v1 serves 0.2.0,
v2 serves 0.3.0, and Nullability v1 continues its original profiles. Inspectors
recognize the new envelope without treating existing Field/Nullability labels as
legacy. Forged version substitutions and cross-version record-author pairs refuse.

Nullability authoring changes container availability independently of cardinality
and item meaning. Kind authoring validates the entire resulting model, including
item references, so changing a referenced item Field into a record/group refuses.
Direct record-type authoring on a 0.4.0 array/map or unknown cardinality refuses;
author the record type on the referenced item/value Field instead. Missing, one
and unspecified cardinality do not invent a container and retain the existing
direct record-type operation. Generic native reference role strings remain
unverified content rather than implicit author receipts.

The [integration checkpoint](../../../../fixtures/validation/cardinality-field-operations-evidence.json)
records old/new version matrices, recursion, qualified IDs, unknown payloads,
serialized verification and conflicts. Chromium additionally verifies record-valued
item Fields and independent container availability. Existing operation schemas
were extended by new versions, not rewritten. Cardinality consumer selection and
full core-task acceptance remain unfinished; both prior gates still require their
post-library-change evidence refresh, followed by the five native bindings.


### Cardinality metadata selection checkpoint

`selectCoreElements` now supports a versioned 0.4.0 selection report and optional
`cardinalities` filter. Filters match explicitly present labels, including unknown
labels without interpreting them. Missing and unspecified remain distinct. Older
envelopes reject this filter rather than treating their opaque members as ideals.
Existing filters keep their meaning; a scalar-family query does not make an array
or map scalar.

For 0.4.0, transitive selection follows both ordinary `references` and typed
`itemType` edges, using exact module/element identities and a shared visited set.
It handles nested and mixed cycles without expanding values or merging display
names. Non-traversing selection keeps ordinary boundary references and separately
reports `boundaryItemTypes`, including original item-reference metadata, source
path and target path. The report declares its scope as
`explicit-core-references-and-item-types`. Prior report versions retain the old
scope and do not follow old lookalike itemType members.

The [selection checkpoint](../../../../fixtures/validation/cardinality-selection-evidence.json)
records 12 independently expected selection cases, copied metadata, JSON/YAML
verification, typed boundaries and tamper refusals. Chromium repeats the matrix
and verifies all three older envelope profiles remain opaque. Source validation
and unknown/native payloads remain in the report; recomputation verifies report
consistency, not provenance or native shape equivalence.

This supersedes the selection-pending status above. Core schema, transition,
authoring, inspection, versioned APIs and selection now have focused evidence.
Full core acceptance still requires the broader regression and fresh Field and
Nullability gate evidence after all library additions. Native Cardinality bindings
and ideal admission remain unfinished.


### Core-task acceptance

The [core acceptance record](../../../../fixtures/validation/cardinality-core-acceptance-evidence.json)
supersedes the pending core-task status in earlier checkpoints. All 66 refresh
commands pass: typechecking, 237 schemas / 37 extension packages, browser build,
fresh five-system Field/Nullability native and Chromium checks, the four Cardinality
browser probes, and a priority regression of 358 tests / 31,542 assertions
across 117 files. The Field and Nullability conformance tests pass separately
after evidence publication; each now rejects missing 0.4.0 dependency fingerprints.

This accepts the experimental core representation, authoring, migration, inspection,
versioned operation integration and metadata selection. It does not admit Cardinality
as a useful cross-system ideal yet. TableSpec, PostgreSQL, SQL Server, Avro and
Parquet Cardinality bindings remain pending, with strict/report loss handling,
qualified native up-classification and both recovery directions required. No native
equivalence, row-value validation or automatic native shape inference is claimed.
