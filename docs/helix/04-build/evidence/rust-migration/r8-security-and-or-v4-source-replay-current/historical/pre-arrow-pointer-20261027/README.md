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

All receipts bind the refreshed Compact build at `/private/tmp/umf-r8-compact-security-final-20261027-refrozen/dist`. Its immutable manifest SHA-256 is `1dfb786e44d32a22ed7595bf7f3b4a6be0692b5932c3b9de87ad2da894996ae4`; its 1,969-input source closure SHA-256 is `45133a5eab727481d7ee30d0cfaa1e00ccf2b10ea9d0117a9952887f17e00f2c`, including the fixed-point generated metamodel manifest and refreshed Compact source index described in the Compact packet. The Security replay wrapper source closure is `de881cc3031471059d6ed9bd239c72f5819abda7adc72e9cf71772a4be3d6f8a` across 22 files. Every replay verifies the build source closure and compiled artifacts before execution. Manifest and build artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `aa6437ad31d967d76cae7b53ccfa5ebbf4c67a43763d3bd6151fd24b52aa2ffd`, Bun `a9504658dce61da00bc7c6f435c184dad21c6e2f617f01a784fac308ebc5eec1`, and Chromium `da538cadb20f30af274f0cf41fb0609331186decebc46522a404d0bbb2355e9d`. `SHA256SUMS` pins the current and retained historical files. The immediately preceding cohort remains under [`historical/pre-arrow-copyjson-source-20261027/`](historical/pre-arrow-copyjson-source-20261027/).

This remains bounded source replay evidence, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
