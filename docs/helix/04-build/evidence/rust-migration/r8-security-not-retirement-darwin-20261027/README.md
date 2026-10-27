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

This packet records the exact CONTRACT-062 `securityNot` profile against the
final private fixed-point SDK archive on Darwin arm64, built after the Python sdist packaging correction. Node 26.12.1, Bun 1.4.3, and
Chromium 153.0.8010.12 each replay all 14 ordered truth, invalid-input, and
host-effect cases through the installed package root and unchanged TypeScript
reference route. All outcomes and traces match the frozen packet. The observed
Rust call counts are one for T/F/U, zero for every invalid value, and zero for
all reference calls. Chromium loaded the packaged WASM member and had no Node
globals.

Archive SHA-256:
`13035f2cec34e1e55c86eb46f5a685cfbf344628575c321e5e36e1d9be52898b`.
The archive source closure is the fixed-point SHA-256
`5ff72dd348c40122d8e79e10e13dd54f23a484f9b58896ea2038729ec2582e17`, with
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
