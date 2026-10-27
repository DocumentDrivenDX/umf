---
ddx:
  id: umf.evidence.rust-migration.r8-core-cardinality-d5e1783d
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-bounded-route-d5e1783d
      kind: extends
    - id: umf.evidence.rust-migration.r5-cardinality
      kind: references
    - id: umf.evidence.rust-migration.r5-cardinality-default-route
      kind: references
---

# R8 Core Cardinality replay on the d5 archive

The existing installed Cardinality harness passes its three-operation replay
against the fixed-point macOS arm64 archive recorded by the parent
[d5 cohort](../r8-bounded-route-d5e1783d/README.md). This receipt is pinned to
archive SHA-256
`7105a7f69118367cefe1e156481a6e3c85bad49c63157f1956f85dcef52383e2` and source
closure SHA-256
`d5e1783d7f615c8c1877df4f3d9ded43e68039f6b8f4d307e13ea79c190fa8f9` (3,529
inputs). The replay checks the package manifest's 1,802 hashed distribution
members; the archive has 1,803 regular members including that manifest. It
compares the installed default route with the explicit TypeScript reference and frozen predecessor
packet.

`inspectCoreCardinality`, `declareCoreCardinality`, and
`verifyCoreCardinalityDeclaration` match the frozen semantic and refusal
envelopes in Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The harness
also confirms host-admission and refusal order, Proxy traces, caller-thrown
error identity, genuine `UmfError` shapes, and receipt copy prototypes. The
Chromium run loaded the archive's WASM member and made zero external requests.
The full machine-readable result is in
[`installed-replay.json`](installed-replay.json).

This is bounded compatibility evidence for authored Cardinality ideal metadata
under CONTRACT-040. It does not establish native container behavior,
cross-system projection, complete TypeScript retirement, or release
qualification. The selected default binder still performs TypeScript
`copyJson` admission before Rust dispatch; this replay shows that the installed
route preserves the frozen observable behavior, not that host admission is
Rust-owned. It also does not close the parent cohort's 922 logical retirement
gaps, the unresolved resource-authority aliases, the Linux host cohort, or the
remaining integrated SDK gates. No declaration is retired by this packet.

Replay harness SHA-256: `2f26ed37875b079ea51535a959d5aa67401f3c64a08f755d6925607a397e70fd`.
Frozen predecessor SHA-256:
`6d18efe22f1eb525844cb78ae5cc7854ec78ce1aa103d3fdc2eb65b274c5aeea`.
