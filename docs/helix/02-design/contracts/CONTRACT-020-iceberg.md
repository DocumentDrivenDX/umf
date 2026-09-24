---
ddx:
  id: CONTRACT-020
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-020
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-020: Iceberg schema JSON

**Type:** library/schema. **Version:** 0.1.0 bootstrap. **Status:** draft.

## Purpose

Preserve and inspect standalone Iceberg schema JSON with exact field identity and native
content, then propose edits without silently applying native-library normalization.

## Scope and Boundaries

Authority is Apache Iceberg 1.11.0, commit 6976e020b894f6a6777704df2b8c4458cb291ae9,
with pinned specification, license, notice and hashes in native/iceberg/sources/.
PyIceberg 0.11.0 supplies independent native observations. This is a standalone preservation
and consistency profile, not table format-version validation or a complete Iceberg reader.
Table metadata, partition/sort specifications, manifests, geospatial parameter interpretation,
default encoding/execution and historical schema evolution remain separate work.

## Normative Surface

umf.iceberg 0.1.0 stores {profile:"iceberg-schema-json",root:<NativeJson>} in module schema,
element schema. spec/extensions/iceberg/schema.json describes its full envelope;
datatype-schema.json describes recursive source shapes, including unknown type forms;
package.json declares registration, scope and evidence. The source tree is authoritative.
Object order and number tokens remain; source whitespace is not an archival guarantee.

Root type/fields are required. schema-id and identifier-field-ids remain absent if omitted.
Fields require id/name/required/type; doc and both defaults are optional. Lists require
an element ID, element-required and element type. Maps require key/value IDs and types,
plus value-required. Signed-int32 IDs retain their native values; nonpositive field IDs and
the reserved metadata range receive table-context diagnostics, without arbitrary renumbering.
IDs must be globally unique across fields and collection components; sibling names must be
unique. Known decimal precision/scale and fixed-length bounds are checked. Unknown native
properties, nonempty type spellings and object forms retain their content with diagnostics.

Identifier IDs must resolve to required primitive fields beneath required structs, outside
collections; float/double are forbidden. Unknown primitive eligibility remains qualified.
Identifier declarations MUST NOT imply an enforced primary key or unique-row guarantee.
Defaults remain exact arbitrary JSON with diagnostics; no evaluation/coercion occurs.

| API | Result and behavior |
| --- | --- |
| importIcebergSchema(text,{id}) | Bounded exact-JSON parse into a validated Document; malformed known structure or consistency rejects |
| exportIcebergSchema(document) | Render authoritative NativeJson; unknown representation content blocks rather than disappears |
| inspectIceberg(document) | Registry validation with explicit native/context diagnostics |
| icebergRegistry(), icebergPackage | Pinned extension registration and package schema |
| getIcebergNode(document,pointer) | Copy of an existing exact-node value |
| proposeIcebergNodeEdit(document,pointer,text) | Copied candidate document and validation; existing target only; failure leaves source untouched |

Generic edits do not allocate new schema IDs, validate dependent table specs or authorize
committing table evolution. Native number tokens, unknown native keys and original spelling
of type parameters must not be normalized during export.

## Precedence and Compatibility

CONTRACT-001 governs UMF serialization. The pinned native specification governs meanings;
PyIceberg acceptance alone does not override source-shape or identity constraints. Missing
schema-id can be valid for v1 and is required for later table formats; absence is preserved
until a table context is supplied. New types/defaults require separate format-version checks.
Unknown native content may round trip; unknown UMF representation fields must remain in UMF
and prevent a native export that would discard them. A copied candidate coexists with source.

## Error Semantics

ICEBERG_STRUCTURE, ICEBERG_DUPLICATE_ID, ICEBERG_DUPLICATE_NAME, ICEBERG_TYPE_PARAMETERS and
ICEBERG_IDENTIFIER report errors. Context/default/unknown diagnostics are warnings and do not
assert native compatibility. Invalid documents cause ICEBERG_DOCUMENT; missing pinned payload
causes ICEBERG_PAYLOAD; lossy representation export causes ICEBERG_EXPORT. Existing native-pointer
and exact-JSON parsing errors propagate. No native code, remote resources or expressions execute.

## Examples

fixtures/iceberg/nested.json exercises collection IDs and nested identifiers. Editing
/fields/1/type/fields/0/name to "renamed" leaves field 3 and identifiers [1,3] unchanged.
exact-defaults.json retains signed-int64 defaults and unknown metadata beyond JS safe integers.

## Non-Normative Notes

The 35 authored cases yield 26 preserved schemas and nine UMF rejections. Twenty-one preserved
schemas retain identical PyIceberg re-emission across both formats; five preserve unsupported
variant/geospatial/future cases with unchanged native rejection. PyIceberg accepts four inputs
that this profile rejects: duplicate IDs, a collection-ID collision, out-of-range decimal
precision and an omitted required flag. These differences are recorded, not hidden as parity.
Native nested-rename evidence confirms IDs and identifier declarations are preserved. Full
upstream corpus and physical schema-evolution evidence remain pending. No new core promotion
follows from similarity to DDD identity, Delta mapping IDs or SQL keys.

## Validation

US-020-AC1–3 map to tests/iceberg/schema.test.ts and fixtures/iceberg/*results.json.
The native and Chromium harnesses execute the public round-trip/edit path. Passing these
checks establishes only the bounded standalone profile above.

AC4 extends evidence to every JSON resource under core/src/test/resources in the pinned
Apache Iceberg 1.11.0 tree. Nineteen source documents plus LICENSE/NOTICE are archived with
byte hashes. Twenty-one schema occurrences are extracted from schema or schemas entries,
with original resource path/pointer; they represent seven distinct canonical source schemas.
Full resources remain authoritative context. Some are deliberately invalid table/view metadata
fixtures; acceptance of an embedded schema does not validate the enclosing resource.

Twenty schema occurrences round-trip in both formats and support a candidate first-field
rename without changing IDs, defaults or other native schema meaning. PyIceberg 0.11.0 and
Apache Iceberg Java 1.11.0 independently verify 40 round trips and 20 edits. The remaining
occurrence, schema-3 from TableMetadataV1MissingSchemaType.json, lacks root type. UMF and
Java reject it; PyIceberg inserts its default struct type and accepts it. UMF retains the
original resource and extracted JSON but does not silently insert that default. This evidence
confirms the existing contract's required root type rather than relaxing it to one runtime's
permissiveness. Java source authority is the pinned SchemaParser.typeFromJson implementation.

Chromium repeats all 21 outcomes and 20 edits. Evidence is in fixtures/iceberg/upstream/;
source retrieval, extraction, Python comparison and Java comparison have separate scripts.
The Java oracle uses a pinned iceberg-core Maven dependency and build plugins, with artifacts
under .cache; Java 21.0.2 is the recorded runtime. Maven/JVM remain development-only. Native
schema re-emission is the equivalence oracle here; data files and historical table evolution
are not tested. Partition/sort/table metadata and broader upstream type cases remain required.
