---
ddx:
  id: umf.evidence.rust-migration.r8-default-retirement-fe65bf01
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
    - id: CONTRACT-062
      kind: informed_by
---

# Fixed-point macOS archive and operation receipts

The private macOS arm64 SDK archive at
`.cache/sdk-distribution/cohorts/fe65bf01/umf-sdk.tgz` has SHA-256
`80d02a83a1620990c9d7a3bbc3a8d06328fccd000d164b997cb6d28bb45d529c`.
Its captured and live source closure both have SHA-256
`fe65bf01ab04d64d1a549029c4a218d2b91ef6140326c4a674b882f9c1d28988`:
3,521 inputs and zero generated-input changes. The archive has 1,803 regular
members. [`cohort.json`](cohort.json) records the host identity and sidecar
hashes; [`archive-source-cohort.json`](archive-source-cohort.json),
[`archive-members.json`](archive-members.json), and
[`archive-package.json`](archive-package.json) preserve the full source map,
complete member hash map, and package metadata. The archive is an ignored
private build output; its digest is pinned here, and its bytes must be retained
separately to reproduce archive-opening checks.

The 21 raw `{operation}-{node,bun,chromium}.json` receipts replay four Core
Relationship and three Core Inspector frozen packets through the installed
default and explicit TypeScript reference routes. Each operation includes one
valid Rust call path and one preflight refusal. Node, Bun, and Chromium matched
the frozen outcome and trace for all seven operations; valid default calls
entered Rust/WASM, refusals did not, and `./reference` made zero Rust calls.
Each receipt identifies the archive, source closure, packet, platform,
condition-selected entry, and relevant native/WASM member hashes. The
[`securityAnd`/`securityOr` installed receipt](security-and-or-installed-receipt.json)
pins the separate 68-case predecessor packet. Its final replay during the full
installed run passed 30 valid default Rust/WASM calls and zero refused or
reference calls per host, with a packaged WASM request and no external browser
requests. The complete SDK harness passed its Node and Bun R3 replays and
reached its final Chromium/security receipt check, then failed in the harness:
it parsed the security runner's short console summary as the full receipt and
accessed a missing `archive.sha256` field. That harness defect was corrected
after this archive's source snapshot. There is no passing full installed SDK
receipt for this archive; this bundle remains a diagnostic macOS cohort.

This is one macOS arm64 cohort. The R8 retirement validator requires both a
current macOS arm64 cohort and an independently built Linux x64 cohort with the
same source closure and complete Node/Bun/Chromium receipts before any global
default-route row can be marked retired. These receipts do not qualify other
exports, broader security behavior, release publication, or a completed Rust
port. The ledger remains at 922 open logical default-route gaps and zero
retired rows absent that two-platform evidence.
