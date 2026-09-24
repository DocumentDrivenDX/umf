---
ddx:
  id: CONTRACT-026
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-026
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-026: JSON-LD preservation and processing

**Type:** library/schema. **Version:** 0.1.0. **Status:** draft.

## Purpose and Scope

umf.jsonld preserves source documents and supplied contexts independently of semantic processing.
Expansion, flattening, compaction, framing and RDF-to-JSON-LD projection use jsonld.js 9.0.0 with
the pinned UMF processing patch and no network fallback. HTTP/HTML loading, JSON-LD-to-RDF
conversion, remaining compatibility gaps and ontology reasoning remain required work.

## Normative Surface

spec/extensions/jsonld/schema.json defines profile:jsonld-source, processingMode, baseIRI, root,
originalSource, contexts and optional expandContext. Native trees use core's exact tagged JSON
representation. Each context stores url, documentUrl, root and originalSource; URLs MUST be unique
within the supplied list, with at most 100 contexts. Base/document URLs MUST be absolute; baseIRI
is 1–4096 characters. Shared source/copy limits apply. Unknown fields MUST survive UMF serialization.

importJsonLdDocument(text,{id,baseIRI,processingMode?,contexts?,expandContext?}) defaults mode to
json-ld-1.1. Context inputs are {url,documentUrl?,text}; documentUrl defaults to url and represents
explicit post-redirect identity, not an instruction to follow redirects. expandContext is JSON text.
Import preserves syntactically valid JSON even when it is semantically invalid JSON-LD.
inspectJsonLdDocument reports envelope/source validity with incomplete semantic interpretation.

exportJsonLdDocument returns exact original text if the root is unchanged; otherwise it renders
exact tagged JSON. getJsonLdNode returns a copied native node at a JSON Pointer.
proposeJsonLdNodeEdit replaces an existing node on a copy and returns document/validation. Original
archives and contexts remain. Unknown representation fields at payload/context/tree levels block
native export; unknown native JSON content remains exportable without invented interpretation.

proposeJsonLdExpansion(document,{lossPolicy:'report'|'reject'}) MUST require the policy explicitly.
The expansion-schema.json report includes source, lossPolicy, status, complete:false, resourcesUsed,
diagnostics and optional candidate. Context retrieval MUST use exact supplied URL keys only. No
network or implicit repository/file access is permitted. Used URLs are reported in first-use order. Every expansion MUST use a fresh processor instance
so prior @import resolution cannot bypass the supplied context map or hide resource usage.
Native numeric values MUST remain exact through expansion. Values that ordinary JavaScript JSON
serialization would alter use the immutable exact-number bridge defined below, including negative
zero and extreme exponents. Equivalent ordinary numeric spellings can normalize in the candidate.

Processor warning events become JSONLD_EVENT diagnostics. Under reject, any warning blocks the
candidate. Under report, processing may produce a candidate with the warnings attached. The report
MUST retain the full input document and contexts; the candidate also retains original source archives.
Expanded representation may remove aliases, contexts, free-floating nodes or unmapped values.
Successful expansion MUST NOT imply lossless source syntax, RDF equivalence or ontology validity.
Blocked reports have no candidate. Missing context, invalid JSON-LD, unsupported numeric operations and unsupported
representation content produce explicit blocked diagnostics. Invalid options and core copy failures
can throw before a report exists. This API does not claim completeness of processor warning events.

## Authority and Evidence

[RDF JSON-LD 1.1 syntax](https://www.w3.org/TR/json-ld11/) and
[processing algorithms](https://www.w3.org/TR/json-ld11-api/) govern native interpretation.
The pinned [official test repository](https://github.com/w3c/json-ld-api/tree/ffdb326121ea89b7b8280e76a5caea923834bcef)
contains 385 expansion cases. Source files and hashes are retained in native/jsonld/sources.
Native and browser outcomes, including disagreements, live in fixtures/jsonld/expansion.
No JSON-LD-specific semantics are promoted into core by this extension.


## Current processor gaps

Known jsonld.js 9.0.0 discrepancies MUST NOT produce an apparently supported candidate. The adapter
blocks nested @context keyword redefinitions and invalid expanded value-type arrays. JSON-LD 1.0 nested
lists also block. The declaration scan is deliberately conservative and may also block JSON literal
content containing these shapes; it does not declare such source invalid. Native source preservation
remains available. Complete interpretation of those shapes requires further processor work.

The legacy examples t0026/t0038/t0071 pass using the version-conditioned patch. AC7 now preserves
the exact value 333333333.33333329 in tjs12 as well; expected values are compared without floating
point rounding. Candidate status describes a transformation
proposal within this profile; it does not establish full JSON-LD processor conformance.


## Baseline results

All 385 source documents round-trip in both UMF formats. All 276 official positive cases produce candidates matching official expected expansions,
including exact numeric values. All
109 official negatives are blocked (error-code conformance is not asserted). PyLD 2.0.4 accepts
278 and rejects 107 inputs, including four accepted negatives and two rejected positives. It
agrees with 270 candidate expansions under the documented integer/Decimal input loader. It rejects two positive legacy cases (t0026/t0071) and
produces different outputs for t0038/tc036/tc037/tc038; UMF matches official expected output for all
six. The two-format candidate matrix has 552 exports: 540 native agreements, eight output
discrepancies and four exports whose source PyLD rejects. Source preservation does not imply
semantic support for blocked inputs.

Chromium 148 repeats 770 exact source recoveries and 552 candidate exports, with all 109 negative blocks,
zero external requests and Node globals absent. Authored browser checks cover loss policy, edits,
@import isolation, missing contexts, numeric rounding and unknown representation preservation.


## Scoped nesting (US-026-AC5)

A nesting alias's property-scoped context MUST apply to each nested value. Sibling properties
continue using their own enclosing context. Nested aliases can recursively supply contexts, including
caller-supplied remote contexts. Protected definitions can be overridden in the scoped context,
without changing the enclosing protected term. Invalid nested scalars or value objects fail.
Opaque @json literals containing scoped-nest-shaped objects MUST remain opaque and unchanged.

patches/jsonld@9.0.0.patch changes the pinned processor's source expansion routine to apply that
context before validating and expanding nested values. The package source entry is bundled for the
browser; the upstream prebuilt distribution would omit this patch and MUST NOT be used. Bun's
patchedDependencies declaration and lockfile bind the patch. A fresh isolated install reproduced
the patched source hash. Seven authored fixtures cover five successful expansions, two rejections,
and one copied edit through both UMF formats; Chromium repeats these cases and the full corpus.
The official tc037/tc038 cases now succeed. Future dependency upgrades require repeating the corpus,
patch-install verification and authored scope checks before removing or updating the patch.


## Explicit legacy mode (US-026-AC6)

JSON-LD 1.0 processing MUST retain its term-definition rules for IRI-shaped aliases and compact
IRI redefinitions. Its colon-free term definitions can be used as prefixes, including object-form
definitions, mappings without trailing delimiters and blank-node identifiers. JSON-LD 1.1 keeps
its stricter term/prefix rules. Absolute IRIs with // and explicit blank-node identifiers remain
unchanged; null mappings do not become prefixes. Modes are retained through UMF serialization.

The context.js portion of patches/jsonld@9.0.0.patch conditions these behaviors on processingMode.
The previous blank-context source scan is removed, so opaque JSON containing such context-shaped
content is no longer rejected. Eight authored inputs yield 15 mode-specific outcomes: 13 candidates
and two 1.1 rejections, with 26 two-format exports and two edited exports. Chromium repeats the
mode comparisons and full expansion corpus. scripts/jsonld-patch-check.ts independently installs
the package and patch in a temporary directory, checks both changed source files and records hashes
in fixtures/jsonld/patch-results.json. This supersedes the earlier scoped-nest-only patch evidence.
Authority: [JSON-LD 1.0 algorithms](https://www.w3.org/TR/2014/REC-json-ld-api-20140116/).


## Exact numeric expansion (US-026-AC7)

Expansion MUST preserve numeric values as numbers, including values outside IEEE 754 JSON
round-trip precision. Unsafe numeric tokens use immutable internal boxed numbers tracked by a
private WeakMap. The pinned processor patch retains marked numbers during cloning and scalar
expansion. Candidate serialization rebuilds NativeJson and emits their original tokens. Internal
marker objects MUST NOT leak into exported JSON or cause numbers to gain string language semantics.
Numeric coercion on a boxed value throws JSONLD_NUMBER_OPERATION; this is not an arithmetic engine
or an RDF datatype conversion implementation. Ordinary numbers whose decimal JSON serialization
preserves value use the normal processor path. Source archives remain exact in all cases.

The conformance comparator parses exact number tokens, compares normalized decimal coefficient/
exponent pairs and preserves negative-zero sign. JSON-LD arrays are unordered except lists and
opaque JSON literal arrays. Language-tag case normalization MUST NOT alter @language-looking
content inside an opaque JSON literal. This prevents floating-point parsing from concealing errors.

Nine authored cases cover seven exact candidates and two invalid numeric positions, yielding
14 exports and two edited exports through both UMF formats. Python's arbitrary-precision integers
and selective Decimal loader feed PyLD 2.0.4; expected/output comparisons use Decimal. That loader
keeps ordinary finite float values only when their JSON spelling preserves the input decimal value,
so valid numeric context versions keep native behavior. It changes no PyLD processing code.
Chromium repeats these vectors and all 385 official cases, with no external requests or Node globals.
Fresh-install evidence now covers context.js, expand.js and util.js. Exact expansion does not imply
full support for compaction, flattening, framing, HTTP/HTML loading, RDF conversion or reasoning.


## Flattening proposals (US-026-AC8)

`proposeJsonLdFlatten(document, {lossPolicy, context?, compactArrays?})` accepts target context
as JSON text; omitted/null context means no compaction. compactArrays defaults to true. The report
adds the copied NativeJson context (or null) and chosen compactArrays to the expansion report fields.
Expansion runs with the source context once, followed by node-map flattening and optional target
compaction. Both stages use only supplied resources. Candidate archives retain original source and
contexts. Missing resources, processor errors and rejected warning events block the entire proposal.

Flattening merges descriptions by node identifier, assigns local blank-node labels, removes duplicate
unordered values and may compact aliases. Lists retain ordering and repeated values. Exact decimal
numbers are compared by normalized coefficient/exponent without floating conversion; negative zero
remains distinguishable to retain the source numeric distinction. No blank-label stability across
documents, RDF equivalence, ontology reasoning or standalone compaction conformance is asserted.
The full pinned flatten manifest and authored precision/context/edit cases govern support.
Authority: [W3C flattening algorithms](https://www.w3.org/TR/json-ld11-api/#flattening-algorithms).


Executed AC8 evidence: fixtures/jsonld/flatten contains 58 official cases, 57 matching candidates
and one rejection; PyLD rejects t0026 and differs on t0014/t0038. Fourteen authored cases yield
11 candidates and three blocks. PyLD collapses opposite @direction values and signed zero; UMF
includes direction in value identity and deliberately preserves zero sign. It also accepts the
unmapped-property source that UMF rejects under lossPolicy: reject. Opaque JSON equality compares
object members and ordered arrays recursively, retaining exact numeric distinctions. Chromium
repeats all 72 cases, both UMF formats, edits and context isolation with no external requests.
Flattening uses the pinned internal node-map function without re-expansion, preserving @base:null
relative identifiers. Optional compact uses skipExpansion. This internal dependency is version
pinned and guarded by the full corpus and fresh patch installation evidence.


## Standalone compaction (US-026-AC9)

`proposeJsonLdCompaction(document, {lossPolicy, context, compactArrays?, compactToRelative?})`
requires target context JSON text. Both boolean options default to true. The complete report
contains copied source, NativeJson target context, selected options, resources, diagnostics and
an optional candidate. Expansion interprets the source once; compaction receives expanded values
with skipExpansion. Source archives and all supplied resources remain in the candidate and report.
Term/keyword aliases, array shape and relative IRI spelling may change. No RDF equivalence claim
is made. Unknown representation, missing supplied contexts, invalid processor input and rejected
warning events block proposals. Exact values and ordered literal/list arrays must survive.
Compare all 246 pinned compaction cases against official expected JSON and independent PyLD;
use strict array order in output comparisons so aliased lists/opaque JSON are not normalized away.
Authority: [compaction algorithm](https://www.w3.org/TR/json-ld11-api/#compaction-algorithm).


US-026-AC9 implements standalone JSON-LD compaction with required target context and explicit
compactArrays/compactToRelative options, plus a complete report schema. All 246 pinned cases run:
229 candidates and 17 expected negative blocks. Strict exact-value/order comparisons match 228
positive outputs; tp001 remains an explicit legacy-prefix discrepancy. Its 1.0 processing mode
expects expanded term definitions not to form prefixes, while t0038 expects such prefixes. UMF
retains the earlier 1.0 prefix interpretation, without claiming full compaction conformance.
PyLD rejects t0112/tm023 and differs on t0038/t0111/t0113/tc028/tp001. All differences are recorded.

Twelve authored cases add nine candidates and three blocks, exact language-neutral numbers,
aliased ordered lists, opaque JSON, array and relative-IRI options, explicit remote contexts,
source expandContext applied once, empty custom indexes and copied edits. PyLD differs on the
absolute-IRI option and empty custom index, and accepts the loss case UMF explicitly rejects.
Chromium repeats 258 cases: 238 candidates, 20 blocks, 516 source recoveries, 476 candidate exports
and two edited exports, with no external requests and Node globals absent. Evidence lives under
fixtures/jsonld/compaction; native/jsonld/README.md records reproduction. The compact.js patch
expands custom index IRIs, selects the actual compacted property using its value, retains empty
index keys and honors compactArrays for remaining index values and map entries. Fresh installation
now checks four patched files. Framing, HTTP/HTML loading, RDF projection, the legacy discrepancy
and the wider extension/consumer goal remain unfinished.


## Framing proposals (US-026-AC10)

`proposeJsonLdFraming(document, {frame, lossPolicy, ...options})` requires frame JSON text.
The report retains source, copied NativeJson frame, explicit framingOptions, used resources,
diagnostics and an optional candidate. Options: embed (@once default; @always/@never and legacy
@first/@last; API booleans normalize true to @once and false to @never), explicit=false, requireAll=false, omitDefault=false, frameDefault=false,
ordered=false, compactArrays=true, compactToRelative=true. omitGraph and pruneBlankNodeIdentifiers
are omitted unless explicitly supplied, allowing the processor's mode/context defaults.

Framing can select a subset, merge named graphs, suppress properties, introduce defaults and
change embedding. A candidate is a view with retained source, never a lossless replacement or an
RDF equivalence proof. report policy permits this disclosed transformation; reject policy blocks
processor warning events, not the intended selection inherent in the requested frame. The source
is validated by expansion, then the native frame API interprets the original source to preserve
base/context semantics. It never re-expands an already-expanded input. Only explicitly supplied
resource documents may be loaded for source or frame. Errors produce no partial candidate.
Exercise all 92 official framing cases and independently authored cases in Bun and Chromium.
Authority: [JSON-LD framing](https://www.w3.org/TR/json-ld11-framing/).


US-026-AC10 adds framing proposals, full report schema and a separately pinned official framing
corpus (w3c/json-ld-framing commit 3bf782ba9a40dd1b143435abe386d38df64f2b47, 271 resources/92 cases).
Eighty-eight candidates match strict expected JSON, all three negatives block, and positive t0010
also blocks because the source uses literal dcterms:creator without defining that prefix while
its frame assigns the prefix a different IRI meaning. The retained source is authoritative; this
legacy corpus disagreement remains explicit. PyLD accepts 87 official sources and rejects five,
including t0010 and positive t0069; every comparable candidate agrees with its output.

Twelve authored cases yield ten candidates/two blocks, 20 exports and two edited exports. They
exercise exact numeric frame matching/defaults, source precision, explicit selection, default versus
merged graphs, cycles as references, requireAll, explicit remote contexts, missing resources,
loss rejection, ordered lists and opaque JSON. PyLD matches nine authored candidates and the edit;
it ignores frameDefault in the authored graph case and accepts the source warning UMF rejects.
Chromium repeats 104 cases: 98 candidates/six blocks, 208 unchanged source recoveries, 196 candidate
exports and two edits, no external requests and Node globals absent. Evidence is under
fixtures/jsonld/framing; native/jsonld/README.md records reproduction.

The pinned jsonld.js patch honors frameDefault; frame.js uses exact value equality for numeric
pattern matching. Fresh installation covers six patched files. Framing is a selected view, not an
assertion of lossless semantic round trip: sources, frame and resource bundles remain archived and
reports disclose selection, defaults, embedding and graph merging. HTTP/HTML retrieval, RDF
projection, the documented legacy disagreements and the wider extension/consumer goal remain open.


## Framing flag validation (US-026-AC11)

Validate expanded frame flags before subject matching, recursively through nested frames. A frame
must not become valid merely because its input has no matching nodes. @explicit, @requireAll and
@omitDefault require one boolean value; @embed requires one recognized value. @first/@last remain
legacy 1.0 only. Nonstandard @link is rejected in supplied frames as well as API options. Keyword
aliases are resolved by expansion before validation. @value and @default contain data, so recursive
frame validation MUST NOT interpret keyword-looking object members inside them as frame flags.
Blocked reports retain the complete original frame and source and contain no candidate.


US-026-AC11 supersedes the framing counts above. Framing now validates flags and identifier/type
patterns before subject matching, including nested and aliased frames on empty input. Expansion
checks raw flag types before nulls can disappear; preflight checks expanded cardinality and mode
rules before building the node map. Nonstandard @link and 1.1 @first/@last are rejected. Data inside
@default and @value is not interpreted as framing instructions.

The official corpus now yields 86 exact expected candidates and six blocks. In addition to the
three negative cases and the known t0010 collision, positive tg005/tg008 contain @omitDefault:
"true" strings where the syntax requires booleans. These are explicit compatibility discrepancies;
UMF does not silently coerce them. PyLD accepts those two cases, rejects t0069 and otherwise agrees
with comparable candidate outputs. The authored set grows to 26 cases: 13 candidates/13 blocks,
26 exports plus two edited exports. Eleven new invalid frames are accepted by PyLD but rejected
by UMF. Controls retain legacy 1.0 behavior and keyword-looking JSON literal/default data. PyLD
rejects the @json value-pattern control and still ignores frameDefault; these disagreements remain
recorded. Blocked reports retain exact source and NativeJson frame and expose no partial candidate.
Current Chromium baseline: 118 cases, 99 candidates/19 blocks, 236 source recoveries, 198 candidate
exports and two edits; no external requests, Node globals absent. See fixtures/jsonld/framing.

The boolean requirement follows the [frame object syntax](https://www.w3.org/TR/json-ld11/#frame-objects).
This check applies after keyword aliases are resolved, so aliasing cannot bypass validation.


## RDF-to-JSON-LD projection (US-026-AC12)

`proposeRdfToJsonLd(source, {id, baseIRI, processingMode?, lossPolicy, useNativeTypes?, useRdfType?, rdfDirection?})`
creates a JSON-LD candidate and retains the complete RDF source in a projection report. Both
boolean options default to false; rdfDirection defaults to null and accepts i18n-datatype or
compound-literal. Unsupported conversion must block explicitly. The report is authoritative for
source preservation; the candidate's source archive describes generated JSON-LD, not the RDF input.
Do not discard the report when source-native annotations or lexical representation matter.

Unknown RDF encoding fields block conversion. Named graph inventory, including empty graphs,
is preserved in JSON-LD. Blank identifiers retain their source-local scope without a global
identity assertion. useNativeTypes may alter datatype and lexical representation; report policy
permits this disclosed conversion, reject policy blocks it when relevant literals occur. Exact
integers and decimal spellings must not round through JS numbers. Non-finite lexical forms remain
typed strings. RDF JSON literals use the exact NativeJson parser. No ontology equivalence is claimed.
Run the full 54-case official fromRDF manifest, including non-normative direction cases, and record
every discrepancy. [Algorithm authority](https://www.w3.org/TR/json-ld11-api/#serialize-rdf-as-json-ld-algorithm).


AC12 supports both direction modes. Compound literals convert only singly referenced blank nodes;
shared nodes retain their graph representation. Invalid literal structure, language or direction
blocks. Additional properties cause a loss event before the compound node is removed; reject
policy blocks that loss. JSON-LD 1.0 retains RDF JSON as a typed string and uses its historical
nested-list lowering; 1.1 decodes JSON literals and supports direction conversion. Direction options
require 1.1. Integer conversion is exact; finite decimal spellings retain numeric precision and
negative zero; non-finite/overflow double forms stay typed strings. Boolean 1/0 convert to true/false
with the native-type loss warning. Empty named graphs are explicitly restored in output.


AC12 rejects malformed i18n direction datatypes when direction conversion is selected: the suffix
must contain exactly one language/direction separator and end in ltr or rtl. The same datatype
remains an opaque typed literal when direction conversion is disabled. Both rejection cases and
the opaque control preserve their complete RDF sources. PyLD accepts the invalid direction value
but rejects the extra suffix; these outcomes are recorded separately from UMF validation.


## JSON-LD-to-RDF projection (US-026-AC13)

`proposeJsonLdToRdf(source, {id, lossPolicy, rdfDirection?})` returns a qualified RDF dataset
candidate, resources used and complete original JSON-LD source/context archive. The candidate
contains generated N-Quads; consumers must retain the report for native source recovery. The
source selects base IRI and processing mode. No network fallback is permitted.

Only standard RDF is emitted. Processor events for dropped blank predicates, relative terms and
unconverted direction are reportable losses; reject policy blocks them. Index annotations and
empty graph inventory require explicit loss events. Exact numeric values that the processor
cannot safely serialize block conversion. Generalized RDF remains an implementation gap. Run the entire pinned toRDF manifest,
including cases outside the currently passing subset, without presenting those blocks as support.
The governing algorithm is [W3C JSON-LD to RDF](https://www.w3.org/TR/json-ld11-api/#deserialize-json-ld-to-rdf-algorithm).


AC14 supports compound-literal direction conversion in JSON-LD 1.1. Each converted value receives
an issuer-generated blank node; rdf:value and rdf:direction are plain string literals and optional
rdf:language is a lowercase plain string. Component triples and the reference remain in the same
graph. Conversion inside RDF collections preserves order. Direction-distinct values must not
collapse, and source archives remain unchanged. Legacy mode still rejects direction conversion.


AC15 requires generic [RFC 3987 IRI syntax](https://www.rfc-editor.org/rfc/rfc3987.html#section-2.2)
and [BCP47 well-formed language tags](https://www.rfc-editor.org/rfc/rfc5646.html#section-2.2.9)
for RDF output. Scheme-specific rules, resource existence and registered-language validity are
separate concerns. Preserve valid IRI spelling without URL normalization. Each malformed term
omission raises JSONLD_RDF_TERM; report policy permits the disclosed omission, reject policy
blocks the entire candidate. Source archives remain unchanged. Processor omission events for
relative IRIs continue to use JSONLD_RDF_EVENT.

Check graph, subject and predicate before producing auxiliary list/compound triples. Invalid
object or literal datatype/language returns no object; skip that triple while preserving other
list links. No null RDF object may reach serialization. Malformed language in a compound literal
must be rejected before its component triples are constructed. This implements the well-formed
term requirements in the W3C conversion algorithm linked above.


AC16 distinguishes ASCII whitespace from the Unicode characters permitted by RFC 3987 UCSCHAR.
The processor must not classify an absolute IRI as relative merely because its suffix contains
U+00A0, U+2003, U+2028 or U+3000. Preserve each character in graph names, subject/predicate/object
IRIs and datatype IRIs, including term mappings in supplied contexts. The weak absolute-IRI
classification remains separate from AC15's full generic RDF term validation. ASCII whitespace
remains invalid; matching must reach the actual end of the string, including a final newline.
Framing may intentionally select and merge graph content, but must retain the selected IRI values.


AC17 adds `numericPolicy: "strict" | "binary64"` to `proposeJsonLdToRdf` options and requires the
selected policy in every report. Default strict mode checks exact JSON numeric token round trips
and the numeric value of generated RDF lexical forms; it blocks detected changes. Binary64 mode
allows finite native conversion and RDF numeric serialization with explicit losses. Diagnostics
use JSONLD_RDF_NUMBER_LOSS and pointers into the expanded JSON-LD candidate, not pointers into
the original aliased source. The report retains the full original source/context archive.

Negative-zero removal, underflow and changed integer/decimal values are reported before mutation
of the temporary conversion tree. Reject loss policy blocks those conversions atomically. JSON
numeric overflow remains blocked even in binary64 mode; it must not become JSON null or an invalid
native number. Typed strings retain their RDF literal lexical forms, including strings labelled
xsd:double; numeric policy does not coerce them. This preserves typed lexical data without asserting
that every lexical form is valid for its datatype. JSON @json literals use canonical serialization
of the selected finite native values. The canonical form is not a proof of arbitrary-precision
numeric equivalence; retain the report when that distinction matters.

The distinction between numbers and typed strings follows the [W3C object-to-RDF algorithm](https://www.w3.org/TR/json-ld11-api/#object-to-rdf-conversion).


Generalized projection is selected with optional `produceGeneralizedRdf: true` on
`proposeJsonLdToRdf`; the default is false and every report records the boolean. True selects
an `umf.generalized-rdf` candidate governed by CONTRACT-027, retaining blank predicates in a
native quad-array representation. False continues to produce RDF 1.1 and report any omitted
blank predicates. Both branches retain source and numeric/loss policies. Callers must use the
candidate's declared extension when selecting export APIs.

`proposeGeneralizedRdfToJsonLd(source, {id, baseIRI, processingMode, lossPolicy})` creates a
JSON-LD candidate from interpreted generalized quads and retains the complete source in the
report. Mode and policy are explicit. Native scalar conversion is disabled; RDF JSON literals
use the exact conversion hook, with typed lexical preservation in 1.0. Unknown generalized
semantics block without a partial candidate. This does not promise preservation of arbitrary
RDF JSON lexical layout, empty graph inventory or entailment; source remains authoritative.
The complete report schema is `spec/extensions/jsonld/from-generalized-schema.json`.
