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
revision 1. **Status:** Field and Nullability ideals have passed their qualified
five-system admission/delivery gates. Experimental Cardinality core 0.4.0 has passed
core-task acceptance. All five priority Cardinality bindings have qualified acceptance; the separate
ideal admission and five-system delivery gate passes. See the Cardinality gate
checkpoint below. Native equivalence remains unclaimed.
Experimental facet core 0.5.0 has passed core-task acceptance. TableSpec,
PostgreSQL and SQL Server facet bindings have qualified acceptance. Avro and
Parquet facet bindings, facet admission/delivery, key and native-equivalence
graduation remain pending.

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

Relationship is the sixth ordered ideal after key. CONTRACT-041, not this
contract's five-concept table, owns its exact shape, counterexamples and
bindings. Existing `references` retain CONTRACT-001 meaning. Physical storage
and indexes belong to CONTRACT-042's independently versioned `umf.binding`.

The following is the proposed semantic surface, to be added incrementally after
this contract. Existing documents do not acquire these assertions by default.

| Element | Shape | Meaning and validation |
| --- | --- | --- |
| Element.kind | `field`, `record`, or `group` | A field is a named member/value slot; a record defines named members; a group organizes members without asserting a value shape. Missing means unspecified, never inferred solely from scalarType. |
| Element.nullability | `required`, `absent-allowed`, or `unspecified` | Required means the field supplies a value in the ideal instance; absent-allowed permits no value; unspecified asserts neither. This is ideal value availability, not native syntax or an is_nullable copy. |
| Element.cardinality | `one`, `array`, `map`, or `unspecified` | One value, ordered finite sequence (duplicates allowed), finite mapping with unique exact string keys, or no assertion. Container emptiness is not absence. |
| Element.itemType | `{module, element}` reference to a Field | Optional array-item or map-value definition. Requires explicit array/map cardinality. Does not describe the container, map keys, dimensions or storage encoding. Missing leaves item meaning unasserted in core. |
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


### Cardinality representation and version decision

Experimental core 0.4.0 reserves `cardinality` and `itemType` on elements after
explicit migration from 0.3.0. Cardinality applies only to Fields. Known array/map
containers cannot carry `scalarType`; an optional `itemType` reference identifies
a Field whose own scalar, record-reference, nullability or nested cardinality
meaning describes each array item or map value. The container's availability
remains independent. No item definition is synthesized when the reference is
missing. Exact module/element IDs resolve the reference; record/group targets do
not stand in for the required value Field. Recursive references are permitted
without recursively expanding them during validation.

`itemType` requires known array/map cardinality. One, unspecified, missing and
unknown cardinality cannot acquire an item reference under this version. Unknown
nonempty cardinality labels remain uninterpreted when otherwise structurally
valid. Other native references and all extension content remain separate.

Migration archives every preexisting cardinality/itemType member, including
known-looking labels or references, and removes those members from the new
interpretation. It retains scalarType and all existing 0.3.0 meanings. Rollback
restores the exact original envelope and separately retains the whole subsequent
0.4.0 model; it never inserts newly authored assertions into legacy semantics.
This representation decision does not admit native Cardinality bindings or
replace any native meaning.


### Cardinality authoring receipt semantics

`declareCoreCardinality` takes an explicit identity and a request containing
`cardinality` plus optional `itemType`. Omission of itemType preserves the existing
reference. A supplied reference explicitly sets it; null explicitly clears it.
Every declaration retains the complete old model, request and new model. Clearing
or replacing a reference does not discard its old unknown metadata from that
archive. An incompatible unchanged item reference or scalarType causes an atomic
conflict rather than implicit removal or relocation. Unknown cardinality labels
cannot be overwritten by this operation.

`inspectCoreCardinality` returns copied known/missing/inapplicable/legacy/unknown
meaning without inventing author provenance or native interpretation. Only 0.4.0
labels have this core interpretation. Receipt verification recomputes the complete
declaration and requires the unchanged current target; this is consistency checking,
not proof of a person's identity or native equivalence.


### Cardinality and record-type authoring

For core 0.4.0, a direct authored record-type association must not describe an
array/map container or an unknown cardinality. Use the container's itemType Field
and author that Field's record type. The container and item remain separate
identities with independently stated availability. Existing raw native reference
roles are retained without automatically acquiring record-type author provenance.
Versioned kind and Nullability operations preserve item references and reject
incompatible edits; their older receipt versions retain their original envelopes.


### Cardinality selection scope

Core 0.4.0 metadata selection treats itemType as an explicit identity edge separate
from ordinary reference roles. Transitive traversal follows both edge sets; omitted
item targets appear in a distinct boundary list with source and target paths.
A cardinalities filter tests explicit labels only and never infers one from a
scalar family, empty container from absence, or shape from native metadata. Older
envelopes neither follow opaque itemType members nor permit this ideal filter.
Unknown reference metadata and full native source context remain recoverable.


### Cardinality gate checkpoint

The [conformance record](../../../../fixtures/validation/cardinality-conformance.json) supersedes earlier Cardinality admission/gate-pending
notes. Ideal admission passes the two-binding minimum; qualified delivery passes
all five priority bindings. Neither result claims native equivalence. Facets may
now proceed under TD-043 after its representation/version decision is amended
for the current 0.4.0 baseline; key follows the facets five-system gate.

`bun scripts/core-ideals/cardinality-conformance.ts` verifies current core/binding
acceptance and native/Chromium proof fingerprints, including every combined
five-system oracle/browser entrypoint. `bun test ./tests/core-ideals/cardinality-conformance.test.ts`
checks the gate's positive matrix and rejection of missing, stale, unsafe or failed
evidence. These checks replay current captured evidence; they do not rerun native
engines or authenticate receipts. The preceding 76-step Parquet acceptance refresh
supplies the unchanged native/browser baseline.

The gate exercises 508 authored cases and 696 native cases: 166 strict projection
blocks, 684 ideal recoveries and 932 native recoveries across JSON/YAML. All four
labels are covered in every binding. Unknown document/Field/reference metadata,
nested items, independent availability and native refinements remain recoverable.
Compositions use fresh schema imports for TableSpec, Avro and Parquet and retained
independent engine captures for SQL. Native-only classification cannot recover
unencoded author intent. SQL array bounds, TableSpec vector constraints, JSON and
Parquet MAP uniqueness/key-carrier losses remain explicit; a report candidate does
not establish enforcement. Existing float-narrowing and filtered/disabled-index
counterexamples remain binding constraints. Core 0.4.0 stays experimental.


### Facet representation and version decision

The experimental facet envelope is 0.5.0. It reserves `Element.facets` only after
explicit migration from 0.4.0, preserving the original document and archiving every
preexisting facet-shaped member without interpreting it. Rollback restores that
original and retains subsequent 0.5.0 assertions separately. This decision does not
claim implementation, native support, facet admission or equivalence.

Facet counts are exact safe JSON integers under the existing core numeric profile:
length maximum and scale are nonnegative; precision and integer bit count are
positive; all are at most 9007199254740991. IntegerWidth and decimal facets describe
mathematical value domains, not JavaScript-number domains. Raw JSON/YAML tokens must
pass the existing exact parser before host-number conversion. Already rounded
caller-supplied numbers cannot establish their lost lexical value. Native bounds
outside this metadata profile remain in native payloads with an explicit residual.

A facets object, including an empty or future-only object, belongs to a Field with
missing, one or unspecified cardinality and no direct record-type association.
Known facet members require the compatible scalar family from the normative table.
Precision and scale appear together, with scale no greater than precision; this
cross-member rule is enforced by semantic validation in addition to JSON Schema.
Unknown members and nested qualifiers are retained and diagnosed. Unknown nonempty
length units are retained without interpretation on string/binary Fields; they
cannot satisfy an exactness request. Neither missing bounds nor native defaults
supply new author assertions. See TD-043 for versioned APIs and acceptance order.


### Facet authoring and receipt semantics

Experimental 0.5.0 document validation now combines the facet JSON Schema with
semantic scale/precision checking and existing identity/reference checks. Explicit
`upgradeFacetEnvelope` and `rollbackFacetEnvelope` preserve old facet collisions
and later assertions in separate retained documents; no native payload is removed.

`declareCoreFacets` patches one or more known groups. Precision and scale must be
supplied together. Omitted groups and unknown nested qualifiers remain attached;
unknown length units cannot be overwritten by this operation. It does not remove
groups or assert a native representation. `inspectCoreFacets` distinguishes known,
partial, missing, legacy and inapplicable meaning. A partial result includes copied
facet metadata, separately interpreted members and paths of uninterpreted content.
An unknown length unit supplies no interpreted length bound. Lookup provenance is
unverified; declarations carry explicit authored provenance and retained source.
`verifyCoreFacetDeclaration` recomputes the operation and compares the complete
current document, refusing forged or stale receipts rather than reconciling silently.

Kind/record-type operation v4, Nullability operation v3 and Cardinality operation
v2 govern 0.5.0 while prior receipt versions remain supported on their own profiles.
Facet selection follows explicit item/value links, retains their metadata and emits
boundaries when traversal is disabled. Direct record-type assignment to a faceted
Field conflicts. Existing Cardinality native bindings explicitly require 0.4.0;
0.5.0 native facet projection requires its separately qualified binding.

These public-runtime capabilities do not themselves admit the facet ideal or claim
native enforcement/equivalence. Core-task acceptance additionally requires the
priority regression, native/browser compatibility refresh and three existing
concept gates. The acceptance checkpoint in TD-043 records that evidence when ready.


### Facet core-task acceptance

The [core acceptance record](../../../../fixtures/validation/facet-core-acceptance-evidence.json) supersedes the candidate-only checkpoint's
public-runtime limitations. Core 0.5.0 now validates declared facets, explicitly
migrates/rolls back 0.4.0 collisions, authors/inspects known and partial bounds,
verifies source-bound receipts and follows faceted item/value metadata in selection.
Kind/record-type v4, Nullability v3 and Cardinality v2 operations retain prior
receipt versions. Existing Cardinality native bindings explicitly refuse 0.5.0
rather than apply their 0.4.0 representation rules to facet declarations.

All 78 refresh steps pass: 420 priority tests / 39,482
assertions across 135 files, typechecking, 261 schemas, 42 extension
packages, browser build and qualified native/browser checks for existing Field,
Nullability and Cardinality bindings. Their three separate gates subsequently pass.
The scope is core plus the five priority systems, not a new full-repository baseline.

Chromium 148 checks 99 public validation cases, 62 valid-document recoveries,
18 migration/rollback recoveries, eight facet-author receipts, eight versioned
prior-operation receipts, four selection receipts and 15 refusals, with no host
globals or external requests. The separate facet-local matrix retains 198 metadata
recoveries and 18 exact-token checks. Reproduce with `bun scripts/core-facet-operations-browser.ts`
and `bun scripts/core-facet-browser.ts` using the configured Chromium executable.

This closes only the facet core task. All five native facet bindings, useful ideal
admission, the facet delivery gate and key remain required. No native facet
enforcement, general row conversion or native equivalence is claimed. The next
binding is TableSpec under the declared schema/runtime profiles; native refinements
and unknown numeric tokens must stay attached to any classification/projection.


### Qualified TableSpec facet binding

The [acceptance record](../../../../fixtures/validation/tablespec-facets-acceptance-evidence.json) covers experimental core 0.5.0 TableSpec facet
classification, authored projection, strict/report loss handling and verified
native/ideal recovery. It supersedes the earlier classification/projection
checkpoints' full-refresh limitation; their original evidence remains historical.

All 80 compatibility-refresh steps pass, including 438 priority tests,
47,122 assertions across 139 files, type checks,
264 schemas, 43 extension packages, browser build and qualified native/browser
checks for existing Field, Nullability and Cardinality bindings. Their three
separate conformance gates pass after evidence revalidation. This is the core and
five-priority-system scope, not a new full-repository baseline.

TableSpec evidence uses commit 647e8e566ad78b864282ec65c0b0b2237aa63084,
Pydantic 2.11.10, JSONSchema 4.25.1, Spark 4.0.1, GX 1.15.1, Java 21.0.2 and
Chromium 148. The browser matrices cover 1,216 native classification cases,
80 explicit-suite cases and 540 authored projection cases. Native checks validate
331 emitted documents and 104 facet representation claims; 11 emitted suite
rules undergo 63 value checks and two tolerance controls. Recovery preserves
native text/archives and full authored ideals, including unknown qualifiers.

Profiles keep declarations, raw/normalized generated schemas, baseline GX,
explicit GX suites and ingest casts separate. Explicit suites support zero length
and canonical widths within the signed-32-bit Spark carrier. Decimal precision
and scale remain consumer-specific. Missing facets do not inherit native defaults.
The binary64-to-binary32 narrowing counterexample remains an exact-input failure.
Unknown detail, unsupported encodings, shape conflicts and conversion losses
remain explicit. This does not qualify whole-pipeline execution or write policy.

This closes the TableSpec facet binding only. PostgreSQL, SQL Server, Avro and
Parquet facet bindings, the distinct facet ideal admission/five-system delivery
gate, and Key remain required. Native-equivalence graduation is not claimed.


### Qualified PostgreSQL facet binding

The [acceptance record](../../../../fixtures/validation/postgresql-facets-acceptance-evidence.json) qualifies experimental core 0.5.0 PostgreSQL
facet classification, authored projection, strict/report residuals and retained
native/ideal recovery. It supersedes the earlier checkpoints' full-refresh
limitation; their original counts and fingerprints remain historical.

All 82 compatibility-refresh steps pass, including 466 priority tests,
49,198 assertions across 148 files, type checks,
268 schemas, 44 extension packages, browser builds and existing five-system
Field/Nullability/Cardinality native/browser workflows. Accepted TableSpec facets
are revalidated. The three prior concept gates pass after evidence refresh.
The initial PostgreSQL aggregate failed after its native stages passed because
its metadata reader expected the constraint proof's server version at the wrong
path. The reader was corrected; typechecking and the affected aggregate were
rerun. Earlier successful commands were retained because their implementation
inputs were unchanged. The failed attempt and adjustment are archived in the
acceptance record. This is the core and five-priority-system scope, not a
full-repository baseline.

Five native workflow stages use PostgreSQL 17.4/UTF8 and the qualified
little-endian Datum64 layout. The projector matrix has 232 cases: 145 emitted
schemas and 87 blocks. Emitted schemas pass 479 independent native value probes
with 166 expected rejections under an adversarial operator search path. All 145
schemas undergo composed classification and both retained recoveries; 66 recover
the authored facets and 79 retain explicit residuals. Inferred native refinements
remain separate from author intent.

All six Chromium 148 workflows pass against the public bundle and optional pinned
PostgreSQL WASM runtime. Public classification covers 231 cases with 157 exact
native recoveries and 74 blocks; projection covers 232 cases with 290 ideal
recoveries plus comment controls. Browser execution has no host globals or
external requests. Typed operation and extension schemas cover both directions.

Qualification is limited to supported direct scalar carriers and verified CHECK
expressions with explicit stored/new non-null scope. NOT VALID, unknown/custom
predicates, scalar-family conversion, character NUL/padding and input rounding
remain native refinements or residuals. Binding ceilings are length 10485760,
checked integer width 1024 and decimal precision 1000. Arbitrary SQL expression
conversion, source authentication and composition with earlier nullability or
cardinality operations are not claimed. The float-narrowing case remains an
exact-input failure. Native payloads are never removed by core labels.

This closes the PostgreSQL facet binding only. SQL Server, Avro and Parquet facet
bindings, the separate facet ideal admission/five-system delivery gate, and Key
remain required. No native-equivalence graduation is claimed.


### Qualified SQL Server facet binding

The [acceptance record](../../../../fixtures/validation/sqlserver-facets-acceptance-evidence.json) qualifies experimental core 0.5.0 SQL Server
2022 16.0.4295.3 facet classification, authored projection, strict/report losses
and both retained recovery directions. It supersedes earlier checkpoints' pending
refresh status; their counts and fingerprints remain historical.

All 84 refresh steps pass, including 492 core/priority tests with
51,613 assertions across 156 files, typechecking,
271 schemas, 45 packages, browser builds and five-system native/browser checks.
Field, Nullability and Cardinality gates pass after evidence revalidation; accepted
TableSpec and PostgreSQL facets remain qualified. A metadata-only browser evidence
label was corrected before its stage ran, with a separate typecheck. Runtime
behavior and assertions were unchanged; the adjustment is archived.

Four native stages and six Chromium 148 workflows cover discovery, CHECK
association, 238 projection cases (145 emitted, 93 blocked), 27 projection value
probes, and composed native/ideal recovery. The 145 emitted cases recover authored
facets directly in 57 cases and retain explicit residuals in 88. Browser composition
passes 290 ideal and 290 native-view recoveries, two full-catalog recoveries and
24 scoped association cases. Extra native refinements do not become author intent.

Qualification covers direct supported scalar carriers, bounded CHECK expressions,
explicit non-null stored/ordinary-checked-write scopes and separately identified
logical Fields. Disabled, untrusted, replication-exempt, cross-column, Unicode,
padding, alias/computed and input-conversion distinctions stay explicit. The only
exact string bound inferred is the qualified zero-byte variable-string domain.
Arbitrary SQL conversion, complete inventory, source authentication and composition
with earlier native availability/container operations are not claimed.

This completes the SQL Server facet binding only. Avro, Parquet, the separate
facet ideal admission/delivery gate and Key remain required. Native equivalence
is unclaimed; native payloads and unknown content remain recoverable.


### Avro facet binding profile and acceptance boundary

The experimental core 0.5.0 Avro facet profile separates declared schema meaning,
Apache Avro 1.12.0 datum-writer behavior and fastavro 1.12.2 schemaless-writer
behavior. Native classification retains selected locations, named dependencies,
union branches and unknown refinements. Authored projection emits one non-null
scalar Field in a record, with explicit native-type, metadata-only or carrier-only
encoding. It does not infer author intent from observed native bounds.

Signed 32/64-bit declaration domains can match int/long; narrower and unsigned
widths require residuals. Variable string/byte maximum lengths are not enforced
by custom metadata. Fixed length is not maximum length, except the qualified
zero-length binary case. Decimal declaration matches remain separate from writer
conversion, physical-byte bypass and precision enforcement. Fixed sizes and emitted
decimal precision are capped at 4096 in this implementation profile. The permanent
binary64-to-binary32 counterexample remains an exact-input failure.

Strict mode blocks loss; report mode retains explicit residuals. Invalid carriers
block both modes. Recovery verifies the full retained ideal receipt and emitted
text; native recovery preserves original text and dependencies. Neither recovery
is source authentication or a native-equivalence claim. The
[Avro evidence record](../../04-build/evidence/avro-facet-discovery.md) records
current qualification and unresolved acceptance checks. This profile definition
alone does not admit facets or complete five-system delivery.
