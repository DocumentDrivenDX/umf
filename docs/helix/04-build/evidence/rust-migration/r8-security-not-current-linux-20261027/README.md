---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-current-linux-20261027
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
    - id: umf.evidence.rust-migration.r8-security-not-current-darwin-20261027
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-not-direct-binding
      kind: extends
---

# Linux x86_64 `securityNot` installed replay evidence

This packet records the exact CONTRACT-062 14-case `securityNot` profile for a
Docker-emulated Linux x86_64 SDK archive built from source commit
`e9ace728d2e8c0758b4723e3d1eef90b330ebe0d`. The source closure is
`a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25` across
3,595 inputs, with zero generated-input transforms; it matches the Darwin
cohort's closure exactly.

The 44,218,744-byte SDK archive SHA-256 is
`dc3ec269f99266862ea078e23d166c4b50e30cc5b1fd0ef3cf337982b31bd93a`. Its
complete 1,807-member archive map is recorded in
[`archive-members.json`](archive-members.json), with the installed package
manifest in [`archive-package.json`](archive-package.json) and source closure
manifest in [`archive-source-cohort.json`](archive-source-cohort.json). The
archive itself remains in `/private/tmp/umf-sdk-linux-e9ace728d.tgz` and is not
copied into the repository.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each passed all 14 ordered
truth, invalid-input, and host-effect cases through the installed package root
and unchanged TypeScript reference route. Valid T/F/U calls dispatched to Rust
once each; all eleven invalid inputs dispatched zero times; reference calls
dispatched zero times. Chromium loaded the packaged WASM member and confirmed
that `process` and `Buffer` were absent from the page global. Raw receipts are
preserved in [`node.json`](node.json), [`bun.json`](bun.json), and
[`chromium.json`](chromium.json).

The clean-source checks `bun scripts/actions-plan-identity.ts --check` and
`bun scripts/metamodel/build.ts --check` passed. SDK packaging reported a
fixed-point source manifest and 1,807 archive members; the package verifier
passed all 9 tests. The build used rustc/cargo 1.90.0 and wasm-bindgen 0.2.100;
see [`platform.txt`](platform.txt) and [`package-receipt.json`](package-receipt.json).

The `/3` retirement validator was rerun against this archive and the matching
Darwin arm64 archive. Its exact [input](two-cohort-validator-input.json) and
[result](two-cohort-validator-result.json) are preserved. It accepted only the
Node and browser `securityNot` rows as retired for this pinned source and
two-archive cohort, leaving 921 logical default-route gaps. The explicit
`./reference` declaration remains available. Negative controls rejected a
stale archive hash, a missing Chromium receipt, a stale source closure, and a
stale frozen-packet hash. The checked default ledger has no evidence argument
and therefore still reports 922 open gaps and zero retired.

This is local Docker-emulated evidence for the pinned commit and archive. It
does not establish hosted Linux CI, broader platform or security support, or
SDK release suitability. The archive paths in the validator input are local
replay paths; the SHA-256 pins and source/member maps identify the evidence.
