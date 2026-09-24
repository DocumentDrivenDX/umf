---
ddx:
  id: TD-026
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-026
      kind: informed_by
    - id: CONTRACT-026
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-026: Browser JSON-LD preservation and processing

## Technical Approach

Use core NativeJson trees for source and contexts so JavaScript processing never becomes the
source of truth for exact numeric tokens. Source parsing/serialization and copied pointer edits
are synchronous; expansion is an asynchronous proposal using pinned jsonld.js browser code.
Create a fresh processor per expansion: its resolved-context cache can otherwise retain @import
results across operations and bypass later loaders. A per-operation document loader consults only the copied context map. A decimal coefficient/exponent
comparison selects immutable boxed numbers for values that ordinary JS serialization would alter.

## Components and Integration

jsonld-schema.ts generates complete payload and report schemas. src/adapters/jsonld/index.ts
registers structural/source checks and exposes source/node/proposal APIs. Processor events become
diagnostics under an explicit caller policy. Candidate generation uses existing pointer replacement
and retains source archives. No semantic web concepts are promoted into core.

jsonld-sources.py vendors JSON-LD test resources, license, manifest and hashes at one verified pin.
jsonld-expansion.ts discovers requested contexts using a local corpus-only loader, then supplies
those contexts explicitly to UMF. The runtime never infers this filesystem mapping. Independent
PyLD runs use the same supplied resources; expected official output remains a separate authority.

## Validation and Risks

Exercise every official expansion case through source round trips, record each candidate/failure
and compare successful output with official expected JSON-LD and PyLD. Preserve list order during
semantic comparisons and disclose any language-tag normalization. Chromium must run the public API
without Node globals and without external requests. Authored checks cover edits, unknown fields,
context isolation, precise numbers, missing contexts and reject/report behavior.

Processor event coverage is not a proof that all semantic loss is detected. A candidate carries
incomplete interpretation and full source context. Framing, HTTP behavior,
RDF projection and other native corpora remain implementation work.


The official corpus exposed scoped @nest and legacy blank-prefix behavior differences plus missed
negative validations. The AC5 processor patch corrects scoped nesting; conservative input guards
and post-expansion checks initially blocked the remaining legacy/negative discrepancies; AC6
now corrects legacy term/prefix behavior while retaining negative checks. The guard scan can also reject
literal JSON with the same shapes; broader interpretation remains work. PyLD's tc036/tc037/tc038 results differ
from official scoped-context expected outputs; UMF follows the official result and records
the native disagreement. Neither processor is treated as an unquestionable authority.


AC5 replaces the scoped @nest source-shape guard with a pinned jsonld.js source patch. For each
nesting key, process its property-scoped context with protected override and propagation, then
validate/expand nested objects in that context. The parent active context remains unchanged for
siblings. Import the package source entry so Bun and browser builds both include the patch, rather
than continuing to load an unpatched prebuilt distribution. Bun's patchedDependencies and lockfile
make the change reproducible. The full official corpus and independent hand-authored expected
expansions govern correctness; native PyLD disagreement remains visible.


AC6 extends the pinned processor patch with explicit mode checks. IRI-shaped terms require
self-consistent expansion in 1.1; 1.0 retains its older alias/redefinition rules. A colon-free
term definition can act as a prefix in 1.0 regardless of trailing delimiter or shorthand form.
Keep 1.1 prefix rules unchanged. Remove the conservative blank-context source-shape guard,
which previously also blocked opaque JSON content. Test both modes on the same inputs.


AC7 uses an immutable boxed-number bridge for numeric tokens that cannot survive ordinary JS
JSON serialization. jsonld.js recognizes boxed numbers as numeric scalars; its clone helper must
retain marked immutable numbers instead of converting them to strings. A private WeakMap records
the original token. Candidate serialization reconstructs NativeJson directly, recovering those
tokens rather than calling JSON.stringify on numeric wrappers. Unexpected numeric coercion throws;
this adds exact expansion, not arithmetic or RDF literal conversion. Ordinary interoperable numbers
retain their existing processor behavior. Test language defaults and typed values to detect accidental
string treatment, plus JSON literals and overflow/underflow values.


AC8 shares the expansion preparation and validation with flattening. Do not apply expandContext
again: call the pinned internal node-map flatten function on expanded input, then public compact
with skipExpansion. Re-expansion would incorrectly resolve identifiers preserved by @base: null. Keep a fresh processor per proposal
and a shared explicit resource loader across its stages. Extend immutable exact numbers with a
value-equality hook used by the pinned processor's duplicate check; never coerce them to IEEE 754.
Store target context in the report and preserve source archives independently of candidate layout.
Run all 58 official flatten cases, independent PyLD comparisons and browser execution.


AC9 reuses the same source expansion, loader isolation and numeric bridge as AC7/AC8. Standalone
compaction bypasses node-map flattening; pass explicit compactArrays/compactToRelative and
skipExpansion to the pinned public compact API. Report target context independently of source
archives. Compare exact numbers and ordered arrays in compact JSON, because keyword aliases and
scoped contexts make raw-key-based list detection unsafe. Record native disagreements separately.


The compact.js patch resolves custom index IRIs before selecting the output property, using the
expanded index value to select aliases with type coercion. Empty strings are valid index keys;
only absent/null keys become @none. Preserve compactArrays:false on both leftover index values
and index-map entries. Compaction expected-output comparison is stricter than expanded comparison:
all arrays and string case remain exact, while decimal numeric spellings compare by exact value.
The full corpus has one unresolved prefix expectation (tp001); do not change behavior to satisfy
that case while breaking t0038. Record this as an open compatibility discrepancy.


AC10 reuses source inspection, resource loading, loss policy and exact-number output reconstruction.
After source validation, call the pinned frame API on original NativeJson input, avoiding relative
IRI changes caused by re-expansion. Deduplicate repeated source-validation warnings only for this
operation. Store all selected options and frame in the report. Support frameDefault explicitly:
the processor must select the default graph when requested instead of always merging graphs.
Use the separately pinned w3c/json-ld-framing corpus, retaining its license and resource hashes.


The native framing implementation ignored frameDefault; patch jsonld.js to suppress merged-graph
framing when that option is true. Patch frame.js value-pattern matching to use the shared exact
comparison instead of wrapper identity, retaining false/zero patterns via own-property lookup.
The public embed option accepts standard booleans and normalizes them in the report. Legacy
@first/@last remain subject to native mode validation; experimental cyclic @link is not a public
embed option. Framed output is copied back to NativeJson; no linked runtime object escapes.
The blocked legacy t0010 source/frame IRI collision is retained as an explicit compatibility gap.


AC11 adds a preflight over expanded frames at frameMergedOrDefault, before node-map construction
or matching. Validate flag cardinality, boolean types and mode-dependent embed values, including
nested frames. Skip @value/@default payloads and identity/type/language patterns during recursion.
This fixes the processor's match-dependent legacy-embed checks and permissive truthiness flags.


AC11 also validates raw framing flag values in expand.js after keyword alias resolution and before
null expansion. Recursive preflight invokes existing identifier/type checks for each frame object,
so unmatched nested blank identifiers cannot bypass validation. Expanded @default/@value data is
excluded. Official tg005/tg008 use string booleans and are now recorded as compatibility blocks;
no native truthiness rule is silently substituted for the boolean syntax requirement.


AC12 uses the existing RDF adapter for validation and N-Quads serialization, preserving the source
copy in the report. A temporary input envelope omits only empty graph inventory, which is restored
as @graph:[] in the output. The pinned fromRDF implementation accepts a UMF literal conversion
hook for exact JSON literals and requested native scalar conversion. Existing exact boxed numbers
and NativeJson output rendering avoid float parsing. Unsupported direction modes remain blocks.


AC12's processor patch implements compound-literal conversion before RDF list assembly, validates
literal components and emits loss events for additional node properties. It also restores 1.0's
nested-list head preservation. RDF input uses normalized N-Quads term serialization to avoid the
native processor's comment-parser bug; source bytes remain unchanged in the report. The literal
hook decodes RDF JSON exactly only in 1.1 and preserves it as a typed literal in 1.0. All 54 official
fromRDF cases now produce expected candidates/errors; no compound-direction cases are skipped.


AC12 rejects malformed i18n direction datatypes when direction conversion is selected: the suffix
must contain exactly one language/direction separator and end in ltr or rtl. The same datatype
remains an opaque typed literal when direction conversion is disabled. Both rejection cases and
the opaque control preserve their complete RDF sources. PyLD accepts the invalid direction value
but rejects the extra suffix; these outcomes are recorded separately from UMF validation.


AC13 reuses the qualified expansion operation, including isolated supplied contexts and exact
number tokens, then invokes toRDF with skipExpansion and standard-RDF output. Inspect expanded
values before native conversion: boxed exact values and doubles rounded by toExponential(15)
block; @index and empty @graph produce explicit policy-controlled losses. Opaque JSON values
must not be inspected as graph annotations. Copy the complete source into the report and import
only successful N-Quads into a fresh RDF document. A blocked report has no partial candidate.


AC14 patches the pinned processor's toRdf.js compound branch. Reuse the conversion's blank-node
issuer and graph term rather than inventing IDs or emitting components in the default graph.
Append rdf:value, rdf:direction and optional rdf:language triples, then return the blank object
for the normal reference or list construction. The fresh-install checker covers eight processor
files. Reverse conversion uses AC12 and preserves the same value semantics across both envelopes.


AC15 adds internal rdf-terms.ts validators. Parse generic IRI scheme, authority, path, query and
fragment, using RFC character ranges and percent escapes; validate IPv6/IPvFuture authorities.
Private Unicode characters are permitted only in the query. Reject controls, surrogate code
points and noncharacters excluded by the grammar. BCP47 checking includes grandfathered/private
forms and rejects repeated variants or extension singletons, without registry lookup.

The toRdf.js patch accepts UMF term/language validation hooks at graph, subject, predicate,
literal and object boundaries. It removes null list-first objects before serialization, preserving
rest links. Hooks emit policy-controlled losses. This avoids filtering finished datasets in a way
that would leave orphan list triples from an invalid graph or subject. The patch remains covered
by the eight-file fresh-install check; no new runtime dependency is introduced.


AC15 follow-up probe: RFC 3987 permits U+00A0 in an IRI, but the native processor's earlier
absolute-IRI predicate treats it as whitespace/relative. The source is preserved and omission
warnings are emitted; the candidate currently drops that triple. This is a known compatibility
gap outside the official manifest, recorded in fixtures/jsonld/to-rdf/unicode-iri-gap.json. Generic
term validation does not establish complete IRI handling throughout context expansion/conversion.


AC16 resolves the AC15 Unicode-IRI probe. The pinned url.js classifier now excludes ASCII
whitespace explicitly instead of JavaScript's broader Unicode whitespace class, and uses an
end-of-input assertion that cannot stop before a final newline. Fresh installation covers nine
patched processor files. AC15's component validator still controls RDF term well-formedness.
The authored matrix covers four Unicode spacing characters across all named RDF term roles,
context mappings and reverse conversion; separate checks cover the shared processing operations.


AC17 operates on a copied expanded NativeJson tree. Strict mode retains the existing precision
barrier; binary64 mode converts finite exact tokens only after emitting path-specific loss events.
Compare both floating and integer serializer lexical values, including large integers whose
JSON.stringify and toFixed spellings differ. Carry a forced-double flag from a numeric @value's
xsd:double annotation; do not apply RDF numeric formatting rules inside opaque JSON literals.

The toRdf.js patch now selects doubles by numeric fractional value or magnitude, rather than
looking for a decimal point in String(value). Small exponent-form values therefore remain doubles.
Only numbers enter that branch; typed strings bypass numeric coercion. Official-corpus conversion
uses explicit binary64/report options, while authored paired cases retain strict and reject
coverage. No binary64 conversion occurs during source import or semantic expansion.
