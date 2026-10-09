# Core dataset value operation evidence — 2026-10-09

This bounded public API experiment checks the explicitly supplied finite dataset against original core 0.8 declarations. It preserves original Record and Key operation receipts separately from dataset context results. It does not establish completeness of omitted partitions, native storage coverage, transaction acceptance, publication readability or ACK authority.

The implementation starts from UMF master `45473e71d5dfe9aa80abe3e346243b8efcbf1a37`. The Record operation foundation is copied from `c45c72a2a8a3c4fba61c40c5927dd9091acf8cc3`; current master document validation and Key tuple v3 behavior remain authoritative. CONTRACT-049 defines the desired scope and obligations. The original commerce ontology and graph fixture remain unchanged. The test helper explicitly converts their candidate lexical values into public scalar carriers; this is consumer preparation, not an inferred canonical graph representation.

Final checks:

- `bun test tests/core-record-values.test.ts tests/core-dataset-values.test.ts tests/core/key-tuple.test.ts tests/core/schema-properties.test.ts tests/core/relationship-public.test.ts tests/core/relationship-selection.test.ts tests/core/relationship-operations.test.ts`: 82 passed, zero failed, 802 assertions across seven files.
- `bun node_modules/typescript/bin/tsc --noEmit` and `bun node_modules/typescript/bin/tsc -p tsconfig.tools.json`: passed.
- `bun scripts/audit-json-schemas.ts`: all 350 schemas passed; retained report is `fixtures/json-schema-audit.json`.
- `bun scripts/core-dataset-values-browser.ts`: actual Chromium 153.0.8010.12 passed, using the schema-enabled browser bundle. The complete retained receipt, request, source, controls and source/bundle fingerprints are in `fixtures/validation/core-dataset-values-browser.json`.

The browser checks 11 original commerce records, 11 original public Key receipts and 10 relationship occurrences. The supplied dataset context is valid and complete while the unchanged original Record receipts retain their separate context obligations. Duplicate keys, unresolved targets, wrong source endpoints and missing required relationships refuse. Unknown source content remains preserved and incomplete; forged receipts and changed request scope refuse. Browser execution has no Node globals.

Additional Bun controls cover duplicate instance and occurrence identity, distinct-neighbor multiplicity with preserved parallel occurrence bags, unsupported lifecycle/heterogeneous context, relevant unknown key semantics, null/missing keys, unchanged unbounded integer values, and exact source/input/receipt custody. The receipt budget regression uses twenty keys sharing a large string: the small case retains twenty original Key receipts; the large case refuses before returning an oversized receipt. Actual retained original receipt bytes are charged incrementally and the complete final envelope is checked against the four-million-byte ceiling. Public Key resource-limit failures propagate unchanged.

Reproduce from this implementation revision with the commands above. Browser verification needs a local loopback listener and cached Playwright Chromium; it makes no Databricks calls or paid resource requests.
