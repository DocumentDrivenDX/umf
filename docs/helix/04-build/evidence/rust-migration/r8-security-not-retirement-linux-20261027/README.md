---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-retirement-linux-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-not-retirement-darwin-20261027
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-not-direct-binding
      kind: extends
---

# Linux x86_64 `securityNot` installed replay evidence

This packet records the CONTRACT-062 `securityNot` profile on a Docker-emulated
Linux x86_64 cohort. Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each
replayed the same 14 ordered truth, invalid-input, and host-effect cases through
the installed package default route and unchanged TypeScript reference route.
All outcomes and traces match the frozen packet. Rust calls are one for T/F/U,
zero for every invalid input, and zero on every reference call. Chromium loaded
the packaged WASM member and made no external requests.

This is a local emulated cohort, not hosted CI evidence. It qualifies this
captured archive and source closure only; current worktree source has moved since
the snapshot. It does not retire the outstanding route or imply broader platform
support.

Snapshot source commit: `eca698152a3dde440dfebeaa306bb42cade94f82`. The fixed-point
source closure SHA-256 is
`5ff72dd348c40122d8e79e10e13dd54f23a484f9b58896ea2038729ec2582e17`.
The 44,171,890-byte SDK archive SHA-256 is
`df1414877895e260ad88222771dd9736aa5d8c1eb69dcc7939f2af11af11c82f`; the
frozen packet SHA-256 is
`10ac8874de655a4896dfd63b0de1dbd884a3049bba5118843beb35fd04bc46e6`.
The archive has 1,807 verified members. It is not copied into the repository;
the replay source was `/private/tmp/umf-linux-out/umf-sdk-linux-x64.tgz`. See the
[selected member inventory](archive-member-inventory.txt), package receipt,
SDK manifest and Rust default manifest for route hashes and closure details.
[Input checksums](input-SHA256SUMS) retain supplied hashes, including the archive
pin.

The [Node](node.json), [Bun](bun.json), and [Chromium](chromium.json) receipts
retain all 14 case outcomes, traces, Rust-call counts, route artifact hashes,
and runtime versions. The package build receipt and raw [platform capture](platform.txt)
are preserved too. All receipts agree on archive, closure and packet hashes,
case order and outcomes. Evidence is limited to this emulated Linux x86_64
snapshot; it does not establish hosted Linux CI or present-day source qualification.

The pinned `eca69815` `/3` validator was independently rerun against both
archives and all six raw host receipts. The exact
[input](two-cohort-validator-input.json), Linux
[member map](archive-members.json), [package manifest](archive-package.json),
and [result](two-cohort-validator-result.json) are preserved here. It returned
exactly the Node and browser `securityNot` routes as `retired` for that historical
fixed-point snapshot. This is a local validator dry run, not a retirement of the
changed current worktree. The next final-source SDK archives and replays must
pass the same validator before the current ledger can change its disposition.
