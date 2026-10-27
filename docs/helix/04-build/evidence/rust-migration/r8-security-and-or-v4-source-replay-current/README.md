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

The current frozen fixture contains 68 Security And/Or truth-fold and raw-admission cases and has SHA-256 `d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`. Node v26.3.0, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the reference route made zero Rust calls. Chromium loaded the pinned WASM without Node globals. This does not exercise the `readJsonValue` access facade.

All receipts bind the same fresh Compact build at `/private/tmp/r8-compact-security-replay-20261027/dist`. Its manifest SHA-256 is `43a735c629f357ca85d99708055a86c38a73522375ac7334eae79d7138ad8b3e`, with a 1,975-file source closure SHA-256 `ca6d3b7c893833073d2cd79a8a13d3909f0428dd16c6305f9115d6c2a33b2c21`; this includes `src/extensions/actions/plan-identity.ts` at SHA-256 `ce429d59eec48618584f52a7390b4fec9c2633ab6441dfa0d60ce705062a615f`. The Security replay wrapper closure is `60d6fad44134d5925b359df96e885f8836e4a98286580220e777f8baa5126ba2` across 22 files. Each replay verified the full source closure and compiled artifacts before execution. The manifest and artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are recorded in `SHA256SUMS`, which pins the current and retained historical files. Earlier current-source cohorts remain under [`historical/`](historical/).

This remains bounded source replay evidence, not installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
