---
ddx:
  id: umf.evidence.rust-migration.r8-installed-cardinality-compact-security-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
      kind: informed_by
---

# Private installed Cardinality, Compact and Security replay

This bounded local macOS arm64 packet verifies one private, nonpublishable SDK
archive, SHA-256
`b48f5c50d11e9766256919905e82d1bab01dde3c4a1413eeaf105d5c6950cb29`.
Its [package manifest](sdk-package-manifest.json) SHA-256 is
`b5ac385ab224c1b69f5d4635b5097f6c86545fb9871cf47befcf6d1055306d42`.
The [package receipt](sdk-package-receipt.json) records a fixed-point,
zero-transform captured/live source closure
`e95ca0fa8109a3a81f605cbeae735683ca5b253b3663e90edb105b38f8260a6d`.
The archive itself is a local build artifact and is not checked in. The
[archive member inventory](cardinality/archive-members-darwin-arm64.json),
SHA-256 `df27e3f186bf5d92befd6c60244d610346b5e127fb792e7a1006386b6dbafbdf`,
verified 1,807 members including the package manifest.

The [Cardinality cohort](cardinality/cohort-darwin-arm64.json), SHA-256
`048c638eb31ae63233aef2b9e2d98ddc734901771c57466bc7509d6ceae9fd16`,
binds three all-Rust v2 packets: four `inspectCoreCardinality`, four
`declareCoreCardinality`, and three `verifyCoreCardinalityDeclaration` cases.
The nine raw Node, Bun and Chromium receipts in `cardinality/` passed all 11
cases on each host. Each case matched its frozen outcome and ordered trace,
made exactly one default Rust/WASM call and zero reference calls. The
browser loaded the actual WASM export and made no external requests. Runtimes
were Node v26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The capture
rehashes the archive and all 3,570 source inputs before writing receipts.

The [Compact installed receipt](compact-installed.json), SHA-256
`acafdde71965699ab3e015d1d4f99ce84a1efd530238f38c25b524f38f040a46`,
passed five cases on each host with two default native/WASM calls and zero
reference calls per case. The [Security installed receipt](security-installed.json),
SHA-256 `eda0db64baea6de3a33b78895efff6736506f5f329c28afb10cbe1a50252aaec`,
passed 68 cases per host with 30 valid default calls, zero refusal calls and
zero reference calls. Both browser probes loaded WASM and made no external
requests. [`SHA256SUMS`](SHA256SUMS) pins every checked-in file.

These are exact archive and host observations for the named cases. They do
not establish complete Cardinality, Dataset or Security semantics, whole SDK
parity, default-route declaration retirement, Python package rebuildability,
Linux behavior, or release qualification. No macOS CI was run.
