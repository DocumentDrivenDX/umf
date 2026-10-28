---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-ipc-host-boundary-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# R8 Arrow IPC host boundary predecessor

The compressed `typescript-arrow-ipc-host-boundary.json.gz` freezes raw host input
classes, `options.id` getter order, thrown error identity, subclass iteration, and
proxy access order for `inspectArrowIpcCapture` and `exportArrowIpcCapture` against
`src/adapters/arrow/capture.ts`. Bun 1.4.3 generated the packet with
[`freeze-arrow-ipc-host-boundary.mjs`](../../../../../../scripts/rust-migration/r8/freeze-arrow-ipc-host-boundary.mjs).
It supplements the R5 native fixture packet; it does not replace its 18 IPC
fixtures or its byte-copy evidence.

The packet contains ten capture-host cases: ordinary array, DataView, Node
Buffer, Uint8Array subclass, cross-realm Uint8Array, oversize input with a
throwing id getter, wrong class with a throwing id getter, non-string id, an
iterator failure proving byte iteration precedes id access, and a subclass iterator
yielding non-byte values to record predecessor coercion and rejection. Wrong-class
and oversize inputs both produce the predecessor `UmfError` identity, code
`ARROW_IPC_LIMIT`, empty path, and exact size-limit message. The accepted
subclass case preserves the predecessor's custom iterator behavior. A throwing
subclass iterator runs before the id getter and its original exception escapes.
Subclass iterators that yield values outside the byte range are outside the
qualified byte semantics; their custom hex coercion is captured in the packet
for follow-up comparison.

The packet's proxy records show the TypeScript predecessor's property-read
order for inspection and export. Rust bridge input is ordinary JSON data;
accessors, proxies and custom prototypes are outside the supported bridge
contract. The packet is evidence of predecessor behavior, not a claim that
those host objects are supported by the Rust adapters.

The 3,613-byte decompressed JSON has SHA-256
`c55e6e7164ac114cace49edbd0d97a3abc0fe08d5bd663f7a464f47f6de7c66c`.
The 987-byte gzip packet has SHA-256
`bcdf09b15940bce0f52980fd824a5cba35d3ee492446f2c73933a69d1632b520`.
The freeze script SHA-256 is
`4c3a36470b93bac874a72ac0a38e1c1c0f694823c3b554f6c1dd66bba02b09b5`.
The source TypeScript SHA-256 is
`d8b75f23a0d2637eac6c18e7826c6c75a3c217b1c5933120e4174812934d79f9`.

## Host adapter verification

The focused Bun wrapper test passes 9 tests and 213 assertions across the Node
and WASM adapters. Rust `r5_arrow_ipc_capture_wire` passes 4 tests. A focused
real-Chromium smoke test bundles the current Node host adapter and confirms
subclass iteration precedes id access, cross-realm Uint8Array input is rejected
before its id getter runs, and the failure exposes `UmfError` with the expected
name, code, path and message. The browser bundle SHA-256 is
`f98bd3b8f6b1e1c19f030e943e53fbfeb8f7bb93cd57d0c12edb0bf143f940d6`.
This smoke test uses a stub dispatcher; it does not qualify the Rust WASM
semantic runtime.

The full Arrow IPC predecessor Chromium replay was started with the existing
R5 WASM package and current host adapter but did not produce a receipt before it
was stopped. A separate older Arrow schema replay against
`bindings/core/wasm/pkg` failed at initialization with
`RUST_WASM_BINDING_MISSING`; that package lacks the expected Arrow schema export.
Neither run is counted as IPC or Arrow schema parity evidence.

The Node adapter SHA-256 is
`5b27f07019589cfd984265656fb8241059344103565fd46a12138863c3a5d21c`; the WASM
adapter currently has the same SHA-256. The binding-tree wrapper test avoids a
JavaScript engine import; cross-realm admission is also covered by the V4
route test. The focused wrapper test SHA-256 is
`c0978ea3c261ecfff60cebfe550145080a3e86a1e51e14268ea046250f18cb53`.
