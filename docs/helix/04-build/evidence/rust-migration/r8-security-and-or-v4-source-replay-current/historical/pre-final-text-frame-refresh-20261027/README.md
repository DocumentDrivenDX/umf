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

The current-source frozen fixture contains 68 Security And/Or truth-fold and raw-admission cases. Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the TypeScript reference route made zero Rust calls. Chromium loaded pinned WASM without Node globals. The replay does not exercise the `readJsonValue` access facade.

All three receipts bind the same immutable build as the sibling [five-case Compact Dataset verifier replay](../r8-compact-dataset-verify-source/README.md): `/private/tmp/umf-r8-copyjson-sparse-rrf-20261027/compact-dataset-verify-build-manifest.json`, SHA-256 `3fd773d003c1262542a404dbfcc83fbc6e8f444e484a8ec4035dbf281d5a8ece`; source closure SHA-256 `757c36080591f98244010510a60ec20063135233aaf88de5114216bfe3da15aa`. Each receipt verified the complete build closure and six artifacts before execution. The fixture is separately SHA-pinned (`be97dfa59f8971e1c70e8e932ea8dac0188e0c3cd39b7ddf1b7206a06790f5d2`) and records live security source, JSON admission, CONTRACT-062, and frozen truth source hashes; Compact index regeneration remained an exact no-op.

The superseded top-level receipts and build manifest are retained in [`historical/pre-copyjson-sparse-rrf-refresh-20261027/`](historical/pre-copyjson-sparse-rrf-refresh-20261027/); earlier cohorts remain under `historical/`. Current fixture/source hashes and retained historical evidence are pinned by `SHA256SUMS`.

This remains bounded source-built replay evidence, not installed SDK archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. The contract’s separate `securityNot` acceptance profile is not covered by this And/Or fixture. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-installed-ef9f20c8/README.md).
