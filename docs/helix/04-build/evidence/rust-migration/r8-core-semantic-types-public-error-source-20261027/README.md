---
ddx:
  id: umf.evidence.rust-migration.r8-core-semantic-types-public-error-source-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-semantic-types
      kind: extends
---

# Source-built V4 Semantic Types public error replay

Node, Bun, and real headless Chromium each passed the 16 frozen Core Semantic
Types cases against the same fixed-point source build. Node and Bun match the
V4 Rust model default route to the explicit TypeScript oracle and preserve the
unknown qualifier. Their direct public-error probes also confirm that an
invalid-input refusal is `instanceof api.UmfError`. Chromium independently
asserts that identity, preserves the unknown qualifier, and has no Node
globals. Node 26.12.1 emitted an experimental `localStorage` warning but
exited successfully; Bun is 1.4.3 and Chromium is 153.0.8010.12.

All receipts bind to the immutable compact build manifest at
`/private/tmp/compact-v4-build-fixedpoint-20261027c/compact-dataset-verify-build-manifest.json`,
SHA-256
`4d25c856fdac60bd5e0ae9c0bf7ac9afeda235251c13c05f313e3c6da96e5f3e`. Its
expanded source-closure SHA-256 is
`2f83e19ace175ceb538d0b7aba94926a41a868c3af4ad87d52d73a996b88fd31`. The
manifest pins the Node addon, WASM, WASM glue, reference bundle, Node bundle,
and browser bundle. The parent SDK builder reported that the matching archive
is a zero-transform fixed point; the separate installed-package replay is
documented in the compact installed evidence.

The [Node receipt](node-run.json) SHA-256 is
`6f5ec9401623d5be75b0c8b9029321100adc18d3a498d184b82325a40d66b71b`, the
[Bun receipt](bun-run.json) is
`338c15c00de53d9202ae1500ae1cc4b31d5694474134641b65e924f5ac5e1403`, and the
[Chromium receipt](browser-run.json) is
`1ce391cf8914fe6e2c0ef3c14e68eeab5ae388284d7bd2e9e6e2bfcb000fb307`. Node and
Bun use replay script
[`replay-core-semantic-types-default-node.mjs`](../../../../../../scripts/rust-migration/r5/replay-core-semantic-types-default-node.mjs),
SHA-256 `d233fa3751e272ea64343e1517480ea1f883407d92c9af09fe5430ca73386900`;
Chromium uses
[`replay-core-semantic-types-default-browser.mjs`](../../../../../../scripts/rust-migration/r5/replay-core-semantic-types-default-browser.mjs),
SHA-256 `f3b9ecc9bddaf1ed715867aea45b20ee0ad1fdd998be5a1c150ca6184abd69ab`.
The direct Node/Bun identity probe is
[`public-error-identity-probe.mjs`](public-error-identity-probe.mjs), SHA-256
`984bcead2f3bd88e28c715462c75018766c6c278284db40e7132937ee1a9a593`.

This is bounded source-built route and public error evidence for the four
opt-in Core Semantic Types operations. It does not establish complete
CONTRACT-078 coverage, Python parity, allocation/budget limits, or retirement
of the TypeScript reference. The prior evidence cohorts are preserved in
[`historical-pre-typed-cohort/`](historical-pre-typed-cohort/) and
[`historical-pre-canonical-action-generator/`](historical-pre-canonical-action-generator/).
