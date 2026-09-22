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


### PostgreSQL native discovery before classification

The PostgreSQL binding is in progress. Its discovery corpus now exercises 18
statements on the pinned PostgreSQL 17.4 image: 12 succeed and six produce the
expected native SQLSTATE. Evidence is in
[`nullability-postgresql-native.json`](../../../../fixtures/validation/nullability-postgresql-native.json)
and [`nullability-postgresql-browser.json`](../../../../fixtures/validation/nullability-postgresql-browser.json).
This is discovery evidence, not binding acceptance.

- Column `NOT NULL` rejects explicit NULL, while a default can supply an omitted
  input. Identity generation likewise accepts omission and rejects explicit NULL.
- A domain `NOT NULL` rejects direct NULL but accepts a domain-typed NULL produced
  by an empty subquery. The column catalog flag is false even though the domain
  flag is true. Domain and column guarantees cannot be conflated.
- `CHECK(value > 0)` accepts NULL through UNKNOWN. `CHECK(value IS NOT NULL)`
  rejects NULL despite a false column `notNull` flag. A `NOT VALID` constraint
  rejects new NULLs while an existing NULL remains readable.
- Column defaults override domain defaults; neither replaces explicit NULL.
  A generated expression can return a non-null result with a false column flag.
  An outer join produces NULL from a column declared `NOT NULL`.

The official PostgreSQL 17 documentation explains the
[domain conversion boundary](https://www.postgresql.org/docs/17/sql-createdomain.html)
and [CHECK/NOT NULL semantics](https://www.postgresql.org/docs/17/ddl-constraints.html).
The executable fixture verifies the specific cases above rather than assuming
catalog flags describe all native behavior.

Implementation must require an explicit SQL-NULL carrier and distinguish stored
relation values from input omission and query results. A true column flag is
candidate evidence for required stored values, not a claim about every query.
A false column flag alone cannot prove absent-allowed: domains, checks and other
native rules may reject NULL. Domain constraints must remain native refinements;
no arbitrary expression evaluation or unconditional domain-to-required rule is
admitted. Unresolved cases need unspecified plus residuals, blocking strict mode
when an authored obligation cannot be honored.

Commands: `bun scripts/core-ideals/nullability-postgresql-oracle.ts`,
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/core-ideals/nullability-postgresql-browser.ts`,
and `bun run typecheck` pass. JSON and YAML each preserve the captured native tree
in Bun and Chromium 148, without browser host globals or external requests.
Exact input formatting, ideal classification/projection, author recovery and
native-equivalence graduation are not established by these checks. The binding
bead remains open and these two harnesses must grow to cover both ideal round
trips before acceptance.


### PostgreSQL classification implementation checkpoint

`classifyPostgresqlNullability` now consumes explicitly migrated core 0.3.0
Fields and retained PostgreSQL 17.4 catalog captures. Its caller selects
`stored-relation`, `query-result`, `write-input` or unresolved scope, and an
explicit `sql-null` carrier or unresolved carrier. Only stored-relation/SQL-NULL
classification can currently establish an availability label.

A captured true column `notNull` flag supplies required for an ordinary or
partitioned table. A false flag supplies absent-allowed only for the implemented
built-in scalar declarations, with no generated/identity behavior, relation
constraints, unresolved relation triggers or unknown column refinements. Domain
flags, CHECK expressions and generated expressions are retained without inferred
availability. Unsupported views and unresolved cases produce unspecified plus
residuals in report mode and no target in strict mode. Malformed captures are
rejected by the existing native importer; modified captures require recapture.
The implementation does not authenticate captures or verify a live server.

The `umf.postgresql.nullability` extension package retains scope, carrier,
interpretation and native path on the classified Field, including when the target
is saved without its receipt. The operation schema describes source, target,
request, observation, diagnostics and residuals. Existing authored availability
requires a matching, current author receipt; conflicts block both modes. Recovery
recomputes the receipt, checks the entire current target and returns the exact
retained capture text, including unclaimed native data. Unknown UMF extensions
remain attached. JSON/YAML round trips do not silently reclassify them.

This is an up-classification checkpoint. Authored down-projection, ideal recovery,
full binding acceptance and the refreshed five-system Field evidence remain to be
completed. Adding this public API changes the library fingerprint, so the earlier
Field acceptance record is historical until its required rerun. Cardinality,
facets and key remain behind the Nullability delivery gate.

The [classification checkpoint evidence](../../../../fixtures/validation/nullability-postgresql-classification-evidence.json)
records 51 passing Bun tests / 1,932 assertions across 14 files; 176 Chromium
classification cases, 182 exact source recoveries and 91 altered-receipt refusals;
18 native behavior probes; successful typecheck and browser build; and audits of
219 JSON Schemas and 34 extension packages. Source and evidence hashes qualify
this checkpoint. The native oracle still measures native behavior separately
from the browser classifier; it does not establish authored native projection.


### PostgreSQL authored projection implementation checkpoint

`projectNullabilityToPostgresql` now accepts verified core 0.3.0 availability
authorship and an explicit native scalar carrier. Required maps to column
`NOT NULL`; absent-allowed maps to explicit `NULL`; unspecified emits no
availability clause. Required/absent-allowed need stored-relation scope and the
SQL-NULL carrier. An unresolved carrier or a query/input scope becomes a residual:
strict blocks without a target, while report emits a candidate without that
availability assertion. Unspecified carries no availability obligation and does
not acquire one from native defaults.

The projection audits document, module and Field metadata. Other elements,
unknown refinements, vocabulary semantics, conflicting namespaces/names and scalar
family mismatches remain explicit residuals. Selected descriptions become escaped
column comments; native type names are qualified with `pg_catalog`. Identifiers
are quoted and must fit PostgreSQL's 63-byte UTF-8 limit. This binding creates a
single table column in an existing schema; it does not execute defaults or infer
facets, keys or lifecycle semantics.

`recoverNullabilityFromPostgresql` checks the complete receipt against a fresh
projection and requires unchanged native SQL before returning the original
model, including unprojected assertions. Native-only reclassification establishes
an observation with its own provenance. In particular, SQL generated from an
authored unspecified is observed as absent-allowed; the author intent is recovered
from the receipt, not guessed from the catalog. Report-mode loss remains visible
when an unprojected required assertion produced a nullable candidate.

The native corpus includes all 14 existing PostgreSQL scalar carriers, the three
availability ideals, strict/report policies, unresolved carrier/scope, namespace
and scalar-family conflicts, unknown metadata and quoted identifiers. Native
checks execute generated DDL, attempt NULL, omitted and present values, inspect
captured declarations, recover author models and reclassify captured columns.
Browser checks use the pinned WASM parser and compare full projection receipts
with the native-run corpus through both serializations. These checks do not claim
value-domain equivalence. Final binding acceptance still requires the broader
Field/core regression and native/browser evidence refresh.

The [authored projection checkpoint](../../../../fixtures/validation/nullability-postgresql-projection-evidence.json)
records 73 policy cases: 60 native targets execute and 13 strict cases block.
Native checks recover 60 author models and 60 captured sources; Chromium recovers
120 author models across JSON/YAML and refuses 60 altered receipts. The current
classification browser rerun still passes 176 cases / 182 source recoveries.
Twelve focused Bun tests / 674 assertions, typecheck, browser builds and audits of
220 JSON Schemas / 34 packages pass. The PostgreSQL bead remains in progress until
the broader evidence refresh and acceptance review complete.


### PostgreSQL binding acceptance after the evidence refresh

The [PostgreSQL acceptance record](../../../../fixtures/validation/postgresql-nullability-acceptance-evidence.json)
qualifies both implemented directions. The expanded bead criteria include both
binding test files, native discovery/projection oracles, both Chromium probes,
current type/schema/build checks and the broader Field evidence gate. All 50
refresh commands pass. The combined core/core-ideals/PostgreSQL regression passes
206 tests / 13,404 assertions across 59 files; the separate Field
gate passes three tests / 24 assertions. All 220 schemas and 34 packages pass.

The rerun includes TableSpec's native profile and row checks, the previous
five-system Field native/browser commands, three core Nullability browser probes,
and both PostgreSQL native/browser directions. Fingerprints were refreshed only
after those commands passed. Earlier checkpoint counts and warnings that the
Field gate was stale remain historical; current linked evidence supersedes them.

PostgreSQL's qualified subset is captured 17.4 stored-column availability plus
authored single-column DDL using the existing 14 scalar carriers. Raw DDL alone,
query results, arbitrary constraints/domains, input omission and value-domain
equivalence are not inferred. Descriptions, qualified type identities, unknown
content and both receipt recovery directions have explicit checks. Unspecified
author intent remains distinct from native permission to store NULL.

TableSpec and PostgreSQL now have qualified Nullability bindings. SQL Server,
Avro and Parquet remain ready, and the experimental concept's delivery gate stays
open. This acceptance neither replaces native concepts nor completes US-041 or
the overall extension goal.

### SQL Server availability discovery

The SQL Server binding is in progress. Its pinned SQL Server 2022
`16.0.4295.3` discovery corpus distinguishes stored-column metadata from accepted
inputs and query results before any ideal classification is added.

The harness uses the existing `catalog-v3.sql` profile, retaining checks, keys and
indexes. `native/sqlserver/nullability.sql` adds a discovery section for database
metadata visibility, table triggers, alias-type nullability/bound-object IDs,
sparse/generated/hidden column flags and the original fixture DDL. These remain
native content; the new section is not yet a qualified ideal binding profile.
The v1 column-only capture does not establish that no additional constraint exists.

The native corpus covers these boundaries:

- `NOT NULL` with a default accepts omission and rejects explicit NULL. Identity
  omission generates a value; explicit NULL produces native error 339.
- An enabled but untrusted check rejects new NULLs while an existing NULL remains.
  A disabled check permits NULL. `CHECK(value > 0)` accepts UNKNOWN, whereas
  `CHECK(value IS NOT NULL)` rejects NULL despite a nullable column flag.
- `ISNULL(input,7)` and `COALESCE(input,7)` return the same value in the fixture but
  have different computed-column nullable flags. Explicit computed-column writes
  are rejected independently of result availability.
- Explicit NULL in a rowversion column generates a distinct stored value;
  explicit bytes are rejected. A required stored value therefore does not imply
  the same restrictions on every input representation.
- An alias type's inherited NOT NULL can be overridden by an explicit nullable
  column declaration. Sparse NULL remains a separate storage refinement.
- A unique nullable column accepts its first NULL and rejects its second. This
  neither establishes core identity nor makes its availability unconditional.
  An outer join produces NULL from a required base column.

Microsoft documents the [CHECK/UNIQUE NULL behavior](https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints?view=sql-server-ver16)
and [computed nullability differences](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/coalesce-transact-sql?view=sql-server-ver17).
The pinned native engine, rather than the documentation version alone, qualifies
the fixture observations.

The discovery commands are `bun scripts/core-ideals/nullability-sqlserver-oracle.ts`
and `bun scripts/core-ideals/nullability-sqlserver-browser.ts`. Browser recovery
uses the existing catalog adapter and preserves the captured tree, including the
new native section and its DDL string. It does not execute SQL or establish ideal
classification, authored projection, exact outer capture formatting, or binding
acceptance. Those remain work for the SQL Server bead. Its future classifier must
use explicit carrier/scope and retain generated/computed/constraint semantics;
it cannot negate `is_nullable` into the entire core availability contract.

The [native discovery evidence](../../../../fixtures/validation/nullability-sqlserver-native.json)
records 24 probes, ten expected native rejections and 18 captured columns. Bun and
[Chromium 148](../../../../fixtures/validation/nullability-sqlserver-browser.json)
each preserve the complete native capture tree through JSON and YAML, including
its additional metadata and original DDL string. Typechecking passes. Source and
browser-bundle fingerprints are retained. These results qualify discovery only;
they do not close the SQL Server binding bead or change the core schema.


### SQL Server up-classification checkpoint

`classifySqlServerNullability` now requires a core 0.3.0 Field and a captured
SQL Server `16.0.4295.3` catalog-v3 source. The caller selects stored-relation
scope and the SQL-NULL carrier explicitly. Query-result, write-input and unresolved
scope/carrier produce unspecified plus residuals; strict mode blocks loss.
Computed columns and assembly types require further interpretation. A noncomputed
column's declared non-nullability is not interpreted as an input-omission rule.

For absence permission, the binding requires a valid native availability
supplement with database metadata visibility, exact selected-column refinements,
and no unresolved enforcement. Enabled checks, foreign-key interactions, triggers,
other computed columns, generated values, bound rules and unknown column
refinements prevent that claim. Disabled checks remain attached; they do not
assert current NULL enforcement. Alias nullability can be overridden at a column,
but a bound alias rule remains unresolved. Unique nullable columns can permit
absence while preserving uniqueness as a separate native constraint; no core
identity is inferred.

Review found that the discovery supplement also needed `sys.columns.rule_object_id`.
The query now emits native profile `umf-sqlserver-nullability-evidence-v2`, and its
published native JSON Schema describes all captured fields. Earlier v1 supplements
remain recoverable but cannot establish absence permission. Integer tokens are
checked before host conversion, including underflow values that could otherwise
look like zero. Original DDL, source queries, unknown fields and unhandled native
rules remain attached.

The `umf.sqlserver.nullability` extension retains scope, carrier, interpretation
and native path on the target Field. The classification operation schema describes
source, request, observation, target, diagnostics and residuals. Existing author
intent requires a matching current receipt; conflicting or stale provenance blocks
both modes. Recovery recomputes the complete receipt, checks the current target
and returns the exact retained capture text. It does not authenticate the capture
or verify a live server.

Native discovery still passes all 24 probes with ten expected native rejections.
The classification matrix covers all 18 captured columns in 288 policy cases:
156 targets, 132 strict blocks and 312 JSON/YAML capture-text recoveries. Chromium
reproduces those results and refuses 156 altered receipts. Five focused Bun tests
pass with 1,962 assertions. Typechecking, browser build and audits of 223 JSON
Schemas / 35 packages pass. These results do not complete authored projection,
ideal recovery or binding acceptance. The public library changed, so prior Field
gate fingerprints require a native/browser rerun before SQL Server acceptance.

The [classification checkpoint evidence](../../../../fixtures/validation/nullability-sqlserver-classification-evidence.json)
also records 34 existing SQL Server/core Nullability regression tests with 687
assertions, alongside the five focused tests. Both suites pass. Evidence hashes
bind the native version, new supplement schema, public API, browser bundle and
recovery checks; they do not close the broader delivery gate.

### SQL Server authored projection checkpoint

`projectNullabilityToSqlServer` now accepts verified core 0.3.0 Field availability
with an explicit native scalar carrier. Required maps to `NOT NULL`;
absent-allowed maps to `NULL`. Unspecified has no authored availability obligation:
the binding chooses explicit `NULL` and records `no-authored-requirement` as its
basis. The original unspecified assertion remains in the receipt. Native-only
classification observes absence permission rather than reconstructing authorship.

This native choice makes generated DDL deterministic. SQL Server can obtain an
omitted nullability clause from session/database settings; explicit clauses are
independent of those settings, as described in Microsoft's
[ANSI_NULL_DFLT_ON documentation](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-ansi-null-dflt-on-transact-sql?view=sql-server-ver17).
The native oracle executes every emitted target under both opposing session
settings and includes omitted-clause controls that deliberately yield different
nullable flags. The projection does not mutate the caller's session settings.

Known availability obligations require stored-relation scope and the SQL-NULL
carrier. Unsupported scopes/carriers produce residuals: strict blocks, while
report emits a permissive candidate with `unprojected-requirement` as its basis.
Other source metadata, vocabulary semantics, elements, references, namespaces and
unknown extensions are audited into explicit residuals. Extended-property size
limits are also reported. Quoted Unicode names and descriptions survive native
execution; temporary, unsafe and overlength identifiers refuse.

`recoverNullabilityFromSqlServer` recomputes the entire projection receipt and
requires unchanged native DDL before returning the complete original model.
Report-mode losses remain recoverable. The 79-case corpus includes all 14 current
SQL Server scalar carriers, all three ideals, strict/report policies, unresolved
bindings, conflicting names/types, unknown metadata, long descriptions and quoted
identifiers. It emits 63 targets and blocks 16. The native oracle executes the
targets twice, checks NULL/omitted/present writes, comments and native type IDs,
and recovers/reclassifies all 63 retained models/captures. Two ambient controls
verify the omitted-clause counterexample. These probes do not establish scalar
value-domain equivalence or general SQL Server DDL conformance.

Authored projection and both retained recovery directions now have implementation
evidence. The broader Field/core refresh and final SQL Server binding acceptance
remain open. Avro and Parquet Nullability follow; no native concept is replaced.

The [authored projection evidence](../../../../fixtures/validation/nullability-sqlserver-projection-evidence.json)
records 126 native executions across 63 emitted targets, 16 strict blocks,
63 native reclassifications and 63 recoveries in each retained direction.
Chromium recovers 126 ideal models through JSON/YAML and refuses 63 altered
receipts. The classification browser rerun still passes all 288 cases / 312 source
recoveries. Ten focused/existing Bun tests pass with 765 assertions, along with
typecheck, browser build and audits of 224 schemas / 35 packages. Source and
runtime fingerprints qualify these results; broader binding acceptance remains
pending.


### SQL Server binding acceptance

The [qualified acceptance record](../../../../fixtures/validation/sqlserver-nullability-acceptance-evidence.json)
closes the SQL Server binding's implementation criteria and supersedes its pending
acceptance status above. It covers SQL Server 2022 build 16.0.4295.3, captured
catalog-v3 plus supplement v2, experimental core 0.3.0 Fields, and explicit
stored-relation/SQL-NULL policy. Authored single-column projection covers 14
existing scalar carriers. Unknown native refinements remain attached; unresolved
constraints, rules, triggers and computed/generated interactions do not become
unqualified absence permission.

All 54 refresh commands pass, including the five-system Field native/browser
checks and TableSpec/PostgreSQL Nullability regressions. Current Bun regression
passes 234 tests / 16,414 assertions across 68 files, with a separate three-test,
24-assertion Field conformance gate. Typechecking, 224 schema audits, 35 package
audits and browser build pass. SQL Server projection executes 126 targets under
opposing ANSI defaults; Chromium verifies 126 ideal recoveries and the scoped
classification matrix verifies 312 source recoveries.

The receipt preserves unspecified author intent even though its native SQL
uses explicit NULL. This differs from PostgreSQL's omitted-clause projection
and does not equate either native representation with the ideal. Stored
availability does not claim write-input or query-result behavior. Avro and
Parquet Nullability and the five-system delivery gate remain open; three
qualified bindings do not graduate native equivalence.


### Avro Nullability native discovery

The 19-schema authored corpus in `fixtures/avro/nullability-cases.json` distinguishes
present null, omitted writer API input and a field absent from the writer schema.
It covers both null-union orders, defaults matching either branch, null-only and
multi-value unions, arrays/maps with nullable members versus nullable containers,
required/optional record parents, recursive named types, enums and an unknown
logical annotation. Unknown metadata includes an integer beyond binary64's exact
range; retained source text must preserve it exactly.

The [Avro 1.12 specification](https://avro.apache.org/docs/1.12.0/specification/)
separates field defaults used during reader resolution from encoding-time field
optionality. Native evidence is qualified to Apache Avro Python 1.12.0 and
fastavro 1.12.2, not all language implementations:

- Both codecs encode omitted nullable fields as null in their default writer
  APIs, but a missing writer-schema field still requires a reader default.
- fastavro's default writer fills an omitted integer from its field default;
  Apache's writer rejects that input. With a nullable union and integer default,
  Apache writes null while fastavro writes the default. Explicit null remains
  separate from omission.
- Apache reader resolution rejects defaults that match only a non-first union
  branch in two cases; fastavro accepts them. Source branch order/defaults stay
  intact, and successful schema parsing alone proves neither reader behavior.
- fastavro's strict writer rejects all 19 omitted-field inputs, including those
  permitted by its default API mode. No single observed API mode establishes
  portable member-omission semantics.
- A null-only field has a zero-byte datum representation. Null branches in other
  unions retain their branch indices; reader union reordering still resolves by
  type. Nullable container elements do not permit a null container.

`bun scripts/core-ideals/nullability-avro-oracle.ts` uses the existing Field
archival receipts and both UMF formats before independently replaying native
operations. It asserts 171 native outcomes, 342 recovered-source outcomes, eight
reader/writer union-order resolutions and two permanent binary64-to-binary32
narrowing counterexamples. Error object addresses are normalized for stable
comparison; error classes and other message content remain recorded. Chromium
retains all 19 schemas through 38 exact source recoveries and rejects 19 altered
receipts without host globals or external requests.

These checks establish native counterexamples and archival fidelity. Core
Nullability up-classification, authored down-projection, operation/result schemas
and their strict/report/residual tests remain unfinished. The binding must scope
an explicit null-value carrier independently of writer-input and reader-resolution
behavior, retain nested/name/default/logical refinements, and avoid assigning a
scalar cardinality to container fields. No new native-equivalence claim follows.

The [discovery checkpoint](../../../../fixtures/validation/nullability-avro-discovery-evidence.json)
records source/runtime fingerprints, six existing Avro Field tests / 334 assertions
and typechecking. It is not final binding acceptance.
