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

The current 68-case [fixture](predecessor.json) has SHA-256 `d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`. Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the reference route made zero Rust calls. Chromium loaded the built WASM without Node globals. This covers the `securityAnd` and `securityOr` truth-fold and raw-admission cases; it does not exercise the `readJsonValue` access facade.

All receipts bind the refreshed Compact build at `/private/tmp/umf-r8-arrow-schema-properties-refresh-20261027`. Its immutable manifest SHA-256 is `7e22134d72023245036097ec4f110b9ddb773eb820ecb681d77a5d677b941da6`; its 1,973-input source closure SHA-256 is `9143f872a1bb2cd3d4aa5d25da4ec0c7d7f06c3b22447f1b32b54e70d5629681`. The Security replay wrapper source closure is `60d6fad44134d5925b359df96e885f8836e4a98286580220e777f8baa5126ba2` across 22 files. Every replay verifies the build source closure and compiled artifacts before execution. Manifest and build artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `f4b03b183bceeb897bd34e85297f56101f82a214de509322333d960722302d14`, Bun `8b70517af5dfb6ccfd5b6b7d4c9c8ce7c5f75f784c870006a25d1354827bbaad`, and Chromium `afb5dbf053272d7a8db6977eccd49ffd5b6068a2c916471b6efcf362172b582d`. `SHA256SUMS` pins the current and retained historical files. The immediately preceding cohort is retained under [`historical/pre-arrow-generated-source-20261027/`](historical/pre-arrow-generated-source-20261027/); earlier cohorts remain under [`historical/`](historical/).

This remains bounded source replay evidence, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
