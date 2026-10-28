---
ddx:
  id: CONTRACT-076
  type: contract
  activity: design
  status: draft
  x-recovery-previous-id: CONTRACT-067
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: informed_by
    - id: SD-005
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-076: Exact 128-bit values and UUIDs

**Type:** schema/library and physical binding. **Version:** proposed core 0.9.0;
`umf-128/1`, `umf-key-tuple-v2`, `umf.binding` 0.3.0 / `umf-binding-3`.
**Status:** design complete for implementation; draft pending review and evidence.
The initial implementation has scoped Bun, browser and native carrier evidence.
The later uuid-model1 profile passes separate qualified ideal-admission and
five-priority delivery gates; native equivalence and downstream adoption remain
separate. See [adapter qualification](../../04-build/evidence/uuid-adapter-completion.md).

## Purpose

Give UMF native exact 128-bit and Universally Unique Identifier (UUID) domains,
with independent physical carriers. FEAT-005 IDEAL-09 supplies product authority.
Logical meaning MUST survive string fallback and paired-integer storage.

## Scope and Boundaries

UMF owns value meaning, portable codecs, Field validation, key framing, binding
metadata and qualified native projection/classification. Consumers own database
transport, queries, mutations, deployment and optimization. Generation, entropy,
uniqueness guarantees, timestamp extraction, arithmetic operators, automatic data
rewrites and automatic storage selection are outside this contract.

External grounding, inspected 2026-10-15: [IETF RFC9562 §§4, 5, 6.11–6.13](https://www.rfc-editor.org/rfc/rfc9562.html)
defines UUID layouts and network order; this contract's opaque domain deliberately
preserves reserved versions/variants without claiming their generation semantics.

## Normative Surface

### Logical domains and literal representation

| Core 0.9.0 declaration | Literal | Meaning |
| --- | --- | --- |
| `scalarType: bits128` | `{bits128Hex: string}` | All 2^128 bit strings; exactly 16 bytes. No arithmetic or identifier intent. |
| `scalarType: uuid` | `{uuid: string}` | The same complete bit space with UUID identity and text representation. All versions/variants, Nil and Max remain representable. No generation-validity or uniqueness claim. |
| `scalarType: integer`, `facets.integerWidth: {bits:128,signed:true}` | Existing `{integerToken: string}` | Mathematical integers -2^127 through 2^127-1. |
| `scalarType: integer`, `facets.integerWidth: {bits:128,signed:false}` | Existing `{integerToken: string}` | Mathematical integers 0 through 2^128-1. |

`bits128Hex` accepts exactly32 ASCII hexadecimal digits, upper/lowercase.
`uuid` accepts exactly36 ASCII characters in 8-4-4-4-12 hexadecimal groups with
hyphens. No whitespace, newline, braces, URN prefix, hyphen omission, Unicode
substitutions, truncation or implicit string coercion. Native adapters MAY accept
broader native syntax under their own pinned profile while retaining the exact
source and explicitly converting to this literal. Neither a string nor sixteen
bytes alone can be classified as authored UUID meaning.

UUID equality compares all16 bytes. Canonical text is lowercase, hyphenated;
original text MUST remain recoverable. Unknown variant/version bits MUST NOT be
rewritten to a known value or treated as an invalid opaque identity. Layout
inspection reports them as uninterpreted; it cannot infer generation time,
cryptographic quality, provenance or uniqueness. Nil/Max are present values, not
absence. Cross-domain equality/coercion is undefined: UUID, bits128, integer,
string and binary values remain distinct until an explicit conversion is invoked.

The logical comparison profile `umf-128/1` orders bits128/UUID values by unsigned
lexicographic network-order bytes. This is deterministic value order, not creation
order, native database order or a guarantee of monotonic UUID generation. Integer
order remains mathematical. UUID/bits128 range facets are not introduced.

A bits128/UUID Field uses existing kind, availability and cardinality rules. For
containers the referenced item/value Field owns the scalar domain. No length,
precision/scale, integerWidth or range facet applies to bits128/UUID; their width
is intrinsic. `allowedValues`, `examples` and literal defaults use the matching
new wrapper and exact bit equality. Equal differently cased spellings are duplicate
allowed values and MUST reject. Null is admitted only by existing availability
rules; defaults remain declarations and MUST NOT generate a UUID or substitute
Nil. Unknown relevant refinements block value interpretation. Unrelated extension
content remains attached. Version/variant restrictions require a separately
specified extension; they MUST NOT be guessed from examples or field names.

### Portable codecs

All operations are synchronous, pure and browser-compatible. Every input object
and byte view is copied before use; results share no mutable storage with inputs.
JSON-safe results contain no bigint, typed array or unsafe number. The explicit
byte bridge returns a fresh Uint8Array. Internal bigint arithmetic is permitted.

`Bit128Value` is `{profile:'umf-128/1',hex:string}` with lowercase32-digit hex.
`UuidValue` adds `canonicalText:string` and `originalText:string`; `hex` contains
the same bytes. These are readonly snapshots; outputs MUST be validated on reentry,
not trusted because they have this shape. All hex conversion inputs require exact
width; no padding of malformed external hex.

| Operation | Exact surface and behavior |
| --- | --- |
| `parseBits128(hex:string): Bit128Value` | Strict width/grammar; lowercase result. Caller retains original input spelling. |
| `parseUuid(text:string): UuidValue` | Strict UUID grammar; preserve originalText; derive canonicalText and hex. |
| `bits128FromBytes(bytes:Uint8Array): Bit128Value` | Exactly16 bytes in network order, honoring the view's offset and length. |
| `bits128ToBytes(value:Bit128Value): Uint8Array` | Fresh16-byte network-order view. |
| `uuidFromBits128(value:Bit128Value): UuidValue` | Explicit interpretation; originalText equals newly constructed canonicalText. Does not certify a generation layout. |
| `uuidToBits128(value:UuidValue): Bit128Value` | Explicitly drops UUID interpretation in the returned view; source remains unchanged. |
| `compareBits128(left:Bit128Value,right:Bit128Value): -1\|0\|1` | Unsigned network-byte order. UUID callers explicitly convert their values first. |
| `bits128ToWords(value:Bit128Value,signed:boolean): {high:string,low:string}` | Canonical base10 integer strings for the high/low64-bit halves under the selected signed carrier. |
| `bits128FromWords(words:{high:string,low:string},signed:boolean): Bit128Value` | Exactly two canonical base10 strings; range-check both before recombination. |
| `bits128ToInteger(value:Bit128Value,signed:boolean): {integerToken:string}` | Explicit128-bit two's-complement or unsigned interpretation, minimal decimal output. |
| `bits128FromInteger(literal:{integerToken:string},signed:boolean): Bit128Value` | Existing bounded exact integer parser; integral JSON-number token, in range; no modulo overflow. Negative zero refuses. |

Canonical word grammar is `0` or optional `-` followed by a nonzero ASCII digit
and digits. No `+`, leading zeros, exponent, decimal point or negative zero.
Unsigned words lie in [0,2^64-1]; signed words lie in [-2^63,2^63-1]. `signed`
MUST be a boolean, never a default inferred from negative input. Word strings
are bounded to20 characters before parsing. Hex/UUID/byte lengths are checked
before allocation. Existing4,000,000-character integer token and bounded exponent
limits apply only to the explicit integer conversion. JavaScript numbers are
never accepted in words or numeric literals, even if a particular value is safe.

Portable codecs make no Field-context claim. Existing `validateCoreFieldValue`
and `resolveCoreDefault` receive new0.9 literals through their existing signatures;
all declaration, inspection and selection APIs dispatch by source core version.
Authoring requires a complete validated target; unknown relevant meaning refuses
atomically. No routine declaration/selection receipt is introduced.

### Two64-bit carrier algorithm

Let B be the unsigned integer represented by sixteen network-order bytes.
H=floor(B/2^64), L=B mod2^64. For signed carriers, each half x becomes
s(x)=x when x<2^63, otherwise x-2^64. Decode each negative signed word by adding
2^64, then B=H*2^64+L. No byte swap, field swap, floating-point conversion,
clamping or hashing is permitted. The mapping covers every128-bit value bijectively.

This separates word order (high then low) from each target's physical byte order.
A COM GUID memory layout MUST use a separately named/native-qualified adapter;
it MUST NOT be passed to the network-byte codec unchanged. Native driver results
must be decoded using their actual representation, not the host's endian default.

### Physical binding profile

`umf-binding-3` retains CONTRACT-042's logical identity, target, relationships,
indexes and unknown-content rules. Its new Field storage choice is
`storage:'scalar-carrier'` with required `carrier` below; it is mutually exclusive
with old column/embedded choices on that Field. One Field retains one logical
identity even when it occupies two physical slots. A scalar carrier selects a
singular bits128/UUID Field only; container element storage is not implied.

| `carrier` exact discriminated shape | Obligations |
| --- | --- |
| `{kind:'native-uuid',column:string}` | UUID Field only; identified native type/driver codec and equality/order qualification. |
| `{kind:'bytes16',column:string}` | Exactly16 bytes in network order; native fixed/exact-length behavior must be qualified. |
| `{kind:'uuid-text',column:string}` | UUID only; canonical36-character lowercase text on authored writes, full-token validation before casts. |
| `{kind:'hex128-text',column:string}` | bits128 only; canonical32-character lowercase hex on authored writes. |
| `{kind:'words64',highColumn:string,lowColumn:string,signed:boolean}` | Distinct named64-bit columns/slots in explicit high/low order; exact algorithm above. |

Column names are nonempty exact target identifiers, not raw SQL fragments.
All slots must resolve to the selected target relation/record under its native
binding. Slot collisions with any other logical Field block, including one half
of a pair. Native DDL generation must validate/quote names using its target adapter.
Unknown carrier discriminants/qualifiers remain recoverable and block generation.
Plain strings/binary/pairs without an explicit source-qualified carrier assertion
remain plain native types; names such as id, uuid, high or low never prove meaning.

Authored carrier choice is explicit. No automatic switch to a pair, string or
native UUID, no extra columns and no invented native UUID type. If the selected
target cannot implement a carrier, strict blocks; report may emit a complete
qualified target only when a supported carrier was explicitly selected and all
unsatisfied semantic obligations appear as residuals. It MUST NOT secretly choose
another layout. Text is a useful supported fallback, not an erased logical type.

A required value uses nonnull slots. An absent-allowed pair encodes absence as
both slots absent/null under the selected native availability profile; one absent
half is malformed, never a Nil UUID. Updates, reads, joins, key/foreign-key and
unique constraints MUST treat both halves as one value. Mutation atomicity and
consistent read snapshots require consumer/native execution qualification;
metadata alone cannot establish them. No hash or either half may replace identity.

Equality, ordering, width/range, availability, logical-domain enforcement and
source recovery are separate obligations. A text carrier must prevent truncation,
case/Unicode/padding ambiguities and preserve bit equality under its selected
write/read profile. Canonical author output alone does not prove every external
writer is constrained. An unvalidated arbitrary native string MUST refuse decode.
For signed-word ordering, normalize each negative word by adding2^64 and compare
high then low; plain signed tuple ORDER BY is not portable UUID order. Native UUID
or string collation order also requires proof or an explicit ordering residual.
All native key/index and relationship mappings must account for both pair slots.

Projection/classification retains CONTRACT-040's copied sources, mapping paths,
versioned target subset, strict/report outcomes and both recovery directions.
Retained metadata proves recoverability, not native enforcement. No result may
claim every obligation exact solely because all bits round-trip.

### Key profile

`umf-key-tuple-v1` remains byte-for-byte unchanged and refuses UUID/bits128.
The new explicitly selected `umf-key-tuple-v2` uses ASCII magic `UMFK2`, the
same component-count and tag/length framing as CONTRACT-040, existing tags01–05
unchanged, tag06 for bits128 and07 for UUID. Both new payloads are exactly16
network-order bytes. Unknown tags, nonminimal framing, incorrect lengths, absent,
null, wrong wrapper and unknown relevant qualifiers refuse before any output.
UUID case does not affect bytes; UUID and bits128 remain different tags.
Existing validated required/singular membership, ownership and stable key identity
rules apply. Equality does not assert uniqueness enforcement or global identity.

A new key operation/receipt version4.0.0 admits core0.9.0 and records selected
profile `umf-key-tuple-v1` or `umf-key-tuple-v2` explicitly. A new trailing
`{profile}` options argument to encodeCoreKeyTuple is mandatory for0.9; earlier operation
versions retain existing signatures/behavior. Version4 verification dispatches
on the retained profile and recomputes against the supplied current source.
Historical tuple/receipt verifiers remain version-scoped. Receipts do not
implicitly upgrade profiles or adopt lookalike values from an older document.

## Precedence and Compatibility

Core0.9.0 adds scalar labels/literal wrappers, not ordinary JSON numeric range.
JSON/YAML envelopes use strings and bounded safe metadata numbers; raw bigint
remains rejected. Integer128 metadata already fits integerWidth; this does not
assert all existing native integer bindings can project it.

0.8.0 schemas, inspectors, serializers, operation schemas and evidence retain
nine-family semantics. Migration to0.9 MUST retain the complete original source
and all extension content. Any preexisting bits128/uuid scalar strings and
bits128Hex/uuid literal-shaped objects in interpreted positions are collisions:
block automatic adoption and require an explicit caller-authored replacement
mapping, with exact path, expected original and replacement, retained in the
migration record. Unrelated extension objects with those spellings remain opaque.
No inferred conversion from string/binary/native payloads is allowed.

The migration surface is `upgradeBit128Envelope(source,options)` with required
`options:{collisions:Array<{path:string,expected:Json,replacement:Json}>}`.
`path` is an exact JSON Pointer to a collided scalar label or complete literal;
`expected` must exactly match the original JSON value and `replacement` must be
valid under the target domain. Listing an identical replacement is explicit
adoption. Each collision must be addressed exactly once; duplicate/overlapping
paths, noncollision edits, stale expected values or omitted collisions refuse.
The source must satisfy its old structural profile; unknown semantic meaning is
retained and is never approval to interpret it. The only automatic edit is the
core version. No network, native lookup or name-based interpretation participates.

The JSON-safe `Bit128UpgradeReceipt` has
`{operation:'upgrade-bit128-envelope',version:'1.0.0',source,options,target}`.
Source/target are complete copied Documents; the target uses core0.9.0. Every
collision edit and the whole target are validated before return.
`rollbackBit128Envelope(receipt,current)` verifies the receipt by recomputation
and requires exact current-target equality, then returns
`{restored:Document,later:Document}`. `restored` is the exact copied old envelope;
`later` retains the supplied new envelope. A later edited document requires a
new explicit reconciliation; stale receipt rollback blocks. Receipt verification
is consistency checking, not authentication, and does not undo external effects.

Rollback restores the exact earlier envelope from its verified migration record
and separately retains the full later envelope; it never silently erases newly
authored UUID meaning. Down-projecting to an older core is a separate explicit
loss-reporting conversion. Core version, binding version and key codec version
are independent; unsupported combinations block. Binding3 accepts core0.9 only
for this initial profile. Old binding profiles do not interpret scalar-carrier.

A consumer adopting tuple v2 must explicitly rebuild/version persisted indexes,
caches, identity aliases and relationship references together, under its own
migration protocol. v1/v2 bytes MUST NOT share an unversioned key namespace.
Rollback cannot reinterpret v2 bytes as v1 or claim database writes were undone.

## Error Semantics

Portable codecs throw UmfError with `BIT128_TYPE`, `BIT128_SYNTAX`,
`BIT128_RANGE`, `BIT128_LIMIT` or `BIT128_VALUE` for wrong runtime type, grammar,
out-of-domain value, resource bound or inconsistent supplied value snapshot.
A UUID grammar failure uses `UUID_SYNTAX`. Snapshot validation rejects mismatched
profile/hex/canonicalText/originalText and unknown relevant members. Field/key/
binding operations retain their existing source-path diagnostic conventions and
add domain-specific reasons. Wrong wrapper, partial pair, stale source binding,
slot collision and unsupported layout block atomically in both policies.
Non-exact requested semantic obligations block strict; report retains explicit
residuals. Failures publish no partial value, tuple, schema or mutation instruction.
They authorize no retry, truncation, generation, implicit cast or alternate carrier.

## Examples

`00112233-4455-6677-8899-aabbccddeeff` has bits
`00112233445566778899aabbccddeeff`, high hex `0011223344556677`, low hex
`8899aabbccddeeff`. Unsigned words are `4822678189205111` and
`9843086184167632639`; signed words are `4822678189205111` and
`-8603657889541918977`. All forms recover identical bits. Mixed-case UUID text
retains its spelling but has the same canonical equality/key as lowercase.

All-zero bits decode to words0/0; all-one bits to unsigned
18446744073709551615/18446744073709551615 or signed-1/-1. Integer signed128
minimum is -170141183460469231731687303715884105728; unsigned128 maximum is
340282366920938463463374607431768211455. First values outside the selected
domain reject, rather than wrapping.

A one-component UUID v2 tuple for the first example is
`554d464b3201071000112233445566778899aabbccddeeff`.
The bits128 tuple differs at tag07→06. Source-record/key identity remains an
external scope as in CONTRACT-040; this is not a globally unique record handle.

## Validation and qualification

SD-005 defines invariant, native, browser, migration and performance evidence.
Core admission requires useful down-projection and up-classification for at least
two priority systems, permanent counterexamples and retained unknown detail.
All-five priority delivery remains mandatory and separate. No performance,
full native equivalence, generator or downstream execution claim follows from
this contract. Unknown future UUID layout interpretation remains an explicit
extension responsibility; opaque bit preservation is complete without it.

## Initial public implementation profile

The following bounded APIs refine the implementation interface without widening
native execution claims. Evidence and remaining delivery gates are recorded in
[the execution record](../../04-build/evidence/uuid-implementation.md).

`SCALAR_TYPES` retains the earlier nine-family inventory; both versioned
inventories are immutable at runtime as well as readonly in TypeScript. `SCALAR_TYPES_V09` and
`scalarTypesForVersion(version)` expose version-qualified inventories; `ScalarType`
includes the new families. No older source acquires meaning from that TypeScript
union. `coreBit128DocumentSchema`, `coreBit128SelectionSchema`,
`coreBit128TransitionSchema` and `coreBit128KeyTupleSchema` expose new independently
identified schema resources. Earlier resources remain unchanged.

`declareCoreBit128Field(source,identity,scalarType)` accepts only a valid current
core0.10.0 Document, exact `identity:{module,element}` and
`scalarType:'bits128'|'uuid'`. It returns a copied, validated Document directly,
with no declaration receipt. Core0.9.0 is the historical profile version in the
original design; it is not an accepted source version for this current public
helper. This boundary is specific to `declareCoreBit128Field` and does not revise
other operation predicates in this contract. The target must already be a singular
Field; container item meaning is declared on the referenced Field. Unknown scalar
meaning or relevant unknown qualifiers block replacement; incompatible existing
facets/literals block the whole edit. This is explicit metadata authoring, not
stored-value conversion. The function does not upgrade a 0.9.0 source; callers
must explicitly migrate to the current core profile before authoring.

The current read-only inspection result versions are kind8, nullability7,
cardinality6, facets5, Key4, relationship3 and scalar/member/reference inspection0.3.
Schema-property inspection/default resolution and Record value checking use result2
for0.9. Relationship metadata selection uses result2 for0.9 while preserving
its original0.7/result1 behavior and0.8 refusal. Their older source/result dispatch
remains unchanged. Routine metadata
selection remains a copied snapshot, not a persistent receipt.

### Carrier inspection and values

`inspectBit128Binding(binding,logical):Validation` validates the declared binding3
shape, exact supplied logical source, known relevant qualifiers, explicit target
relation/record assignments and all physical-slot collisions. `inspectBinding`
dispatches to this checker for0.3.0 after safe input copying. Native capabilities,
DDL execution and database atomicity are not certified by `complete:true` here.
The initial carrier profile retains nonempty native index/relationship declarations
with incomplete interpretation and refuses their generation/value operations;
legacy generators reject binding3 rather than interpret split slots as one column.

`encodeBit128CarrierValue(binding,logical,identity,literal)` returns a fresh
`Record<string,string|null>` with exactly the selected physical column names.
`decodeBit128CarrierValue(binding,logical,identity,slots)` returns a checked matching
`CoreLiteral`. Both require complete interpretation of selected binding/Field
meaning; both validate Field allowed values and availability. No partial pair or
extra/missing slot is accepted. Null encodes both words together only for
absent-allowed. Hex carriers use32-digit lowercase hex; native-uuid and uuid-text
use canonical UUID text; word carriers use the exact selected decimal word strings.
These are JSON-safe transport tokens. The consumer's selected driver converts
hex to16 bytes or canonical text to a native UUID object as required. They are
not SQL parameters or an assertion that every native driver accepts strings.

These value-only bridges preserve bit identity. Original inputs remain unchanged;
a caller requiring lexical source recovery must retain the original token or
`UuidValue.originalText` alongside the native carrier. Decoding a canonical carrier
cannot reconstruct an unretained original case spelling. No source-custody claim
follows from carrier equality alone.

### Native schema proposal and recovery

`projectBit128CarrierSchema(binding,logical,identity,policy)` receives explicit
`policy:{lossPolicy:'strict'|'report',obligations:Array<Bit128Obligation>}`. The
nonempty unique obligations are bits, availability, equality, ordering and
enforcement. Extra policy members and invalid identities refuse. The bounded
native subset is exactly `target.subset:'uuid-carrier1'` with PostgreSQL17.x,
SQL Server2022, Avro1.12.0, Parquet format2.11.0 or TableSpec model1.0. A binding's
version/subset is explicit; a similarly named unsupported target is not substituted.

The JSON-safe result is
`{operation:'project-bit128-carrier-schema',version:'1.0.0',source,binding,identity,policy,outcomes,status,diagnostics,mapping,candidate?}`.
`source` and `binding` are complete copies. Each outcome has obligation, outcome
exact/unknown/not-expressible and reason. Diagnostics retain source validation
limits and always disclose text-enforcement, nullable-pair and TableSpec-model
limitations even when the caller requests only bit fidelity. A projected result
therefore certifies only its selected obligations, never general completeness. `mapping` contains the exact idealPath, target, bindingVersion0.3.0 and
all targetSlots. Slots use semantic coordinates
`/tables/<escaped-name>/columns/<escaped-name>`; they are not pointers into SQL text.
Unemitted Field facets, defaults and allowed values receive enforcement residuals
even when bits alone was requested. Other source Fields and Record/graph assertions
remain in the retained source; this is explicitly a one-Field carrier proposal,
not complete-model lowering or automatic key/index enforcement.

`status` is projected/reported/blocked. A candidate has format sql/avro/parquet/
tablespec and text. Non-exact obligations block strict and remain explicit in
report. Unsupported carrier/target combinations block under either policy.
Invalid/unknown relevant meaning or unsafe native names throws BIT128_PROJECTION;
there is no partial candidate or alternate layout. SQL identifiers reject NUL,
unpaired surrogates and target length overflow before quoting; no SQL identifier
fragment is executable. Avro names use its native name grammar, exclude primitive root-name collisions,
and avoid collisions with generated fixed-type names. The initial SQL Server
subset uses ASCII letter/underscore followed by letters/digits/underscores and
rejects case-insensitive column-name collisions.
Selected partition choices receive explicit residuals; they are not silently dropped.
Result copying enforces the existing aggregate JSON/text bounds before publication.

SQL candidates are standalone CREATE TABLE statements for the selected carrier.
Avro candidates are standalone native record schemas. TableSpec candidates are
native model documents. Parquet candidate JSON is a column layout for a selected
native writer, not a Parquet file or Thrift FileMetaData. Its columns carry name,
physicalType, length when fixed, logicalType, integer bitWidth/isSigned when relevant,
and nullable; actual writer/reader qualification is separate.

Signed words use native bigint/long in PostgreSQL, SQL Server and Avro. Unsigned
words refuse there rather than narrow; Parquet supports the explicit unsigned64
annotation. TableSpec only emits the explicitly chosen text fallback. Native
ordering remains unknown in this profile; caller selection of ordering therefore
blocks strict. Text grammar/enforcement and collation are not silently certified.
Nullable independent Avro/Parquet pairs report missing all-or-none enforcement.
Native fixed UUID annotations may be ignored by a runtime: retained warnings and
byte recovery cannot certify native logical-type enforcement or UUID generation.

`recoverBit128CarrierProjection(report,nativeText)` recomputes the full proposal,
requires exact report and candidate-text agreement, and returns copied
`{logical,binding}`. This is source/artifact consistency recovery, not authentication,
independent native classification or tolerance of arbitrary native edits.

`classifyBit128NativeType({system,version,definition})` returns copied source,
optional scalarType uuid, and basis native-type-identity/unclassified. It requires
explicit PostgreSQL pg_catalog/uuid/base-kind identity, SQL Server sys/
uniqueidentifier/system-type36, Avro uuid annotation on string/fixed16, or Parquet
UUID annotation on fixed16. Unknown native members remain in source. Unannotated
bytes, strings, same-named domains and unrelated integer pairs remain unclassified.
No descriptor-only result certifies native equality, coercion or write enforcement.

## Model composition profile — uuid-model1

The independently selected `target.subset:'uuid-model1'` retains binding3's
version and carrier shapes. Carrier1 behavior and receipts remain unchanged.
`projectBit128Model(binding,logical,lossPolicy)` takes copied validated core0.9
and binding3 Documents and explicit strict/report policy. Its result schema is
`spec/projections/bit128-model.schema.json`, exported as
`bit128ModelProjectionSchema`. Result members are operation project-bit128-model,
version1.0.0, complete source/binding, lossPolicy, status projected/reported/blocked,
residuals `{path,reason}[]`, nativeRequirements, mappings and optional candidate `{format,text}`.
Each mapping has record identity, table and Fields with exact identity, carrier
slots and native segment-array paths; paired file paths include their group.
Blocked results MUST omit candidates. Strict MUST block every retained residual.
Recovery recomputes all inputs and exact native text; stale source, changed text
or forged report MUST fail BIT128_MODEL_STALE. This is consistency, not custody
or native schema equivalence.

Every Record and member Field MUST have exactly one binding. This initial model
subset accepts singular required/absent-allowed UUID/bits128 Fields, explicit
unpartitioned Records and complete known Key declarations. Groups, containers,
other scalar families, unknown relevant semantics and unbound Fields MUST refuse
instead of disappearing. All full source content remains copied. Unsupported
carriers or target versions MUST refuse without selecting a fallback.

Relationship rows are exactly `{module,id,storage:'foreign_key',fields:ElementRef[]}`.
They select an existing directed relationship with one source and one target
Record and no associationRecord. Fields belong to the source in the target Key's
component order; scalar domains, carrier kinds and signedness MUST agree.
Every logical relationship needs exactly one layout. SQL foreign-key projection
requires targetMultiplicity.max1. Independent/owned lifecycle, mandatory reverse
participation and unimplemented finite bounds receive residuals. No lifecycle
cascade is invented. File/model output retains relationships as residuals.

Index rows are exactly `{name,kind:'btree'|'unique',on:{field:ElementRef}[],unique:boolean}`.
All Fields MUST be distinct and in one Record. Kind unique requires unique true.
Other index kinds, predicates, includes and document expressions MUST refuse.
Both halves of a paired Field MUST be included in every Key/index/foreign key.
Nullable unique indexes and reverse-uniqueness constraints enforce uniqueness
only for present values, using an all-slots-nonnull filter; multiple absent
values are distinct from a present Nil UUID under this explicit profile.
Native model SQL identifiers use bounded ASCII letter/underscore followed by
letters/digits/underscores. Case collisions and generated-object-name collisions
MUST refuse. Keys/indexes have a conservative16-slot limit and SQL Server's
900-byte budget. SQL Server word pairs MUST be signed bigint; unsigned refuses.

SQL candidates are complete ordered table/Key/index/foreign-key DDL. `nativeRequirements` is an array of `{scope:'connection',statements:string[]}`.
SQL Server declares and emits ANSI_NULLS ON, QUOTED_IDENTIFIER ON, ANSI_PADDING ON,
ANSI_WARNINGS ON, ARITHABORT ON, CONCAT_NULL_YIELDS_NULL ON and NUMERIC_ROUNDABORT
OFF. Every connection writing the generated filtered-index layout MUST apply
these requirements; schema creation alone does not configure future connections.
Other targets return an empty array. Requirement metadata does not authorize
execution of a blocked result. Both-null
or both-present checks protect nullable pairs and entire nullable foreign-key
component groups. Text uses canonical lowercase grammar/length checks; SQL Server
uses Unicode text with binary collation. Bytes have exact16-byte checks. SQL
literal defaults implement on missing; on null/missing-or-null reports the
unimplemented NULL substitution. Allowed values emit full-slot checks. Native
UUID comparison and signed tuple index order do not become portable byte order;
no ORDER BY or range-index equivalence follows from this schema projection.

Avro/Parquet/TableSpec candidates are explicit JSON bundles
`{profile:'umf-128-native-model/1',system,records}`. Each Avro record is a native
schema; each Parquet record is a native-writer column layout, not file bytes;
each TableSpec record is a native model document. Nullable word pairs use one
group named highColumn plus `__pair`, with required high/low members bearing
the authored slot names. Group absence represents logical absence. Names MUST
be collision checked. Avro long only admits signed words; Parquet carries signed
or unsigned integer64 annotations. Avro named types use unique per-record/Field
namespaces. TableSpec admits only explicitly selected uuid-text/hex128-text and
emits context-default nullability plus primary/alternate Key declarations.
No native file/model uniqueness, FK/index enforcement, string grammar or
unimplemented refinements/defaults may be represented as exact. Apache Avro's
ignored fixed UUID annotation remains a residual.

`encodeBit128Record(binding,logical,record,values)` and
`decodeBit128Record(binding,logical,record,slots)` convert complete rows. Values
are one `{field:ElementRef,value:CoreLiteral}` per member; slots contain every
exact native slot once as string/null. Missing/extra/repeated Fields or slots,
partial pairs, wrong domains and unsafe tokens MUST refuse atomically.
`encodeBit128FileRecord` / `decodeBit128FileRecord` use the same arguments and
constraints, with a nested JSON-safe native datum for file/model targets. Present
pairs require two nonnull decimal strings; absent groups are null. Driver-owned
conversion maps decimal strings to exact native64-bit values and hex tokens to
network-order bytes. These functions do not execute a read or mutation and do
not authorize independent half updates. A consumer MUST write/read the complete
carrier in one statement or a qualified consistent transaction.

The new APIs throw BIT128_MODEL_SOURCE/POLICY/TARGET/RESULT/STALE,
BIT128_LAYOUT/IDENTIFIER/SLOT_COLLISION/KEY_WIDTH/KEY_NULL/SQL_UNSIGNED/SQL_VALUE,
BIT128_RECORD_IDENTITY/SOURCE/VALUE, or BIT128_FILE_TARGET/VALUE and
BIT128_AVRO_NAME/UNSIGNED/PARQUET_NAME/TABLESPEC_NAME/CARRIER as applicable.
Failures publish no partial native candidate or row; they authorize no retry,
implicit conversion or alternate layout. Versioned observations and qualification
gate status live in the adapter completion execution record.

## Composition extension — owner direction 2026-10-16

The separately selected `uuid-model2` profile composes existing singular UUID/
bits128 carriers with exact scalar column tokens. It MUST NOT widen `uuid-model1`.
`storage:column` selects native SQL scalar storage and exact-text scalar storage
for Avro, Parquet and TableSpec. This selection is explicit in the versioned
profile; file arithmetic/type enforcement remains a residual. Supported scalar
value domains are boolean, bounded integer (including integer128), decimal with
explicit precision/scale up to38 digits, string and binary. Float/temporal arithmetic and validity
semantics are not introduced; exact lexical-token storage is specified below. Existing scalar codecs validate all declared facets,
allowed values and availability; unknown relevant meaning MUST refuse.

Composition lowering MUST preserve complete source and binding, recursive array/
map item identity, empty versus absent values, order and duplicates. Groups need
explicit membership and ownership declarations; their meaning MUST NOT be guessed
from labels or unrecognized extensions. Association layouts MUST enumerate every
source/target Key mapping and retain association Record attributes. Native file
schemas do not enforce dataset referential integrity or multiplicity; portable
dataset validation and explicit residuals are required. SQL constraints MUST NOT
invent ownership cascades. New composition support remains unqualified until its
native and browser gates execute; earlier singular-profile receipts remain scoped
to their original source cuts.

### Composition layout and values

For `uuid-model2`, optional `groups` is an array of
`{module,element,members:ElementRef[]}`. Each identity MUST resolve to an explicit
core Group; members MUST be distinct exact Field identities. A singular Field
with exactly one `references:[{role:'record-type',module,element}]` selects that
Group. No Group membership is inferred from display names. Array/map Fields
select their item/value Field through existing `itemType`. Shape definitions
MUST be finite and acyclic (depth64 and10,000 expanded nodes); value limits also
apply. Every source Field/Group and selected binding MUST be reached. Reusable
item/group definitions are by-value types, not shared stored instances.

Each root composite Field uses `storage:column,column:string`; it selects SQL
JSON storage (`jsonb` / checked `nvarchar(max)`), native nested Avro/Parquet
storage, or TableSpec VARCHAR JSON text. Nested scalar leaves select ordinary
column tokens; nested UUID/bits128 leaves select their existing explicit carrier.
Native file word-pair children remain required together; optional value/group
absence wraps the complete pair. Canonical typed values use existing scalar,
`{array:ModelLiteral[]}`, `{map:Record<string,ModelLiteral>}` and new
`{group:{field:ElementRef,value:ModelLiteral}[]}` wrappers. A group value MUST
supply exactly its declared members once. Native group properties `m0`, `m1`,…
follow declared member order. Map keys are exact strings; arrays preserve order
and duplicate entries. Null is absence only where declared; empty containers
and present groups with absent children remain distinct. JSON-text `null` MUST
NOT be silently reinterpreted as SQL/CSV absence. Duplicate native JSON members,
partial word pairs and extra/missing members MUST refuse.

Projection `compositeMappings` enumerates Record, root Field, referenced Field,
root column, storage (`json-column` or `native-nested`), paired terminal slots
and tagged path segments (`member` with `name`, `array-item`, `map-value`). Tagged
segments distinguish dynamic map values from a literal map key. Reports retain
all logical and binding content, and recovery recomputes this complete surface.

All eleven scalar families can coexist in this profile. Boolean, bounded integer,
decimal, string and binary values use existing exact portable semantics. Float,
date, time and timestamp use their exact typed lexical tokens; no new arithmetic,
calendar, timezone or validity semantics are asserted. Such tokens use SQL/file
text and carry an explicit semantic residual. Native SQL scalar types likewise
retain unimplemented facet/equality/order obligations. File/model scalar columns
use explicitly selected exact-text fallback; native string storage MUST NOT be
reported as enforcement of numeric, temporal or boolean domains.

### Association layout and snapshot validation

A relationship may select
`{module,id,storage:'junction',record:ElementRef,source:AssociationEnd[],target:AssociationEnd[]}`,
where `AssociationEnd` is `{record:ElementRef,key:string,fields:ElementRef[]}`.
The selected Record MUST be keyed and agree with `associationRecord` when one
is declared. Source and target endpoint sets are alternatives, not a hyperedge.
Each declared endpoint type MUST have exactly one mapping to an existing named
Key; target key IDs MUST agree with the declaration. Every endpoint component
belongs to the association Record, matches its referenced domain/carrier/facets,
and participates in a complete ordered tuple. Endpoint component sets are
disjoint. Multiple alternatives use nullable complete component groups, with
exactly one present alternative on each side per association instance. Association
identity, attributes, direction and inverse presentation remain in copied source.
SQL emits FKs and exclusive-choice checks; file/model enforcement remains residual.
No pair uniqueness or lifecycle cascade is invented.

`validateBit128Dataset(binding,logical,populations)` accepts a complete finite
snapshot: one `{record:ElementRef,rows:Bit128RecordValue[][]}` per bound Record,
including empty populations. It returns copied normalized logical populations
only after full-row validation, all named Keys/unique indexes, composite reference
integrity, endpoint choice and declared multiplicity pass. Multiplicity counts
distinct endpoint Record instances (including zero-degree Records), not association
rows; repeated association instances connecting the same endpoints remain valid
unless a declared Key/unique index prohibits them. Incomplete populations, orphans,
partial references, duplicate Keys and violated bounds throw MODEL_DATASET.
This API does not prove snapshot consistency under concurrent writes, execute
mutations or establish lifecycle behavior. MODEL_SHAPE / MODEL_SHAPE_VALUE /
MODEL_SCALAR / MODEL_SCALAR_VALUE identify unsupported layout/value failures;
inputs remain unchanged. Strict projections block retained residuals.
