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

The current frozen fixture contains 68 Security And/Or truth-fold and raw-admission cases and has SHA-256 `d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`. Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the reference route made zero Rust calls. Chromium loaded the pinned WASM without Node globals. This does not exercise the `readJsonValue` access facade.

All receipts bind the fresh Compact build at `/private/tmp/umf-r8-plan-identity-refresh-20261027`. Its manifest SHA-256 is `9501e340a2e8905378926b7415e1d247a57ed3fa1bb070ccd241de73a4943cb7`, with a 1,973-file source closure SHA-256 `a917c501d6882ba7a0b737232f69ea3acc859848e0e497c0c8760a314577991f`; this includes `src/extensions/actions/plan-identity.ts` at SHA-256 `cd104adefbc27d9e51870ca4e316d414cbc8bb5de2e458b1cd673035f8049c5b`. The Security replay wrapper closure is `60d6fad44134d5925b359df96e885f8836e4a98286580220e777f8baa5126ba2` across 22 files. Each replay verified the full source closure and compiled artifacts before execution. The manifest and artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `02df186be2623c813e22c16fbeeb8f19a8056566f5ab370103674165ff10da6b`, Bun `232b1ef57b93d6628fcc049cba4a42404faf4f8cba253f1aadd298e1774ee716`, and Chromium `a08fb871706e7f24f30a963229e9590c5127097badea03ffd2e37c9503f69204`. `SHA256SUMS` pins the current and retained historical files. The previous current packet is retained at [`historical/pre-plan-identity-refreeze-20261027/`](historical/pre-plan-identity-refreeze-20261027/); earlier cohorts remain under [`historical/`](historical/).

This remains bounded source replay evidence, not installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
