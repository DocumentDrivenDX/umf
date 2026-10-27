---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-retirement-darwin-20261027
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
    - id: umf.evidence.rust-migration.r8-security-not-direct-binding
      kind: extends
---

# Darwin `securityNot` fixed-source installed receipt

This packet records the exact CONTRACT-062 `securityNot` profile against one
private fixed-point SDK archive on Darwin arm64. Node 26.12.1, Bun 1.4.3, and
Chromium 153.0.8010.12 each replay all 14 ordered truth, invalid-input, and
host-effect cases through the installed package root and unchanged TypeScript
reference route. All outcomes and traces match the frozen packet. The observed
Rust call counts are one for T/F/U, zero for every invalid value, and zero for
all reference calls. Chromium loaded the packaged WASM member and had no Node
globals.

Archive SHA-256:
`5f5943dace4db5d2fb21bf4ee4593b9b796601b7d278ef78ca01a33d6ad7d0be`.
The archive source closure is the fixed-point SHA-256
`a9c04b7e73d24c6c0eda94a0d6917c21f0953f117187d859308ec6f295973f51`, with
zero generated-input transforms. The frozen packet SHA-256 is
`10ac8874de655a4896dfd63b0de1dbd884a3049bba5118843beb35fd04bc46e6`.
The archive itself remains in ignored `.cache/sdk-distribution/` and is not
included in this evidence directory.

The raw [Node](node.json), [Bun](bun.json), and [Chromium](chromium.json)
receipts preserve every case outcome, trace, observed Rust-call count, and
route artifact hash. [Archive provenance](cohort.json) binds them to the
fixed-point source manifest, package manifest, and verified member map.
This Darwin cohort alone does not satisfy the two-platform retirement gate or
retire the logical route gap.
