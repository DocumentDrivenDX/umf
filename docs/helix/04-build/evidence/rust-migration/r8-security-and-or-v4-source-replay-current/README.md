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

The current 68-case [fixture](predecessor.json) has SHA-256 `d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d` and is byte-identical to the supplied private fixture. Node 26.3.0, Bun 1.4.3, and real Chromium 153.0.8010.12 each matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero invalid calls; the reference route made zero Rust calls. Chromium loaded the built WASM without Node globals. This covers `securityAnd` and `securityOr` truth-fold and raw-admission cases; it does not exercise the `readJsonValue` access facade.

All receipts bind the refreshed Compact source build at `/private/tmp/umf-r8-compact-postmerge-v2-20261027`. Its immutable manifest SHA-256 is `8b3a7fa5d854f709d6ca7888758e7099ef9b8c5707f0722bdc16f64735890cf2`; its 1,958-input source closure SHA-256 is `0f8f116988ba2da74a13085790824cb9a4f2dc8deda9a5abdb2a594aa14f20dd`. The Security replay wrapper source closure is `de881cc3031471059d6ed9bd239c72f5819abda7adc72e9cf71772a4be3d6f8a`. Every replay verifies the build source closure and compiled artifacts before execution. Manifest and build artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `27bf28c30de73d25164d273d0cddf8d37f882d9b5cb37a9dc153a93e6aaa2535`, Bun `9ce6deea0189302dbc1200cfcd822f1c2f1477b4dc40a36ec7876df0d2abdd42`, and Chromium `f00936178654eda8e3766c1433c1dcc31f4b2c3a55e660f9f5724b51fca55d8e`. `SHA256SUMS` pins all current and retained historical files. Earlier receipts remain under [`historical/pre-index-current-refreeze-20261027/`](historical/pre-index-current-refreeze-20261027/).

This remains bounded source replay evidence, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
