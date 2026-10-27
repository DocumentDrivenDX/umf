---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-installed-ef9f20c8
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
      kind: extends
    - id: umf.evidence.rust-migration.r8-security-and-or-installed-ef9f20c8
      kind: references
---

# Installed Compact Dataset verifier replay on ef9f20c8

The [installed receipt](installed.json), SHA-256
`24985f55b33bf3d0cdb962f08658988b305c514ae797dc6e80239a68058ee8c2`, records
`qualified-pass` for SDK archive SHA-256
`3302afe1837647344b6fa08606f31cc61a88637d3897f15feb6cb218c01c4046`, fixed-point
source closure
`ef9f20c85e220651590552b94e92da0743d02f5a97446b1e2f51f5781e244ecb`, and
manifest SHA-256
`a3317d5edd5a3971904899f14f1050b441b029dfd9ee0bafeecaaecd643d17ab`. The
archive reports zero generated transforms and verifies all 1,805 packaged
member hashes. The source closure pins the replay harness and all six frozen
packet files byte-for-byte.

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 passed all five frozen
cases and host controls. On each case, the explicit reference route made zero
native/WASM calls and the default route made two. Chromium loaded the packaged
WASM, had no Node globals, and made no external requests.

This qualifies only these installed Compact verifier cases and host controls
for this exact archive. It does not establish complete Dataset semantics,
retire declarations, or qualify a release.
