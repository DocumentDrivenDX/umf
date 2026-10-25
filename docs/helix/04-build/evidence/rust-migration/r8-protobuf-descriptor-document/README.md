---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-document
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
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-protobuf-descriptor-codec
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-protobuf-document
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-protobuf-inspect-bindings
      kind: informed_by
---

# R8 Protobuf descriptor/document host packet

This packet adds an **opt-in** Rust-backed host packet for descriptor-set read
and write, document import/get/export, bundle export, and inspection. It does
not route the TypeScript default or claim adapter retirement. Source compiler
callbacks, edited-source operations, Edition 2024, and broader Protobuf
adapter operations remain outside this packet. Public operations retain raw
`Uint8Array` byte inputs and outputs; hex is used only by the existing internal
tree representation.

The wire dispatcher in `crates/umf-core-wire/src/protobuf_document.rs` executes
each operation in one `Context`, admits the JSON request before binary input,
and returns no partial bytes after failure. It charges raw input bytes against
the 4,000,000-byte CONTRACT-003 ceiling. Node and WASM wrappers enforce that
ceiling before copying caller bytes. They read Uint8Array brand, length, buffer,
and byte offset through captured intrinsic TypedArray accessors, then make an
owned snapshot using intrinsic `set`; a hostile subclass cannot substitute
`byteLength` or iteration. The frozen host test covers a nonzero-offset view,
overridden `byteLength`/iterator, and snapshot isolation.

The fresh TypeScript predecessor captures are stored at
`/private/tmp/protobuf-composed-capture/predecessor.json` (93 descriptor/document
operations) and
`/private/tmp/protobuf-composed-capture/inspector-predecessor.json` (10 inspector
observations). They were captured with Bun 1.4.3 and protoc 36.2 from 37 and 41
source files respectively. Their SHA-256 values are `59969e3a12ad8c4f9fbb1354db4a82bbbb647885f2576000e8248abc842fe2d5` and
`530f14cdbfca55739da6828be90707e5938d44e48fd4d08d54d38bbd0a018721`. A Python
protobuf oracle was unavailable in the capture environment. The predecessor
captures are source observations, not proof that all Rust host behaviors are
equivalent.

Focused Rust tests pass: `cargo test --locked --offline -p umf-core-wire --test protobuf_document_wire`
(5 tests). They cover composed operations, unknown raw wire preservation,
malformed wire, control refusal without partial output, exactly 4,000,000-byte
acceptance, 4,000,001-byte refusal, and malformed request-before-binary
admission. Node/Bun replay passes 5 tests against the isolated addon at
`/private/tmp/umf-r8-protobuf-node-pkg/bindings/core/node`; the addon SHA-256 is
`1ad754491b93665fc76b4f01aec361a10efc509f58ca37e98b203e4b4067c62c`. Run it
from the repository root with:

```sh
UMF_NODE_BINDING_DIR=/private/tmp/umf-r8-protobuf-node-pkg/bindings/core/node bun test tests/rust-core/protobuf-document-bindings.test.mjs
```

`bun run typecheck` passes. The fresh browser artifact was built with the
pinned Rust 1.90.0 toolchain and wasm-bindgen 0.2.100. The WASM JS and binary
hashes are `b02026a61a8b8703b952a9feed692d61fba0dd45adf3baa1b4334be49e23228f`
and `293bce32fec7c3a025cc64755b56fe0f15f7a7b684317bd331a53d223ad6dff7`.
Real Chromium 153.0.8010.12 passed raw unknown-byte round trip, descriptor
read/write and document export/bundle consistency, the hostile offset-view
control, snapshot isolation, the oversize refusal, and a browser-global check.
The receipt was:

```json
{"status":"pass","browser":"Chromium","browserVersion":"153.0.8010.12","profile":"umf-r8-protobuf-descriptor-document/0.1.0","unknownRawRoundTrip":true,"documentOperations":true,"hostileOffsetView":true,"snapshotIsolation":true,"overLimit":"LIMIT","browserGlobals":true}
```

Node/Bun currently demonstrates a deliberate qualification gap: malformed
semantic input surfaces as `UmfCoreError` (`PROTOBUF_BINARY`) from this opt-in
binding, whereas the TypeScript predecessor throws `UmfError`. The focused test
pins this class difference; it must be mapped to the predecessor public error
class before any default selection. Per-call control errors remain distinct.
This packet therefore supports bounded operation parity and byte-boundary
behavior, not complete public error parity or a default-route claim.

Source hashes for this candidate packet:

| File | SHA-256 |
|---|---|
| `crates/umf-core-wire/src/protobuf_document.rs` | `9578e83b39b6033f76ced703ce0b6302961171560978cf7bd285b150a650dfd9` |
| `crates/umf-core-wire/tests/protobuf_document_wire.rs` | `4f396d01ddcffe1166cd1e62dd5a7f3d5f54df658be1ce0bf257655dfc731050` |
| `bindings/core/node/src/protobuf_document.rs` | `0be958c9fda7c3915c740d8f71fc9b646f17900c56c3aa14e5d5188afa65b3ae` |
| `bindings/core/wasm/src/protobuf_document.rs` | `726befcd2c13fee606f2e03e820353b37634223e2da55e75d625114cedeae545` |
| `bindings/core/node/index.js` | `1621204b48195ff2783cfb4bf0f4fa28053781bb3a742c70ffb9edd3221cabbc` |
| `bindings/core/wasm/index.js` | `db9fbb0c933a4fa14d8a586ed722a7f8ea99f19fe8a2092cdcf48b2ef036a1e6` |
| `tests/rust-core/protobuf-document-bindings.test.mjs` | `33d02bb9a73e8c49a1bf0fd6038706d9fb0b41c8342e8f2a3df436aa6309b049` |
| `tests/rust-core/protobuf-document-browser.mjs` | `28ad5c3c749f55b446306005f5b97420a97e0d5c8b670d2bf386f12620bd5dec` |

The shared dispatch-registration file and binding `lib.rs` files contain
concurrent work from other slices; their hashes are intentionally not treated
as packet-owned pins. They must be captured again in the integrated review
after all agents freeze those files.
