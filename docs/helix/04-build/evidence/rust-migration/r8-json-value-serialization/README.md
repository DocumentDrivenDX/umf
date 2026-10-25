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
SHA-256 `45e4ffeae7898419a077dee4a4e43d3a5191fc1cbc35659857a94bd41d64334f`.
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

## Scoped profile and remaining mismatches

An opt-in Rust profile now backs public Node and WASM `readJsonValue` and
`writeJsonValue` calls. Omitted format selects YAML; explicit `json` and `yaml`
are admitted, while other format spellings fail with `FORMAT`. Generic
`readValue` and `writeValue` retain their previous behavior. Missing profile
bindings fail closed. Host controls are passed into both operations. The
TypeScript default routes remain unchanged, and this evidence does not accept
the export pair as a full migration mapping or claim default-route retirement.

The 24-case frozen packet was replayed through the public facades. Node and Bun
each returned 22 exact matches and two known YAML diagnostic mismatches, with
zero unexpected mismatches. Actual Chromium 153.0.8010.12 exercised the
generated WASM artifact and public facade with the same 22/24 result. The two
known differences are `read.syntax.yaml-duplicate-key` and
`read.syntax.yaml-multiple-documents`. For the duplicate case, TypeScript
expects `SYNTAX`, empty path, and `Map keys must be unique at line 2, column
1:\n\nx: 1\nx: 2\n^\n`; Rust returns `DUPLICATE_KEY`, empty path, and
`Duplicate mapping key`. For the multi-document case, TypeScript expects
`SYNTAX`, empty path, and `Source contains multiple documents; please use
YAML.parseAllDocuments() at line 3, column 1:\n\nx: 1\n---\n^\n`; Rust
returns `YAML_DOCUMENTS`, empty path, and `Exactly one YAML document is
required`. A precise translation is not included: the bounded event parser
currently drops duplicate-key spans when assembling map members, and its
document-count refusal does not retain the source excerpt/location needed for
the TypeScript diagnostic. Reconstructing locations with a second raw YAML
scan risks changing behavior for quoted/escaped keys, transformed private
views, or control precedence. The packet checks YAML/JSON output for its one structured value, negative-zero and
non-finite refusals, a cycle path, and the text limit. The YAML writer profile
uses a conservative scalar subset; broader YAML plain-scalar quoting rules,
arbitrary writer values, and the two parser diagnostic envelopes remain
unqualified. No `instanceof` or broader error-identity claim is made.

The browser replay also checked YAML-default profile reads, explicit format
refusal, measured work and host-budget interruption, generic YAML alias
behavior, generic YAML writer output, and absence of Node globals. Focused
Node/WASM facade tests passed 5/5. The Rust profile tests passed 2/2;
`umf-core-wire` focused tests passed 7/7. Rust 1.90.0 formatting and
`git diff --check` passed. The frozen predecessor packet remains pinned at
`45e4ffeae7898419a077dee4a4e43d3a5191fc1cbc35659857a94bd41d64334f` and the
selected TypeScript source file remains pinned at
`027360ffd8bf77905f7d14a3d4d933035fe11d9f52ae28d54691cc607cb43586`. The
packet's source closure is a selected input closure, not an entire crate or
application closure. Sol reviewed the six changed closure hashes and verified
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
| `crates/umf-core/src/serialization.rs` | `38dea0c3e5853d25ee80758f35cd7726f2017e32bc7cb1d752b35e088b15d44d` |
| `crates/umf-core-wire/src/lib.rs` | `353b06139b6d0e221d4022a265a74afffb7041ba1678237199eab5ebc3bea667` |
| `crates/umf-core-wire/tests/r8_json_value_serialization_wire.rs` | `364a47de3725120b20e1f5d5de1958973112a60d3391b11cc3b7f492cc4caccd` |
| `bindings/core/node/index.js` | `73e830355533ae5a6b31207f7c12570036fedceb253991b6f2bf4e99b05f8b0b` |
| `bindings/core/node/src/lib.rs` | `70ba184b677bfed79a9eac6a628b3647a9d1b4c6b641a435521fa278888a161f` |
| `bindings/core/node/src/wire.js` | `d7687bae10505fea1295d841a73c174ddcda22ec49c534b2165033631fadfa1f` |
| `bindings/core/wasm/index.js` | `675d73c2cf92795485e87f01f5ce6209befa4fe1fb3dd8029507671598b6752d` |
| `bindings/core/wasm/src/lib.rs` | `3359145e79d004d10eb019f8346c74cc18933cf9f2c31eea37a32b20212a9ebc` |
| `bindings/core/wasm/src/shared-sources.json` | `5173e6860f5783523333309e2201c6af993bacdfad47c8d3fd86bf59e1f8949c` |
| Node addon `/private/tmp/umf-json-value-node-target/release/libumf_core_node.dylib` | `3a87eaccfae4f3dec3d2baae45befbe4138f2d8feb5b5659a047b54d757e784b` |
| WASM `/private/tmp/umf-json-value-wasm-package/umf_core_wasm_bg.wasm` | `26478e393a594556cd478aecb6ef35678080f22aac09e1ff65f083ce6ba68129` |
| Browser facade `/private/tmp/umf-json-value-wasm-package/facade.mjs` | `a44cc9d6940087059492b8a01b4e23369c421ff82d51493ccd0e356217a61b0a` |
