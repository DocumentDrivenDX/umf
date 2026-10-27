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

The live TypeScript predecessor generator was rerun for this source cohort. All five regenerated outcome payloads are byte-identical to the frozen payloads, and its generated index is byte-identical to `index-current.json` (SHA-256 `6bb6e7d1557f12e551a709e837c2e7966dfdd212d30eed9c3bc1c6a8a729cc1e`). The build4 cohort is retained under [`historical/pre-build5-generated-manifest-refresh-20261027/`](historical/pre-build5-generated-manifest-refresh-20261027/); prior receipts are retained under [`historical/pre-securitynot-contract062-refresh-20261027/`](historical/pre-securitynot-contract062-refresh-20261027/) and earlier historical cohorts remain in `historical/`.

A single fresh source build at `/private/tmp/umf-r8-current-source-securitynot-20261027` backs this Compact replay, the Security And/Or replay, and the PostgreSQL RRF Node/Bun/Chromium replay. `build-manifest.json` has SHA-256 `c48aa7bfe8f65129cdaa1c4fa49c6a0c579d3aed970e410d99dcb1b1189312ff` and source closure SHA-256 `86192c24ea6310ccb7d50e9e78045bb928900fe1876b878a244bfd4832e1fa4a`. It pins the Node addon, WASM binary/glue, and reference/Node/browser bundles. Rust/Cargo are 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3.

Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed all five cases. Node and Bun each recorded 14 Rust calls. Chromium loaded pinned WASM and recorded dispatches with no Node globals. Each receipt binds the shared manifest above and the exact current predecessor index and frozen payloads.

This is bounded source-built evidence for five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement. See the sibling [Security And/Or current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
