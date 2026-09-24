# JSON-LD source, expansion, flattening, compaction and framing evidence

Browser TypeScript uses jsonld.js 9.0.0 with patches/jsonld@9.0.0.patch. Bun is the development/test runtime; PyLD is only an
independent Python development oracle. No context loader has a network fallback.

```sh
uv venv .cache/jsonld-venv --python python3
uv pip install --python .cache/jsonld-venv/bin/python -r native/jsonld/oracle-requirements.txt
python3 scripts/jsonld-sources.py
python3 scripts/jsonld-framing-sources.py
bun scripts/jsonld-schema.ts
bun scripts/jsonld-patch-check.ts
bun scripts/jsonld-legacy.ts
bun scripts/jsonld-numeric.ts
.cache/jsonld-venv/bin/python scripts/jsonld-numeric-oracle.py
bun scripts/jsonld-nest.ts
bun scripts/jsonld-expansion.ts
.cache/jsonld-venv/bin/python scripts/jsonld-expansion-oracle.py
bun scripts/jsonld-flatten.ts
.cache/jsonld-venv/bin/python scripts/jsonld-flatten-oracle.py
bun scripts/jsonld-flatten-authored.ts
.cache/jsonld-venv/bin/python scripts/jsonld-flatten-authored-oracle.py
bun scripts/jsonld-compaction.ts
.cache/jsonld-venv/bin/python scripts/jsonld-compaction-oracle.py
bun scripts/jsonld-compaction-authored.ts
.cache/jsonld-venv/bin/python scripts/jsonld-compaction-authored-oracle.py
bun scripts/jsonld-framing.ts
.cache/jsonld-venv/bin/python scripts/jsonld-framing-oracle.py
bun scripts/jsonld-framing-authored.ts
.cache/jsonld-venv/bin/python scripts/jsonld-framing-authored-oracle.py
bun scripts/jsonld-from-rdf.ts
.cache/jsonld-venv/bin/python scripts/jsonld-from-rdf-oracle.py
bun scripts/jsonld-from-rdf-authored.ts
.cache/jsonld-venv/bin/python scripts/jsonld-from-rdf-authored-oracle.py
bun test tests/jsonld
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/jsonld-browser.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/jsonld-flatten-browser.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/jsonld-compaction-browser.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/jsonld-framing-browser.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/jsonld-from-rdf-browser.ts
```

The source collector verifies w3c/json-ld-api commit ffdb326121ea89b7b8280e76a5caea923834bcef,
retaining all 2,133 JSON-LD test resources, license and hashes. The 385-case expansion, 58-case flattening and 246-case compaction
manifests are executed here; other algorithm resources do not imply coverage. Context discovery
runs with a local corpus-only loader and records every requested resource before UMF processing.
Runtime callers must supply those documents explicitly. Each expansion creates a fresh processor
instance so @import processing cannot reuse another call's resolved-context cache.

Official comparisons ignore unordered array order except @list, preserve JSON literal array order,
and compare language tags without case differences. Exact source recovery is checked separately.
Expansion uses immutable boxed values when JavaScript JSON serialization would change a number.
NativeJson candidate serialization restores those tokens without numeric rounding.

CONTRACT-026 records processor gaps and corpus/native discrepancies. Remaining compaction discrepancies,
framing, HTTP/HTML loading, RDF conversion and full ontology semantics remain required work.

Chromium 148 repeats 770 exact source recoveries and 552 candidate exports, with all 109 negative blocks,
zero external requests and Node globals absent. Authored browser checks cover loss policy, edits,
@import isolation, missing contexts, numeric rounding and unknown representation preservation.


The expansion patch applies a nesting alias's context without changing sibling scope. Importing
jsonld package source, rather than its upstream prebuilt distribution, includes the patch in Bun
and browser builds. Bun applies the checked-in patch via patchedDependencies; an isolated fresh
install reproduced the installed expansion source hash (fixtures/jsonld/patch-results.json).
The seven authored nest fixtures include expected expansions independently specified from the
processor and two invalid inputs, plus a copied nested-value edit. Official tc037/tc038 now match
expected output. PyLD 2.0.4 disagrees on tc036/tc037/tc038, recorded separately from official results.


The same patch now fixes mode-specific 1.0 IRI-shaped aliases/redefinitions and prefix expansion.
Eight authored legacy inputs yield 15 paired-mode outcomes (13 candidates/two 1.1 rejections),
26 exports and two edited exports. Official t0026/t0038/t0071 now match expected output; AC7 also preserves tjs12 exactly. PyLD rejects t0026/t0071 and differs on t0038 in addition
to its three scoped-context differences. The fresh-install check now covers context.js, expand.js and util.js.


Exact-number fixtures use Python integers and selective Decimal values as PyLD inputs; expected
and actual texts are compared with Decimal rather than lossy float parsing. There are nine authored
cases (seven candidates/two invalid numeric positions), 14 exports and two edited exports. The
complete official expansion matrix now has 276 exact expected candidates and 109 negative blocks.
PyLD agrees with 270 candidates, differs on four outputs and rejects two positive legacy sources.
The browser repeats the corpus and authored vectors; no approximate numeric policy is required.


Flattening has 57 official positive candidates matching expected output and one negative block,
with 116 source recoveries and 114 candidate exports. PyLD rejects positive t0026 and differs on
outputs t0014/t0038; these are explicit discrepancies, not conformance successes. Fourteen authored
cases add 11 candidates, three blocks, 22 exports and two edited exports. They cover exact decimal
deduplication, signed zero, lists, JSON literals, language direction, named graphs, reverse blank
links, target contexts, missing resources, loss rejection and source expandContext applied once.
PyLD agrees with nine authored candidates and the edit; it collapses signed zero and opposite
directions. It also accepts the dropped-property case that UMF blocks under explicit reject policy.
Chromium repeats all 72 cases: 68 candidates/four blocks, 144 source recoveries, 136 candidate
exports and two edits, no external requests, Node globals absent. See fixtures/jsonld/flatten/.

The pinned internal flatten function receives validated expanded input. Re-expanding that input
would resolve relative identifiers intentionally retained by @base: null. Optional target
compaction skips expansion. The util.js patch compares exact boxed numbers without conversion,
includes @direction in value identity and compares opaque JSON structurally with ordered arrays.
Signed zero remains distinct by UMF preservation policy; this is explicitly qualified behavior.


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


US-026-AC12 connects RDF datasets to JSON-LD through a complete projection report schema. It
preserves source archives, unknown-encoding blocks, empty graphs, exact JSON/numeric values and
selected native-type loss policies. The full pinned fromRDF corpus passes: 52 expected candidates
and two negative blocks, 108 exact source recoveries and 104 candidate exports. PyLD rejects
t0027/t0028 and differs on t0008/tdi11/tdi12; no discrepancy is counted as native agreement.

Eighteen authored cases cover exact native numbers, lexical preservation, non-finite typed values,
RDF JSON in 1.0/1.1, empty graph inventory, direction with native types, malformed JSON, comments,
compound lists/shared nodes/invalid direction/extra-property loss, malformed direction datatypes and a copied edit. Twelve
candidates/six blocks produce 24 exports and two edited exports. Unmodified PyLD agrees on typed
lexical values, opaque datatypes and shared compound nodes; precision, direction, mode and empty-inventory differences
are retained in fixtures/jsonld/from-rdf/authored/oracle-results.json. N-Quads cannot transmit empty
graph inventory, so that oracle case explicitly compares the nonempty subset only.

The collector now retains 2,545 JSON-LD API JSON-LD/N-Quads resources (same source pin). Fresh
installation checks seven patched processor files. The browser matrix covers all 72 official and
authored cases: 64 candidates/eight blocks, 144 source recoveries and 130 candidate/edit exports, no
external requests or Node globals. Reproduction is in native/jsonld/README.md. JSON-LD-to-RDF,
HTTP/HTML retrieval, ontology/platform semantics and the wider extension/consumer goal remain open.


US-026-AC13 adds a JSON-LD-to-RDF proposal/report schema and standard RDF dataset candidate.
Full source/context archives remain in the report; JSON/YAML candidate recovery and copied edits
are verified. Explicit losses cover index annotations, empty graph inventory, omitted direction
and blank predicates. Unsafe exact-number conversion, double rounding/overflow, missing resources
and unknown encoding fields block atomically. Compound direction remains a required implementation gap.

The complete pinned toRDF manifest has 467 cases: 361 positives (including 16 syntax-only cases)
and 106 negatives. UMF emits 354 candidates and blocks 113; all negative cases block. Seven
positives remain blocked: tdi11/tdi12 (compound direction), tjs12/trt01 (exact numeric conversion),
tli12/tli14 (invalid RDF terms/list handling), twf05 (language validation). RDFLib 7.6.0 with literal
normalization disabled verifies 334 expected datasets by quad-role graph isomorphism. te111/te112
emit an extra triple whose property IRI contains multiple fragment separators; this is a known
conformance gap. t0118/te075 require generalized RDF with blank predicates, outside the current
RDF representation; their standard-RDF candidates disclose omitted predicates and are not counted
as equivalent. Syntax-only tests have no expected dataset and are counted separately.

Unmodified PyLD 2.0.4 accepts 360 cases. Twelve acceptance differences and five RDFLib-confirmed
output differences remain explicit in fixtures/jsonld/to-rdf. PyLD normalization additionally
miscompares several escaped literals; RDFLib comparisons distinguish those parser differences
from dataset changes. Neither oracle is treated as universal authority.

Sixteen authored cases verify literals, ordered lists, opaque JSON, native source recovery,
report/reject policies, direction, numeric guards and copied edits: seven candidates/nine blocks.
Chromium 148 matches all 483 official/authored outcomes, 966 source recoveries, 722 candidate
exports and two edits, without external requests or Node globals. tli14 has different TypeError
wording between engines; the same blocked status and diagnostic codes are required and both
messages are archived. Bun's two conversion tests pass with 4,112 assertions; type checking and
the browser ESM/declaration build pass. Full JSON-LD conformance, remaining extensions and the
seven metadata consumers remain open. No concepts were promoted to core in this increment.


Reproduce AC13 with `bun scripts/jsonld-schema.ts`, `bun scripts/jsonld-to-rdf.ts`,
`.cache/jsonld-venv/bin/python scripts/jsonld-to-rdf-oracle.py`,
`.cache/rdf-venv/bin/python scripts/jsonld-to-rdf-rdf-oracle.py`,
`bun scripts/jsonld-to-rdf-authored.ts`, and `bun test tests/jsonld/to-rdf.test.ts`.
Run `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/jsonld-to-rdf-browser.ts`
for the browser matrix (or omit the override when Playwright's Chromium is installed).
The existing pinned JSON-LD and RDF oracle environments are development-only dependencies.


US-026-AC14 implements compound-literal direction emission. The processor reuses its blank-node
issuer and places rdf:value, rdf:direction and optional lowercase rdf:language in the reference's
graph. Both official direction cases now match their expected RDF datasets under RDFLib graph
isomorphism. PyLD 2.0.4 emits a plain literal instead, dropping direction; these two output
comparisons are explicit native discrepancies, not native agreement.

The full 467-case toRDF baseline now has 356 candidates/111 blocks, including all 106 expected
negative blocks. Five positive blocks remain (tjs12, tli12, tli14, trt01, twf05). There are 336
verified official dataset matches, 16 accepted syntax-only cases, two differing datasets and two
generalized-RDF comparisons outside the current representation. No remaining gap was reclassified
as supported. Twenty authored cases include twelve candidates/eight blocks; five compound cases
exercise plain/language values, lists, named graphs and distinct directions. Reverse conversion
through both UMF formats must reproduce their expected JSON-LD values.


AC14 verification passed: eight scoped tests, 5,014 assertions, eight-file fresh patch installation,
type checking and the browser ESM/declaration build. Chromium ran all 487 official/authored cases:
368 candidates/119 blocks, 974 exact source recoveries, 736 candidate exports, two copied edits
and ten reverse conversions through JSON/YAML. External requests were zero and Node globals
absent. The existing tli14 engine-specific exception wording remains recorded with matching
status and diagnostic codes. The next JSON-LD conversion gaps are exact-number/JCS policy,
invalid-term handling and generalized RDF; wider extension and metadata-consumer work remains open.


US-026-AC15 closes the observed invalid-term conversion gaps. Generic IRI and BCP47 syntax
validation emits explicit loss events; reject policy blocks omissions. Graph/subject/property
checks precede auxiliary triple generation, and null list-first objects are omitted without
removing list-rest structure. Dedicated boundary tests cover Unicode/private-use placement,
percent escapes, authorities, IPv6/IPvFuture, grandfathered tags and duplicate language subtags.

The full toRDF corpus now has 359 candidates/108 blocks: all 106 negatives block and only tjs12
and trt01 remain positive blocks (numeric conversion). RDFLib verifies 341 official expected
datasets, with zero differing comparable outputs; 16 accepted syntax tests have no expected
output, and t0118/te075 still require generalized RDF outside the representation. Nine native
output differences remain, while PyLD emits non-parseable RDF for tli12/twf05 and rejects tli14.
These outcomes are recorded without treating oracle behavior as conformance authority.

The authored set now has 28 cases, 19 candidates/nine blocks. New controls cover malformed
subjects/graphs with lists (no orphan triples), invalid list values, datatype IRIs, duplicate
language extensions, paired omission/rejection and valid IPv6/Unicode/private language forms.


AC15 follow-up probe: RFC 3987 permits U+00A0 in an IRI, but the native processor's earlier
absolute-IRI predicate treats it as whitespace/relative. The source is preserved and omission
warnings are emitted; the candidate currently drops that triple. This is a known compatibility
gap outside the official manifest, recorded in fixtures/jsonld/to-rdf/unicode-iri-gap.json. Generic
term validation does not establish complete IRI handling throughout context expansion/conversion.


AC15 verification passed: ten scoped tests with 5,154 assertions, fresh eight-file processor patch
installation, type checking and browser ESM/declaration build. Chromium matches all 495 official
and authored cases: 378 candidates/117 blocks, 990 source recoveries, 756 candidate exports, two
copied edits and ten reverse conversions. Diagnostic messages now agree across engines, including
the repaired tli14 case. External requests are zero and Node globals absent. Numeric/JCS policy,
generalized RDF, the recorded Unicode-IRI compatibility gap and the wider UMF goal remain open.


US-026-AC16 resolves the Unicode-IRI omission recorded after AC15. Four authored Unicode cases
cover U+00A0/U+2003/U+2028/U+3000 across contexts, graph names, subjects, predicates, objects and
datatypes; an ASCII-space control still rejects. Expansion, flattening and compaction retain the
same datasets. Framing retains the selected terms while intentionally projecting into its merged
default-graph view. Both UMF formats recover sources and RDF candidates and reverse to the expected
JSON-LD values. The original probe remains historical evidence; current resolution is recorded in
fixtures/jsonld/to-rdf/unicode-iri-resolution.json and regenerated by the authored-case script.

PyLD 2.0.4 rejects all four Unicode context mappings. RDFLib 7.6.0's raw N-Quads parser also rejects
the Unicode spaces because of its whitespace predicate. After equivalent Unicode escaping of the
four characters in N-Quads syntax, RDFLib confirms all eight expected dataset comparisons without
literal normalization. Raw rejections and escaped comparisons are recorded separately in
fixtures/jsonld/to-rdf/unicode-iri-oracle-results.json; no raw-native agreement is claimed.

The browser matrix passes all 500 official/authored cases: 382 candidates/118 blocks, 1,000 exact
source recoveries, 764 candidate exports, two edits, 18 reverse conversions and 16 additional
Unicode processing/projection checks. Diagnostic messages agree with Bun; external requests are
zero and Node globals absent. The shared JSON-LD suite's conversion, expansion, flattening,
compaction, framing and numeric regressions pass. A legacy sample-count assertion accidentally
changed with the patch-file count was corrected and rerun; the larger authored matrix now uses
an explicit 30-second timeout and passes its rerun. Type checking and the browser ESM/declaration
build pass. Fresh installation reproduces nine patched files. Numeric/JCS conversion, generalized
RDF and the wider extension/metadata-consumer goal remain open; no core promotion occurred.


AC16 native evidence is reproduced after authored-case generation with
`.cache/jsonld-venv/bin/python scripts/jsonld-unicode-iri-oracle.py`; that script invokes the
existing pinned RDF oracle environment for raw and escaped dataset comparisons. Run
`bun test tests/jsonld/unicode-iri.test.ts` for the processing and evidence checks.


US-026-AC17 adds explicit strict/binary64 numeric policy to RDF proposals and report schemas.
Strict is the default. Binary64 mode reports changed numeric values, signed-zero removal,
underflow and RDF integer/double formatting losses at expanded-value pointers. Reject policy
blocks these losses; non-finite JSON overflow blocks under either numeric policy. Exact source
and context values remain in the report. Typed strings, including xsd:double strings, retain their
lexical values. Small exponent-form JSON numbers correctly select RDF double representation.

The official toRDF matrix now selects binary64/report explicitly: 361 candidates and 106 expected
negative blocks. All 343 comparable expected datasets match RDFLib's term-isomorphism check;
16 syntax-only positives have no expected output. The two generalized-RDF expectations remain
outside the current representation and are not counted as equivalent. The numeric policy change
does not establish full JSON-LD conformance or close the remaining extension scope.

Forty-eight authored cases yield 34 candidates/14 blocks. Numeric controls cover paired policy
rejection, copied exact-token edits, underflow, overflow, negative zero, small doubles, typed
strings, large integer formatting and opaque JSON canonicalization. PyLD 2.0.4 rejects three
typed-string controls and differs on four expected numeric lexical results, reflecting its Python
integer/float behavior. These outcomes are recorded in fixtures/jsonld/to-rdf/numeric-oracle-results.json;
no mismatch is counted as agreement. The official native comparison also retains trt01's datatype
difference in addition to the previously documented discrepancies.


Regenerate AC17 native numeric evidence after authored-case generation with
`.cache/jsonld-venv/bin/python scripts/jsonld-numeric-rdf-oracle.py`, then run
`bun test tests/jsonld/numeric-rdf.test.ts` for numeric edits, datatype and oracle checks.


AC17 verification passed: twelve scoped regression tests (5,523 assertions) and three focused
numeric tests (49 assertions), type checking, browser ESM/declaration build and nine-file fresh
patch reproduction. Chromium ran all 515 official/authored cases: 395 candidates/120 blocks,
1,030 exact source recoveries, 790 candidate exports, four copied edits (including rounded numeric
edits), 18 reverse conversions and 16 Unicode processing checks. Diagnostics agree with Bun,
external requests are zero and Node globals absent. Generalized RDF, other JSON-LD compatibility
work and the wider extension/metadata-consumer goal remain open. No concepts were promoted to core.
