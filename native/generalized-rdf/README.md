# JSON-LD generalized dataset evidence

`umf.generalized-rdf` preserves the JSON-LD generalized subset in quad-array JSON, with
node subjects/predicates, literal objects and named/default graphs. It is distinct from
RDF 1.1 N-Quads/Turtle/TriG. See [CONTRACT-027](../../docs/helix/02-design/contracts/CONTRACT-027-generalized-rdf.md).

Sources are t0118 and te075 from the pinned [JSON-LD source manifest](../jsonld/sources/manifest.json).
The source license remains with that corpus. Forward projection explicitly enables
produceGeneralizedRdf. Both expected datasets match; both reverse/reprojection datasets are
isomorphic with shared blank identities across term roles. The first has nine quads, the second two.

PyLD 2.0.4 produces ten quads for t0118 and differs from the official expectation; it agrees for
te075. Both outputs are retained. Expected generalized N-Quads require a declared parsing adaptation:
replace only blank predicate tokens with collision-checked IRIs, parse using the standard parser,
and restore blank identities before comparison. RDFLib 7.6.0 compares reified term roles with
literal normalization disabled and duplicate quad occurrences collapsed. This is not a claim that
an unmodified N-Quads parser accepts generalized syntax.

Reproduce with:

```sh
bun scripts/generalized-rdf-schema.ts
bun scripts/jsonld-schema.ts
bun scripts/generalized-rdf.ts
.cache/jsonld-venv/bin/python scripts/generalized-rdf-oracle.py
bun test tests/generalized-rdf
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/generalized-rdf-browser.ts
```

Use the existing JSON-LD/RDF oracle environments; Python is development-only. The browser override
can be omitted when Playwright Chromium is installed. Results live in `fixtures/generalized-rdf/`.
Unknown native structures remain exact source JSON but block interpretation/edits. Unknown encoding
fields block native export. Native dataset JSON does not carry empty graph inventory or establish
entailment; literal subjects/predicates and global blank identity are outside this subset.


US-027 verification: the scoped regression run passed ten tests with 5,412 assertions. The expanded
package run passed three tests with 81 assertions, including exact RDF JSON in both processing
modes and unknown-source blocking. Chromium passed both official generalized cases with four
source recoveries, four candidate exports, four reverse projections, four reprojections, four
copied edits, two exact JSON-literal checks and unknown-data/encoding guards. External requests
were zero and Node globals absent. Type checking, browser ESM/declaration build and fresh
nine-file processor patch reproduction passed. Wider JSON-LD compatibility, ontology/platform
extensions and metadata-consumer deliverables remain open; the overall goal is not complete.
