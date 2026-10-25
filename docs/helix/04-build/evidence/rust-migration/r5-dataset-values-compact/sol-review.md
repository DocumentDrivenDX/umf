---
ddx:
  id: umf.evidence.rust-migration.r5-dataset-values-compact.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact
      kind: references
---

# Independent Sol review: compact dataset values core

I reviewed the final opt-in Rust implementation and frozen packet at
[`README.md`](README.md). The `dataset_values.rs` source SHA-256 is
`4d94b0daf38a925711e790778360d806adc178f20d1a2309fc3a22ea8becc720`;
the integration test is
`e0f23a2c9ed26d127ceeafe9816881153f6e40a2b7202640bcd7b4d98c5385c2`.
I verified all 27 entries in `SHA256SUMS`, including the source pins and 17
frozen case files. The accepted threshold fixture and production ledger
snapshot have matching source hashes: all 59 categories and the 998,489 total
are exactly equal. The first refused 350-record fixture has the frozen
`LIMIT` code, message and empty path; Rust first exceeds at 1,001,090 during
`receipt-and-compact-schema`.

The independent review found an unbounded direct-`Value` recursive path during
development. The final source now runs an iterative depth/value preflight
before recursive compact ledger work. It borrows large member names, polls
cancellation/deadline without allocating their paths on success, and builds
paths on refusal. I independently reran its three focused unit tests and the
direct public compact API depth case; all four passed. The authoring Luna
agent's final serial integration suite passed 4/4 in 279.32 seconds, covering
15 complete frozen result/refusal envelopes and the 349/350 boundary. The
agent also passed 16 Context controls, observer invariance, Bun typecheck and
an Ajv 8.20 Draft 2020-12 check of actual captured Rust commerce output.
`git diff --check` passed. I found no remaining P1/P2 in this bounded core
slice.

After the adjacent Key tuple packet removed an unused public `Clone` from its
prepared handle, I refreshed this packet's `core_key_tuple.rs` source pin to
`d3f82c374da48ff27da7869649342ea555b2197acdec684d0edd6eff2771e7f8`.
I independently rechecked all 27 `SHA256SUMS` entries and reran the direct
compact API depth/control test against the changed core source (1/1 passed).
This refresh does not change the compact dataset implementation or its frozen
outputs.

The work ledger enforces some schema/semantic phases at their boundaries, so
the packet does not establish identical first-stop points for all large inputs.
Regex reservation and unbounded resource graphs remain unqualified. Native
wire, Node/Bun, Python, browser bindings, default routing, broader dataset
operations and R5 completion remain open.
