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

The current-source frozen fixture contains 68 Security And/Or truth-fold and
raw-admission cases. The committed receipts record passes on Node v26.12.1, Bun
1.4.3, and real Chromium 153.0.8010.12, matching expected results, refusals,
and reflection traces. Node and Bun each record 30 valid Rust calls and zero
refusal calls; the TypeScript reference route records zero Rust calls.
Chromium loaded pinned WASM without Node globals. The replay does not exercise
the `readJsonValue` access facade.

All receipts bind to the same immutable source-built manifest as the sibling
[five-case Compact Dataset verifier replay](../r8-compact-dataset-verify-source/README.md):
`/private/tmp/umf-r8-domain-pack-fixedpoint-replay-final/compact-dataset-verify-build-manifest.json`,
SHA-256 `45116162b154da756e3abee5bd59fca9da345b761fd20c91e72891196f328209`;
source closure SHA-256
`9eb6c681a5cabf35d94394b2def87a159c15777b58877dc0070003fb16e71130`. Each
receipt verified the complete build closure and six artifacts before execution.
The frozen fixture [`predecessor.json`](predecessor.json) remains pinned in
`SHA256SUMS` and records live Security source, JSON admission, CONTRACT-062,
and frozen truth source hashes.

The superseded active packet is preserved in [pre-domain-pack-route-replay-20261028/](historical/pre-domain-pack-route-replay-20261028/), with its original receipts, predecessor fixture, and checksum list. Earlier historical cohorts remain under `historical/`.

This remains bounded source-built replay evidence, not installed SDK archive or
release qualification. It does not establish complete Security semantics
acceptance or retire a default-route gap. The contract's separate
`securityNot` acceptance profile is not covered by this And/Or fixture.
Controls/maxWork meter parity is not asserted. See the separate [installed
replay on the ef9f20c8 archive](../r8-security-and-installed-ef9f20c8/README.md).
