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

The unchanged [68-case predecessor packet](predecessor.json) matches every
expected result, refusal, and reflection trace on Node 26.12.1, Bun 1.4.3, and
real Chromium 153.0.8010.12. Each default route made 30 valid Rust/WASM calls
and zero refusal calls; the reference route made zero Rust calls. Chromium
loaded the built WASM without Node globals. This packet covers the
`securityAnd` and `securityOr` truth-fold and raw-admission cases; it does not
exercise the `readJsonValue` access facade.

All three receipts bind the Compact source build at
`/private/tmp/umf-r8-compact-v4-stable-20261027d`. Its immutable manifest
SHA-256 is `2d204008769e77edbb8d4c78eee7cac2d589957dd9441f9f62303f0996b84cf3`;
source closure SHA-256 is
`fe21235aaf399b3adf616ef5ce4d6c9a91cafe75dd1b5e1ed22b084d63edb832` across
1,958 files. The Security replay wrapper's 22-file source closure is
`7bac03c3e6a6595d490c5a8c3c35db0569d78ca2a260ccdb8a2966fc0f5dd1ef`. The
manifest and six artifact hashes are recorded in the
[Compact source evidence](../r8-compact-dataset-verify-source/build-manifest.json).
Every replay verifies the full build source closure and all six compiled
artifacts before execution. The fixture SHA-256 is
`d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d`.

To reproduce, run `scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs`
with `--host node`, `--host bun`, and `--browser`, passing the same build
directory and this packet's `predecessor.json`. The browser replay uses a
temporary loopback server.

Receipt SHA-256 values are Node
`da8bb37d0841401c0d95cffe6f5285f9dfdde1751afa95e537bc4649ccb7b9fc`, Bun
`67f109eec330294c3df1510389219ac6093958f4b57a34b1c92132cb9069575f`, and
Chromium `af2cd430a825255d562654e043872641562c5c899ff4e4873a9fcfe9b334357d`.
Prior current receipts are preserved under
[`historical/pre-index-current-refreeze-20261027/`](historical/pre-index-current-refreeze-20261027/).
`SHA256SUMS` pins every file in this packet, including historical receipts.

This remains a bounded source replay, not an installed archive or release
qualification. It does not establish complete Security semantics acceptance or
retire a default-route gap. See the separate
[installed replay on the ef9f20c8 archive](../r8-security-and-or-installed-ef9f20c8/README.md).
