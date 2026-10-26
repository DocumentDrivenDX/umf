---
ddx:
  id: umf.evidence.rust-migration.r8-json-value-serialization
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# R8 JSON-compatible value serialization audit

## Candidate boundary

The TypeScript exports `readJsonValue` and `writeJsonValue` in
`src/model/serialization.ts` are still unmapped default-root operations. The
Rust core exposes JSON and YAML parsing/writing through the unprofiled
`read_value_wire` and `write_value_wire` operations, and the Node/WASM engines
forward those operations with per-call host controls. The initial audit found
that their `readJsonValue` and `writeJsonValue` aliases hard-coded JSON while
the TypeScript functions defaulted to YAML. The opt-in profile below repairs
those aliases; generic `readValue`/`writeValue` keep their JSON default.

The direct TypeScript predecessor is frozen in [predecessor.json](predecessor.json),
SHA-256 `76314beae043f3cb9136509bcacdb0d4d3b1920468d7b5d021ad1f1e07f0c60f`.
Its capture script is
[`serialization-predecessor.ts`](../../../../../../scripts/rust-migration/r8/serialization-predecessor.ts),
SHA-256 `7cb755fcbedac15b38cc9335d3d284db117a0e89c00349a0043c9ce679c63df3`.
It contains 24 direct-call cases captured with Bun 1.4.3: default and explicit
JSON/YAML selection, JSON-as-YAML, YAML rejected as JSON, duplicate keys,
aliases, tags, multiple documents, unsafe/rounded/negative-zero numbers,
source/depth/value limits, JSON/YAML output, negative zero, non-finite values,
cycles and output limits.

The packet's 12-file TypeScript source closure is selected input closure, not
the whole application or crate closure. It pins the serializer and its direct
local dependencies, generated schemas and type definitions; package and Bun
lock hashes are embedded in the packet. In particular,
`src/model/serialization.ts` is pinned at
`027360ffd8bf77905f7d14a3d4d933035fe11d9f52ae28d54691cc607cb43586`.
The packet was recaptured after six generated schema/model inputs changed and
again after regenerating the metamodel fixed point for the settled Rust source
cohort. All 24 case inputs and outcomes remain byte-for-byte unchanged. The
current capture script's `--check` passes.

## Scoped profile and remaining gaps

An opt-in Rust profile now backs public Node and WASM `readJsonValue` and
`writeJsonValue` calls. Omitted format selects YAML; explicit `json` and `yaml`
are admitted by the Rust wire; the public facades route other JavaScript
format values to YAML, matching the TypeScript selection rule. Generic
`readValue` and `writeValue` retain their previous behavior. Missing profile
bindings fail closed. Host controls are passed into both operations. The R8
ledger accepts exact opt-in Rust operation mappings for this bounded source
profile. The TypeScript default routes remain unchanged, and this evidence
does not qualify a full migration or default-route retirement.

The recaptured 24-case packet passes exactly against the fresh native addon
in Node 26.12.1 and Bun 1.4.3, and against the fresh WASM artifact in Node,
Bun, and actual Chromium 153.0.8010.12. Both formerly mismatched YAML
diagnostics now preserve TypeScript `SYNTAX`, source excerpt, line/column and
path. The bounded event parser retains UTF-16 source offsets through its
private-surrogate view, including quoted/escaped keys. Focused tests also
cover multiline block scalars and selected Unicode/date-shaped YAML values.
The packet's exactness qualifies only its 24 inputs. A separate Rust scalar
corpus now covers selected YAML punctuation, whitespace, numeric-looking
strings, document markers, control escapes, Unicode and lone UTF-16
surrogates, with round trips through the Rust parser. The Node/WASM facades
copy ordinary host JSON values before wire encoding. A live TypeScript
comparison in
[`json-value-host-admission.test.js`](../../../../../../scripts/rust-migration/r8/json-value-host-admission.test.js)
passes refusal code/message/path and proxy reflection order in both hosts.
It keeps the reference implementation outside the strict binding boundary.
The scope is the ordinary 100,000-value profile; the larger synchronous
catalog profile, full YAML writer behavior, arbitrary Proxy behavior and an
installed package route remain unqualified. Neither export is retired.

The checkout's ignored `.node` addon was stale. Sol temporarily replaced it
with the fresh dylib, ran Node and Bun native 24/24 replays and 13/13 focused
facade/host-oracle tests, then restored the original SHA-256
`3a87eaccfae4f3dec3d2baae45befbe4138f2d8feb5b5659a047b54d757e784b`.
This is a local build check, not an installed package qualification.

The browser replay also checked YAML-default profile reads, the format
fallback, measured work and host-budget interruption, generic YAML alias
behavior, generic YAML writer output, and absence of Node globals. Focused
Node/WASM facade and host-oracle tests passed 13/13. The Rust serialization tests passed 21/21;
`umf-core-wire` focused tests passed 9/9. Rust 1.90.0 formatting and
`git diff --check` passed. The frozen predecessor packet remains pinned at
`76314beae043f3cb9136509bcacdb0d4d3b1920468d7b5d021ad1f1e07f0c60f` and the
selected TypeScript source file remains pinned at
`027360ffd8bf77905f7d14a3d4d933035fe11d9f52ae28d54691cc607cb43586`. The
packet's source closure is a selected input closure, not an entire crate or
application closure. Sol reviewed the changed closure hashes and verified
that the recaptures changed no case inputs or outcomes; `--check` now passes.

Fresh native addon build command:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-json-value-node-target \
  cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml
```

Fresh release WASM build and bindgen commands:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-json-value-wasm-target \
  cargo build --locked --offline --release --target wasm32-unknown-unknown \
  --manifest-path bindings/core/wasm/Cargo.toml
/private/tmp/umf-sdk-v4-wasm-bindgen/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-json-value-wasm-package --out-name umf_core_wasm \
  /private/tmp/umf-json-value-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun build bindings/core/wasm/index.js --target browser \
  --outfile /private/tmp/umf-json-value-wasm-package/facade.mjs
```

Public Node and Bun packet commands were `node`/`bun
scripts/rust-migration/r8/json-value-serialization-binding-node.mjs` and
`node`/`bun scripts/rust-migration/r8/json-value-serialization-wasm-node.mjs`.
The real-browser command was
`PATH=... bun scripts/rust-migration/r8/json-value-serialization-browser.mjs`
with the temporary local asset server; it required the approved escalated
execution environment. `bun scripts/rust-migration/r7/wasm-package-sources.ts
--check` passed after regenerating the shared WASM helper copy.

Source and built-artifact SHA-256 pins for this replay:

| Artifact | SHA-256 |
| --- | --- |
| `crates/umf-core/src/serialization.rs` | `6dcb0ec4fb47e0aa6d5cb545b0cd925b9a1b23838a3782f435386af5a497c392` |
| `crates/umf-core-wire/src/lib.rs` | `353b06139b6d0e221d4022a265a74afffb7041ba1678237199eab5ebc3bea667` |
| `crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs` | `2ba67ed399da67bca1dc191241e1d96b7df003b7ef405d1b61fde2089ac1a478` |
| `bindings/core/node/index.js` | `90613c3367d6dc02e3740cbd3159b55a92b86bea76c7d681e0bbd37614a9269a` |
| `bindings/core/node/src/lib.rs` | `70ba184b677bfed79a9eac6a628b3647a9d1b4c6b641a435521fa278888a161f` |
| `bindings/core/node/src/wire.js` | `d7687bae10505fea1295d841a73c174ddcda22ec49c534b2165033631fadfa1f` |
| `bindings/core/wasm/index.js` | `9a20ef27a2726aa8e30c8883986955a00744faf2152fc04fed7e8c07117457ea` |
| `bindings/core/wasm/src/lib.rs` | `3359145e79d004d10eb019f8346c74cc18933cf9f2c31eea37a32b20212a9ebc` |
| `bindings/core/wasm/src/shared-sources.json` | `5173e6860f5783523333309e2201c6af993bacdfad47c8d3fd86bf59e1f8949c` |
| Node addon `/private/tmp/umf-json-value-node-target/release/libumf_core_node.dylib` | `ffff1d2eb24d6129b7e7ea0cba68d08639b7823e5363cb56732f2bb57351b1ac` |
| WASM `/private/tmp/umf-json-value-wasm-package/umf_core_wasm_bg.wasm` | `074b9d66e2bc2bde76f5cbf4eb5ae46870b7580f2ce77ab17b866dfe646ac87f` |
| WASM glue `/private/tmp/umf-json-value-wasm-package/umf_core_wasm.js` | `548abebfb3c92b317cfa24ef4c23e7501f343cee7248f8f32df89784fc348bd0` |
| Browser facade `/private/tmp/umf-json-value-wasm-package/facade.mjs` | `642ddd1bdd898e3dd871d59cd41125f18c34673936922c826e1a896a03e02120` |
