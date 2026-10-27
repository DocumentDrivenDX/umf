---
ddx:
  id: umf.evidence.rust-migration.r8-full-sdk-8a105dd6
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Historical fixed-point SDK full-suite replay: 8a105dd6

The private macOS arm64 SDK archive SHA-256 was
`01b15705bb1fcdc30814de4740cda352a23d5bc28dece3a60da9ffddf680504d`.
Its captured live/source closure SHA-256 was
`8a105dd69a5e42001250cd5e6063ed8c2721e844408389b8f5d5b561abedcdf7`;
the archive had zero generated-source transforms and 1,805 members.

`bun scripts/test-sdk-rust-default.ts` passed from the installed archive on
Node 26.12.1, Bun 1.4.3 and real Chromium 153.0.8010.12 in 1,096,013 ms.
The [installed test receipt](installed-test-receipt.json) has SHA-256
`78ce2936577622e224aced2e0f828d6634147bf581ed94585f3429ceae3f4288`.
The [Security And/Or installed receipt](security-and-or-installed-receipt.json)
has SHA-256
`c9a87aa1b307d42261641f58ded5fff2e2d0e7d93a7c4c51b79f44c14f09b138`
and records 68 cases and 30 Rust/WASM calls on each host.

This archive is exact for its captured source closure. The compact verifier
packet index, replay script, and gap ledger changed afterward, so these
receipts are historical rather than current-source release evidence. Linux
x64, coordinated Python packages, full default-route retirement, and release
qualification remain open.
