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

All three receipts bind the same final source-built manifest as the sibling [five-case Compact Dataset verifier replay](../r8-compact-dataset-verify-source/README.md): `/private/tmp/umf-r8-copyjson-identity-fixed-20261027/compact-dataset-verify-build-manifest.json`, SHA-256 `2cd9bdb5bb32e43cb76a11fa3074e321e1c24777ff139e139f1311d21172dcff`; source closure SHA-256 `7483d797dbf4a7cbb0dd538e02dca51ab4d7567bcf1939ad6cdb03b38ad87acf`. Each receipt verified the complete build closure and six artifacts before execution. The frozen fixture [`predecessor.json`](predecessor.json) is SHA-256 `be97dfa59f8971e1c70e8e932ea8dac0188e0c3cd39b7ddf1b7206a06790f5d2` and records live Security source, JSON admission, CONTRACT-062, and frozen truth source hashes.

The preceding top-level packet is preserved in committed source revision `851f648bb` (manifest `7acacd541cb89814ca04f20d3443ac3b166290fac9d4a8bd1173876e8f5d0d87`, source closure `58faa724a3ca71315ab8337a8bc060841ba6a882797a8bbb85a22025f29b270b`); earlier historical cohorts remain under `historical/`. Current receipts and retained evidence are pinned by `SHA256SUMS`.

This remains bounded source-built replay evidence, not installed SDK archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. The contract’s separate `securityNot` acceptance profile is not covered by this And/Or fixture. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-installed-ef9f20c8/README.md).
