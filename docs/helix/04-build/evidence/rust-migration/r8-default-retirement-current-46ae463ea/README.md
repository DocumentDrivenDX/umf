---
ddx:
  id: umf.evidence.rust-migration.r8-default-retirement-current-46ae463ea
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-relationships-default-retirement-replay
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-inspectors-default-retirement-replay
      kind: informed_by
---

# Current-source default-route retirement replay

This evidence bundle records one fixed-point macOS SDK archive and the default
route/reference route replays for four Core Relationship operations and three
Core Inspector operations. It is limited to the recorded macOS arm64 cohort;
it does not qualify other operating systems, architectures, a complete SDK
operation set, or publication.

The archive is pinned at
`.cache/sdk-distribution/cohorts/46ae463ea/umf-sdk.tgz`, SHA-256
`fe9b101303207574cc68f50bf4853590f683b51cbde9db39e03083c87e60a998`.
Its captured source closure SHA-256 is
`a75f3a86b75f48f2695fa2785cce8fc230c16a25c439f1a360343bc616ef3da1`
at source HEAD `46ae463ea6250cbfd7362da76a2345d50c8ffbef`. The build reported
3,518 source inputs and zero generated-input transforms. The package manifest
SHA-256 is
`1bd5f6cc6db6a5e9ef0e395a19aa6504e8a9a130a2fcbd3faaf4effbac7bb23a`.
The preserved [installed SDK receipt](installed-test-receipt.json), SHA-256
`6b6b92d59c1df24146a796caef53d278997e4b9f531082227ce2253246158aed`,
reports a passing Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 replay
against this exact archive. It covers 31 R3 cases, 27 JavaScript numeric cases
and six boundaries, 66 cardinality, 19 facets, 14 Keys, 11 Bit128, and 19
compact Dataset cases. The installed test also passed missing/corrupt native
addon and WASM asset refusals. Its reported 1,000,752 ms duration is an
observation on this host, not a performance threshold.
[`archive-source-cohort.json`](archive-source-cohort.json) preserves the
captured source map, [`archive-members.json`](archive-members.json) records
the complete 1,803-member file map, and [`archive-package.json`](archive-package.json)
retains the package metadata copy.

The 21 immutable host receipts cover seven operation packets on Node, Bun, and
Chromium. The four-relationship manifest is
[`relationship-only-retirement-manifest.json`](relationship-only-retirement-manifest.json);
the seven-operation diagnostic manifest is
[`seven-operation-retirement-manifest.json`](seven-operation-retirement-manifest.json).
Receipt JSONs retain their captured bytes and are hashed by the manifests.

## Validator outcome

At this archive's source revision, the repository validator refused the
relationship-only manifest at `inspectCoreRelationships/node` because it
compared serialized object property order rather than JSON values. The
seven-operation manifest encountered the same issue first. A temporary
diagnostic copy that sorted keys accepted all four relationship operations,
then refused the seven-operation manifest because
`inspectCoreScalarType/package-root-browser` lacked the ledger's accepted Rust
owner. That temporary result is investigative only; it did not retire rows.

The macOS-only archive cannot establish a global default-route retirement,
including for the relationship rows. The gate requires source-current,
independently pinned macOS arm64 and Linux x64 archive and host cohorts for the
same packet before a global row can be retired. Any validator or accepted-owner
mapping correction also changes the current source closure and requires a new
archive. No default-route row is retired by this evidence.

## Scope and reproduction

Run from the repository root while the pinned archive is present at its recorded
path:

```sh
node scripts/rust-migration/r8/gap-ledger.mjs \
  --default-route-retirement-evidence \
  docs/helix/04-build/evidence/rust-migration/r8-default-retirement-current-46ae463ea/relationship-only-retirement-manifest.json \
  --stdout
```

At the recorded source revision, the command refused at the outcome/trace
comparison described above. After the two-cohort validator change, these
single-cohort diagnostic manifests are expected to be rejected at the evidence
format/cohort gate. The seven-operation manifest separately documents the
Inspector accepted-owner gap at this revision. These receipts show only the
specified operations in this installed macOS cohort; they do not establish
broad Inspector support, cross-platform parity, release readiness, or full
Rust migration completion.
