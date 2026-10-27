---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
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
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-verify
      kind: extends
---

# Compact Dataset verifier V4 current-source replay

The five-case TypeScript predecessor was regenerated after its prior index rejected the updated core schema source hash. All five regenerated outcome payloads are byte-identical to prior frozen payloads; only predecessor source provenance/index changed. The build4 cohort is retained under [`historical/pre-build5-generated-manifest-refresh-20261027/`](historical/pre-build5-generated-manifest-refresh-20261027/); earlier superseded receipts and indexes remain in `historical/`.

A single fresh source build at `/private/tmp/umf-r8-access-rrf-final-build-5` backs this Compact replay, Security And/Or replay, and RRF scorer replay. `build-manifest.json` has SHA-256 `3e88fb576d9bf076415b96263154b86453b9d372b1b7d88fb22651f9fb788f63` and source closure SHA-256 `86192c24ea6310ccb7d50e9e78045bb928900fe1876b878a244bfd4832e1fa4a`. It pins six artifacts, including Node addon, WASM binary/glue, and reference/Node/browser bundles. Rust/Cargo are 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3.

Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed all five cases. Node and Bun each recorded 14 Rust calls. Chromium loaded pinned WASM and recorded dispatches with no Node globals. Receipts bind the same build manifest as the 68-case Security And/Or and five-case RRF replays.

This is bounded source-tree evidence for five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement. See the sibling [Security And/Or current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
