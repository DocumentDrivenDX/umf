---
ddx:
  id: umf.evidence.rust-migration.r8-csv-boolean-current-darwin-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-csv-boolean-default-retirement-replay
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-csv-boolean-default-route
      kind: informed_by
---

# Current-source Darwin CSV Boolean installed replay — 2026-10-27

This packet independently replays the frozen `validateCsvBooleanLexical`
(44-case), `verifyCsvBooleanLexical` (17-case), and
`validateCoreRecordValues` (2-case presence-control) packets against the pinned
Darwin-arm64 SDK archive built from commit
`eca698152a3dde440dfebeaa306bb42cade94f82` at
`.cache/sdk-distribution/umf-sdk.tgz`. These receipts are current for that
captured source revision; subsequent worktree edits require a new cohort.
Archive SHA-256
is `13035f2cec34e1e55c86eb46f5a685cfbf344628575c321e5e36e1d9be52898b`;
the package manifest SHA-256 is
`3bd2c4ed5f45afb2462355de2a4bdf2a9818c70ce0802dd66ede120d97d2d8c8`.
The manifest reports captured and live source-tree SHA-256
`5ff72dd348c40122d8e79e10e13dd54f23a484f9b58896ea2038729ec2582e17`, fixed-point
source transforms, and zero transformed inputs. Receipts bind these archive and
source-closure pins plus each packet and selected package artifact hashes.

Node v26.12.1, Bun 1.4.3 and real Chromium 153.0.8010.12 each matched all frozen
outcomes and traces. `validateCsvBooleanLexical` default Rust-call counts were
zero for cases 0–16, one for 17–42, and zero for case 43. The
`verifyCsvBooleanLexical` vector was
`[2,2,2,2,2,2,2,2,2,2,2,1,2,1,1,0,1]` on all three hosts. The Record presence
control had `[0,0]` default Rust calls; it remains outside the two-operation
retirement manifest. All explicit TypeScript reference-route Rust-call counts
were zero. Chromium confirmed that `process` and `Buffer` were absent.

Raw per-host receipts are in [`receipts/`](receipts/). Exact replay and packet
generator sources are retained in [`harness/`](harness/); hashes for those
files, receipts, and the preserved [package manifest](package-manifest.json)
are in [`SHA256SUMS`](SHA256SUMS). The archive and frozen packets have exact
hashes in the receipts and remain at their stated local and repository paths;
the checksum file covers the durable packet files only.
The frozen packets remain in the established
[expanded packet directory](../r8-csv-boolean-default-retirement-replay/).

For reproduction from the repository root, extract the pinned archive without
changing it, set the receipt directory, then run the Node/Bun replay and the
Chromium replay using the exact archive and source-closure hashes above. The
replay source in `harness/` is byte-identical to the repository runner used for
this capture. Chromium needs permission to bind local loopback.

This evidence is one macOS arm64 cohort. It does not establish the independent
Linux x64 replay, any cross-platform retirement decision, general CSV ingestion
support, full SDK parity, release eligibility, or R8 completion. No ledger row
is retired by this packet.
