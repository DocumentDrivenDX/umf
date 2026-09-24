---
ddx:
  id: CONTRACT-011
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: US-011
      kind: informed_by
---

# CONTRACT-011: OpenAPI native descriptions

`umf.openapi` 0.1.0 preserves JSON-compatible OpenAPI JSON/YAML as an exact JSON
tree plus original source/format. The complete payload schema is
`spec/extensions/openapi/schema.json`, embedded in the extension package. Native
version remains inside the root; the representation profile does not rewrite it.

## Preservation and Access

Operations, paths, parameters, media types, schema objects, references, security,
webhooks, callbacks, links and specification extensions remain native content.
Copied JSON Pointer access returns exact typed nodes. Numbers remain lexical strings,
including values unsafe for host arithmetic. Original source preserves comments and
formatting. Unchanged same-format export returns that source; edited or converted
output uses exact JSON syntax, also valid YAML 1.2. Bundles report edited layout
changes and retain source UMF; native-only output cannot recover unrelated metadata.

The YAML reader accepts JSON-compatible scalar/map/sequence values, with string
mapping keys. It rejects duplicate keys, aliases, explicit tags, multiple documents,
non-finite values and unsupported numeric spellings instead of silently flattening
meaning. Numeric YAML spellings normalize to exact JSON tokens without floating-point
rounding. Text, depth and value limits apply. Unknown tree/payload representation
fields survive core serialization but block native export.

## Validation Profile

Pinned official schemas validate OpenAPI object structure:

- [Swagger 2.0 schema, 2017-08-27](https://spec.openapis.org/oas/2.0/schema/2017-08-27).
- [3.0 schema, 2024-10-18](https://spec.openapis.org/oas/3.0/schema/2024-10-18).
- [3.1 object schema, 2026-08-03](https://spec.openapis.org/oas/3.1/schema/2026-08-03).
- [3.2 object schema, 2026-08-30](https://spec.openapis.org/oas/3.2/schema/2026-08-30).

The current normative release checked during discovery is
[OpenAPI 3.2.1](https://spec.openapis.org/oas/v3.2.1.html). Schema resources are vendored
unchanged with hashes and Apache license. The 3.1/3.2 schemas deliberately do not validate embedded
Schema Object dialects. The Draft-04-based 2.0/3.0 resources check their declared
Schema Object subset; this is not full instance or prose conformance. Formats, reference resolution, all normative prose rules,
HTTP serialization, authorization and runtime execution are not implemented by this
profile. `OPENAPI_VALIDATION_LIMIT` keeps every such result explicitly incomplete.
Versions outside the pinned 2.0/3.0/3.1/3.2 profiles remain recoverable with
unsupported-version warnings. Exact numbers beyond safe host interpretation prevent host validation,
with an explicit diagnostic rather than rounded validation inputs.

Ajv misbinds the official schemas' `#meta` dynamic anchor during standalone object
validation. The adapter substitutes `$ref: "#/$defs/schema"` only in a private
validation copy. There is no outer dynamic binding in this profile. This workaround
must not be used for schema-base/dialect extension validation. Python jsonschema
independently evaluates the unmodified resources over the positive/negative corpus.

## Candidate Edits and Evidence

`proposeOpenapiEdit` replaces an existing native node in a copied document and
returns the candidate plus validation results. Invalid structural candidates fail.
A valid-but-incomplete candidate is not a conformance certificate; the API reports
all remaining limitations. This differs from a conservative fully interpreted edit.
Original source remains archived and original documents remain unchanged.

The original Orders fixture covers paths, parameters, references, request/response
media, security, callbacks, webhooks, links and native extension fields. Tests cover
JSON/YAML retention, exact numbers, copied access, edits and invalid/unknown content.
Twelve object-validation cases across 3.1.2/3.2.1 agree with Python's unmodified-schema
oracle, with object-only acceptance distinguished from the additional embedded-dialect checks below.
Actual Chromium exercises preservation, candidate edits and incomplete status.

Next work includes embedded schema dialect validation, contextual reference resolution,
broader semantic interpretation and cross-system projections.


## Official Examples and Legacy Validation

The OpenAPI Initiative Learn OpenAPI examples are pinned to commit
`43756549c27cbf84107b190b82c65e0336f2f09f`: every JSON/YAML example is included,
with hashes and CC-BY-4.0 attribution/license. All 38 complete descriptions across
2.0, 3.0, 3.1 and 3.2 preserve exact source through core serializations and validate
against unmodified official schemas in Python. Eight referenced fragment files
remain in the corpus; standalone import rejects them because no version/context
is supplied. They are not silently assumed to be complete descriptions.

Legacy browser validation uses ajv-draft-04 1.0.0 with the same safe JSON equality
hooks used by core. Eight legacy positive/negative cases agree with Python Draft4
validation; actual Chromium verifies legacy acceptance and invalid candidate rejection.
The YAML corpus oracle explicitly retains timestamp-tagged literals as strings,
avoiding PyYAML's default date/time object conversion for JSON-compatible OpenAPI.


## Explicit Resource Bundles

Optional `baseUri` and `resources` preserve a multi-document description. Each resource
has an absolute fragment-free URI, exact native tree, original source and original
format. A resource list requires a base URI. URL-normalized duplicate resource URIs
or collisions with the owning document URI fail. Resource content is JSON-compatible
but is not required to be a complete OpenAPI document. Unknown resource representation
fields survive core serialization and block native export.

Import accepts supplied `{uri, text, format}` resources; it does not discover or fetch
files. Bundle export returns the root source, base URI and all supplied resource
artifacts. Root-only export refuses nonempty resource lists. Unchanged resources
retain exact source; edits emit current JSON syntax with original source archived.
Copied node access and candidate edits accept a resource URI. Candidate validation
remains incomplete because resource target kind/context is not inferred.

`lookupOpenapiResource` resolves a caller-provided reference against an explicit
owned document URI, then performs literal JSON Pointer lookup into the supplied
resource map. It returns a copied node and `interpretation: "literal-document-pointer-only"`.
Missing resources/pointers, malformed URI fragments and named anchors fail. No
recursive dereferencing or network access occurs. This is **not** general OpenAPI
or JSON Schema resolution: nested `$id`, `$self`, anchors, dynamic scope, reference
object target kinds and closure require further context-aware interpretation.

The official separate-file petstore is tested in JSON and YAML: each bundle contains
one full description and four fragments. All eight fragment sources remain exact
through UMF serialization and bundle reimport. Independent Python URI/pointer lookup
checks the fixture's references without fetching, then Draft4 validation observes a
changed Pet ID type. Browser tests exercise lookup, edits and context diagnostics.


## Embedded Schema Keyword Validation

For OpenAPI 3.1/3.2, semantic inspection additionally locates Schema Objects by native
object role: component schemas, parameters/headers, media content, request bodies,
responses, callbacks/webhooks, path items, additional operations, media item schemas
and encoding headers. Examples, defaults and specification-extension data are not
scanned for declarations merely because they contain keys named `schema` or `type`.

The default 3.1 profile uses the pinned dialect/meta resources dated 2024-11-10;
`https://spec.openapis.org/oas/3.1/dialect/base` is interpreted under that 3.1 profile.
The default 3.2 profile uses dialect/meta resources dated 2026-02-26. Explicit JSON
Schema Draft 2020-12 is also recognized. Other dialect IDs, including unpinned older
3.2 IDs, remain unknown with `OPENAPI_SCHEMA_DIALECT` diagnostics. Document-level
`jsonSchemaDialect` supplies the default, and each Schema Object's `$schema` can
change the inherited dialect. Unknown dialect subtrees are never validated under
a different dialect's rules.

Each known schema position receives shallow Draft 2020-12 meta-validation plus the
pinned OpenAPI vocabulary meta-schema where applicable. Schema-valued keywords are
then visited with their own dialect context; this includes deprecated schema-valued
`dependencies`. This avoids applying a parent's known dialect through a nested unknown
dialect boundary. Known invalid keyword types, nested schemas, discriminator fields
and XML annotations fail. This is meta-schema syntax checking, not instance validation,
reference resolution, custom vocabulary execution or transport behavior. Resource
fragments still require explicit contextual interpretation.

Independent Python validation uses the unmodified official dialect/meta resources
for nine fully known cases and two 3.2 vocabulary checks. Unknown dialect and literal
extension cases remain separately excluded from that oracle, with authored retention
checks. Object-only schema acceptance is reported separately from the stronger combined
browser profile. The global validation-limit warning remains in force.


## Typed Reference Object Chains

`resolveOpenapiObjectReference` resolves a caller-declared role at a native pointer
within an explicitly supplied document/resource bundle. The first profile supports
OpenAPI 3.1/3.2 parameter, header, response, request-body, example, link and
security-scheme Reference Objects. Source role is supplied, not inferred from pointer
location. Schema Objects, Path Item `$ref` merging, callbacks and legacy reference
semantics are outside this resolver and fail unsupported-role/version checks.

Resolution follows relative URI/JSON Pointer chains only through supplied resources,
with a maximum of 128 reference hops. Missing/scalar/wrong-role targets, invalid
Reference Objects and cycles fail. Named anchors and OpenAPI 3.2 `$self` identity
scopes also fail explicitly; retrieval-URI lookup is not substituted for those scopes.
No files or URLs are fetched. Concrete targets are validated against the pinned
version-specific object schema for the declared role.

The complete result schema is `spec/extensions/openapi/reference-result.schema.json`.
Results retain a copied chain of reference nodes, copied target with URI/pointer,
effective annotations, `complete: false` and limitations. The default annotation
policy applies the outermost summary/description override where the object role
supports that field, then falls back to target annotations. Summary has no effect
for supported roles other than Example. Other reference siblings are retained in
the chain and are not merged into the target. No flattening or mutation occurs.
Annotation origins remain traceable through the ordered chain; URI-bearing content
and rich-text rendering are not rebased or executed.

This behavior follows the default override policy in the
[Reference Object specification](https://spec.openapis.org/oas/v3.2.1.html#reference-object).
It does not resolve nested references or establish embedded schema context, transport
semantics or full reference closure. Those gaps are present in every result.

Tests cover all seven concrete target roles, cross-document chains, sibling retention,
copy isolation, cycles, missing resources, role mismatches and scope rejection. Python
independently follows the authored chain and validates targets against unmodified
official schemas; actual Chromium executes the public resolution API.

## Contextual Schema Extraction

`extractOpenapiSchema(document, {pointer, resourceUri?})` selects a declared Schema
Object entry position within an OpenAPI 3.1/3.2 description. It returns the exact native
tree/text, pointer, retrieval URI when available, version, effective dialect and dialect
origin, plus a copied UMF source containing every supplied resource. The result schema
is `spec/extensions/openapi/schema-extraction.schema.json` (with core schema dependency).
Schema `$schema` overrides the document default; absent both, the pinned OpenAPI
version default applies. See [Schema dialect rules](https://spec.openapis.org/oas/v3.2.1.html#specifying-schema-dialects).

The text is a contextual fragment, not a standalone validator. No references or IDs
are rewritten; `$self`, `$id`, anchors, dynamic scope and HTTP direction/serialization
remain unresolved. Unknown dialects and numeric lexemes remain intact. `complete` is
always false. Selection rejects examples, arbitrary nested pointers, legacy versions
and resource fragments lacking their own owning OpenAPI description. This API supports
metadata consumers and future projections; it does not complete OpenAPI projection work.

## Static Schema Scope

`indexOpenapiSchemas` indexes known Draft 2020-12 and pinned OpenAPI 3.1/3.2 schema
positions. Optional `schemaResources` explicitly classifies supplied standalone schema
documents, which must declare `$schema`. Other fragments remain unclassified. Complete
OpenAPI descriptions in the bundle contribute their declared Schema Objects. Retrieval
URIs, OpenAPI 3.2 `$self`, nested `$id`, `$anchor` and `$dynamicAnchor` produce an
identity index. Unknown dialects and conflicting identities fail without changing source.

`resolveOpenapiSchemaReference` accepts a source schema pointer, static reference,
optional retrieval URI and standalone-resource selection. It resolves one static URI
and returns source/target locations plus copied native target. Pointer fragments are
relative to the identified resource; named anchors also support retrieval aliases.
Examples and arbitrary unknown-keyword values do not become schema positions.
These operations follow the [JSON Schema core scope model](https://json-schema.org/draft/2020-12/json-schema-core#section-8.2).
The complete result schemas are `schema-index.schema.json` and
`schema-reference.schema.json` under `spec/extensions/openapi/`.

Both results report `complete: false`: dynamic-reference evaluation, instance validation,
unknown vocabularies, unclassified fragments and HTTP semantics remain outside this
static lookup. URI handling uses WHATWG URL; wider RFC URI-normalization equivalence
has not been established. Python referencing independently agrees on four authored
JSON Schema resolutions; OpenAPI `$self` and source-role discovery have authored tests,
not independent OpenAPI runtime evidence. Static `$dynamicAnchor` lookup does not
claim evaluation-time `$dynamicRef` behavior.

## Explicit Dynamic Scope Resolution

`resolveOpenapiDynamicReference` reads `$dynamicRef` from a selected indexed schema
and accepts an `evaluationScope` of 1–128 resource URIs, ordered outermost to innermost.
Optional resource selection follows the static API. Scope identities must be indexed,
fragment-free, and end at the source schema's owning resource (retrieval aliases are
accepted). The initial reference must resolve before any dynamic override is selected.

When the initial named fragment is a `$dynamicAnchor`, select the outermost supplied
resource defining the same dynamic anchor. Ordinary anchors and pointer fragments do
not acquire dynamic behavior. Preserve initial and selected targets, source locations,
copied native content and supplied scope. The complete result contract is
`spec/extensions/openapi/dynamic-reference.schema.json`. These rules follow
[Draft 2020-12 dynamic references](https://json-schema.org/draft/2020-12/json-schema-core#section-8.2.3.2).

`complete` remains false. This operation neither constructs nor certifies an instance
validation path and does not evaluate assertions or collected annotations. Static
projection still rejects dynamic schemas because its resource flattening would alter
dynamic behavior. Six independent Python referencing comparisons establish target
selection only; authored negative cases and Chromium cover the public API boundaries.
