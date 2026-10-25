---
ddx:
  id: umf.evidence.rust-migration.r5-csv-boolean-default-route
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-csv-boolean-lexical
      kind: informed_by
---

# R5 CSV Boolean lexical default route

This packet follows the explicit CSV lexical profile in
[CONTRACT-053 domain-pack profiles](../../../../02-design/contracts/CONTRACT-053-domain-pack-profiles.md).
It records the exact TypeScript predecessor and the bounded source
selection of Rust for `validateCsvBooleanLexical` and
`verifyCsvBooleanLexical` in the v4 Node and browser entrypoints. It is
implementation evidence only; installed qualification, family retirement,
Python selection and broader CSV conversion support are not claimed.

The predecessor is frozen at
[`scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json`](../../../../../../../scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json)
and reproduced by
`bun scripts/rust-migration/r5/csv-boolean-default-route/freeze.ts --check`.
It covers all four tokens, public Field validation including unknown selected
semantics, malformed Field and token refusals, request-shape precedence,
receipt-first expected-input access, and the exact 4,000,000-byte pair and
receipt boundaries. The input recipe and differential assertion are
`tests/rust-csv-boolean-default.test.ts`.

The binder delegates directly to the existing Node/WASM engine operations.
Receipt verification remains staged by the engine wrapper: Rust admits the
receipt before the wrapper reads independently supplied expected source and
request values, then recomputes the result. Source context remains marked
`unverified`; unknown selected semantics continue through the public Field
validator. The v4 roots select only these two named operations from Rust;
the TypeScript API remains available through the reference entrypoint.

The focused Node Rust differential passes against the frozen TypeScript
receipts and refusals. TypeScript root and tools checks pass. A real Chromium
153.0.8010.12 v4 replay against the isolated semantic-agent WASM package passes
all four full receipts against the frozen packet, receipt recomputation, zero
getter calls on malformed receipt, and browser-global absence; see
[`chromium-smoke.json`](chromium-smoke.json). The harness is
[`bindings/core/wasm/tests/csv-boolean-default-browser.mjs`](../../../../../../../bindings/core/wasm/tests/csv-boolean-default-browser.mjs).

The harness takes an isolated built WASM package directory containing
`pkg/umf_core_wasm.js` and `pkg/umf_core_wasm_bg.wasm`. It builds the current
`src/index-browser-v4.ts` entrypoint with Bun, resolves the WASM glue from that
package, serves the matching binary, and runs Chromium. Reproduce the recorded
build and package assembly with the pinned Rust 1.90.0 and wasm-bindgen 0.2.100:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-semantic-wasm-build \
  cargo build --locked --offline --release \
  --target wasm32-unknown-unknown -p umf-core-wasm

mkdir -p /private/tmp/umf-semantic-wasm-build/bindgen \
  /private/tmp/umf-semantic-wasm-build/package/pkg
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen \
  /private/tmp/umf-semantic-wasm-build/wasm32-unknown-unknown/release/umf_core_wasm.wasm \
  --target web \
  --out-dir /private/tmp/umf-semantic-wasm-build/bindgen \
  --out-name umf_core_wasm
cp bindings/core/wasm/index.js bindings/core/wasm/index.d.ts \
  /private/tmp/umf-semantic-wasm-build/package/
cp -R bindings/core/wasm/src /private/tmp/umf-semantic-wasm-build/package/
cp /private/tmp/umf-semantic-wasm-build/bindgen/umf_core_wasm.js \
  /private/tmp/umf-semantic-wasm-build/bindgen/umf_core_wasm_bg.wasm \
  /private/tmp/umf-semantic-wasm-build/package/pkg/

bun bindings/core/wasm/tests/csv-boolean-default-browser.mjs \
  /private/tmp/umf-semantic-wasm-build/package \
  docs/helix/04-build/evidence/rust-migration/r5-csv-boolean-default-route/chromium-smoke.json
```

The recorded package contains the matched wasm-bindgen glue and binary from the
fresh Rust `wasm32-unknown-unknown` build. The receipt pins both files, the
frozen predecessor, and the v4 source closure. This source checkpoint must not
be used as installed-SDK or release evidence.
