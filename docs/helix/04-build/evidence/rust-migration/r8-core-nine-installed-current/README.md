---
ddx:
  id: umf.evidence.rust-migration.r8-core-nine-installed-current
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-inspectors-default-retirement-replay
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-csv-boolean-default-retirement-replay
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-schema-properties-installed
      kind: informed_by
---

# R8 current-source qualification harness for nine Core exports

This harness composes the existing frozen packets and archive-extracted replay scripts
for the nine selected Core default exports. It gates replay on a Rust-default
SDK archive whose captured fixed-point source closure equals both its explicit
pin and the complete current checkout closure. It checks every archive member
against `manifest.json` and verifies the separately pinned build dependency
inputs before running host replays. Successful runs write `cohort.json`,
retained per-host receipts with SHA-256 references, the full archive member
digest map, and the full source/dependency input map. It
does not resolve or install the package's declared dependency tree in an
isolated consumer; that separate installed-package gate remains required for
default-route retirement.

The frozen corpus contains 150 outcomes per route: 83 Schema Properties,
Field Value, and Default outcomes; six Core Inspector outcomes; and 61 CSV
Boolean outcomes. Inspector and CSV Boolean outcomes run on Node, Bun, and
Chromium against the archive-extracted root and `./reference`. The Schema Properties
runner additionally records its root/reference comparisons, callback identity
controls, browser WASM load, and host-specific TypeError comparisons.

| Area | Default exports | Cases |
|---|---|---:|
| Schema Properties | `inspectCoreSchemaProperties`, `declareCoreSchemaProperties`, `resolveCoreDefault`, `validateCoreFieldValue` | 83 |
| Core Inspectors | `inspectCoreRecordMembers`, `inspectCoreReferenceLinks`, `inspectCoreScalarType` | 6 |
| CSV Boolean | `validateCsvBooleanLexical`, `verifyCsvBooleanLexical` | 61 |

## Run a source cut

After the shared source is frozen, build and package a fixed-point archive with
the existing SDK workflow, then read `sourceClosure.sha256` from
`dist/rust-default-manifest.json` and pass it as the explicit pin:

```sh
CARGO_NET_OFFLINE=true UMF_RUST_DEFAULT_BUILD_ONLY=1 bun scripts/package-sdk-rust-default.ts
bun scripts/package-sdk.ts
bun scripts/rust-migration/r8/core-nine-default-retirement.mjs \
  .cache/sdk-distribution/umf-sdk.tgz \
  <source-tree-sha256> \
  docs/helix/04-build/evidence/rust-migration/r8-core-nine-installed-current/<cohort>
```

The host must be Darwin arm64 or Linux x64, with the repository's locked
JavaScript packages and browser available locally. This harness performs no
network access. A missing offline dependency prevents a qualification receipt;
record that failure and keep all nine ledger names open. An archive that is
not fixed-point, differs from the current source closure, or fails any asset
hash check is refused before operation replay.

The cohort receipt is source-pinned candidate evidence only. Retirement still
requires dependency-resolved installed-package runs, the R8 ledger's required
independent host cohorts, and explicit ledger review.
This packet does not claim a completed Rust port or package release.

## Harness checks and bounded result

`node --check` passed for the coordinator. The Inspector and CSV Boolean
packet generators passed `--check`, and the Schema Properties installed runner
passed `--check-generated`. A stale fixed-point archive was then supplied to
the coordinator as a negative control. It was refused before operation replay:
its captured `Cargo.lock` digest was
`6af562f46c271dc5c185b29b4ee8c87f19352616afab58a731d0d466d17dc445`, while the
current checkout digest was
`c55364fa3058e7a90bb2833dda6288621b863bed13a629c9bbf2f706401d602c`. No
installed receipts were produced from that stale archive.

A later fixed-point source cut with closure SHA-256
`b8fbb687ef87beae35b8d80f52093cbca736f24edf1f8c9b564d6667f8d000a9`
and archive SHA-256
`852ac31aa575a900f1440c663f9e7962d5c7aa9ed9c1a0ff91ba6a610b36d691`
passed the nine-operation archive-extracted candidate on Node, Bun, and
Chromium, verifying 1,819 package members. That run exposed temporary receipt
paths in the coordinator output, so the coordinator now copies its detailed
receipts into the output directory before removing scratch files. The
current-cut receipt and retained per-host evidence are linked from
[`darwin-arm64/cohort.json`](darwin-arm64/cohort.json). Their archive and
source-closure hashes identify the exact tested cut. All nine retirement
names remain open until dependency-resolved installation and the independent
R8 gates pass.
