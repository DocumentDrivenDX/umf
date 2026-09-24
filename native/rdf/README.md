# RDF 1.1 dataset evidence

Public code is browser TypeScript; Bun is the test/development runtime. Python is only an
independent development oracle. N3.js 2.7.12 supplies the pinned browser ESM parser/writer.

```sh
uv venv .cache/rdf-venv --python python3
uv pip install --python .cache/rdf-venv/bin/python -r native/rdf/oracle-requirements.txt
.cache/rdf-venv/bin/python scripts/rdf-sources.py
bun scripts/rdf-schema.ts
bun scripts/rdf-roundtrip.ts
.cache/rdf-venv/bin/python scripts/rdf-oracle.py
bun test tests/rdf
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/rdf-browser.ts
```

The collector verifies w3c/rdf-tests commit 369a90d1a60c021b746df2e411da0ff36258a758 and captures
all 87 manifest cases with hashes and license. It clones/checks out the pin only when the cache
is absent; an existing mismatched checkout fails explicitly. Expected syntax outcomes are 53
accepted and 34 rejected. An authored schema dataset adds duplicate occurrences, blank graphs,
opaque OWL/SHACL metadata, custom datatypes and large lexical numbers.

RDFLib 7.6.0 with literal normalization disabled compares 54 positive datasets and 76 edited outputs.
The oracle reifies distinct quads so one blank-node bijection covers subject/object/graph positions.
It compares plain literals as xsd:string and lowercases language tags for RDF 1.1 equality. Original
source preserves those spellings. Nine official negative cases are accepted by RDFLib and recorded;
UMF still rejects them as required by the official syntax corpus. Chromium repeats every input and
both UMF source/candidate serializations without Node globals.

CONTRACT-025 qualifies the scope. This does not establish OWL/SHACL execution, other RDF syntaxes,
graph canonicalization or semantic equivalence of cross-system projections.

IRI rename candidates:

```sh
bun scripts/rdf-rename-schema.ts
bun scripts/rdf-rename.ts
.cache/rdf-venv/bin/python scripts/rdf-rename-oracle.py
bun test tests/rdf/rename.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/rdf-rename-browser.ts
```

All term positions and datatype IRIs participate, with literal text and blank scope unchanged.
Existing-target identities never coalesce implicitly. Fifty-three cases produce 106 independent
native comparisons; the browser also checks atomic collision/missing/invalid-datatype failures.
IRI identity and datatype interpretation may change intentionally; no ontology equivalence is claimed.

RDF 1.1 Turtle:

```sh
.cache/rdf-venv/bin/python scripts/rdf-turtle-sources.py
bun scripts/rdf-schema.ts
bun scripts/rdf-turtle.ts
.cache/rdf-venv/bin/python scripts/rdf-turtle-oracle.py
bun test tests/rdf/turtle.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/rdf-turtle-browser.ts
```

The same repository pin contains 313 cases (219 positive, 94 negative), including 145 official
expected graphs. Base IRIs follow the manifest's assumedTestBase plus action filename. Literal
carriage returns require byte decoding without Python universal-newline translation. Explicit and
anonymous blank labels use separate deterministic ASCII spaces; original spelling stays archived.
RDFLib's original parses differ on eleven positives (numeric lexical forms and IRI resolution) and
accept 39 negatives. All expected graphs, 219 emitted N-Quads datasets and 204 edits compare correctly.
Turtle export refuses named graph loss; regenerated output uses the N-Triples subset of Turtle.


RDF 1.1 TriG and empty graphs:

```sh
.cache/rdf-venv/bin/python scripts/rdf-trig-sources.py
bun scripts/rdf-schema.ts
bun scripts/rdf-trig.ts
.cache/rdf-venv/bin/python scripts/rdf-trig-oracle.py
bun test tests/rdf/trig.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/rdf-trig-browser.ts
```

All 357 official cases (242 positive/115 negative) and one authored empty/shared-blank case are
covered. Graph inventories retain empty names; N-Quads blocks four lossy projections. RDFLib
observes graph creation to recover empty declarations, then compares inventories, 143 official
quad sets, 239 N-Quads outputs, 216 literal edits and two empty graph renames. Eleven original
source mismatches and 48 accepted negatives remain explicit. Chromium repeats 486 recoveries,
216 edits, two renames and four loss blocks. The pinned private N3 graph-reader hook is tested
by the corpus and targeted anonymous/empty graph cases; upgrades require repeating these checks.


Explicit dataset composition:

```sh
bun scripts/rdf-merge-schema.ts
bun scripts/rdf-merge.ts
.cache/rdf-venv/bin/python scripts/rdf-merge-oracle.py
bun test tests/rdf/merge.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/rdf-merge-browser.ts
```

Every positive baseline dataset (54 N-Quads, 219 Turtle, 243 TriG) is paired with the authored
empty/shared-blank input: 516 merges, 1,032 exports. Both RDFLib and Chromium verify that matrix.
Native oracle inputs use regenerated absolute TriG terms so the separate baseline parser
normalization differences do not confound composition checks. The oracle independently remaps
blank nodes per input and compares quad sets plus graph presence. Bun also checks complete
source retention, report schemas, duplicate occurrences, explicit policies, provenance and
atomic unknown-encoding rejection. Identical input ids/scopes do not imply shared blank identity.
