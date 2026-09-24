# OpenAPI authored evidence

`orders.yaml` is an original UMF fixture with operations, media schemas, security,
callbacks, webhooks, links and extension content. Bun tests emit JSON round trips,
a 3.2.1 variant and twelve validation cases. Source comments remain exact until edits;
edited output uses JSON syntax, a valid YAML 1.2 subset.

`scripts/openapi-oracle.py` compares native content using PyYAML 6.0.3 and evaluates
unmodified official schemas with jsonschema 4.26.0. Versions, resource hashes and
results appear in `oracle-results.json`. The browser adapter's standalone static
anchor workaround is not used by this independent oracle. Invalid embedded Schema
Object keywords are deliberately accepted by these object-only schemas and remain
outside the object-only schema check; the newer embedded-dialect checker rejects known invalid keyword syntax.

Run `bun test tests/openapi` then `.venv/bin/python scripts/openapi-oracle.py`, or
use the full `bun run test:conformance` command. The upstream corpus below extends native-description coverage. Reference/dialect
resolution, HTTP runtime conformance and cross-system projection remain open.


## Official example corpus and legacy profiles

The [OpenAPI Initiative Learn OpenAPI examples](https://github.com/OAI/learn.openapis.org/tree/43756549c27cbf84107b190b82c65e0336f2f09f/examples)
are included under CC-BY-4.0, with original license in `upstream/LICENSE` and source
hashes in `upstream/manifest.json`. These upstream files are unchanged; generated
round-trip output and validation reports are UMF-derived artifacts. The corpus
includes every JSON/YAML example: 46 files, comprising 38 complete descriptions and
eight referenced fragments. No files were filtered by validation outcome.

`corpus-results.json` records exact source round trips through core JSON/YAML and
native JSON content. All 38 descriptions pass their official 2.0/3.0/3.1/3.2 schema
checks. Eight fragments lack document version/context and remain explicitly outside
standalone import; their source content stays in the corpus for reference-bundle work.

`scripts/openapi-corpus-oracle.py` independently compares content and evaluates
unmodified schemas, including Draft-04 for legacy versions. `corpus-oracle-results.json`
records results and eight legacy positive/negative cases. Its safe YAML loader retains
timestamp-tagged literals as strings to match the JSON-compatible OpenAPI profile;
it does not claim generic YAML 1.1/1.2 equivalence. The 3.2 query example exposes why
plain PyYAML date/time conversion would otherwise corrupt the comparison.

## Explicit resources

`resource-bundle-json.json` and `resource-bundle-yaml.json` are generated bundles of
the official separate-file petstore, with original and edited resource versions.
Each contains the owning description and four explicitly URI-addressed fragments.
All eight original fragment sources remain byte-for-byte strings in bundle export.

`scripts/openapi-bundle-oracle.py` looks up the fixture's literal references using
only supplied files, then validates original/edited Pet ID types independently with
Draft4. `resource-bundle-oracle-results.json` records the results. Native bundle
support does not imply general OpenAPI/JSON Schema scope resolution; named anchors,
nested IDs and contextual target validation remain outside literal pointer lookup.


## Embedded dialect checks

`embedded-schema-cases.json` records role/dialect-aware validation outcomes.
`scripts/openapi-schema-oracle.py` uses pinned, unmodified official dialect/meta
resources from `dialect-manifest.json`: nine fully known cases and two 3.2 XML checks.
Unknown dialect and literal-extension cases remain explicitly excluded from that
known-dialect oracle. The Bun tests cover their preservation and incomplete status.

`object-validation-cases.json` separates `objectExpected` from adapter acceptance:
the official object-only schema accepts an invalid embedded type, while the combined
adapter now rejects it. Reports do not equate keyword syntax with instance validation,
reference scope or custom vocabulary execution.

## Typed Reference Objects

`reference-resolution.json` records an authored two-hop Reference Object chain with
an outer description override and untouched target. `reference-kind-cases.json`
covers seven declared roles. `scripts/openapi-reference-oracle.py` independently
follows supplied URI/pointer references and checks unmodified official target schemas;
results are in `reference-oracle-results.json`. Source roles are caller-declared.

The result retains origin and siblings without flattening. Cycles, missing targets,
wrong object roles, anchors and unsupported `$self` identity contexts fail. These
checks do not establish nested reference closure or Schema Object scope resolution.


Schema extraction evidence lives in `tests/openapi/extraction.test.ts`: exact unsafe
integer retention, reference/source retention, copied values, result-schema validation,
three dialect origins, unknown dialect preservation and rejection of literal examples
or contextless fragments. Chromium also exercises the exact-number public API. These
checks establish extraction fidelity, not native schema evaluation or projection.


Static schema scope uses an authored OpenAPI 3.2 description with `$self`, relative
nested IDs, anchors, pointer references, literal examples and an explicitly classified
external schema. `scope-cases.json` records targets; `scope-oracle-results.json` records
four independent Python referencing resolutions. The oracle starts with the selected
schema resource at its owning semantic base URI; it does not independently discover
OpenAPI roles or establish `$self`. Ambiguity and unknown-dialect failures have authored
negative checks. Dynamic evaluation remains separate work.


OpenAPI projection evidence: `projection-cases.json` contains a recursive model with
external enums, conditionals and unevaluated properties, ten native instance vectors
and the emitted/UMF-round-tripped target. `projection-upstream-cases.json` covers all
six components of the pinned official Tic Tac Toe example with twelve vectors.
`projection-oracle-results.json` records Python jsonschema comparisons and three
missing-fidelity-report controls. The native oracle checks JSON constraints only;
HTTP execution, request/response direction and dynamic references are not covered.


`dynamic-cases.json` records six explicit evaluation-scope selections: local dynamic
anchor, outer override, multiple outer overrides, an ordinary anchor that must not
override, and ordinary-anchor/pointer static fallbacks. Python referencing independently
follows the resource transitions and compares native targets; results are in
`dynamic-oracle-results.json`. Negative tests reject invalid scope and missing context.
This evidence covers reference selection, not UMF instance evaluation.
