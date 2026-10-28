---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-verify
      kind: extends
---
# Compact Dataset verifier V4 current-source replay

The fresh source-built replay passed all five frozen verifier cases on Node
v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. Node and Bun each
recorded 14 Rust calls. Chromium loaded the pinned WASM and ran without Node
globals. The receipts bind to the same immutable source-built manifest:
`/private/tmp/umf-r8-domain-pack-fixedpoint-replay-final/compact-dataset-verify-build-manifest.json`,
SHA-256 `45116162b154da756e3abee5bd59fca9da345b761fd20c91e72891196f328209`;
source closure SHA-256
`9eb6c681a5cabf35d94394b2def87a159c15777b58877dc0070003fb16e71130`.
The manifest pins the Node addon, WASM binary/glue, and reference, Node, and
browser bundles. The frozen five-case inputs and current index remain in this
packet and are independently hashed in `SHA256SUMS`.

The superseded active packet is preserved in [pre-domain-pack-route-replay-20261028/](historical/pre-domain-pack-route-replay-20261028/), with its original receipts, index, case payloads, and checksum list. Earlier historical cohorts remain under `historical/`.

This is bounded source-built evidence for five verifier cases and stated host
controls. It does not qualify an installed SDK archive, a release, every
Dataset semantic, or declaration retirement. See the sibling [Security And/Or
current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
