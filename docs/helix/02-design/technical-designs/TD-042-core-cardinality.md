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

### TableSpec native discovery and binding requirements

The [native profile probe](../../../../fixtures/validation/cardinality-tablespec-profile-native.json)
executes the pinned TableSpec model, checked-in schema and schema generators at
`647e8e566ad78b864282ec65c0b0b2237aa63084`, with Pydantic 2.11.10 and Spark 4.0.1.
It covers all ten scalar declarations, EMBEDDING dimensions, unsupported containers,
unknown column content, raw generator bypasses and thirteen synthetic value cases.
This is discovery evidence; the Cardinality binding is not implemented or admitted.

The binding must preserve these distinctions:

- The ten recognized scalar declarations generate singular fields. General ARRAY,
  MAP and STRUCT declarations are rejected. Permissive native helper fallbacks and
  prefix matching do not establish a supported declaration.
- EMBEDDING is a vector declaration with a runtime-required positive dimension.
  The checked-in schema also accepts missing dimensions and dimensions on scalar
  fields that the runtime rejects. Runtime coercion accepts string/boolean dimensions
  rejected by that schema. Select the declaration profile explicitly; do not copy
  a coerced dimension back as an authored exact integer.
- Generated Spark schemas use `ArrayType(FloatType(), containsNull=True)` without
  enforcing dimension. Generated JSON schemas from raw declarations enforce exact
  length and numeric, non-null items. Empty/short/long vectors and null members are
  therefore profile-dependent. Container availability remains a separate obligation.
- Spark preserves order and duplicate vector values, but narrows the existing
  binary64 counterexample to binary32. JSON numeric acceptance does not prove float
  representation fidelity; an unqualified float family cannot discharge exactness.
- Unknown column properties pass native declaration validation but disappear from
  Pydantic dumps. Retain the original native text/column content independently.
- Full normalized dumps contain null-valued descriptions that this generator copies
  into invalid JSON Schema annotations. The value oracle validates and executes the
  raw-input generated JSON schema instead. Raw and normalized generator inputs are
  different profiles, not interchangeable views.

Implementation must classify a checked EMBEDDING as a container, never a scalar.
A caller-selected execution profile may supply qualified item metadata; retain
vector dimensions, float width and member-null behavior in the native extension.
Do not infer an item definition merely from a column name or scalar family. Nested
item references, unknown labels and authored conflicts still obey the core rules.

Down-projection requires an explicit native carrier. A general ideal array is not
identical to a fixed-dimension float vector: added length/item restrictions, member
nullability and precision loss must block strict mode or remain report residuals.
No native map declaration exists in this profile. Any text/JSON encoding must be an
explicit separate encoding with shape/enforcement loss; report mode cannot emit
unsupported MAP syntax. Retained author receipts recover meaning that native syntax
alone cannot reconstruct. Both native archive recovery and Chromium parity remain
required before the binding bead can close.

Run the discovery probe through `bun scripts/core-ideals/cardinality-tablespec-profile-oracle.ts`.
The Python entrypoint asserts native behavior and emits source fingerprints; the Bun
entrypoint verifies those fingerprints after successful completion. This command
executes no complete ingestion pipeline, GX expectations or generated SQL. The public
classification/projection APIs, extension package, operation schemas, retained-recovery
tests and browser evidence are the remaining TableSpec binding work.

### TableSpec declared-shape classification checkpoint

`classifyTableSpecCardinality` now accepts an explicitly migrated core 0.4.0
TableSpec capture with an already classified Field. Its `runtime-model`,
`checked-schema` and `unresolved` profiles preserve the native declaration split.
The complete operation schema and `umf.tablespec.cardinality` extension package
record the selected profile, native/ideal paths, source column, basis and residuals.
This profile classifies declared column shape only, not whole-model validity.

Recognized scalar columns classify as `one`; checked EMBEDDING declarations classify
as `array` with no container scalar assertion or inferred item definition. Exact
positive integer dimension tokens remain native, including integers beyond binary64
precision. String/boolean coercions and noncanonical numeric lexemes remain unknown
with residuals. Missing embedding dimensions and stray scalar dimensions distinguish
the selected checked-schema and runtime-model profiles. Unsupported native types and
unresolved profiles block strict mode; report mode retains an unspecified observation.

Existing Cardinality requires a consistent current author receipt. Conflicts and
existing binding collisions block in either mode. An authored item/value reference,
including nested/cyclic references, stays unchanged and receives an explicit residual:
this operation does not certify its meaning. Unknown native and extension content is
retained. Verified receipts recover original monolithic text or split files exactly;
modified source/target/provenance refuses recovery. Verification checks consistency,
not authenticity.

The [classification checkpoint](../../../../fixtures/validation/cardinality-tablespec-classification-evidence.json)
records 336 profile/format/policy cases, 452 native source recoveries and independent
pinned-native comparison. Chromium reproduces those cases, 110 strict blocks and 226
tamper refusals without host globals or external requests. Bun also checks split files,
authored conflicts, retained item references, unsafe input and exact number tokens.

This supersedes the classification-pending statement in the discovery checkpoint.
Down-projection, ideal-to-native-to-ideal recovery, item-aware projection and full
TableSpec binding acceptance remain unfinished. The public library addition makes
prior Field/Nullability gate fingerprints historical until their required refresh;
this checkpoint does not re-admit either ideal or admit Cardinality.

### TableSpec down-projection and retained ideal recovery

`projectCardinalityToTableSpec` and `recoverCardinalityFromTableSpec` now implement
an explicit single-Field carrier binding. The complete operation schema requires
a native type, generated-JSON/generated-Spark/unresolved profile, dimension policy,
and `requireExactValues` choice. Names are validated before rendering. EMBEDDING
requires an integer dimension from 1 through 2,147,483,647 in this request profile;
scalar carriers require null dimension. This request bound is not a claim about
TableSpec's full native dimension domain.

Scalar `one` and `unspecified` shapes can project within the declared subset.
Unspecified remains unasserted intent in the retained receipt; native-only imports
cannot recover that intent. Exact-value requests carry an explicit residual because
this shape binding does not establish value-domain equivalence. Spark FLOAT and
EMBEDDING identify the permanent binary64-to-binary32 narrowing counterexample.

General arrays projected onto EMBEDDING retain vector-dimension and numeric/float
item restrictions as approximations. The generated-Spark profile records that
native dimension metadata is not enforced by its schema; it does not delete the
metadata or treat another consumer's behavior as equivalent. Item references are
resolved by exact identity without recursively expanding cycles. Scalar family,
member availability, nested shape, record references and unknown refinements remain
in the source; unrepresented obligations receive path-qualified residuals.

Maps and incompatible carrier/shape pairs report `not-expressible` and
`encoding: carrier-only`. A report-mode candidate is only the explicitly requested
carrier; it does not claim JSON/text serialization, a child-table layout or a value
conversion. Strict mode blocks every residual and exposes no partial candidate.
Unknown document/module/element/extension content is retained and disclosed rather
than treated as projected metadata. Verified JSON/YAML receipts recover the entire
authored model only while the emitted native text and receipt remain unchanged.

The [projection checkpoint](../../../../fixtures/validation/cardinality-tablespec-projection-evidence.json)
records 78 cases, 44 emitted candidates, 88 ideal recoveries, 34 strict blocks and
44 Chromium tamper refusals. Native TableSpec validates every emitted candidate;
generated JSON schemas and real Spark schemas undergo 105 vector-value checks,
including 15 float narrowings. The combined Cardinality/TableSpec regression passes
39 tests / 4,593 assertions; typechecking, 240 schemas, 38 packages and browser build
pass. No full ingestion pipeline, generated SQL execution or map encoding is claimed.

Up-classification and down-projection now have focused native/browser evidence.
Full TableSpec binding acceptance still requires the combined entrypoints, current
five-system Field/Nullability gate refresh and broader priority regression. Cardinality
ideal admission and the other four native Cardinality bindings remain unfinished.


### TableSpec qualified binding acceptance

The [acceptance record](../../../../fixtures/validation/tablespec-cardinality-acceptance-evidence.json)
supersedes the pending TableSpec acceptance statements above. The combined Bun native
and browser entrypoints pass, with fresh declared-shape/source recovery and explicit
carrier/ideal recovery checks. All 68 refresh commands pass, including the existing
five-system Field/Nullability native/browser checks and the four Cardinality core
browser probes. The priority regression passes 365 tests / 34,378 assertions
across 119 files; both prior conformance gates pass separately after publication.

Qualification is confined to the profiles described above: declared column shape;
explicit scalar/vector carriers; retained native archives and authored ideals;
strict refusal/report residuals for vector restrictions, item obligations, exact
values and maps. A carrier-only report candidate is not a map encoding. No complete
pipeline, native-equivalence or general data conversion claim follows. The other
four Cardinality bindings and at-least-two-system admission remain unfinished.

### PostgreSQL native discovery requirements

The [PostgreSQL profile oracle](../../../../fixtures/validation/cardinality-postgresql-profile-native.json)
executes the pinned PostgreSQL 17.4 image against synthetic schemas and values.
It asserts 37 cases, including ten expected SQLSTATE-qualified rejections, and
captures eight columns' declared dimensions and type relationships. This is native
discovery only; PostgreSQL Cardinality classification/projection is not implemented.

A declaration `integer[3]` accepts empty, shorter, longer and multidimensional arrays,
non-default lower bounds, duplicate values and null members. `attndims` records the
declaration and cannot establish rank or size enforcement. Empty arrays report null
rank/bounds and cardinality zero. An explicit CHECK profile can preserve emptiness
while requiring nonempty arrays to have rank one and lower bound one; SQL NULL still
needs a separate availability assertion. Ragged multidimensional arrays are rejected,
so rectangular native arrays do not establish arbitrary nested ideal arrays.

Type category `A` is insufficient for classification. It includes standard arrays,
`int2vector`, and domains over arrays. Check the element type's array-type link for
standard arrays; preserve qualified element identity and resolve domain bases as
separate native refinements. Arrays of domains retain item constraints: the tested
positive domain rejects negative items but permits null items under CHECK semantics.
A domain over an array has no direct element type and can hold multiple ranks.
The existing general catalog capture lacks these explicit type relationships; add
a versioned supplement rather than parsing formatted type names or rewriting the
meaning of the existing capture profile. Retain original query/version/source data.

JSON and JSONB require an explicit representation policy. JSON preserves duplicate
key text; JSONB keeps the last value. Both admit scalar JSON values without an object
constraint. An object CHECK rejects JSON null/scalars but permits SQL NULL. JSONB
rejects an escaped NUL key and a number beyond its numeric domain that JSON text can
retain. Neither default coercion nor a shared map label proves exact string-key/value
coverage. Native-only classification must not invent author uniqueness or key intent.

Implementation must expose source-qualified classification and strict/report loss
for rank, lower bounds, domain refinements and JSON representation boundaries. A
single-dimensional sequence projection may use the tested explicit constraint;
member availability, scalar widths and arbitrary nested arrays remain independent
obligations. Retain source text/bytes and unknown extension content in both recovery
directions. The next work is the versioned capture supplement, complete operation
schemas, browser-safe APIs and native/Chromium round-trip matrices. No PostgreSQL
binding acceptance or second-system Cardinality admission follows from this probe.

### PostgreSQL implementation checkpoint (acceptance pending)

The implementation now supersedes the discovery-only status above. PostgreSQL
17.4 has a versioned type-relationship supplement alongside the unchanged catalog
capture profile. Native probes capture both queries in one read-only repeatable-read
transaction. Browser correlation checks overlapping observations; it does not
authenticate transaction provenance. Exact source texts and unknown tokens remain
retained, including the supplement in classified Field extensions.

Classification supports `one` for the qualified basic scalar types and domains
resolved to those types. Native arrays produce an `array` approximation with a
rank/lower-bound residual. JSON/JSONB and vector types remain `unspecified` with
an explicit residual. Existing author declarations require verified receipts;
conflicts block rather than deleting or relocating scalar/item assertions.

Down-projection selects a scalar, checked sequence, or JSONB object carrier.
Sequence checks allow empty arrays, require rank one and lower bound one for
nonempty arrays, and leave SQL NULL separate from item availability. JSONB object
checks reject scalar JSON and JSON null but permit SQL NULL. Homogeneous item
restrictions, exact-value demands, JSONB key/value limitations, nested or cyclic
item definitions, and unprojected metadata receive explicit residuals. Report-mode
carrier emission does not imply value conversion. Strict mode blocks every loss.

Both directions retain recovery receipts. The composed native oracle recaptures
emitted SQL and classifies it back: JSONB object carriers remain unspecified on
native-only classification while the retained author receipt recovers map intent.
The native matrix contains 48 projections, including nested/self item references,
opposite container/member availability and unknown extensions. It executes 26
candidates, blocks 22, and verifies 26 ideal and 26 native recoveries. Browser
projection evidence includes 52 JSON/YAML ideal recoveries. The separate scalar
capture matrix covers 26 columns with 18 strict scalar classifications.

Run `bun scripts/core-ideals/cardinality-postgresql-oracle.ts` and
`bun scripts/core-ideals/cardinality-postgresql-browser.ts` for the combined
fingerprinted native/browser evidence. These focused checks do not establish full
binding acceptance. A current five-system regression refresh, conformance checks,
and acceptance record remain required. No equivalence graduation is claimed.


### PostgreSQL qualified binding acceptance

The [acceptance record](../../../../fixtures/validation/postgresql-cardinality-acceptance-evidence.json)
supersedes PostgreSQL acceptance-pending notes above. The 70-command refresh and
377-test priority regression (34,807 assertions, 122 files)
pass, followed by both separate existing conformance gates. Qualification covers
the implemented subset described above: scalar shape, retained native array and
JSONB refinements, explicit carriers and both recovery directions. Item conversion,
unrestricted map equivalence and authenticated capture provenance are not claimed.
SQL Server, Avro, Parquet and the separate Cardinality admission/delivery gate
remain unfinished.

### SQL Server representation selection

SQL Server JSON containers are stored in text columns. Native column metadata
therefore retains its string scalar family. Logical Cardinality classification
must use an explicitly selected representation and a separate, caller-named Field
identity linked to the captured column through the SQL Server binding. It must not
remove the captured column's scalar family or relax native export consistency.
Existing logical identities are conflicts, including authored Fields; this initial
operation does not overwrite or reconcile them. Source and logical Fields remain
separately selectable by consumers.

The initial JSON profile recognizes only the exact catalog form emitted by the
pinned SQL Server 2022 ISJSON ARRAY/OBJECT fixture. The request selects a constraint
by name, and classification checks its column association, definition, disabled,
trust and replication flags. Arbitrary equivalent expressions remain unresolved.
Plain text and unqualified ISJSON do not establish an array/object interpretation.
A trusted enabled array check establishes outer sequence shape, not member types,
member availability or value-domain equivalence. Object checks permit duplicate
keys, so map classification requires an explicit approximation residual. Disabled
or untrusted checks cannot establish a stored-data shape guarantee. SQL NULL stays
separate from logical member availability; no row decoder or value conversion is
implied. Both exact native text and unknown metadata remain recoverable.

These are implementation decisions, not SQL Server binding acceptance. The native
82-case discovery record is `cardinality-sqlserver-profile-native.json`; schemas,
classification/projection APIs and their qualified acceptance remain in progress.

### SQL Server implementation checkpoint (acceptance pending)

SQL Server 16.0.4295.3 now has complete operation schemas and browser-safe
classification/projection APIs. Classification creates a distinct logical Field
and retains the original native column's scalar family. It requires explicit
representation and constraint selection, preserving trust, disabled state and
replication exemptions. Existing Field identities block instead of being
reconciled implicitly. Logical arrays have no scalar family; their source text
column remains unchanged and exportable.

Projection emits an explicitly chosen scalar or nvarchar(max) JSON carrier.
ISJSON ARRAY/OBJECT checks enforce outer shape, not member type or unique object
keys. Native NULL is explicit and stays separate from authored/member availability.
Exact-value requests, JSON value/text restrictions, duplicate keys, nested/cyclic
item definitions and unknown metadata produce retained residuals. The native
oracle confirms that binary64 `1.0000000000000002` narrows to `real` value `1.0`.
Strict mode blocks every unrepresented obligation; report mode does not claim a
row decoder, child-table layout or recursive value conversion.

Focused evidence covers 104 projection cases and all 14 declared scalar carriers,
68 emitted candidates, 36 strict blocks, 68 authored-model recoveries and 68 fresh
native-capture/logical-classification recoveries. Browser projection checks include
136 JSON/YAML ideal recoveries and 68 forged-receipt refusals. Classification has
56 representation/policy cases with 72 exact native-text recoveries; its tests also
refuse wrong column associations, replication exemptions and bypass expressions.

The combined commands are `bun scripts/core-ideals/cardinality-sqlserver-oracle.ts`
and `bun scripts/core-ideals/cardinality-sqlserver-browser.ts`. Full acceptance
requires their fresh results, the five-system refresh and the separate existing
Field/Nullability conformance gates. SQL Server qualification does not complete
Avro, Parquet, or the separate Cardinality admission/delivery gate.


### SQL Server qualified binding acceptance

The [acceptance record](../../../../fixtures/validation/sqlserver-cardinality-acceptance-evidence.json)
supersedes SQL Server acceptance-pending notes above. All 72 refresh steps and
383 priority regression tests (35,600 assertions, 124 files)
pass, followed by the separate Field and Nullability conformance gates. Support
remains limited to the explicit representation and carrier profiles documented
above; no recursive item conversion, row decoder, unrestricted map equivalence or
arbitrary constraint-expression interpreter is claimed. Avro, Parquet and the
separate Cardinality admission/delivery gate remain unfinished.

### Avro classification representation

The `present-non-null-schema` profile classifies the declared outer shape of a
present, non-null native value. It does not equate a nullable union with member
omission, apply a reader default, or assert that a codec preserves arbitrary data.
Avro maps describe exact string-key mappings at this schema level. The duplicate
binary-key and avsc `__proto__` counterexamples remain mandatory value/encoding
boundaries; schema classification does not perform those lossy decodes.

Classification publishes separately identified logical Fields, retaining the
unchanged `avro.fields` module and complete native bundle. Each unambiguous array
item or map value gets its own Field and exact native type location; nested
containers recurse through syntax locations. Null branches remain in the native
fragment and availability is not authored implicitly. Mixed container unions,
null-only types and unresolved syntax produce unspecified shape with a residual;
strict mode blocks the complete candidate, while report mode retains the residual.
Named record members retain their definition paths and native structure without
inventing a core record association. Known scalar families may be copied only onto
singular Fields, using the existing qualified Avro metadata derivation.

The operation must reject identity collisions and incompatible extension versions,
validate both input and candidate envelopes, and recompute receipts before exact
schema/dependency text recovery. This decision precedes operation/package schemas;
classification, authored projection and binding acceptance remain unfinished.

### Avro classification implementation checkpoint

`classifyAvroCardinality`, receipt verification and exact bundle-text recovery are
implemented with a complete operation schema and `umf.avro.cardinality` package.
Nested item/value Fields retain type locations, named-definition locations and
native fragments. Singular scalar families use existing Avro qualifier rules;
container and member availability remain native observations, not authored labels.

Seven focused tests pass (717 assertions). Chromium reproduces all 80 classification
cases: 58 classified, 22 blocked, 116 JSON/YAML source recoveries and 58 forged-receipt
refusals. Type checking, browser build, 249 schema audits and 41 package audits pass.
The proof is `fixtures/validation/cardinality-avro-classification-browser.json`.
Receipt consistency is not authentication: a self-consistent whitespace-only source
receipt can be recomputed, while changed native meaning and stale targets refuse.
Authored down-projection and the full binding acceptance refresh remain required;
these checks do not accept the Avro binding or run the Cardinality concept gate.

### Avro authored projection decision

Down-projection requires an explicit Avro field-type JSON text and ordered named
schema dependencies, plus native record/namespace/field names. It does not guess
integer widths or item types. Match the declared core Field and its item/value
references recursively against registered native type locations. Record each
ideal/native path pair. Mixed native container branches, missing ideal item meaning,
shape/family conflicts and unknown metadata require residuals. Native names and
structural type syntax must validate before any candidate can be emitted.

Availability mapping requires an explicit `avro-null-value` carrier selection;
otherwise independent ideal availability is retained with a residual. This carrier
concerns underlying values only, not omitted writer fields or reader defaults.
Exact-value requests require residuals because shape/family matching alone cannot
prove domain/codec fidelity; binary32 narrowing and special map keys remain named
counterexamples. Nested arrays/maps can be matched directly. Recursive record
layouts, default execution and core record associations are not fabricated.
Recovery must recompute the receipt and compare the complete generated native
bundle, including dependency identities/text, before returning the retained ideal.

### Avro authored projection implementation checkpoint

`projectCardinalityToAvro` and retained ideal recovery now implement the explicit
native-type decision above with a complete operation/result schema. Nested item
and value Fields match registered native locations; independent availability uses
the selected Avro-null carrier. Unknown source metadata, native interpretation
warnings, shape/family mismatches, missing item meaning and exact-value obligations
remain explicit residuals. Native bundle edits or forged receipts refuse recovery.

Four projection tests pass (89 assertions), including dependency edits and exact
large native tokens. The 66-case native/browser matrix emits 44 candidates and
blocks 22, with 88 serialized ideal recoveries. Apache Avro 1.12.0 and fastavro
1.12.2 pass 176 cross-codec reads; 12 float-narrowing observations remain explicit.
Chromium agrees on all receipts and refuses 44 forged receipts, without host globals
or external requests. Type checking, the browser build, 250 schemas and 41 packages
pass. Proofs are `fixtures/validation/cardinality-avro-projection-{oracle,native,browser}.json`.

This is an implementation checkpoint. Composed fresh-native classification/recovery,
expanded edge coverage, review and the full acceptance refresh remain required;
the Avro binding and separate Cardinality admission/delivery gate remain open.

### Avro composed recovery checkpoint

Fresh ingestion of each emitted candidate now classifies its native schema without
the original author receipt. For exact mappings, every mapped Field's shape, scalar
family and selected availability observation agrees. Report-mode native shapes may
differ from the original ideal; only the retained projection receipt recovers that
intent. Both fresh native and retained ideal receipts pass JSON/YAML recovery.

The expanded matrix covers null-only types/items, mixed array/map branches, fixed
values and recursive records: 78 cases, 52 candidates, 26 strict blocks, 104 ideal
recoveries and 104 fresh-native recoveries. Both pinned Python codecs pass 208
cross-codec reads with 12 explicit float narrowings. Chromium reproduces all results
and refuses 52 forged projection receipts. Five projection tests pass (207 assertions).
The combined `cardinality-avro-oracle.ts` and `cardinality-avro-browser.ts` entrypoints
validate their child-proof fingerprints. The full shared-library acceptance refresh
and separate conformance gates remain pending; this checkpoint does not close the
Avro binding or admit Cardinality.


### Avro qualified binding acceptance

The [acceptance record](../../../../fixtures/validation/avro-cardinality-acceptance-evidence.json)
supersedes Avro acceptance-pending notes above. All 74 refresh steps and
395 priority regression tests (36,524 assertions, 127 files)
pass, followed by the separate Field and Nullability conformance gates.
Classification is schema-level present non-null shape. Projection uses an explicit
native type and selected availability carrier; schema/family agreement does not
prove arbitrary value conversion or native equivalence. Recursive record lowering,
default execution and unknown refinements are not silently inferred. Parquet and
the separate Cardinality admission/delivery gate remain unfinished.

### Parquet representation prerequisite and native discovery

The Parquet binding will publish separate logical Fields for checked container
and item/value roles. Existing physical `parquet.fields` identities, scalar
families, indexes, wrapper paths, annotations, field IDs and source bytes remain
unchanged. The accepted primitive-leaf Field classifier does not authorize
classifying an arbitrary group as a Field. A logical container Field therefore
needs its own source-qualified Cardinality receipt and complete operation/extension
schemas before a public API is exported. An interpreted struct item can point to
separate record meaning; it must not acquire a scalar family from one of its leaves.

Use checked `inspectParquetContainers` results for LIST/MAP descent. Container
availability and member availability remain separate observations. A physical
wrapper is not an extra ideal array dimension. Legacy unannotated repetition,
key-only maps and malformed layouts require explicit interpretation or a residual;
do not silently treat them as the modern three-level layout. Preserve embedded
Arrow declarations independently, including large offsets and fixed list lengths.

The [Parquet logical type specification](https://github.com/apache/parquet-format/blob/master/LogicalTypes.md)
allows non-string MAP keys and specifies last-value handling for duplicate keys.
This does not make every native MAP an exact ideal map. Classifying schema-level
map shape must report unproved unique exact string keys; a unique sample is not
an enforcement proof. Retain ordered native pairs and duplicates. Strict mode
must block on those unresolved obligations. Report mode may expose map intent
with the residual and original bytes, without pretending that an object conversion
preserved all native values.

Reproducible discovery now runs with
`.venv/bin/python scripts/core-ideals/cardinality-parquet-native.py` and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/core-ideals/cardinality-parquet-profile-browser.ts`.
PyArrow 21.0.0 generates 30 Parquet 2.6 files, covering scalar, nested LIST/MAP,
record members, independent empty/null states, duplicate/non-string/special string
keys, large/fixed lists and binary32 narrowing. Two invalid native constructions
refuse. `keys_sorted=True` accepts unsorted pairs; readback has the flag false even
when `ARROW:schema` is retained. Two float cases narrow 1.0000000000000002 to 1.0.
Chromium checks 44 physical columns, 34 containers, 15 embedded schemas and 60
JSON/YAML native-byte recoveries. See
[native evidence](../../../../fixtures/validation/cardinality-parquet-profile-native.json)
and [browser evidence](../../../../fixtures/validation/cardinality-parquet-profile-browser.json).

These are discovery and existing-adapter checks, not Cardinality binding acceptance.
Public classification, authored projection, schema packages, retained ideal receipts,
legacy/malformed corpus integration and the full acceptance refresh remain required.
The preceding acceptance records remain historical checkpoints as this design evolves.
