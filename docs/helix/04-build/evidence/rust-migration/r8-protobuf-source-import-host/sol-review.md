---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-source-import-host.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: R8-PROTOBUF-SOURCE-IMPORT-HOST
      kind: references
---

# Independent Sol review: opt-in Protobuf source import

I reviewed the staged Rust source-import session, one-shot host boundary,
ordered JavaScript property reads, and [the source-bound packet](README.md).
The implementing Luna agent did not perform this review. I independently
verified the final README SHA-256
`a440beef1f5b45e5476110ca1a2e528a03089acbba3443ff6c169668fa7ab732`,
the rebuilt Node addon SHA-256
`e366626c9150e5a3f7b6c803b43532b61df11b28d27af9a1df64e0d1c1645a0c`,
and the bindgen WASM SHA-256
`d8fc95b7a97843256e253b4479fb3aa92edd5d6b7233382c95585be9456cc818`.
The four principal formatted Rust source hashes match the README. I reran the
isolated Bun host suite: 10 tests and 27 assertions passed in 7.55 seconds.
I also independently replayed the final package in real Chromium; it returned
the exact expected `PROTOBUF_SOURCE` diagnostic and event order
`callback, compiler-1, descriptor, id, compiler-2`, with two compiler reads.

The callback is caller-supplied and receives one isolated request argument.
Controls check before and after successful callback fulfillment; a pending
ordinary Promise is not preempted. A rejected callback and a throwing second
getter retain their thrown object identity. A second compiler read returning a
number reaches the same extension-structure diagnostic as the TypeScript
predecessor. The public request is Rust-reflected before callback dispatch,
and the descriptor byte view is snapshotted with the 4 MB bound.

I accept this captured **opt-in import** subset. Object-like second compiler
values are only qualified for the fixed non-string diagnostic and no nested
getter observation. The source-export wrapper is absent because the full
document's pre-callback reflection order is not yet reproduced. The installed
SDK package roots still select TypeScript for both source operations. This
review does not authorize default selection, declaration retirement, or a
release; a later integrated source cohort must rebuild and replay these
artifacts after concurrent binding edits.
