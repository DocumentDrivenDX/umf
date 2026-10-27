---
ddx:
  id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay-current
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-and-or-v4-source-replay
      kind: extends
---

# Security And/Or V4 current-source replay

The frozen fixture contains 68 Security And/Or truth-fold and raw-admission cases. Node v26.3.0, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the TypeScript reference route made zero Rust calls. Chromium loaded pinned WASM without Node globals. The replay does not exercise the `readJsonValue` access facade.

All three receipts bind the same fresh build as the sibling [five-case Compact Dataset verifier replay](../r8-compact-dataset-verify-source/README.md): `/private/tmp/umf-r8-access-rrf-final-build-5/compact-dataset-verify-build-manifest.json`, SHA-256 `3e88fb576d9bf076415b96263154b86453b9d372b1b7d88fb22651f9fb788f63`; source closure SHA-256 `86192c24ea6310ccb7d50e9e78045bb928900fe1876b878a244bfd4832e1fa4a`. The closure includes current Node/WASM binding sources and refreshed Compact predecessor index. Each receipt verified the complete source closure and artifacts before execution.

The build4 cohort is retained under [`historical/pre-build5-generated-manifest-refresh-20261027/`](historical/pre-build5-generated-manifest-refresh-20261027/). Earlier superseded receipts are retained under [`historical/pre-r8-rrf-shared-build-refresh-20261027/`](historical/pre-r8-rrf-shared-build-refresh-20261027/); earlier cohorts remain in `historical/`. Current fixture/source hashes and retained historical evidence are pinned by `SHA256SUMS`.

This remains bounded source replay evidence, not installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-installed-ef9f20c8/README.md).
