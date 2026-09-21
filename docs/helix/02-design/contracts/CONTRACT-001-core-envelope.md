---
ddx:
  id: CONTRACT-001
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# CONTRACT-001: Core document and extension package

**Type:** schema/library. **Version:** 0.1.0 bootstrap. **Status:** draft,
implemented experimentally; no native-adapter support implied.

## Purpose

Define the first executable envelope for versioned semantic vocabularies,
identity, references, preservation, and validation. FR-4/5/15/16/23/34 and FR-39
require a portable foundation before native concepts can be tested for promotion.

## Scope and Boundaries

The structural definitions are [core schema](../../../../spec/core/schema.json)
and [package schema](../../../../spec/core/extension-package.schema.json), using
JSON Schema Draft 2020-12. This envelope carries representations; it does not
promote entity, record, aggregate, or cardinality semantics into core. The scalar
family field below is now implemented; native scalar refinements remain extension-owned.

**Owner direction, 2026-09-21:** the owner explicitly prioritizes a core
scalar type field and other shared column metadata, derived first from TableSpec,
PostgreSQL, SQL Server, Avro and Parquet. The paragraph above describes the currently
implemented envelope, not a decision to keep scalar types out of core indefinitely.
Define common value families, native refinement/provenance retention and compatibility
tests, then update schema, TypeScript types, validation and ingestion together. A
shared scalar family must not certify equal coercion, comparison or storage behavior.

### Next semantic revision (specified, not implemented)

CONTRACT-040 governs ordered field, nullability, cardinality, facets and key ideals.
These are UMF definitions under FR-3, not assertions that native refinements are
equivalent. This contract's existing schema and scalar-only envelope describe the
current implementation. TD-040–TD-044 must implement the new contract incrementally;
this documentation evolution does not change spec/core/schema.json. Existing
native refinements remain attached after new ideal fields are added. The next
revision must distinguish authored ideals from adapter classifications and detect
stale classification rather than overwrite author intent.

### Portable element selection

`selectCoreElements(source,query,registry?)` supports exact module-ID, namespace,
element-name, scalar-family and module/element identity filters. Filter categories
combine with AND, values within a category with OR; an empty array matches nothing.
An omitted category imposes no filter. Unknown scalar-family strings remain selectable
by exact spelling without gaining interpreted semantics. Stable source order determines
result order. Identity is the module/element pair, never a shared display name.

The query must explicitly choose references:none or references:transitive. Transitive
selection follows only Element.references, including targets outside the initial filters,
and terminates on cycles. IncludedBy distinguishes initial matches from reference targets.
Without traversal, boundaryReferences retains each outgoing reference and target path,
including repeated edges and unknown reference annotations. Native links inside extension
payloads are not discovered; referenceScope explicitly states this limit.

Results retain a full copied source document, copied query, source validation diagnostics,
selected element copies, source paths and qualified module context. Full source retention
keeps native/provenance/unknown context available even when it is outside selected elements.
This is a metadata view, not a pruned export or proof of complete native dependencies.
It reads declared core elements; it does not recompute adapter-derived fields or certify
their agreement with native payloads. Adapter export/consistency checks remain required.
Core-invalid documents and supplied-registry semantic errors reject even if the affected
element would not match. An omitted registry reports unknown extensions. Input and result
copying enforce the existing JSON limits; exceeding them publishes no partial result.

The complete result schema is spec/core/element-selection.schema.json. Bun and Chromium
cover namespace collisions, cyclic/repeated references, future vocabularies/scalars,
copy isolation and both serializations. Selection from TableSpec, PostgreSQL, SQL Server,
Avro and Parquet preserves native recovery. CONTRACT-036 now demonstrates all seven
FR-41 consumer classes from one authored mixed model; general consumers remain open.

### Core scalar families

An element may contain `scalarType`. Recognized values are `boolean`, `integer`,
`decimal`, `float`, `string`, `binary`, `date`, `time` and `timestamp`.
These classify value families, not complete native types or instance validators:
boolean truth values, whole numbers, decimal numerics, binary floating-point numerics,
character sequences, byte sequences, calendar dates, times of day and date/time values.
Timestamp includes native civil or instant representations; its presence alone does
not specify a timezone, UTC conversion or comparison rule. Exceptional numeric values,
range/width/signedness, precision/scale, character encoding/collation, padding,
calendar, temporal unit/offset behavior and nullability remain native refinements.

An absent field makes no scalar claim. An unfamiliar nonempty string survives with
`UNKNOWN_SCALAR_TYPE` and incomplete semantic validation. Empty or non-string values
are structurally invalid. The JSON Schema exposes known values in `knownScalarType`
and a forward-compatible string branch in `scalarType`; TypeScript exports
`SCALAR_TYPES` and `ScalarType`. This is an additive experimental 0.1.0 authoring
revision: documents without the field remain unchanged, unknown string families
remain portable, and `scalarType` is now a reserved string-valued field. It does
not certify arbitrary preexisting non-string uses of that formerly unknown key.

The first ingestion is TableSpec: BOOLEAN→boolean, INTEGER→integer, DECIMAL→decimal,
FLOAT→float, VARCHAR/TEXT/CHAR→string, DATE→date, DATETIME/TIMESTAMP→timestamp.
Every native column remains available, and EMBEDDING or unknown types do not receive
a scalar label. Avro now derives the same families for record fields under the
qualified mapping in CONTRACT-007, preserving native union branches and refinements.
PostgreSQL catalog captures expose these families only from explicit recognized
pg_catalog type identities under CONTRACT-015; unresolved/domain/array meanings
remain native. Parquet maps checked logical annotations before physical carriers
under CONTRACT-019, retaining repetition levels and native parameters.
SQL Server uses explicit canonical base type names and system IDs under CONTRACT-031;
rowversion/timestamp maps to binary and aliases retain native qualifiers. Further mappings require
native identity checks and qualifiers, not name-based guessing. SQL Server timestamp
must not be classified by its spelling; Avro nullable unions and Parquet physical
carriers require native interpretation. The new field establishes shared family
metadata, not full cross-system scalar equivalence or a conversion guarantee.

This first implementation uses a bounded JSON-compatible numeric/serialization
profile. Larger/exact native numeric domains need an explicit extension encoding
or a later lossless number API; rejection is mandatory until then. This profile
cannot substantiate full JSON Schema/native numeric fidelity.

## Normative Surface

| Element | Required | Meaning / rules |
| --- | --- | --- |
| `umf` | Yes | Exact core version `0.1.0`; no version guessing |
| `id` | Yes | Nonempty document identifier; treated as opaque, not fetched |
| `vocabularies` | Yes | Map of opaque extension identifier to declaration with exact `version` |
| `modules` | Yes | Array of modules, each with `id`, `namespace`, and `elements` |
| module `id` | Yes | Unique within the document |
| module `namespace` | Yes | String carrying a naming scope; not a DDD bounded-context declaration |
| element `id` | Yes | Unique within its module; schema-element identity only |
| element `name`, `description` | No | Descriptive strings; no native semantic identity inferred |
| element `extensions` | Yes | Map from declared vocabulary identifier to JSON payload |
| module/document `extensions` | No | Same map at the relevant scope |
| element `references` | No | Array of `{role,module,element}`; target must exist in the supplied document |

Reference resolution MUST use exact module and element identifiers. Namespaces
and names MUST NOT cause merging. External-document references are not supported
by this bootstrap reference surface; native extensions can preserve their own
reference syntax without claiming core resolution. Duplicate IDs or unresolved
core references invalidate a document.

Unknown object fields MUST be retained in JSON-compatible copies and serialization.
An unknown core field or unavailable extension version makes semantic validation
incomplete, not structurally invalid. Every used vocabulary MUST be declared.
Extension payloads have no inferred core meanings.

### Package registration

A package MUST declare `id`, `version`, `coreVersion`, `description`, structural
`schema` (object or boolean), human-readable `semantics`, permitted `scopes`
(`document`, `module`, `element`), and `capabilities`. Versions in this bootstrap
are exact numeric `major.minor.patch` identifiers, without range matching.

`capabilities.validation` is `structural` or `semantic`; `directions` lists
`import` and/or `export`; `evidence` lists evidence references. A nonempty
`directions` array requires `native.system`, `native.version`, and `native.subset`.
Declaration is not proof: an empty evidence list cannot establish native support.

Registration copies and freezes package data, rejects duplicate exact versions,
and compiles structural schemas without network resolution. Semantic validators
are separately installed trusted functions. Package data MUST NOT authorize code
execution. A declaration of semantic validation with no installed function remains
incomplete. The initial schema compiler accepts its configured Draft 2020-12
vocabulary, not arbitrary custom validation keywords; unresolved references or
unsupported schema keywords fail registration explicitly.

### Library operations

`readDocument(text, format)` and `writeDocument(document, format)` accept `json`
or `yaml`, defaulting to YAML. They validate core consistency, preserve unknown
semantics, and throw `UmfError` for invalid documents. `validateDocument(value,
registry?)` returns `{valid,complete,diagnostics}`. `valid` means no known errors;
`complete` means all present declared semantics were checked without diagnostics.
It is not a universal native conformance claim. The default registry is empty.

Diagnostics carry `code`, JSON Pointer `path`, `message`, and `severity`
(`error` or `warning`). Structural validity, unknown preservation, and semantic
completeness MUST remain distinct. Native oracles belong to later contracts.

`editExtension(document, registry, moduleId, elementId, extensionId, update)`
returns a copied document. It MUST validate before and after the update, reject
incomplete interpretation conservatively, and leave the original unchanged.
No operation-specific dependency contract exists yet; unknown content anywhere
blocks edits rather than certifying they are safe. Read/write retention remains
available even when edits are blocked.

### Serialization and resource profile

Use YAML 1.2 core scalar resolution, one document, unique string mapping keys,
no explicit tags or aliases, and JSON-compatible values. Formatting, comments,
anchors, and property order are not semantic fidelity promises. Multiple YAML
documents, duplicate keys, non-string keys, and parser warnings/errors MUST fail.
JSON mode also MUST enforce JSON syntax.

Numbers MUST be finite; integers must be within ±9,007,199,254,740,991. Negative
zero is rejected. Parsing MUST reject decimal literals whose exact decimal value
would change on the parse/write path, including overflow and underflow. Finite
programmatic numbers retain their supplied value; the API cannot recover precision
already lost before invocation. Extensions needing other numeric semantics must
use an explicitly specified representation rather than silently round values.

Reject undefined, functions, symbols, bigint API values, cycles, sparse arrays,
custom object prototypes, hidden properties and accessors. Do not call `toJSON`
or getters. Property names such as `__proto__` MUST remain data.

Limits: 4,000,000 UTF-16 code units per source/output text, nesting depth 128,
and 100,000 traversed values. Limit failures are explicit errors, never successful
partial validation. These are bootstrap safety bounds, not performance claims.
Trusted semantic validator execution is not sandboxed or time-bounded by this API.

## Precedence and Compatibility

Core structure governs the envelope; extension validators govern their own
payloads. Neither can reinterpret the other's identity or native semantics.
Package version selection is exact. Unknown future core versions fail explicitly;
unknown fields of the supported version are retained with incomplete interpretation.
Ideal admission follows FR-3/CONTRACT-040. Only native-equivalence graduation
requires separate bidirectional evidence and versioned migration/rollback.
TableSpec now has a captured source baseline and scoped ingestion/recovery evidence
under CONTRACT-030; broader compatibility remains unverified.

## Error Semantics

| Condition | Outcome | Recovery |
| --- | --- | --- |
| Invalid syntax/keys/tags/aliases/numbers/non-JSON content | Throw with `SYNTAX`, `KEY`, `DUPLICATE_KEY`, `TAG`, `ALIAS`, `NUMBER`, `NON_JSON` or `CYCLE` | Correct input or supply an explicit native encoding |
| Limit exceeded | `LIMIT` | Split input or use an independently specified larger-resource profile |
| Invalid core structure/identity/reference | Invalid result; document read/write throws `INVALID_DOCUMENT` | Repair input |
| Unknown core field/versioned vocabulary | Warning and `complete:false`; retain data | Install exact vocabulary or use preservation-only operations |
| Invalid/missing registry schema | `PACKAGE_STRUCTURE`, `PACKAGE_SCHEMA`, `DUPLICATE_VERSION` | Correct package or registration |
| Wrong extension scope/payload or semantic validator failure | Error; `valid:false`, `complete:false` | Fix input or trusted validator |
| Incomplete initial interpretation | `UNSAFE_EDIT` | Resolve semantics before editing |
| Missing edit target / invalid edited output | `MISSING_ELEMENT` / `INVALID_EDIT` | Correct update; original retained |

## Examples

[Minimal fixture](../../../../fixtures/core/minimal.json) is executable. The test
suite's `fixture.note` vocabulary is synthetic and establishes no native support.

## Non-Normative Notes

Bun 1.3.14, TypeScript 7.0.2, Ajv 8.20.0 and yaml 2.9.1 are pinned in the package
manifest/lockfile. Portable sources exclude Bun/Node global types. Browser output
bundles the schema definitions and validators; it requires no runtime server for
validation. Ajv dynamic compilation currently requires a browser policy allowing
its generated validation functions; CSP-restricted execution is not tested.

Sources inspected 2026-09-20: [JSON Schema Draft 2020-12 core](https://json-schema.org/draft/2020-12/json-schema-core),
[Ajv dialect support](https://ajv.js.org/json-schema.html), and
[yaml library API](https://eemeli.org/yaml/). These explain tool mechanisms;
UMF's compatibility and numeric profile above are project decisions.

## Validation Checklist

- [x] Envelope, versioning, validation boundaries and failure modes specified.
- [x] Unknown retention and conservative edit policy executable.
- [x] Browser core checks executed; see build evidence.
- [ ] Native semantics and numeric escape encodings require subsequent contracts.

## Shared Exact JSON Representation (2026-09-20)

`spec/core/native-json.schema.json` and `src/model/native-json.ts` now own the exact
JSON tree previously introduced by the JSON Schema adapter. JSON Schema, Avro and
OpenAPI embed identical node definitions, verified by a core regression. Existing
imports remain compatible. The new YAML reader produces the same representation
for JSON-compatible content, retaining exact numeric tokens. This is a proven
representation-level promotion; native identity, defaults, coercion, API execution
and storage concepts remain extension semantics. The core document envelope is unchanged.


The shared exact-YAML parser now accepts an explicit scalar-profile selection for adapters
(US-024-AC4). Its default remains JSON-compatible YAML 1.2. YAML 1.1, PyYAML boolean vocabulary
and date-only string projection are explicit choices used by LinkML; no new core semantic
vocabulary is implied. Exact integer decoding and non-JSON-node rejection retain the same
representation/limit rules. LinkML's contract records the date projection and native evidence.

## SQL Server index promotion decision

CONTRACT-031 v3 supplies counterexamples against promoting a bare is_unique index
flag to core identity or unconditional uniqueness. The native fixture accepts
duplicate keys and nulls outside a filter, and duplicates under a disabled unique
index. Avro accepts duplicates rejected by the enabled filtered index. Evidence is
in fixtures/sqlserver/indexes-oracle.json and index-projection-oracle.json. Keep
predicate, null/collation and enforcement-state semantics in the extension until
a shared contract has cross-system evidence. Existing scalarType promotion is
unaffected: basic value families do not imply index or domain semantics.

CONTRACT-038 supplies additional evidence for the limited scalar-family contract.
A TableSpec/Avro carrier cycle preserves string, integer32, boolean and float32
samples in two native codecs, while both codecs measure binary64
1.0000000000000002 narrowing to binary32 1.0. Shared float classification therefore
does not justify promoting width, rounding or overflow behavior as identical.
Native refinements and explicit representation policies remain required.
