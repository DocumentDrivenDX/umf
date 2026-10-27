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

The unchanged [68-case predecessor packet](predecessor.json) matches every expected result, refusal, and reflection trace on Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. Each default route made 30 valid Rust/WASM calls and zero refusal calls; the reference route made zero Rust calls. Chromium loaded the built WASM without Node globals. This packet covers the `securityAnd` and `securityOr` truth-fold and raw-admission cases; it does not exercise the `readJsonValue` access facade.

All three receipts bind the shared Compact source build at `/private/tmp/umf-r8-r8-replays-final-20261027`. Its immutable manifest SHA-256 is `50f19d4e492f8f00afbfe9a91ccfe94e093839703adfbd8b72b44e59f18aa5c8`; the 1,958-file source closure SHA-256 is `8ef3b7d6e5eec0e64dbd3f9b7d1170602de3882dbc0db5173cb037cbe33bb711`. The Security replay wrapper's 22-file source closure is `de881cc3031471059d6ed9bd239c72f5819abda7adc72e9cf71772a4be3d6f8a`. The manifest and six artifact hashes are recorded in [the Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json). Every replay verifies the full build source closure and all six compiled artifacts before execution. The fixture SHA-256 is `d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`.

To reproduce, run `security-and-or-v4-source-replay.mjs` with `--host node`, `--host bun`, and `--browser`, passing the same build directory and this packet's `predecessor.json`. The browser replay uses a temporary loopback server.

Receipt SHA-256 values are Node `5021b3bec7bc33441f51aee54f8b391ec49b5509db835a64c5b1aa7c9285dd5f`, Bun `5ed75eadec545edb6ce583a6055e6e7576b065f2cd88e135d4d104ff55bd4797`, and Chromium `a42151f0a3a5f23302ba2184a7c726dc1c854b8058919469747608995c870acd`. Prior current receipts are preserved under [`historical/pre-index-current-refreeze-20261027/`](historical/pre-index-current-refreeze-20261027/). `SHA256SUMS` pins every file in this packet, including historical receipts.

This remains a bounded source replay, not an installed archive or release qualification. It does not establish complete Security semantics acceptance or retire a default-route gap. See the separate [installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
