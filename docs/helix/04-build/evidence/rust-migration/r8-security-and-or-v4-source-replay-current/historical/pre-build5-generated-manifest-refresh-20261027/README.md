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

All three receipts bind the same fresh build as the sibling [five-case Compact Dataset verifier replay](../r8-compact-dataset-verify-source/README.md): `/private/tmp/umf-r8-access-rrf-final-build-4/compact-dataset-verify-build-manifest.json`, SHA-256 `3961bd5542e601c262ea68dfffe0923178bf00a76ef6d54145228d83d9fddba2`; source closure SHA-256 `108829f9bc1afe227b7b1a1adcdb2f2171190464f2cb5c826638338cf3c9928d`. The closure includes current Node/WASM binding sources and refreshed Compact predecessor index. Each receipt verified the complete source closure and artifacts before execution.

Superseded receipts are retained under [`historical/pre-r8-rrf-shared-build-refresh-20261027/`](historical/pre-r8-rrf-shared-build-refresh-20261027/); earlier cohorts remain in `historical/`. Current fixture/source hashes and retained historical evidence are pinned by `SHA256SUMS`.

This remains bounded source replay evidence, not installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-installed-ef9f20c8/README.md).
