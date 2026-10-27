---
ddx:
  id: umf.evidence.rust-migration.r5-arrow-ipc-capture-predecessor-20261027
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

# Arrow IPC exact-capture TypeScript predecessor freeze

The compressed [predecessor packet](typescript-arrow-ipc-capture.json.gz)
records the public TypeScript behavior of `captureArrowIpc`,
`inspectArrowIpcCapture`, and `exportArrowIpcCapture` before selecting any
Rust route. Bun 1.4.3 ran
[`freeze-arrow-ipc-capture-predecessor.mjs`](../../../../../../scripts/rust-migration/r5/freeze-arrow-ipc-capture-predecessor.mjs)
over all 18 authored PyArrow 21.0.0 IPC stream/file fixtures, five additional
empty/invalid/truncated/trailing/exact-limit byte cases, one over-limit
refusal, seven mutated capture envelopes, and input/output copy controls.
The packet preserves ordered inspection diagnostics and exact document,
input, and export hashes. It makes no native Arrow validity claim.

The compressed packet is 3,726 bytes with SHA-256
`2447d1c61246719e1fe9a36408bc2aa2cf50cc0a9c237b50c4d393bd217f38a6`;
its decompressed 24,899-byte JSON has SHA-256
`8732bc1b52fb20c5686e04bc8dca42bcc3156704b0070c61790788382ff742fa`.
The capture source SHA-256 is
`d8b75f23a0d2637eac6c18e7826c6c75a3c217b1c5933120e4174812934d79f9`,
the freeze script is
`54053e5a4ae66103ebe8ad31c737bc75fa389cb8e8f8d12d9c72a4a9f3803bc3`,
the fixture manifest is
`6a921cebb0fefdf5cfe3ca72d074e354754c2a0fe56735d8485d896084f7e009`,
and the Arrow IPC schema and package are respectively
`b5d0a953838d1f38f366f0677f80b51f7709d7a984c70eb63c15d43f4de8d3f6` and
`2853107a7c644ef416a1b53b00ae35b3c476d99d7eec5b38c8d4b8f472d22aae`.

This is a bounded predecessor baseline only. Rust parity, installed bindings,
default SDK routing, release qualification, and native IPC interpretation
remain open.
