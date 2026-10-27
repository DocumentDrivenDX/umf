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

All receipts bind the refreshed Compact build at `/private/tmp/umf-r8-compact-fixedpoint-20261027`. Its immutable manifest SHA-256 is `5962a782eac5ffd09f4c64c1b98828dfc648d2439b7a401cdb105e5378a15d70`; its 1,959-input source closure SHA-256 is `60e9ef033087b32ae195653662afb8955338f82314d108f8ac0f14d773aba30a`, including the fixed-point generated metamodel manifest and action plan identity pins described in the Compact packet. The Security replay wrapper source closure is `de881cc3031471059d6ed9bd239c72f5819abda7adc72e9cf71772a4be3d6f8a` across 22 files. Every replay verifies the build source closure and compiled artifacts before execution. Manifest and build artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `82bf21f290f18902d632046e22b026a2c9c0c7ba6c2125195a04ba2c9122f165`, Bun `02d1fc648405ccd9051e01e429dd1436e465dcaabd322e27293398dded47dd94`, and Chromium `7817ef329b5ada1d6e44c1ed75cc35cfde930adf71aa03a76a56264cd9bea411`. `SHA256SUMS` pins the current and retained historical files. Earlier receipts remain under [`historical/`](historical/).

This remains bounded source replay evidence, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
