# SHACL 1.0 graph and path evidence

The normative baseline is the [2017-07-20 W3C Recommendation](https://www.w3.org/TR/2017/REC-shacl-20170720/),
particularly [property paths](https://www.w3.org/TR/2017/REC-shacl-20170720/#property-paths)
and its SHACL-list definition. The [SHACL 1.2 draft](https://www.w3.org/TR/shacl12-core/)
is a separate version to inventory; no 1.2 support is claimed.

`paths.ttl` and `data.ttl` are authored synthetic samples, not copied official tests.
Thirteen path expressions exercise all seven operators and nested inverses/closures;
four named focus nodes give 52 comparisons. RDFLib 7.6.0 evaluates independently authored
native path expressions, not a translation of UMF's output AST. Literal normalization is
disabled. Native graph isomorphism checks both source round trips and the changed count.
The count is originally `9007199254740993`, retained exactly as a lexical RDF literal.
An unrelated native predicate remains preserved. These are path and preservation tests,
not SHACL constraint-validation or official-conformance evidence.

Reproduce from the repository root:

```sh
bun scripts/shacl-schema.ts
bun scripts/shacl.ts
.cache/rdf-venv/bin/python scripts/shacl-oracle.py
bun test tests/shacl
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/shacl-browser.ts
```

The Python environment is a development oracle only; the public adapter runs as browser
JavaScript. No resource is fetched during import, path interpretation or evaluation.
The existing RDF environment pins RDFLib 7.6.0. Generated evidence is in `fixtures/shacl/`.

US-028 still requires official corpus acquisition, target and constraint execution,
validation-report fidelity, custom/SPARQL support decisions, and metadata projections.
Graph import and path evaluation never claim that a data graph conforms to its shapes.


Official inventory is now pinned to `fe6275b93fa4de7fc070d82ca8e14d633b2d25da` in
`sources/manifest.json`: 172 files, each with source URL, byte length and SHA-256; the
upstream W3C Software and Document License is included. `scripts/fetch-shacl.py` reproduces
retrieval. `bun scripts/shacl-corpus.ts` checks hashes and round-trips all 150 Turtle files
under `data-shapes-test-suite/tests/`. Then
`.cache/rdf-venv/bin/python scripts/shacl-corpus-oracle.py` independently checks 300 graphs
and parses the 13 declared paths in the path directory. Official validation reports remain
unexecuted. Deliberately malformed literal warnings are retained in the oracle result.

Historical implementation reports are inventory only. The 2,948,679-byte SHACLEX report
imports but exceeds the core 4,000,000-character limit when expanded into a serialized UMF
envelope. This is an unresolved large-envelope limit, not successful round-trip evidence.


US-028 Core targets: `getShaclTargetNodes` now implements explicit node, class,
subjects-of, objects-of and implicit class target unions. Shapes and data hierarchies
remain separate; cycles terminate, terms stay exact, and custom targets/imports/entailment
block instead of producing partial selections. Deactivation does not remove target nodes;
constraint execution will apply it separately. A target-node JSON schema is published.

Evidence: seven pinned official target files and an authored graph pair yield 60
selections, including empty sets. Independent RDFLib 7.6.0 SPARQL/path queries agree on
all 60. Three Bun target tests pass with 159 assertions. Chromium 148 passes 120
selections through JSON/YAML recovery, 16 exact source recoveries, one copied target edit,
and a custom-target guard; zero external requests and no Node globals. Type checking and
browser ESM/declaration build pass. Reproduce with `scripts/shacl-targets.ts`,
`scripts/shacl-targets-oracle.py` and `scripts/shacl-targets-browser.ts`; results are under
`fixtures/shacl/target-*.json`. These results are target sets, not validation reports.

Next: implement constraint components and compare official validation reports, retaining
the remaining SHACL/SPARQL, ontology/platform and consumer scope in the active goal.


## Constraint-engine experiment

The browser implementation pins [rdf-validate-shacl 0.6.5](https://github.com/zazuko/rdf-validate-shacl)
under its MIT license. The wrapper disables its silent repeated-check cutoff, rejects
cyclic shape/list dependencies, requires an explicit blank-node policy, and blocks
integer/decimal conversions that change value. It returns an experimental engine outcome,
not a verified UMF conformance verdict. Original source graphs are always retained.

Create the development-only oracle environment with `python3 -m venv .cache/shacl-venv`
and `.cache/shacl-venv/bin/pip install -r native/shacl/requirements.txt`, then run:

```sh
bun scripts/shacl-engine-schema.ts
.cache/rdf-venv/bin/python scripts/shacl-validation-inputs.py
bun scripts/shacl-validation.ts
bun scripts/shacl-numeric-engine.ts
.cache/shacl-venv/bin/python scripts/shacl-validation-oracle.py
.cache/shacl-venv/bin/python scripts/shacl-report-comparison.py
bun test tests/shacl/engine.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/shacl-validation-browser.ts
```

All 98 Core booleans match official expectations. Mandatory-field report projection
matches 98 with equivalent mapped paths, versus 89 with raw path-subgraph isomorphism;
the difference is shared versus duplicated equivalent path nodes. Message/detail fidelity
and blank identity relative to source graphs are NOT included. Raw native reports remain
available for stronger comparisons. PySHACL independently matches 97 booleans and 95
path-semantic projections. Its datatype-001, or-datatypes-001 and uniqueLang-002 differences
are retained. Shared native source files use shared blank identity; distinct files use
disjoint graphs. Python packages are not runtime dependencies of the browser API.

The authored numeric case proves why 98 passing booleans do not establish full support:
rdf-validate-shacl reports true for a value one below integer minimum 9007199254740993;
PySHACL reports false. The UMF wrapper blocks this case without a conformance boolean.
`numeric-engine-gap.json` and `numeric-oracle.json` record that result. Exact numeric
ordering and other datatype gaps remain required implementation work.


Exact numeric follow-up: `umf-exact-decimal-1` replaces the earlier integer/decimal
conversion block with exact six-constraint ordering and datatype checks. The original
9007199254740993 minimum now evaluates to a proper violation. Mixed float/double
promotion remains blocked; full SHACL support remains open. Source spellings are retained.

The authored matrix has 75 cases, including large adjacent integers, negative values,
subnormal-sized decimals, 351-digit integers, equivalent spellings, zero and signed/unsigned
datatype boundaries. PySHACL agrees on 71; four datatype deviations remain recorded.
Seven focused Bun tests pass with 1,932 assertions. Chromium passes 150 authored evaluations,
300 source recoveries and 150 report recoveries plus scope/recursion checks, with no external
requests or Node globals. Type checking and ESM/declaration build pass. The 98 official Core
booleans and qualified mandatory-field comparisons remain passing in Bun/native evidence.

Reproduce the new evidence with `bun scripts/shacl-exact-numeric.ts`,
`.cache/shacl-venv/bin/python scripts/shacl-exact-numeric-oracle.py`,
`bun test tests/shacl/numeric.test.ts tests/shacl/engine.test.ts`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/shacl-exact-numeric-browser.ts`.
The numeric gap fixture now records both the unmodified engine's false pass and the UMF
wrapper's corrected false result. Full report fidelity and remaining datatype/extension
work are still required; no core promotion or overall completion is claimed.


Numeric profile 2 now implements mixed integer/decimal/float/double ordering and
float/double datatype validation. It supersedes the earlier mixed-promotion blocker.
Decimal-to-binary32 rounding is direct, avoiding binary64 double rounding; float literals
enter binary32 before widening. NaN is unordered, infinities compare without subtraction,
and signed zero remains in source while comparing equal. The profile is identified as
`umf-numeric-2` in the report schema. A bounded direct-conversion limit blocks without
partial results or source loss; full SHACL/report support remains unclaimed.

Evidence: 24 authored operand pairs independently agree with glibc 2.41 strtof/strtod.
Those pairs exercise all six ordering constraints, plus 16 datatype cases, for 160 total
cases. The float Bun run passes two tests with 993 assertions; a separate public limit
check passes five assertions. Existing engine/numeric regression passes seven tests with
1,934 assertions. Chromium passes 320 evaluations, 640 source recoveries and 320 report
recoveries, with scope/recursion checks, no Node globals and zero external requests.
All 98 official Core booleans and qualified mandatory-field comparisons remain matching.
Messages/details, source-anchored blank identity, malformed shapes, datetime/string
semantics and remaining extensions/consumers are still required work.

Reproduce with `python3 scripts/shacl-float-inputs.py`, `bun scripts/shacl-float.ts`,
`python3 scripts/shacl-float-oracle.py`, `bun test tests/shacl/float.test.ts`, and
`UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/shacl-float-browser.ts`.
The C oracle is development-only and requires the documented libc platform; the browser
implementation is TypeScript/JavaScript with BigInt and DataView, not a native dependency.


### SHACL string profile evidence

`umf-string-1` implements code-point lexical length, xsd:string ordering and basic
language-range matching. The 106-case corpus and PySHACL comparison retain six native
disagreements; see CONTRACT-028 for their interpretation and limits. Chromium passed
212 JSON/YAML evaluations, 424 source recoveries and 212 report recoveries with no
external requests or Node globals. Reproduce with `bun scripts/shacl-strings.ts`,
`.cache/shacl-venv/bin/python scripts/shacl-string-oracle.py`, and
`bun scripts/shacl-string-browser.ts` (set UMF_CHROMIUM_PATH when needed).
This remains experimental engine evidence, not complete SHACL conformance.

The authored `metadata.ttl` order example exercises declared shape metadata for
consumers. `bun scripts/shacl-metadata-schema.ts` regenerates the API JSON Schema;
`bun scripts/shacl-metadata-browser.ts` writes the metadata sample and Chromium
recovery/edit evidence (set UMF_CHROMIUM_PATH when needed). This output retains the
source model and does not claim to generate or enforce a complete form.
