---
ddx:
  id: CONTRACT-040
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# CONTRACT-040: UMF core ideals and qualified native bindings

**Type:** semantic schema/library contract. **Version:** proposed core semantic
revision 1. **Status:** Field ideal admitted for the qualified bindings recorded
below; Nullability core APIs have passed core-task acceptance but have no native
binding admission. Its five native bindings and the later ideals remain incomplete.

## Purpose

Separate defining UMF meaning (FR-3) from claiming that core replaces a native
concept (FR-28). Consumers read the ideal; adapters retain native representations
(FR-20). Nothing here relaxes FR-21 or authorizes silent normalization.

## Scope and Boundaries

The ordered implementation is field, nullability, cardinality, author-stated
facets, then key. Every concept MUST support authored ideals and qualified native
up-classification. scalarType remains the existing nine-family ideal, not proof
of equivalent widths, equality, coercion or execution. OWL, DDD lifecycle,
physical encodings and default-as-execution remain extension-owned.

An ideal MAY enter core before native systems agree. Its admission record MUST
contain written meaning, counterexamples, a down-projection to at least two of
TableSpec, PostgreSQL, SQL Server, Avro and Parquet, plus up-classification retaining
unknown native detail. A projection includes an explicit refusal where necessary,
but a concept with only refusals and no useful emitted target cannot meet useful
cross-system admission. Admission MUST NOT be reported as all-five completion.
Each of the five bindings remains a required delivery, with a version/subset,
accepted and rejected fixtures, both round trips and native/browser evidence.

Only a separate equivalence graduation may justify replacing native meaning:
independent two-way mappings without material semantic change, documented
preconditions/counterexamples, migration/rollback, zero native/unknown regressions.
No operation here removes a native payload, even when a mapping is exact.

## Normative Surface

The following is the proposed semantic surface, to be added incrementally after
this contract. Existing documents do not acquire these assertions by default.

| Element | Shape | Meaning and validation |
| --- | --- | --- |
| Element.kind | `field`, `record`, or `group` | A field is a named member/value slot; a record defines named members; a group organizes members without asserting a value shape. Missing means unspecified, never inferred solely from scalarType. |
| Element.nullability | `required`, `absent-allowed`, or `unspecified` | Required means the field supplies a value in the ideal instance; absent-allowed permits no value; unspecified asserts neither. This is ideal value availability, not native syntax or an is_nullable copy. |
| Element.cardinality | `one`, `array`, `map`, or `unspecified` | One value, ordered finite sequence (duplicates allowed), finite mapping with unique exact string keys, or no assertion. Container emptiness is not absence. |
| Element.facets.length | `{max: integer >= 0, unit: "unicode-scalar" or "byte"}` | Maximum Unicode scalar count for string, or maximum byte count for binary. No grapheme, collation, padding, normalization or storage-length inference. |
| Element.facets.precision | positive integer | Decimal coefficient digit bound for fixed-scale decimal. Requires scale. |
| Element.facets.scale | integer >= 0 | Fixed decimal fractional digit count; requires precision, with scale <= precision. Value domain is integer coefficient times 10^-scale and absolute coefficient < 10^precision. No rounding permitted implicitly. |
| Element.facets.integerWidth | `{bits: positive integer, signed: boolean}` | Signed domain [-2^(bits-1),2^(bits-1)-1] or unsigned [0,2^bits-1]. Mathematical value domain, not physical storage width. |
| Record.key | `{fields: nonempty ordered list of element references}` | Author assertion that the tuple identifies a record within that record collection. No duplicate references, cross-record fields, absent fields, arrays or maps. Required singular fields and defined equality are necessary. |

Nullability/cardinality/facets apply to fields only. A record-valued field is
still a field with one/container cardinality and a record reference; its record
definition is kind record. A group is not an implicit record. scalarType on an
array or map MUST NOT describe the container as scalar. Element-type information
MUST use a referenced field/value definition or remain native; the implementation
MUST NOT erase a container to retain an existing scalar label. Existing element
references retain CONTRACT-001 identity rules; display names are not identity.

Integer facets apply only to integer, decimal facets only to decimal, string
length only to string and byte length only to binary. All numeric facet tokens
MUST be checked exactly before host-number conversion; a rounded near-integer
cannot become a valid bound. Invalid combinations fail atomically. A missing
facet imposes no such restriction and MUST NOT be populated from a target default.
Unqualified float never guarantees exact binary64 transport or binary32 narrowing.
An exactness request is a projection obligation, not a new float width inference.

Ideal absence deliberately leaves its native encoding unspecified. A binding MUST
say whether absence uses an omitted member, SQL NULL, an Avro null branch, or
another carrier. If a native domain distinguishes present null from omission,
classification MUST retain that distinction and report a residual rather than
collapse both states. Required does not mean a stored column has no SQL NULLs
unless the chosen binding establishes that obligation. Native defaults, read
resolution, generated values and Protobuf presence never follow from this label.
TableSpec contextual rules cannot become unconditional claims; unresolved model
versus JSON Schema disagreement MUST produce unspecified with diagnostics.

Key is asserted identity, not an observed index, DDD lifecycle, foreign key or
storage locality. For the initial portable key subset, equality is exact boolean,
mathematical integer/fixed-scale decimal, Unicode scalar sequence, or byte sequence
equality. Floating and temporal key equality remains unspecified and MUST block
rather than borrow a native comparator. Case-insensitive collation, trailing-space
comparison or padded types require explicit comparison evidence or residual loss.
A native primary/unique key can supply an enforcement observation, but MUST NOT
invent author identity intent. Existing authored identity may be recovered from
retained provenance/residual; observation alone does not assert it.

### Binding and result obligations

An operation receives the ideal or preserved native document, declared native
version/subset, explicit field/container bindings, loss mode `strict` or `report`,
and any requested exactness obligation. No live database, implicit network access
or artifact-supplied code execution is permitted by the browser library.

The result MUST carry a copied source, mapping/provenance records, diagnostics,
residuals, and an optional complete candidate; no partial candidate on block.
Every interpreted assertion MUST distinguish `authored` from `classified`, and
identify its ideal path, native path, binding version and the basis of the claim.
Classification cannot overwrite authored intent; conflict is diagnosed. Invalid or
stale classification requires recomputation from the retained native payload or
an explicit block, never last-writer-wins reconciliation.

Each mapping outcome is `exact`, `approximated`, `not-expressible`, or `unknown`.
A residual retains the source assertion/native fragment and source path, target
path if any, reason, versioned binding and recovery information. These outcomes
refer to stated ideal obligations, not all native semantics. Retention in a
sidecar does not make an unenforced target constraint exact.

`strict` MUST block any requested obligation with a non-exact outcome. `report`
MAY emit a candidate with explicit residuals, but cannot bypass malformed input,
unsafe encoding or unsupported target syntax. Omitted concepts MUST be reported;
no successful status can hide unknown enforcement. Author intent and native
refinements survive both policies, including blocked operations.

For `ideal → native → ideal`, the imported native target plus retained report
MUST recover the ideal, or explicitly return the original ideal assertion as a
residual with its non-recovery reason. A native-only reimport without the report
MUST NOT claim to reconstruct author intent that native syntax did not encode.
For `native → ideal → native`, untouched native text or bytes outside the ideal's
claim MUST be recovered exactly from the retained source, including unknown fields.
Explicit native edits are separately reported with a retained original archive;
semantic equivalence of regenerated text alone cannot replace this recovery test.

## Five-System Mappings

These are required binding rules and counterexamples, not implementation claims.
All entries obey strict/report behavior and retain the original native payload.

| Ideal | TableSpec | PostgreSQL | SQL Server | Avro | Parquet |
| --- | --- | --- | --- | --- | --- |
| Field/record/group | Native column → field; table → record; contextual/provider grouping does not create records | Catalog column or qualified DDL member → field; table/composite structure → record; preserve unresolved type and native IDs | Captured column → field; table → record; retain computed/alias metadata | Record members → fields and record definition → record; union is not automatically a group | Checked schema leaf → field; group node requires interpreted logical/container role before record classification |
| Nullability | Explicit selected runtime/context binding only; disagreement → unspecified/residual | Required projection uses NOT NULL; NULL absence binding explicit; native nullable permits NULL, not omitted SQL members | Same explicit NULL carrier; defaults/generated values are separate | Required selects non-null branch; absent-allowed selects explicit null union binding; missing reader field/default rules stay native | Required/optional repetition needs checked ancestor levels; optional group absence differs from optional leaf; absent-allowed binding explicit |
| Cardinality | Simple column → one where established; EMBEDDING/vector is not silently an array scalar; unsupported containers residual | Arrays can approximate ordered sequences only with rank/lower-bound/domain obligations; JSON/JSONB map binding must disclose shape/enforcement; no default native map | Singular columns → one; JSON/text or child-table containers require explicit layout and enforcement losses | Array maps to sequence with item schema; map to exact string-key mapping with value schema; unions retain branches | LIST/MAP only after structural/logical interpretation; legacy repeated field does not automatically mean non-null array; duplicate map keys/order distinctions residual |
| Facets | length/precision/scale only under demonstrated runtime meaning; integer storage width not implied | integer widths map when exact domain matches; numeric(p,s) fixed-scale profile; varchar character bounds require Unicode/unit and padding evidence | integer types require signedness/domain checks; decimal(p,s); nvarchar length counts UTF-16 units, varchar length depends on encoding—no silent Unicode-scalar mapping | int/long only supported width/domain; decimal bytes/fixed precision/scale checked; string/bytes length is unenforced residual | signed/unsigned integer annotations and physical capacity both checked; decimal precision/scale interpreted; FIXED_LEN_BYTE_ARRAY is exact byte size, not merely maximum length |
| Key | primary_key declaration retained, but native enforcement/identity intent cannot be assumed | Emit primary key or unconditional enforced uniqueness plus NOT NULL with compatible equality; filtered/partial indexes refuse exact key binding | Emit primary key or unconditional enabled enforced uniqueness plus NOT NULL and compatible equality; filtered or disabled unique indexes refuse exact key binding | No collection uniqueness/identity enforcement; preserve author assertion as residual, strict blocks | No collection key enforcement; sorting/statistics/field IDs are not keys; preserve residual, strict blocks |

For narrower integer widths, a wider SQL storage type plus explicit bounds may
honor the ideal if the constraint is actually enforced. Avro/Parquet width claims
MUST distinguish representable values from enforced constraints. For decimals,
source conversion that rounds extra fractional digits must be reported under an
exactness obligation even when target storage has the requested precision/scale.

Permanent counterexamples: SQL Server filtered uniqueness admits rows outside its
predicate, and disabled uniqueness admits duplicates; neither establishes ideal
key enforcement. Native evidence is fixtures/sqlserver/indexes-oracle.json and
index-projection-oracle.json. Binary64 `1.0000000000000002` narrowed to binary32
`1.0` is loss, even when both have scalarType float; evidence is
fixtures/avro/tablespec-oracle.json. These constrain bindings, not ideal admission.

## Precedence and Compatibility

Owner direction and FR-3/FR-28 supersede earlier blanket equivalence prerequisites
for core inclusion. CONTRACT-001 remains the current executable envelope; this
contract governs its next semantic revision. Existing documents with no new fields
MUST remain readable and MUST NOT gain requiredness, one-cardinality or key intent.
Unknown future labels/fields remain recoverable and block unsafe interpretation.

Before reserving a previously open core member name, the implementation MUST test
collisions with preexisting unknown content and define an explicit version/profile
transition. It MUST NOT reinterpret old unknown data merely because its key matches.
The exact released envelope version is an implementation decision recorded before
schema publication, with migration and rollback fixtures preserving original data.
No runtime code or schema changes are part of this authoring evolution.
The strict/report names here describe the new ideal-operation policy; existing
projection APIs and their names (including allow-reported-loss) remain valid
legacy surfaces until an explicit adapter or migration maps them to this contract.

## Error Semantics

Malformed ideal or facet combination: reject with path-qualified diagnostic.
Unsupported native version/encoding: block, retain source. Unknown or conflicting
classification: retain native and authored claims, report unknown/conflict; no
unsafe target. Non-exact projection: strict blocks; report retains explicit
residual and may emit a complete structurally valid candidate. Retry requires
changed input/policy/binding, never implicit coercion.

## Examples

An authored record Order has a field id with integer family, one cardinality,
required availability, signed 64-bit width and a record key referencing id.
PostgreSQL bigint PRIMARY KEY is a candidate exact binding within the declared
integer equality/domain scope. Avro long carries the value domain but cannot
constrain duplicate records: strict key projection blocks; report emits a schema
and the key residual. Native reimport without that residual cannot infer identity.

A string field permitting absence with maximum three Unicode scalars is not
exactly represented by SQL Server nvarchar(3): supplementary characters consume
two UTF-16 code units. A native length annotation alone cannot satisfy the ideal.

## Validation Checklist

- [x] Ideal admission and equivalence graduation have distinct evidence gates.
- [x] Meanings, nonimplications, five-system mappings and counterexamples are explicit.
- [x] Strict/report outcomes and both round trips retain source/residuals.
- [ ] Envelope/version transition and complete result schemas implemented.
- [ ] Five concept stories pass native, Bun and Chromium acceptance across five systems.
- [ ] Any later native replacement passes its separate migration/rollback gate.

### Explicit record-type reference authoring

The experimental Field authoring API may append a `record-type` reference to a
Field, identifying a separate record definition by module/element identity. This
operation requires verified Field and record kind declarations over the same
current document. A scalarType-bearing Field cannot also assert a record type.
One operation asserts one record type; pre-existing `record-type` references block
rather than being adopted, overwritten or silently assigned provenance. Other
reference roles and unknown extension content remain unchanged.

The operation receipt supplies the interpretation and authored provenance. A bare
role string in an older or imported document does not establish this assertion.
The receipt retains the source, target, both declarations, reference path and
record-definition path; verification recomputes it against the unchanged current
model. It asserts neither nullability/cardinality nor native equivalence. Recursive
record membership and same-named records in different modules are permitted;
identity resolution must terminate without expanding recursive definitions.

### Versioned selection reports

Core 0.2 selections use a separate `urn:umf:core:element-selection:0.2.0` schema.
The existing 0.1 result schema remains unchanged. A selection report preserves the
complete source and checked query, selected elements, reference boundaries and
validation diagnostics. Schema validation establishes structure only; report
verification must recompute selection from the retained source/query with the same
registry and compare all results. Unknown reference roles remain traversable links,
not verified record-type semantics. Recursive references terminate by identity.

### Shared authored Field report inspection

A versioned shared inspection report may wrap the five priority authored Field
projection receipts without discarding their native-specific representation.
Inspection MUST recompute the adapter operation and reject inconsistent receipts.
It exposes authored origin, ideal/native paths, the selected native carrier as the
mapping basis, and the complete versioned binding on each mapping and residual.
Residuals retain their source path/value, outcome, reason and receipt-based recovery
instruction. A null target path explicitly means that no mapped native property is
claimed for the unexpressed assertion. The original receipt remains authoritative
for native export/recovery and is retained in full.

This report covers single authored Field projections only. It does not certify
native enforcement, normalize native types, turn source retention into exactness,
or add author provenance to native-only classifications. Verification checks
consistency, not cryptographic authenticity. PostgreSQL inspection still requires
the caller's explicitly supplied pinned parser backend; no implicit host access.

The shared authored inspection profile also applies to flat-record projection
receipts. A record mapping identifies explicit authored membership as its basis;
each Field mapping identifies its own selected native carrier. Mapping order and
member paths remain those of the recomputed adapter report. Missing member bindings
remain blocked residuals, never manufactured Field mappings. This does not expand
the underlying adapter's nested-structure or enforcement support.

Shared native Field classification inspection uses the same retained-receipt and
recomputation discipline, but origin is always `classified`. It retains each
adapter's native fragment, source path, dependency identity where present and
classification basis. Conflicts retain their source assertion with an unknown
outcome and the binding/recovery instruction; they do not become authored intent.
The initial profile covers TableSpec captured columns, PostgreSQL/SQL Server
catalog columns, Avro members and checked Parquet primitive leaves. Raw DDL and
record/type classifications require separately declared coverage.

Shared structured-classification inspection covers existing record mappings,
PostgreSQL captured composites, and Avro/Parquet record-type links by retaining
ordered mappings and recomputing their exact adapter operations. PostgreSQL raw
DDL inspection additionally exposes `declared-only` scope and namespace-resolution
state. It requires the explicit pinned backend and cannot imply catalog expansion,
execution, or resolution of an unspecified search path. Record/type coverage is
limited to each retained binding's published version and subset.

### Field admission and qualified delivery decision

The Field ideal is admitted in experimental core 0.2.0. Its meaning is the
`Element.kind` row above: a named member/value slot, a record definition, or an
organizational group. Names, scalar families and opaque scalar-like annotations
do not substitute for kind. Kind does not assert nullability, cardinality, facets,
keys, DDD lifecycle, storage layout, coercion or executable defaults.

This decision separates three claims:

1. **Ideal admission: passed.** Five bindings provide useful native targets,
   qualified up-classification and retained unknown/native content, exceeding the
   two-binding admission minimum. Strict mode blocks the unknown author obligation;
   report mode retains it and emits a complete candidate. Both receipt formats
   recover the complete ideal or original native archive. Group/name confusion,
   stale provenance, unknown labels and legacy-member collisions remain refusals
   or explicit preserved content.
2. **Five-system Field delivery: passed within published subsets.** TableSpec
   pinned commit `647e8e566ad78b864282ec65c0b0b2237aa63084`, PostgreSQL 17.4,
   SQL Server 16.0.4295.3, Apache Avro 1.12.0/fastavro 1.12.2 and Parquet format
   `219e3f12a62f9476e830c21e26d030d231f7c017` with PyArrow 21.0.0 have native and
   Chromium evidence. The acceptance records retain each binding's limits; this
   is not complete native-language conformance or a general row transformer.
3. **Native equivalence: not claimed.** No native concept or extension payload is
   removed. No replacement migration is authorized. Filtered/disabled indexes do
   not assert identity, and equal scalar families do not excuse float narrowing.

`fixtures/validation/field-conformance.json` records current round-trip coverage
and fingerprints of the four acceptance records. `bun scripts/core-ideals/field-conformance.ts`
recomputes policy/recovery and checks those records against the current files; it
fails on changed fingerprints or missing evidence. It does not impersonate a fresh
native engine run. Native/browser executions are recorded in the referenced
acceptance evidence and the Field gate refresh evidence.

The envelope remains experimental: admission of one ideal does not stabilize the
whole envelope or imply author provenance from a bare label. Nullability is the
next ordered concept, with its own contract interpretation, schema transition,
five binding tasks and exit gate. This decision does not admit the later concepts.

### Experimental Nullability envelope boundary

Core 0.3.0 reserves `Element.nullability` only on explicit Fields. Core 0.1.0 and
0.2.0 retain that member as opaque JSON, even for strings that resemble the three
new labels. No reader silently upgrades those documents. The 0.3.0 validator
retains unknown nonempty labels with an incomplete-semantics diagnostic and rejects
non-string values and non-Field use. Missing availability asserts nothing.

TD-041 records this version choice and the initial validation/preservation evidence.
Typed inspection/authoring and migration/rollback now have schema, Bun and browser
evidence in TD-041. Selection and versioned Field authoring APIs now accept 0.3.0. Prior Field evidence
revalidation and core-task acceptance now pass; native binding tasks remain open. This does not
establish any native absence binding,
Nullability admission, or equivalence with SQL NULL or Avro reader defaults.


Nullability inspection's `missing` state means no metadata assertion; it does not
mean a missing data value is allowed. `known` with `unspecified` preserves an
explicit no-constraint declaration. `inapplicable` identifies a non-Field under
0.3.0, while `legacy` and `unknown` preserve uninterpreted values. Reading these
states does not establish authored or classified provenance. An author declaration
retains its entire source and records only ideal availability, with no native path.
Any later model change invalidates that receipt for current-provenance purposes.


Core 0.3.0 selection reports have a separate versioned schema. Verification uses
the source envelope version; it cannot adopt the 0.3.0 availability interpretation
for a 0.1.0 or 0.2.0 source. Selection retains full source context, unknown labels
and extension payloads. Recomputed query, diagnostics and reference boundaries
must match the receipt. Recursive traversal remains identity-bounded; an unknown
reference role is not promoted into a verified semantic relationship.


Core 0.3.0 kind and record-type authoring use operation version 2.0.0, with separate
schemas and binding versions. The previous operation schemas remain unchanged.
A record-valued Field retains nullability; a role change that would make that
availability assertion invalid refuses. Verification checks the entire retained
source and target, so a later availability edit requires renewed kind/type receipts.
The API extension does not admit native 0.3.0 projections or change legacy opaque
nullability interpretation.


### TableSpec Nullability binding qualification

TD-041 now records one implemented Nullability binding: TableSpec metadata under
explicit profile/context/carrier, with a retained scope extension, strict/report
losses and both recovery directions. The selected runtime model accepts scalar
booleans that the checked schema rejects; projection receipts disclose that fact.
Native row checks are separately qualified to the pinned generator, GX 1.15.1,
Spark 4.0.1, Java 21.0.2 and explicit string/null rows. Routing, normalization and
quoted-context counterexamples prevent any general pipeline or omission/null
claim. One binding does not meet the two-system admission gate; the other four
priority bindings and Nullability delivery remain open. No native concept is
replaced or removed by this qualification.


### PostgreSQL Nullability binding qualification

TD-041 now records a second qualified binding: PostgreSQL 17.4 catalog
classification and authored single-column DDL under explicit stored-relation and
SQL-NULL policies. Column `NOT NULL`, domain constraints, omission/defaults,
CHECK UNKNOWN, NOT VALID historical rows and query-produced NULL remain distinct.
Unknown refinements remain native; a false flag alone is not absence permission.

Required projects to `NOT NULL`, absent-allowed to explicit `NULL`, and
unspecified to no availability clause. Native-only reclassification does not
reconstruct unspecified authorship. The retained receipt recovers the original
ideal, including report-mode residuals, while native classification retains and
recovers the source capture. Modified targets or mismatched receipts refuse.

Both TableSpec and PostgreSQL binding evidence have been rerun with the current
library. This provides two qualified systems for the ideal's admission review;
it does not by itself close the five-system Nullability delivery gate or graduate
native equivalence. SQL Server, Avro and Parquet remain outstanding. The earlier
one-binding status above is historical.


### SQL Server Nullability binding qualification

TD-041 records the third qualified Nullability binding: SQL Server 2022 build
16.0.4295.3, captured catalog-v3 with supplement v2 and authored single-column
DDL under explicit stored-relation/SQL-NULL policy. Unknown native content stays
attached. Computed columns, rule/trigger/constraint interactions and incomplete
visibility remain explicit residuals or refusals. Stored availability must not
be interpreted as accepted input or query-result availability.

Required projects to NOT NULL and absent-allowed to NULL. Unspecified also emits
explicit NULL to avoid ambient session/database defaults, with retained
no-authored-requirement provenance. Native reclassification cannot reconstruct
that author intent; receipt-based recovery preserves it. Both opposing ANSI
defaults have native execution evidence, including bare-clause controls that
produce different results.

The [acceptance record](../../../../fixtures/validation/sqlserver-nullability-acceptance-evidence.json)
includes fresh five-system Field and three-binding Nullability evidence. It
supersedes the outstanding SQL Server status above. Avro and Parquet Nullability
and the delivery gate remain open. This qualification never replaces native
payloads or constitutes equivalence graduation.


### Avro underlying-value scope

The in-progress Avro binding classifies the underlying field-value carrier only
when its containing record is present. An explicit `avro-null` policy interprets
native null as ideal absence. A null branch allows that absence; a resolved
non-null type requires a value at that scope. Parent absence, omitted writer
inputs, reader-resolution defaults and logical annotations are separate meanings.
A required nested field therefore makes no assertion that its parent is present.

The `umf.avro.nullability` extension retains this scope and native path. Complete
native schema/dependency text remains recoverable, including defaults, branch
order and unknown exact metadata. Unresolved structural types become explicit
residuals/refusals. This scoped classification does not validate all native
semantics, replace native concepts, or complete authored projection and binding
acceptance. TD-041 records the implementation and remaining evidence obligations.


### Avro Nullability binding qualification

TD-041 records the fourth qualified binding: Avro 1.12.0 underlying-field-value
classification and authored single-Field projection, with pinned Apache Avro
Python 1.12.0 and fastavro 1.12.2 evidence. The containing record must be present;
writer omission, reader defaults, ancestor availability and logical constraints
remain separate. Full source/dependency text and unknown native content stay
attached and recoverable.

Required projects to a non-null carrier and absent-allowed to a null-first union
or null-only type. Unspecified leaves the chosen carrier unchanged and preserves
no-authored-requirement provenance. Null-only cannot satisfy required; strict
blocks and report retains the explicit loss. No reader default is generated.
Native-only reclassification cannot reconstruct unspecified author intent;
receipt-based recovery preserves it along with every report-mode residual.

The [acceptance record](../../../../fixtures/validation/avro-nullability-acceptance-evidence.json)
includes fresh five-system Field and four-binding Nullability evidence. It
supersedes the in-progress Avro status above. Parquet and the Nullability delivery
gate remain open. This qualification never deletes native payloads or constitutes
native-equivalence graduation.


### Parquet physical availability contexts

The in-progress Parquet binding distinguishes a non-repeated row leaf from a leaf
inside an existing repeated entry. Row scope includes optional ancestors. Entry
scope begins after the innermost repeated boundary; it includes optional descendants
without treating missing/empty containers as a null entry. Repeated paths must not
receive a scalar row-nullability claim, and repetition is not promoted to core
cardinality by this operation.

The `umf.parquet.nullability` extension retains the physical definition-level
carrier, context and repetition metadata. Full original file bytes remain attached.
Writer input masks, embedded Arrow meanings, logical annotations and observed row
values do not silently replace these declarations. Unresolved scopes/types require
explicit residuals or refusals. TD-041 records the tested profiles. Authored flat
row-leaf projection now emits REQUIRED or OPTIONAL, retaining unspecified and
unprojected author intent in verified receipts. Native-only optionality cannot
recover those intents. Exactness, cardinality, defaults and other unclaimed
meanings remain explicit residuals. Broader revalidation and final binding
acceptance remain open, with no native equivalence.


### Parquet Nullability binding qualification

TD-041 records qualified Parquet physical-leaf classification and authored
single-Field schema projection with PyArrow 21.0.0 native evidence and Chromium
parity. This supersedes pending binding status above. Row and repeated-entry
scopes remain explicit; physical optionality does not establish writer-input
validation, cardinality, logical annotation equivalence or original author intent.
Unknown metadata and original native bytes remain recoverable.

The [acceptance record](../../../../fixtures/validation/parquet-nullability-acceptance-evidence.json)
includes fresh five-system Field and Nullability evidence. All five bindings are
qualified, but the separate ideal admission/delivery gate remains open. A binding
qualification neither removes native payloads nor graduates native equivalence.


### Nullability ideal admission and delivery decision

The [five-system gate](../../../../fixtures/validation/nullability-conformance.json)
now admits experimental core 0.3.0 Nullability as a UMF-defined ideal and verifies
qualified delivery across TableSpec, PostgreSQL, SQL Server, Avro and Parquet.
The >=2-system admission threshold and all-five delivery requirement are recorded
separately. TD-041 owns the tested profiles and retained counterexamples.

The gate preserves all three author labels through receipts, explicit strict/report
losses, native captures and unknown extension content. SQL NULL, Avro null unions,
TableSpec contextual declarations and Parquet definition-level availability remain
explicit bindings with their own scopes. Writer inputs, defaults, reader resolution,
logical constraints and repetition do not silently acquire core equivalence.
Ninety ideal and sixty native serialized recoveries pass. Native-equivalence
graduation is not claimed; no extension payload may be discarded. This decision
supersedes earlier pending Nullability gate notes and permits Cardinality work.
