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

### Typed authoring and explicit transition evidence

`upgradeNullabilityEnvelope` now explicitly moves 0.2.0 to 0.3.0. Every old
nullability member becomes a residual, including known-looking labels and values
attached to records/groups. Field roles, references and native payloads remain
unchanged. `rollbackNullabilityEnvelope` recomputes the receipt, restores the old
model, and retains the complete later 0.3.0 model separately. Altered receipts,
wrong document identity, wrong versions and malformed current models refuse. A
0.1.0 source must first use the Field transition; the inverse chain preserves
both opaque kind and availability collisions.

`inspectCoreNullability` distinguishes legacy, missing, inapplicable, known and
unknown states. Missing refers to the metadata assertion, not absence of a data
value. Explicit unspecified is a known label imposing no availability constraint.
Inspection always reports unverified provenance. `declareCoreNullability` requires
a 0.3.0 Field and records explicit author provenance/source/target; it refuses
unknown-label overwrites. `verifyCoreNullabilityDeclaration` recomputes the receipt
and rejects any subsequent model change. These are consistency checks, not
cryptographic authorship or native availability inference.

Complete JSON Schemas describe transition and operation receipts. The current
record is `fixtures/validation/core-nullability-operations-evidence.json`: 55 core
tests, 840 assertions, typecheck, 211 schemas and 32 packages pass. Chromium 148
checks 150 validation decisions, 218 document recoveries, 90 legacy collisions,
41 refusals, 100 transition recoveries, 100 forged-receipt refusals, 109 typed
inspections and 60 author declarations, with no external requests or host globals.

This supersedes the foundation's pending authoring/migration items, not its native
support limits. Existing version-qualified Field/selection APIs still need 0.3.0
integration, and prior Field source fingerprints need revalidation before the
Nullability core bead closes. All five native Nullability bindings remain pending.

### Nullability selection report integration

Core 0.3.0 now uses `urn:umf:core:element-selection:0.3.0`, exported as
`coreNullabilitySelectionSchema`. `verifyCoreElementSelection` selects the report
schema from the retained source version, then recomputes the query, selected
metadata, validation diagnostics and reference boundaries with the caller registry.
The previous 0.1.0/0.2.0 schemas and their interpretation remain unchanged.

The five scenarios cover known/missing/unknown availability, same-named fields in
different namespaces, recursive explicit links, selection boundaries and native
refinements. Mutating availability, deleting extension metadata, altering queries,
erasing diagnostics or changing boundaries fails verification. No availability
filter, native absence carrier or provenance inference is introduced.

`fixtures/validation/nullability-selection-evidence.json` records six passing
new/legacy selection tests with 97 assertions, typecheck, 212 schemas, 32 packages
and the browser build. Chromium 148 reproduces five scenarios, ten JSON/YAML
recoveries, five altered-report refusals and legacy opaque-value verification,
without external requests or Bun/Node globals.

Selection integration is complete for this revision. The versioned Field kind and
record-type integration below completes the next core API step. Prior Field evidence
refresh remains required. The Nullability core bead remains in progress; native
Nullability binding tasks remain dependency-waiting.


### Versioned Field authoring in the Nullability envelope

Kind lookup/declaration and record-type declaration use operation version 2.0.0
for core 0.3.0. Their separate published schemas are
`urn:umf:core:kind-operation:2.0.0` and
`urn:umf:core:record-type-operation:2.0.0`. Version 1.0.0 schemas remain unchanged;
legacy lookup and core 0.2.0 authoring still produce their original receipts.
The public APIs choose the receipt contract from the validated source envelope.

A record-valued Field retains its availability and native extension payload.
Changing a Field with availability to a record or group refuses because availability
belongs to a Field. Scalar/record conflicts and existing record-type relationships
still require separate reconciliation. Qualified identities and recursive links
retain their previous behavior. Every receipt archives its source; recomputation
rejects altered provenance, mixed profiles and stale current documents. Adding an
availability declaration changes the document and therefore requires fresh kind
receipts before relying on current kind provenance.

`fixtures/validation/nullability-field-operations-evidence.json` records Bun,
TypeScript, schema-audit and Chromium evidence. Focused tests pass 31 tests with
859 assertions; 214 schemas and 32 packages pass audits. The broader run passes
165 tests and fails only the expected stale Field evidence fingerprint check; it
is not a green regression gate. Browser coverage exercises 18
old/new-envelope scenarios, 36 JSON/YAML recoveries and 72 expected refusals,
without external requests or host globals. These APIs do not extend native Field
bindings to 0.3.0 and do not define an absence carrier. Prior Field evidence refresh
and core-task acceptance review remain before Nullability binding work begins.


### Core task acceptance and prior Field revalidation

The core task `umf-97221618-a91c451b` passes its expanded acceptance criteria in
`fixtures/validation/nullability-core-acceptance-evidence.json`. This supersedes
the earlier pending-integration and stale-fingerprint status above. It does not
complete US-041 or admit native Nullability bindings.

The current regression passes 163 tests across 46 files with
5,336 Bun assertions. The separately run Field gate passes 3 tests
with 24 assertions, including rejection of a removed new-operation-schema
fingerprint. TypeScript, 214 schema and 32 package audits, and the browser build
pass. All 31 prior Field native/browser/corpus commands were rerun, followed by
all three Nullability Chromium probes. The native fixtures remained unchanged.

The refreshed Field records preserve earlier result counts as history and retain
previous fingerprints. Current results and command outputs live in
`fixtures/validation/field-gate-refresh-evidence.json`; hashes were refreshed only
after those executions passed. The verifier now requires the new shared schema
and model dependencies, and its own source is included in the refresh fingerprints.

Core acceptance covers versioned metadata meaning, authoring, copied inspection,
unknown-content retention, explicit migration/rollback and the existing core API
integrations. US-041-AC1 and AC10 have core evidence. AC2–9 still require their
native Nullability classifications, strict/report projections, absence-carrier
counterexamples, recovery tests and admission/delivery gate. The five binding
beads can now proceed; TableSpec is the next implementation focus. Cardinality,
facets and key remain behind the Nullability delivery gate.

### TableSpec binding discovery: native metadata boundaries

The TableSpec binding bead is in progress. The first native probe uses the captured
model and checked-in schema from commit `647e8e566ad78b864282ec65c0b0b2237aa63084`,
verifying all 17 captured source hashes before execution. Pydantic 2.11.10 and the
checked-in JSON Schema disagree on six of 21 nullable inputs: booleans and scalar
coercions accepted by the runtime are rejected by the checked schema.

`Nullable` allows arbitrary extra values, not just booleans. Its aggregate helper
uses truthiness after excluding null entries: `{"MD":"false"}` reports nullable,
`{"MD":null}` becomes an empty map for that helper, and missing nullable metadata
also reports nullable. `{"MD":false,"MP":true}` reports required for *some*
context. None of these aggregate results establishes availability for an arbitrary
selected context. The probe does not execute a row validator or a pipeline.

These observations refine the implementation obligations:

| Native input | Binding obligation |
| --- | --- |
| Explicit boolean | Require a selected runtime profile; checked-schema disagreement cannot be hidden |
| Context map with exact boolean at selected key | Keep the selected context and original map in provenance; do not generalize to other contexts |
| Missing/null nullable or absent/null selected key | Preserve missing/unknown intent; do not adopt the helper's permissive default |
| Strings, numbers, arrays or objects used as nullable values | Report coercion or uninterpreted refinement; do not use JavaScript/Python truthiness as core meaning |
| Mixed contexts without selected context | Unspecified plus a diagnostic; strict exact projection cannot invent a context |
| No established absence carrier | No claim about omitted members, present null, defaults or row enforcement |

The down-projection must choose a profile and context explicitly, disclose where
its output fails the other profile, and retain all source obligations under report
mode. The up-classification must distinguish declared booleans from runtime
coercion/defaults and preserve the original text. The result contract and native
absence-carrier tests must be authored before exposing those APIs. A successful
metadata parse is not evidence that a native pipeline enforces ideal availability.

`nullability-tablespec-profile-oracle.py` records the 21 native observations.
`nullability-tablespec-profile.ts` exercises both native formats and adds a second
variant with an unknown root field containing exact integer `9007199254740993`.
Both native validators reject that extra field; UMF retains it unchanged. Across
84 source cases, existing Field classification and explicit 0.3.0 migration yield
168 exact JSON/YAML recoveries without inferring nullability. The native oracle
checks accepted/rejected outcomes and exact recovered values; Chromium checks the
same transformations and source recovery without host globals or external requests.
See `fixtures/validation/nullability-tablespec-profile-evidence.json`.

These are discovery and preservation results. They do not close the TableSpec
binding bead, establish either Nullability round-trip direction, or provide native
Nullability admission. Classification, strict/report projection, selected-context
and absence-carrier execution tests remain required.

### TableSpec up-classification result contract

The first binding operation is `classifyTableSpecNullability(source, request)` on
an explicitly migrated core 0.3.0 TableSpec document. The selected native column
must already be an explicit Field; this operation does not migrate versions or
reinterpret a record/group. Its request requires a column index, strict/report
mode, profile (`runtime-model`, `checked-schema`, or `unresolved`), context (a
nonempty exact key or null), and carrier (`null-value` or `unresolved`).
`null-value` is the caller's explicit mapping of the native declared nullable value
to ideal absence; it does not establish omitted-member or row-execution behavior.

Only exact native booleans establish declared availability: false → required,
true → absent-allowed. Scalar booleans require the selected runtime-model profile;
the checked-schema profile rejects them. A map requires an explicitly selected key
with an exact boolean value. Missing/null inputs, missing/null keys, coercible
scalars, nonboolean context entries, unresolved profile or unresolved carrier
produce unspecified plus a path-qualified residual. Strict mode blocks those
unresolved mappings; report mode may return a complete target with unspecified.
The original native map, unselected contexts and extension content remain attached.

Classification is scoped to the requested context and carrier, retained in the
receipt's mapping and request. A context-specific result is a semantic view for
that context, never an unconditional statement about the other contexts. Whole
native-document validation and executable enforcement are separate evidence.

An existing nullability assertion requires a verified current author receipt for
that exact member and an equal observed ideal value. Missing/stale provenance or
a different assertion blocks in both modes. A classified result retains its entire
source, request, native column fragment, binding version, diagnostics and residuals.
Receipt verification recomputes the operation and compares the entire current
target. Recovery returns the original monolithic text or complete split-file map;
unknown and rejected native content is retained, not normalized.

Publish a separate `urn:umf:core:tablespec-nullability-classification:1.0.0` schema
for this operation. It must distinguish blocked receipts without targets from
classified results, preserve declared/unknown/unsupported interpretation and
require zero residuals for strict success. This is a partial binding implementation:
authored down-projection and native absence-carrier execution tests remain required
before the TableSpec bead can close.

The classified target must also retain the chosen scope when serialized without
its outer receipt. Attach `umf.tablespec.nullability` version 1.0.0 metadata to the
selected element, with profile, context, carrier, interpretation, native path and
binding identity. Publish that extension's schema/package and preserve all existing
extension content. An existing marker or incompatible vocabulary version blocks;
classification cannot silently replace its scope. This extension describes the
binding, not a new core concept or proof of native execution. The full receipt is
still required to verify provenance or recover an archived source after edits.


### TableSpec up-classification implementation evidence

`classifyTableSpecNullability`, `verifyTableSpecNullabilityClassification` and
`recoverTableSpecNullabilitySource` now implement the result contract above.
`tableSpecNullabilityClassificationSchema` describes the operation;
`tableSpecNullabilityPackage` describes the retained element-level scope extension.
Neither profile selection nor a declared core label claims native row enforcement.
The new extension preserves unknown refinements and refuses scope replacement.

The matrix covers 21 native cases in both native formats, three profiles, selected
or missing context, and both policies: 504 operations, 272 classified targets,
232 strict blocks and 544 JSON/YAML receipt/native recoveries. Forty operations
observe exact declared booleans; the others retain unresolved meaning rather than
using runtime coercion or defaults. Pinned Pydantic/schema checks reproduce the
native declaration and recovery observations. Chromium reproduces all operations,
544 recoveries, 232 blocks and 272 forged-scope refusals, retaining scope metadata
on detached targets without external requests or host globals.

Focused tests also cover author/provenance conflicts, unresolved carriers, role
conflicts, getters, native precision, escaped context keys, unknown extensions,
malformed scope payloads and split sidecars. TypeScript, 216 JSON Schemas and 33
extension packages pass their checks. The browser build is 10,189,144 bytes.
`fixtures/validation/nullability-tablespec-classification-evidence.json` records
commands, counts, source hashes and limits.

The prior Field gate intentionally fails its source fingerprint check at
`src/index.ts` after these exports. Its old native/browser acceptance remains
historical; no all-five regression claim is made for this change. Revalidation is
required before binding acceptance. Authored TableSpec down-projection, the other
round-trip direction and native absence-carrier execution tests remain pending;
this up-classification work does not close the TableSpec bead or admit Nullability.

### TableSpec authored down-projection contract

`projectNullabilityToTableSpec(author, request)` consumes a verified current core
Nullability author receipt. The request supplies native names/type, strict/report
policy, selected profile, context and absence carrier. Native table/column names
must satisfy the pinned identifier syntax and length limit. The source remains
archived; every unprojected source property, namespace, other member and extension
obligation receives its own residual. Unknown refinements cannot disappear in
report mode or be accepted silently in strict mode.

Under `null-value`, required emits false and absent-allowed emits true. A selected
context encodes the boolean at that exact map key, accepted by both native profiles.
With no context, only `runtime-model` can emit a scalar boolean: the receipt must
report its incompatibility with the checked-in schema as a profile note, without
misrepresenting that separate profile as the selected target. `checked-schema`
without a context cannot express a required/absent-allowed assertion through this
binding. An unresolved profile or absence carrier similarly leaves the assertion
unmapped. Strict mode blocks; report mode emits a complete column with nullable
omitted and an explicit residual. Unspecified always omits nullable; no native
helper default is promoted to author intent.

The projected UMF document retains the native representation. It contains no new
core availability label, so native-only import does not recreate authored
provenance. A separate versioned projection schema covers the copied author/source,
request, encoding choice, profile notes, diagnostics, residuals and atomic target.
`recoverNullabilityFromTableSpec(receipt, nativeText)` recomputes the receipt and
requires exact current native text before returning the retained original ideal.
This recovers either an exactly encoded ideal or its explicitly residualized
assertion; it does not claim that omitted members and present null are equivalent,
or that the native metadata itself executes row validation.


### TableSpec down-projection and binding acceptance

`projectNullabilityToTableSpec` and `recoverNullabilityFromTableSpec` implement the
authored projection contract with its published operation schema. The 204-case
matrix produces 146 complete native targets, 58 strict blocks and 292 JSON/YAML
ideal recoveries. The pinned model accepts every emitted target. Exactly 26
scalar-boolean outputs are incompatible with the checked schema; their selected
runtime profile and structured profile notes disclose that boundary. The matrix
covers all ten declared native type carriers and all three ideal labels. Native
re-import confirms the observed label independently of receipt-based author recovery.
Chromium reproduces all cases, recoveries, blocks and 146 forged-receipt refusals.

The copied expectation generator and direct helper dependency are separately
pinned in `native/tablespec/nullability-runtime/sources.json`, including their
license. Great Expectations 1.15.1, Spark 4.0.1 and Java 21.0.2 execute the generated
not-null rules on an explicit string/null row schema. Ten cases establish five
executed checks, four cases with no availability constraint, and one native syntax
refusal. Required global metadata finds four absent values among seven rows;
routed MD metadata finds two among four. All three present values pass. Empty
strings and the literal string `null` remain present values.

The controls limit the execution claim: omitted members become Spark null under
the supplied row schema; absent routing makes mixed-context requiredness global;
raw null context entries and normalized empty maps generate different rules; and
an apostrophe in the context name produces an unescaped native rule that Spark
refuses. GX stores that refusal inside nested metric exception information. The
oracle checks the specific parse error rather than accepting any native failure.
The native execution harness requires a compatible JVM; this evidence uses Java 21.0.2.
Metadata projection therefore does not promise arbitrary GX/Spark execution or
JSON omission/null equivalence.

All 170 core/core-ideals regression tests pass with 11,347 assertions;
the separate Field conformance tests also pass. All 31 prior Field native/browser
commands, the three core Nullability browser probes, both TableSpec binding
matrices and native row oracle were rerun before source fingerprints were refreshed.
TypeScript, 217 schemas, 33 packages and the browser build pass. This supersedes
the earlier stale-Field-gate status above. The expanded TableSpec bead acceptance
is satisfied within these published subsets; it does not complete US-041 or admit
Nullability from one native binding. PostgreSQL, SQL Server, Avro and Parquet remain.

`fixtures/validation/tablespec-nullability-acceptance-evidence.json` links the
commands, versions, matrix/native/browser evidence, regression and current Field
gate fingerprints. The TableSpec execution checks assess availability only; other
generated expectations and whole pipelines remain outside this support claim.
