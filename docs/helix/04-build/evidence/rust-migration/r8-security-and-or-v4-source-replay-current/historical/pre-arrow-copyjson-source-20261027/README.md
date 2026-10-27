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

The current 68-case [fixture](predecessor.json) has SHA-256 `d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d` and matches the supplied private fixture byte for byte. Node v26.3.0, Bun 1.4.3, and real Chromium 153.0.8010.12 matched all expected results, refusals, and reflection traces. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the reference route made zero Rust calls. Chromium loaded the built WASM without Node globals. This covers the `securityAnd` and `securityOr` truth-fold and raw-admission cases; it does not exercise the `readJsonValue` access facade.

All receipts bind the refreshed Compact build at `/private/tmp/umf-r8-compact-current-cardinality-checkpoint-3/dist`. Its immutable manifest SHA-256 is `65bb6505f247e221f55b3e0fe7a5b998c76ef7470b390bfae33c8140add3d5aa`; its 1,967-input source closure SHA-256 is `571569bc131aaa1a38c6d52edfd2273cec7cf13e52e01b77eb63d8b2b03c31ed`, including the fixed-point generated metamodel manifest and refreshed Compact source index described in the Compact packet. The Security replay wrapper source closure is `de881cc3031471059d6ed9bd239c72f5819abda7adc72e9cf71772a4be3d6f8a` across 22 files. Every replay verifies the build source closure and compiled artifacts before execution. Manifest and build artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `3be14704780cd7c87acf4edd658de8d308ad518971d257870766974e3e3dadda`, Bun `f3b7814fb5f6eecc58883ebed9d66771a35a4d94f39e33cd423b48793d80f3ea`, and Chromium `03ba4061b891a2e5d9114b5800f32563bff2dd43020b1c65361fe38b52fd4534`. `SHA256SUMS` pins the current and retained historical files. The immediately preceding cohort remains under [`historical/pre-compiler-provenance-refreeze-20261027/`](historical/pre-compiler-provenance-refreeze-20261027/).

This remains bounded source replay evidence, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
