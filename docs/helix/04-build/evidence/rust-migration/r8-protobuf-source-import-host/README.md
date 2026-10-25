---
ddx:
  id: R8-PROTOBUF-SOURCE-IMPORT-HOST
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: R5-PROTOBUF-SOURCE-IMPORT
      kind: informed_by
    - id: R5-PROTOBUF-SOURCE-EXPORT
      kind: informed_by
---

# R8 Protobuf source import host boundary

This evidence packet covers only opt-in Node and browser WASM
`importProtobufSources` with a caller-supplied asynchronous compiler callback.
It does not expose a source export wrapper or change the default TypeScript
route. The callback receives exactly one isolated `{files, roots}` argument.
`callbackControl: "boundary-only"` means controls run before dispatch and
after successful fulfillment; an ordinary Promise callback cannot be
preempted while it is running, and a rejected callback value propagates by
identity without a later control check replacing it. No compiler discovery,
process launch, or filesystem access occurs in Rust.

The host wrapper uses the existing `umf.host-json/1` reflection adapter and
Rust `copy_host_json` for the public request. Its staged source session keeps
one cumulative Rust `TransportUsage` across request admission, descriptor
decode, archive validation and final copy. The order is: admit request; invoke
`compiler.compile(request)`; check the first `result.compiler` read for
truthiness; read `result.descriptorSet`; read `options.id`; snapshot and decode
descriptor bytes; read `result.compiler` again for the source archive; inspect
and copy the returned document. Byte snapshots use typed-array intrinsics and
the existing 4,000,000-byte ceiling. Non-string values from the second
compiler read are represented through descriptor inspection and rejected with
the predecessor's `EXTENSION_STRUCTURE` diagnostic; getter exceptions escape
without wrapping. The second compiler value is never recursively reflected:
non-string objects are rejected by the fixed compiler-string schema check,
before any nested member can be observed. The adversarial test pins a nested
read-count getter. Byte-snapshot tests cover intrinsic access on a hostile
nonzero-offset typed-array subclass and the 4,000,001-byte refusal.

## Governing predecessor evidence

The frozen import packet is
[`r5-protobuf-source/predecessor.json`](../r5-protobuf-source/predecessor.json)
(SHA-256 `ffd9076d232923f7fe29bbdef125585ab355cd96f3c3255a8d40e2387001b7bc`),
captured by `predecessor-capture.ts` (SHA-256
`03b8fd89d9ef1fbba9cde8996d7edcd3fb724d70344bbc7af96ad3ad22eb480c`). The
frozen export predecessor is
[`r5-protobuf-source-export/predecessor.json`](../r5-protobuf-source-export/predecessor.json)
(SHA-256 `699ef9545e9f9e40cbb2ed34ecc084501e5a9d85ba215624ef209309c26625a8`).
The TypeScript source hash in the import capture is
`0ab03a98400c74c19c39060e81950f2b08c198eeb75f5142eda22d40b3978023`.
Native source/compiler evidence remains scoped to `protoc 36.2`, the source
fixtures and descriptor.proto hashes recorded in the predecessor packet; it
does not widen Edition 2024 support.

## Explicit export blocker

No `exportProtobufSources` host wrapper is provided. The predecessor first
inspects the document, locates its Protobuf extension payload, and copies only
that payload before encoding descriptor bytes. Blanket host `copy_host_json`
of the full document would change accessor/prototype refusal order. The next
required production interface is a Rust-driven protobuf document host
inspector that reflects the document structurally in predecessor order and
admits only the located extension payload before descriptor encoding. Frozen
crossed controls must include invalid document plus payload accessor, document
getter plus unsupported value, and emitter-result failure plus post-callback
document accessor before source export can be qualified.

## Current validation status

The frozen host packet passes 10 Bun tests / 27 assertions against the isolated
Node package using:

```sh
UMF_PROTOBUF_SOURCE_IMPORT_PACKAGE=/private/tmp/umf-protobuf-source-import-node-final-pkg \
  bun test tests/rust-migration/r8-protobuf-source-import-host.test.js
```

The isolated package addon is
`/private/tmp/umf-protobuf-source-import-node-final-pkg/umf_core_node.node`,
SHA-256 `e366626c9150e5a3f7b6c803b43532b61df11b28d27af9a1df64e0d1c1645a0c`.
The tested Chromium receipt reports `callbackControl: boundary-only`, the
expected `PROTOBUF_SOURCE` diagnostic for a non-string second compiler read,
and event order `callback, compiler-1, descriptor, id, compiler-2` with two
compiler reads. It ran in a real Chromium page against the isolated freshly
bindgen-generated package; localhost serving required sandbox escalation in
this environment. Exact browser result:

```json
{"profile":"boundary-only","ok":false,"code":"PROTOBUF_SOURCE","message":"[{\"code\":\"EXTENSION_STRUCTURE\",\"path\":\"/modules/0/elements/0/extensions/umf.protobuf/sourceArchive/compiler\",\"message\":\"must be string\",\"severity\":\"error\"}]","events":["callback","compiler-1","descriptor","id","compiler-2"],"reads":2}
```

Fresh bindgen WASM artifact
`/private/tmp/umf-protobuf-source-import-wasm-final-pkg/pkg/umf_core_wasm_bg.wasm`
has SHA-256 `d8fc95b7a97843256e253b4479fb3aa92edd5d6b7233382c95585be9456cc818`.
Its unbound build input at
`/private/tmp/umf-source-wasm-build/wasm32-unknown-unknown/release/umf_core_wasm.wasm`
has SHA-256 `2fd138289a7f4f7f16c107fda4ebe9cad4ca063415c7e65c37900992e7c16f5b`.

Both artifacts were rebuilt from the source hashes below with Rust 1.90.0.
Exact build commands:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
TMPDIR=/private/tmp CARGO_TARGET_DIR=/private/tmp/umf-source-node-build \
  cargo build --release --locked --offline --manifest-path bindings/core/node/Cargo.toml
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
TMPDIR=/private/tmp CARGO_TARGET_DIR=/private/tmp/umf-source-wasm-build \
  cargo build --release --locked --offline --manifest-path bindings/core/wasm/Cargo.toml \
  --target wasm32-unknown-unknown
/private/tmp/wasm-bindgen-cli-target/debug/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-protobuf-source-import-wasm-final-pkg/pkg \
  --out-name umf_core_wasm \
  /private/tmp/umf-source-wasm-build/wasm32-unknown-unknown/release/umf_core_wasm.wasm
```

The final Chromium replay used:

```sh
UMF_PROTOBUF_SOURCE_IMPORT_WASM_PACKAGE=/private/tmp/umf-protobuf-source-import-wasm-final-pkg \
  bun run docs/helix/04-build/evidence/rust-migration/r8-protobuf-source-import-host/chromium-replay.ts
```

The principal edited sources are pinned below (SHA-256):

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/protobuf_source.rs` | `0498e42aa4bbfa7b5bd041ee1a045329a38ac893fc1aec20bda266c4cee8c56d` |
| `crates/umf-core-wire/src/protobuf_source.rs` | `126e337aa8c2aaa64dad2c13baff6253bf676aaf9db3b26be15ce24995c30bf2` |
| `bindings/core/node/src/protobuf_source.rs` | `8a3cc4dda13f98f1a205d22cb5f49f681d30459089fc46f82ece387e63f4548a` |
| `bindings/core/wasm/src/protobuf_source.rs` | `878634f5924081964931c2cc8ce3af9e3cc34afecc2a62e1ae576d2a8f0e1e9f` |
| Node/WASM `src/host_json.rs` | Node `0f9cda72a4a1b28db09d07cdb0f4a180b51910f41d91de4e176bcbf57f1ddbf7`; WASM `4b8e95c67c66c1ecba0a57fc7ef8da12d445b1feefe57c21e47f6a167ac4d90f` |
| `bindings/core/node/index.js` | `0228ea1853fe6e3a2f699463d1729711c40eb5bdcce5bf64605a91faaee952c1` |
| `bindings/core/wasm/index.js` | `7053e27c116b80c1cc380e10e961f19823cd0ae8539c8d6777cddd4a39879386` |
| Node/WASM `src/host-json.js` | `a3b3d732fcc53b62424eca4cde8acdcd68365103e052cc59917ef972aea5c426` |
| `tests/rust-migration/r8-protobuf-source-import-host.test.js` | `6d219c8eeec7ecf7e855ba8bb243e463d163c548533e215138d31b122bd63642` |

`cargo test --locked --offline -p umf-core --test r5_protobuf_source` passed
8/8 tests with pinned Rust 1.90.0 and an isolated build target under
`/private/tmp/umf-final-rust-target`. `bun run typecheck` passed.
The four Protobuf source Rust files were formatted with edition 2021 and pass
focused `rustfmt --check`. No formatting sweep was applied across shared files.
Independent Sol review is pending. This evidence does not claim full import
equivalence or default selection.
Object/array/function/symbol values on the callback's second `compiler` read
are reduced to the fixed non-string diagnostic without recursively observing
their nested properties; callback flows that depend on such nested getter side
effects remain outside the qualified subset.
