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

All receipts bind the refreshed Compact build at `/private/tmp/umf-r8-copyjson-current-replay-refrozen-20261027`. Its immutable manifest SHA-256 is `0faa8dc02cb0e0068af0b66c5e0cffe46a7d16c3c15d953403916c643bc6dc65`; its 1,969-input source closure SHA-256 is `12e2975de46a4bed5749e4f93390959f2a0ebed30cf23b36940189c328451a61`, including the fixed-point generated metamodel manifest and refreshed Compact source index described in the Compact packet. The Security replay wrapper source closure is `de881cc3031471059d6ed9bd239c72f5819abda7adc72e9cf71772a4be3d6f8a` across 22 files. Every replay verifies the build source closure and compiled artifacts before execution. Manifest and build artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).

Receipt SHA-256 values are Node `51eea6b1a4d6f8aebbb6de72c4327c7d9fbdec678d9024d751e1d9c17a0e98d8`, Bun `6037ee288dcbcde0abd22409120284997ff04dd24c188b5974876bc0b83aa122`, and Chromium `9559937fe31c181f8d1fd642f4f7b0f7ae6af2d602fbe15abcc558294b17fbb2`. `SHA256SUMS` pins the current and retained historical files. The immediately preceding cohort remains under [`historical/pre-arrow-pointer-20261027/`](historical/pre-arrow-pointer-20261027/).

This remains bounded source replay evidence, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. Controls/maxWork meter parity is not asserted. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
