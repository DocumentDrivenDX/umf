---
ddx:
  id: umf.evidence.rust-migration.r9-avro-cardinality-classification
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-avro-record-type
      kind: references
---

# R9 Avro Cardinality classification candidate

**Review base:** `3f284435748c78d9c373c4eda7f8ce06ee340bde` in this isolated checkout; the original R9 source base was `4dc0d1daeaecd86ba9286e6cf93d7d5d041cee2d`. **Profile:** core 0.10.0, Avro structural 1.12.0, `umf.avro.cardinality` 1.0.0, opt-in tagged binding `umf.avro-cardinality-binding/1.0.0`.

The production `umf-core` module owns `classifyAvroCardinality`, `verifyAvroCardinalityClassification`, and `recoverAvroCardinalityBundle`. It uses the retained `NativeJsonTree` and `avro_document` archive, the `avro_fields` metadata and scalar-family kernel, exact core schemas and extension manifest, and one Rust implementation across the tagged CLI, Node/Bun, Python and browser WASM routes. The TypeScript exports remain explicit reference operations. This slice does not change default selection or publish an installed release.

`freeze.ts` captures 80 complete TypeScript envelopes from the 20 authored Avro Cardinality cases across both profiles and modes. `compare-parallel.ts` replays full envelopes through the source-built CLI with an empty `PATH`, including native fragments, logical identity graph, residuals, diagnostics, target documents and exact unknown numeric lexemes. The predecessor packet authored 23 extra controls: 22 typed-wire controls matched and the `missing-column` control contained JavaScript `undefined`, which the host `copyJson` wrapper rejects as `NON_JSON` before the operation. That result is **22 matched typed-wire controls out of 23 authored controls**, not 23 wire comparisons. Its missing-property counterpart is now frozen as `missing-column-wire` and expects `AVRO_CARDINALITY_REQUEST` with `missingProperty: "column"`.

The expanded `freeze-extra.ts` packet has 51 authored controls, 50 representable on the typed wire. It covers named and fully qualified union branches, array/map duplicates, invalid names and enum symbols, fixed-size safe-integer and avsc width rules, exponent and fractional integer tokens, nested unions, combined Ajv errors, nested unknowns and 64 ordered extra properties. It also verifies and recovers receipts for duplicate named branches, unsafe fixed-size tokens and accepted exponent-form fixed size. `compare-extra.ts` compares every enumerable outcome field or wire error code/path/message and separately checks the host `UmfError` name. It never serializes the `undefined` input into a misleading missing-property request. Request diagnostics use the existing trusted schema evaluator's Ajv-style all-errors mode locally to this request schema; this retains each additional-property key in original JavaScript property order without changing the global schema profile. Meter and cancellation failures retain their control provenance and escape structural classification.

Fresh native Node and Bun addons, a Python abi3 extension through `rust_avro_cardinality.py`, and release WASM through `wasm-bindgen 0.2.100` are replayed with the checked-in host scripts. They compare complete classify, verify and recover outcomes for the base case and three changed classifications. The browser test uses real Chromium and a loopback server. The sandboxed bind returned `EADDRINUSE`; an authorized local retry is recorded separately. The production Darwin Python Hatch wheel build sets `aarch64-apple-darwin`, deployment target, `CARGO_PROFILE_RELEASE_STRIP=none`, and `-C debuginfo=2 -C strip=none` through `python/hatch_build.py`. The wheel build is source-built packaging evidence, not an installed consumer test. `python/tests/test_python_sdist.py` checks the expanded exact resource list and helper pin. These remain current-source local routes, not installed npm/wheel or release qualification.

The classifier reports a residual for unresolved profiles, null-only or mixed container branches, and unresolved structural types. Strict mode blocks residuals; report mode retains them. It copies source and request, refuses incompatible target identities and vocabulary versions, re-exports the target to check native archive conservation, and verifies receipts by recomputation before recovery. Recovery returns the caller's retained source text and ordered dependency strings; whitespace in an equivalent dependency may change without falsely claiming receipt authentication.

## Correction qualification

The checked-in `receipt.json` describes the predecessor source identified by
its hashes. It does not qualify the subsequent review repairs. Independent
review found duplicate named-union acceptance, unsafe fixed-size acceptance,
and incomplete request errors. A six-case release-artifact probe then exposed
three further differences: later child errors must precede duplicate-union
errors, and diagnostics must preserve both quoted and raw unpaired UTF-16.
The repaired implementation separates structural indexing from native type
validation and retains diagnostic text as UTF-16 throughout.

The bounded correction run at source `0f9bf6998` passes six focused Rust tests,
six release-CLI regression cases, all 80 frozen classifications, all 50
representable additional controls, and all 21 actual Node addon outcomes plus
the host-control check. Bun is incomplete; Python and WASM/Chromium were not
reached. The exec handle ended with code 1 while the budget state still showed
an active run; a process audit confirmed the runner and its owned group absent.
The exact termination cause and elapsed time are unverified. Accounting retains
the full reservation, with no refund, attempt reset or allowance increase.
[Captured observations](bounded-correction/observations.json) pin the tested
source, artifacts, helper scripts, logs and conservative budget reconciliation.
Earlier interrupted comparisons and the predecessor receipt are retained as
historical evidence. Independent review of the latest repair remains open.

A read-only source audit additionally found an uncovered compatibility case:
avsc initializes enum-symbol and union-branch indexes with ordinary JavaScript
objects (`node_modules/avsc/lib/types.js`, `EnumType` and `UnionType`). Its
`index[name] !== undefined` check rejects inherited Object-prototype names even
on their first occurrence. The tested Rust source's empty `HashSet` does not model that case.
The current frozen packet has no such symbols or global branch names. This is
an open semantic finding even if every currently running case passes; do not
accept or integrate this candidate until the mechanism and actual reference
regressions are qualified. After the run ended, the successor repair adds explicit stock-prototype name
checks to both indexes and Rust regressions for enum rejection, global union
rejection, qualified union acceptance and standalone named-record acceptance.
That successor has been formatted but has not been executed or independently
reviewed. `prototype-index-reference.cjs` is a small direct-avsc oracle for all
inherited names; it is authored but not executed. Further qualification needs
an explicitly bounded allowance; the prior two-attempt allowance is exhausted.

## Reproduce

The shell examples assume the official cached `node_modules` linked at this checkout's `node_modules`, Rust 1.90.0 at the path below, and the locally cached dependencies. Build the CLI and native bindings before comparing:

```sh
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc CARGO_TARGET_DIR=/private/tmp/umf-avro-cardinality-hatch-target CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 MACOSX_DEPLOYMENT_TARGET=11.0 CARGO_PROFILE_RELEASE_STRIP=none RUSTFLAGS='-C debuginfo=2 -C strip=none' /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo build --locked --offline --release --target aarch64-apple-darwin -p umf-cli -p umf-core-node -p umf-core-python
export UMF_AVRO_CARDINALITY_CLI=/private/tmp/umf-avro-cardinality-hatch-target/aarch64-apple-darwin/release/umf
```

```sh
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/freeze.ts
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/freeze-extra.ts
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/compare-parallel.ts
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/compare-extra.ts
node docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/test-binding.mjs
bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/test-binding.mjs
PYTHONPATH=python/src PYTHONDONTWRITEBYTECODE=1 /private/tmp/umf-r8-python-env/bin/python docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/test-python.py
CARGO_INCREMENTAL=0 RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc CARGO_TARGET_DIR=/private/tmp/umf-avro-cardinality-target /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo test --locked --offline -p umf-core avro_cardinality::tests --lib
PYTHONDONTWRITEBYTECODE=1 /private/tmp/umf-r8-python-env/bin/python -m pytest -q python/tests/test_python_sdist.py
```

The release WASM/Chromium route used `cargo build --locked --offline -p umf-core-wasm --release --target wasm32-unknown-unknown` with the same `RUSTC`, `CARGO_TARGET_DIR`, and `CARGO_INCREMENTAL=0`, then `/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen --target web --out-dir /private/tmp/umf-avro-cardinality-wasm-web --out-name umf_core_wasm /private/tmp/umf-avro-cardinality-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm` and `bun docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification/test-browser.ts`. The production Python wheel used `python -m hatchling build -t wheel` from `python/` with `CARGO`, `RUSTC`, `CARGO_NET_OFFLINE=true`, and an isolated `CARGO_TARGET_DIR`; its hook owns the Darwin target and no-strip flags.

These comparisons check enumerable values and array order; their object comparison does not assert member order. That remains a separate qualification requirement. The compare scripts require an explicit `UMF_AVRO_CARDINALITY_CLI` and execute one CLI process at a time. Stage the release addon and extension into isolated Node and Python package directories; select them with `UMF_AVRO_CARDINALITY_NODE_ENTRY` and `PYTHONPATH`, and select generated release WASM glue with `UMF_AVRO_CARDINALITY_WASM_PACKAGE`. The correction run uses those release artifacts rather than overwriting source-package modules with debug builds. The predecessor `receipt.json` identifies only its own historical artifacts and source hashes. The browser test needs a loopback bind. Local Rust 1.90.0 and wasm-bindgen 0.2.100 were used.

## Limits

This evidence covers schema-level present, non-null shape and its retained archive. It does not establish Apache Avro compiler equivalence, datum codec behavior, authored Cardinality projection, every possible Avro declaration or alias combination, full resource/cancellation/deadline matrices, installed artifacts, default-route retirement, or release readiness. CONTRACT-001–011 do not add an operation-specific Cardinality rule; CONTRACT-040 and the current TypeScript API define this bounded classification behavior. Wider native and consumer gates remain separately open.
