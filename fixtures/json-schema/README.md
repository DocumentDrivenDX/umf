# JSON Schema evidence

`order.schema.json` is an original UMF test fixture, authored 2026-09-20. It models
an Order with required identifiers, nested line definitions, local references,
closed properties and numeric bounds. Native tests edit a bound and independently
verify changed instance acceptance; this is not a copied production schema.

`upstream/` vendors the MIT-licensed JSON-Schema-Test-Suite at revision
`ab079cc2bace029fdbb483be28a6ade526bcfbc2`. Its manifest pins SHA-256 hashes and
provenance. Source: https://github.com/json-schema-org/JSON-Schema-Test-Suite .
The executed scope is all 46 required root Draft 2020-12 files: 384 schemas and
1,301 instance vectors. Optional/proposal files are retained but not executed.

Run `bun run test:conformance` after preparing the Python oracle dependencies as
described in the root README. It regenerates native exports through UMF and YAML,
then checks exact native-tree retention and original expected instance outcomes.
References resolve only from explicit local vendored resources; no network fetch.

Reports from 2026-09-20:

- `upstream-results.json`: all 384 round trips preserve native trees. Ajv 8.20.0
  passes expected vectors in 349 cases, disagrees with baseline in 24, and cannot
  compile 11. Every case preserves before/after parity where Ajv is available.
- `python-oracle-results.json`: jsonschema 4.26.0 passes 382 cases. Two fail because
  Python regex does not implement Unicode property escapes; Ajv passes those cases.
  The oracle uses Decimal decoding, mathematical integer recognition, Fraction
  multipleOf and explicit custom-metaschema validation-vocabulary selection.
  Exact dependency versions are in `scripts/oracle-requirements.txt`.
- `coverage.json`: all 384 cases have at least one independent native oracle that
  passes all original expected vectors before and after UMF round trip. Each
  oracle's individual failures remain visible; this is not a claim both pass.

The browser inspector reports 281 corpus schemas completely interpreted and 103
incomplete. Expected-vector coverage does not override interpretation diagnostics.
Unsafe numbers, unknown dialects/keywords/vocabularies and known compiler limits
remain preserved but block conservative edits. No universal validator conformance,
other JSON Schema dialect, optional format assertion or strict-CSP claim is made.

Chromium 148.0.7778.0 executed the bundled library's native round-trip, bound edit
and exact-number retention checks through `scripts/browser.ts`.
