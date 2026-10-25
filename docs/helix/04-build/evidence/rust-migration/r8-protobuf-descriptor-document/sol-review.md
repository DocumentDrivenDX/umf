---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-document.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-protobuf-descriptor-document
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
---

# Independent Sol review: opt-in Protobuf descriptor/document packet

I reviewed the seven-operation wire dispatcher and Node/WASM host wrappers.
The dispatcher accepts a separately owned byte buffer, uses one Context for
request, binary, operation and response, and clears partial binary output on
failure. It preserves raw unknown wire bytes and keeps source compiler
callbacks outside this packet. I found a pre-copy resource gap in the first
wrapper: it could clone an oversized typed array before Rust's 4,000,000-byte
refusal. The corrected host path reads intrinsic typed-array slots, charges
and checks the length before an owned snapshot, and admits import options
before binary bytes to preserve the crossed-invalid predecessor order.
Focused tests cover a hostile subclass, nonzero-offset view, copy isolation,
4,000,001-byte refusal, and a zero-touch crossed options case.

I independently reran the final isolated-addon Bun packet: five tests and 31
assertions passed in 48.35 seconds. The copied Node wrapper SHA-256
`1621204b…` matches the current wrapper, and the addon is `1ad75449…`.
`bun run typecheck` and `git diff --check` also passed on the current source.
The implementing Luna agent reports five core-wire tests and a fresh Chromium
153 replay from WASM `293bce32…`; I inspected the test and evidence but did
not independently rerun that browser packet. The historical 93-case
descriptor/document and ten-case inspector predecessor captures were not
replayed end-to-end through this binding, so their existence does not turn
the focused host checks into broad parity evidence.

This accepts a bounded opt-in descriptor/document interface for the cited
Node/Bun/Chromium artifacts. Malformed semantic input still raises
`UmfCoreError` here while the public TypeScript adapter raises `UmfError`;
that class mismatch must be corrected and independently replayed before a
default-root selection. Source compiler callbacks, Edition 2024, a current
combined-source SDK archive, full frozen predecessor/native replay, and R8
row-level retirement remain open. No default or release claim follows from
this packet.
