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
SHA-256 `3b720b959a934e9e0aad6f86a80d7dc9bc995a21a302f32448a73a39d599678e`.
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
bindings fail closed. Host controls are passed into both operations. The
TypeScript default routes remain unchanged, and this evidence does not accept
the export pair as a full migration mapping or claim default-route retirement.

The recaptured 24-case packet passes exactly against the fresh native addon
in Node 26.12.1 and Bun 1.4.3, and against the fresh WASM artifact in Node,
Bun, and actual Chromium 153.0.8010.12. Both formerly mismatched YAML
diagnostics now preserve TypeScript `SYNTAX`, source excerpt, line/column and
path. The bounded event parser retains UTF-16 source offsets through its
private-surrogate view, including quoted/escaped keys. Focused tests also
cover multiline block scalars and selected Unicode/date-shaped YAML values.
The packet's exactness qualifies only its 24 inputs. Broader YAML writer
plain-scalar rules, tab/control-character escaping, arbitrary host values,
proxy reflection order, invalid-value error names/codes/paths, and
`instanceof UmfError` remain unqualified. These host and writer differences
block default-route retirement.

The checkout's ignored `.node` addon was stale. Sol temporarily replaced it
with the fresh dylib, ran the Bun native 24/24 replay and 9/9 focused facade
tests, then restored the original bytes. This is a local build check, not an
installed package qualification.

The browser replay also checked YAML-default profile reads, the format
fallback, measured work and host-budget interruption, generic YAML alias
behavior, generic YAML writer output, and absence of Node globals. Focused
Node/WASM facade tests passed 9/9. The Rust serialization tests passed 21/21;
`umf-core-wire` focused tests passed 9/9. Rust 1.90.0 formatting and
`git diff --check` passed. The frozen predecessor packet remains pinned at
`3b720b959a934e9e0aad6f86a80d7dc9bc995a21a302f32448a73a39d599678e` and the
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
| `crates/umf-core/src/serialization.rs` | `4a0c1e7c380bc2bc10bf184d4d05c4489597d2c7029eb6bc4496a8f15d192d78` |
| `crates/umf-core-wire/src/lib.rs` | `353b06139b6d0e221d4022a265a74afffb7041ba1678237199eab5ebc3bea667` |
| `crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs` | `2ba67ed399da67bca1dc191241e1d96b7df003b7ef405d1b61fde2089ac1a478` |
| `bindings/core/node/index.js` | `1f73934eecc97165f3cc4c8da3e303824a73475ca025437dcf1fd923e760e7e2` |
| `bindings/core/node/src/lib.rs` | `70ba184b677bfed79a9eac6a628b3647a9d1b4c6b641a435521fa278888a161f` |
| `bindings/core/node/src/wire.js` | `d7687bae10505fea1295d841a73c174ddcda22ec49c534b2165033631fadfa1f` |
| `bindings/core/wasm/index.js` | `5819565327d4ce4f32e70bbe9e47487326299cccfd33a5c5740158ed06354146` |
| `bindings/core/wasm/src/lib.rs` | `3359145e79d004d10eb019f8346c74cc18933cf9f2c31eea37a32b20212a9ebc` |
| `bindings/core/wasm/src/shared-sources.json` | `5173e6860f5783523333309e2201c6af993bacdfad47c8d3fd86bf59e1f8949c` |
| Node addon `/private/tmp/umf-json-value-node-target/release/libumf_core_node.dylib` | `85f1d04e0741364d37e5fac7ff8957136f2192acf4981171f757c2f50a68ade0` |
| WASM `/private/tmp/umf-json-value-wasm-package/umf_core_wasm_bg.wasm` | `84cb872c724bb0e0d08aa0170f12df55d8308a8163cac325407db6c14e41b748` |
| WASM glue `/private/tmp/umf-json-value-wasm-package/umf_core_wasm.js` | `548abebfb3c92b317cfa24ef4c23e7501f343cee7248f8f32df89784fc348bd0` |
| Browser facade `/private/tmp/umf-json-value-wasm-package/facade.mjs` | `166fc0ec799d31661735b41257acf5f2072bacee5b3acb57ee1be8bf5e09375f` |
