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

The frozen fixture contains 68 Security And/Or truth-fold and raw-admission cases. Node v26.3.0, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the TypeScript reference route made zero Rust calls. Chromium loaded the pinned WASM without Node globals. The replay does not exercise the `readJsonValue` access facade.

All three receipts bind the same fresh Compact build used by the sibling [five-case Dataset verifier replay](../r8-compact-dataset-verify-source/README.md): `/private/tmp/umf-security-v4-arrow-final/compact-dataset-verify-build-manifest.json`, SHA-256 `405070e56a89922673b42d60879d6a6dea0f17c14b674e1c4f4cc0125aa090ab`; source closure SHA-256 `3b3f41e8fedb412c4d0f086ded4d32b4248330508841619fe070a9a0ec175863`. The closure includes current `bindings/core/node/index.js` and the regenerated Compact predecessor index. `build-manifest.json` and artifact hashes are copied here for durable review. Each replay verified the complete build source closure and artifacts before execution.

The prior current-source receipts are retained under [`historical/pre-arrow-source-closure-refresh-20261027/`](historical/pre-arrow-source-closure-refresh-20261027/); earlier cohorts remain in `historical/`. The current fixture/source hashes and retained historical evidence are pinned by `SHA256SUMS`.

This remains bounded source replay evidence, not installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-installed-ef9f20c8/README.md).
