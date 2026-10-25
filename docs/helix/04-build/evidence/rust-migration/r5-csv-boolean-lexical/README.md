# R5 CONTRACT-053 CSV Boolean lexical core candidate

This evidence contains a historical Rust core/wire checkpoint and the successor
installed-binding checkpoint below. CSV Boolean lexical conversion remains an
opt-in Rust core-model operation; this family has no default-route or Python
graduation claim.

Gate 0 is retained under `predecessor/`: unchanged TypeScript operation and
byte-budget helper, the exact schemas and medical ontology fixture, the test
file as input recipe, test transcript, and SHA-256 checksums. The predecessor
suite passes 8 tests and 91 assertions. The original source closure archive
remains preserved with its replay limitation; the expanded, standalone-replayable
closure and replay transcript are in `predecessor-v2/`. The source checksum for
the corrected CONTRACT-053 is included alongside those inputs. Receipt version
is 1.0.0 and core version admission is 0.10.0; the
historical graph 0.8.0 profile remains separate.

The Rust operation uses a copied `Value` source/request pair, checks their
combined serialized UTF-8 size before request shape and source admission, reads
the explicitly selected scalar Boolean Field, and delegates typed value
semantics to the public Field validator. Verification copies and budgets the
receipt, validates its closed receipt and request shapes, and admits the
embedded source against the core structural schema only. That receipt check
does not run semantic constraints before independently supplied expected
inputs. Control failures retain their original provenance. Validation copies
the assembled receipt before its byte-budget and schema checks. Verification
then recomputes from expected source/request values and canonical-compares the
whole receipt. JSON byte traversal counts UTF-8, JSON escapes, and lone
surrogate escaping, with early refusal at the 4,000,000-byte ceiling.

The earlier Rust core-only checkpoint is recorded in `candidate-sha256.txt` and
`rust-test-output.txt`. Its statement that no host route was staged is
historical; the successor below adds opt-in Node and browser WASM bindings.

## Installed binding checkpoint

The versioned operation is now exposed by `createCoreModelEngine` through
tagged Rust wire operations. `verifyCsvBooleanLexical` first sends the receipt
alone for Rust admission. Only after success does the wrapper send expected
source/request values. The finish operation re-admits the prepared receipt and
recomputes from those independent values, so direct wire callers cannot forge
the intermediate result. The Node package asset list includes the new helper;
the WASM helper is an exact mirror recorded in `bindings/core/wasm/src/shared-sources.json`.

The frozen predecessor is checked by
`scripts/rust-migration/r5/capture-csv-boolean-lexical-predecessor.ts --check`
against `pre-binding-freeze.json`. It pins all four finite tokens, unknown
selected semantics, invalid Field/cardinality, crossed refusal order, UTF-8
pair and receipt limits, and getter-free receipt-first rejection. Rust tests
also prove that structurally allowed unknown extension payload survives receipt
preparation without semantic interpretation, and that malformed validation
fields are rejected by the closed receipt admission.

Focused offline tests pass: `umf-core` 4/4, `umf-core-wire` 2/2, and the Node
wrapper 3/3. The installed npm tarball
`/private/tmp/umf-r5-csv-bool-install/umf-core-rust-native-0.1.0.tgz` has SHA-256
`9fb0f951a4d49d69527cd556dc8e23d764d6afdd6d43d94c2ccac81740ac0e95`; it has 18
members, including `src/csv-boolean-lexical.js` and the freshly built addon
`45b4e3de4002d11a782a89b67ce4104ac364ec9f90030b37cfc2adbfb7995765`. Extracted
package-name replays pass under Node 26.12.1 and Bun 1.4.3 / Node 26.3.0. The
receipts are `/private/tmp/umf-r5-csv-bool-install/archive-node-replay.json`
(SHA-256 `be089204d4d5e4c2f0ad95566d5fd3cac60493e28387efbbc2221893aa9e3a28`)
and `/private/tmp/umf-r5-csv-bool-install/archive-bun-replay.json` (SHA-256
`29a0dadb48d9c21013ef1ee7da0029751fdf72e196f0496af2cf55bccd305ee6`).

The clean WASM runtime archive
`/private/tmp/umf-r5-csv-boolean-lexical-wasm/csv-boolean-lexical-wasm-runtime.tar.gz`
has SHA-256 `562317aa73a1e822efca6e34564232bbfc578adbb90a864e42ff97b26f403698`;
its generated WASM is SHA-256
`1cf665b0d74eb904d967a140d5054c394c7f99a83c7b41c8b63b80b12047b669` and was
built with wasm-bindgen 0.2.100. The extracted runtime passes the same matrix in
Headless Chromium 153.0.8010.12; receipt:
`/private/tmp/umf-r5-csv-boolean-lexical-wasm/runtime-extracted-replay.json`,
SHA-256 `5214d07e5828de320dd2fba7bbad824cb465bb291e7bd8f4f2b6b460d653603a`.

Each installed-host matrix covers the four tokens, malformed receipt before
getter-bearing expected inputs (zero getter calls), crossed invalid expected
source/request ordering, astral and lone-surrogate preservation, direct-wire
forged prepared-receipt refusal, and both byte ceilings. A 4,000,000-byte
source/request pair reaches the frozen request-shape error; 4,000,001 bytes
refuses with `LIMIT`. An exactly 4,000,000-byte complete receipt succeeds and
one additional byte refuses with `LIMIT`.

The Node and WASM operation contexts are separate calls: receipt admission and
finish recomputation do not share a single cumulative Rust Context. These tests
qualify the opt-in host routes for this source cohort only. SDK publication,
default-route integration, Python, wider conversion behavior, and cumulative
single-Context equivalence remain open.

Independent Sol review checked the receipt schema against the Rust closed-shape
and request admission, UTF-16 JSON byte accounting, source/Field validation
delegation, and receipt-first wrapper ordering. No P1/P2 issue was found in
that scoped code review. Sol reran the extracted Chromium WASM replay against
the frozen source cohort; its independent receipt at
`/private/tmp/umf-sol-csv-browser-replay.json` is byte-identical to the
checkpoint receipt above (SHA-256
`5214d07e5828de320dd2fba7bbad824cb465bb291e7bd8f4f2b6b460d653603a`).
