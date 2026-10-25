---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-value-node.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-value-node
      kind: references
---

# Independent Sol review: opt-in Node semantic validator binding

Reviewed the bounded Node/Bun binding at the source hashes in
[`receipt.json`](receipt.json), including `core_semantic_types.rs`
`9dfa888984afc9db2d0bdac2f2ffdae1aee9911bcf4d441c9e696fe2e25fc0f7`,
`semantic_value.rs`
`d6d96fd51b0a163fd0116ef1396332e56fa50b6c6753829d58c523c688926016`,
the shared wire `lib.rs`
`d2b843e5c5087bba7bee8f69a7db1014521724e9bb10216271db93f701a5d1c0`,
and the Node addon bridge `lib.rs`
`377f70e01dfc9bc2a6df6f3abd0a948ea81165b66edb384d6f102c78bfece1bc`.
The authoring Luna agent did not perform this review.

The review found and resolved two work-boundary defects before acceptance.
Reported callback work now charges the operation Context even when the validator
throws or returns a resource refusal; the focused budget test covers
report-then-throw. The Node bridge now encodes the core's already-admitted
value and definition snapshots without another deep copy. Rust, not JavaScript,
resolves unknown and unvalidated references from a bounded data-only projection
before value admission. Ordering preflights have no host-control callbacks;
the final operation remains the controlled authority.

I independently reran the focused Bun binding suite (8 tests, 42 assertions),
the two Rust semantic wire tests, and `git diff --check`. I checked the listed
source hashes against the worktree. The agent's clean installed tarball replays
on Node 26.12.1 and Bun 1.4.3, full Rust core 10/10, and typecheck are recorded
in the linked receipt; I did not relabel those as my own executions.

Review reopened after a callback-provenance P1 was found: a caller-thrown
exception carrying an engine-like control code was classified as an engine
resource failure. The host bridge needed to distinguish its private
work/control signals from arbitrary validator exceptions and rerun malicious
callback controls.

Sol implemented the Node dispatcher correction. Caller-thrown errors now
become semantic unknowns regardless of a forged `code`; a sticky private
report-work fault remains an engine `HOST_CONTROL` refusal even if the callback
catches it. Post-callback result admission recognizes only its own frame-limit
signal and the wire admission error type, so a returned Proxy cannot spoof
`RESOURCE_LIMIT` through a trap. The source binding suite passes 9 tests and
53 assertions. A locally packed archive (SHA-256
`04bcb2df93a97e3a34897541d1649ebfea20cb63feff5ccd5bec40546e520a33`)
passed clean installed package-name replay and spoof controls under Node
26.12.1 and Bun 1.4.3. The corrected JavaScript wrapper SHA-256 is
`708f8d9379c1391ebfa0c9cf7edb4d428c5b0c6fdb7194011316c5c50b6941eb`;
the source test SHA-256 is
`ff176fed8170d996966e4a63e3d6d54458ce64636aa12d11d857b9af62812a2a`.
That archive was a provisional JavaScript-only control. I subsequently rebuilt
the addon from the settled shared-wire source; its SHA-256 is
`ad9c1a04028f1c52027a20cc1bc36f2dfe577b7f73bc821b8f0d6d592976cb98`.
The clean final archive SHA-256 is
`08030872e3c4b993bd447233d5246cd0c85da7f70a60dbc33855bafdb1c02369`.
I independently reran the current Bun source suite (9/9, 53 assertions),
installed package-name replay under Node 26.12.1 and Bun 1.4.3, and the
forged-control replay in both hosts. All passed. The refreshed
[`receipt.json`](receipt.json) pins this final source and artifact cohort.
This review accepts the opt-in Node/Bun callback slice.

A fresh Rust registry is
reconstructed from entries on each final call, so large-registry work/capacity
parity is unqualified. The aggregate ordering preflight validates the document
separately before the final validation. Python callbacks have a separate
opt-in CPython review; browser callbacks, default routing, and full
semantic-type family retirement remain open.
