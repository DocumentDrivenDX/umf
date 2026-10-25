---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-value-wasm
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-value
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-value-node
      kind: informed_by
---

# R5 trusted semantic validator WASM binding

This is an additive opt-in browser/WASM transport for the bounded synchronous
trusted validator operations recorded in the Rust semantic-value and Node
binding evidence. `createSemanticTypeRegistry(module, options)` and `initializeSemanticValueWasm(loader, host, options)` provide the
same caller-owned `register`, `lookup`, `check`, and
`validateCoreSemanticTypeValue` facade as the current Node packet. The wasm
export `executeSemanticValueWire(wireJson, dispatcher, controlDispatcher?)`
executes the Rust wire operation. JavaScript owns validator closures; only safe
integer tokens and tagged value copies cross the bridge.

The callback remains synchronous, trusted, and cooperative. It receives copies
of the value and definition and an additive `{reportWork(units)}` argument.
Reported work must be a nonnegative safe integer and is charged to the same Rust
`Context` before the callback outcome is applied. Result framing is capped at
1,048,576 units of host frame work and 1,000,000 message units. Callback
exceptions and invalid callback results are converted to tagged results; a JS
exception thrown directly by the Rust dispatcher becomes a generic host failure.
Meter, cancellation, deadline, and callback-reported resource provenance travel
through the host control bridge. A synchronous callback cannot be preempted.
Hard-isolated execution is refused before a request can be issued.

The facade mirrors the Node packet's ordering preflights and per-call registry
reconstruction. Preflight calls omit controls, aggregate source validation is
performed before value admission and again during final aggregation, and large
registry scaling is not qualified. No default package route changed. This
packet does not claim complete browser equivalence to the v3 predecessor, full
`SemanticTypeRegistry` API coverage, callback preemption, a general WASM release
qualification, or retirement of TypeScript semantic-type paths. CONTRACT-078's
broader transitions, legacy behavior, extension APIs and remaining source
reconciliation stay open.

Focused evidence at this draft source:

- `bun test ./bindings/core/wasm/tests/semantic-value-wrapper.test.js`: 6 passed, 15 expectations, including one-load/one-init initializer behavior.
- Rust 1.90.0 `cargo check --locked --offline -p umf-core-wasm --target wasm32-unknown-unknown`: passed using `/private/tmp/umf-wasm-semantic-target` as `CARGO_TARGET_DIR`.
- Fresh optimized build: `cargo build --locked --offline --release -p umf-core-wasm --target wasm32-unknown-unknown`, with `CARGO_TARGET_DIR=/private/tmp/umf-semantic-wasm-build`.
- Reproducible isolated package assembly after the build:

  ```sh
  mkdir -p /private/tmp/umf-semantic-wasm-build/bindgen /private/tmp/umf-semantic-wasm-build/package/pkg
  /private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen /private/tmp/umf-semantic-wasm-build/wasm32-unknown-unknown/release/umf_core_wasm.wasm --target web --out-dir /private/tmp/umf-semantic-wasm-build/bindgen --out-name umf_core_wasm
  cp bindings/core/wasm/index.js bindings/core/wasm/index.d.ts /private/tmp/umf-semantic-wasm-build/package/
  cp -R bindings/core/wasm/src /private/tmp/umf-semantic-wasm-build/package/
  cp /private/tmp/umf-semantic-wasm-build/bindgen/umf_core_wasm.js /private/tmp/umf-semantic-wasm-build/bindgen/umf_core_wasm_bg.wasm /private/tmp/umf-semantic-wasm-build/package/pkg/
  UMF_SEMANTIC_VALUE_WASM_PACKAGE=/private/tmp/umf-semantic-wasm-build/package bun ./bindings/core/wasm/tests/semantic-value-browser.mjs
  ```

- The Chromium 153.0.8010.12 replay compared 14 direct, 10 registration, and 4 aggregate results/refusals with frozen packet v3, checked refusal-before-callback count, and verified the new initializer loaded a fresh glue module, initialized once, and returned a working registry. It also verified additive repeated/invalid reportWork cases, exact wasm32 charging of `4,294,967,315` in chunks `4,294,967,295` and `20`, generic dispatcher-exception mapping, and `HOST_CONTROL` control failure provenance.

SHA-256 pins for this replay:

- Rust binding source `bindings/core/wasm/src/lib.rs`: `9f7600957bc3147450b9f77e139eed41050ccade519627a32e8867d77bf5de98`.
- JavaScript facade `bindings/core/wasm/index.js`: `2440d265779bd9b8cb740a5d4680bc58f4cdd3362128dc951a81125abc072700`.
- Public API declarations `bindings/core/wasm/index.d.ts`: `45813e1d0d7f579f7c1597c48ac6694c5e7b514032d1079063ae629b8046a445`.
- Callback transport `bindings/core/wasm/src/semantic-value.js`: `708f8d9379c1391ebfa0c9cf7edb4d428c5b0c6fdb7194011316c5c50b6941eb`.
- Focused wrapper tests: `4c194fbcb81c4b2a0ff148e734c3e9e218bb3a10aa91d7e1788af0b790aaf43f`.
- Chromium replay harness: `fcd4b1536819c36410c0db863a808c9e9174ad72a2bbb70f050ac2a9d2c6bfd9`.
- Frozen v3 packet: `ef39fe513a8f1fe457cc696d987e31d2248313b59a66f3e9ed80a6e7d2720c48`.
- Raw optimized Rust wasm: `f0db9b819aeba82b51f47a09134885a1d2976748d1c494614324af86dcbd8aa2`.
- Generated wasm-bindgen JS: `fdf4925f6fdf0db94c6181710f8970c7fdd75f7651dc8c6e3e1d5e57d8472a16`; paired `umf_core_wasm_bg.wasm`: `a6635f109ea1ef738d30701e4e8691154741382d255ba8be97b3640756d2bbfd`.

`bun run typecheck` passed after the concurrent root-entry typing fix landed.
