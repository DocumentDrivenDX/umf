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
`/private/tmp/umf-r8-domain-record-current-refrozen-20261027/compact-dataset-verify-build-manifest.json`,
SHA-256 `ef5ff50e418a7060a2df814a226f9f66f7d4d3387a7b6a9d9622b092d9aa7f43`;
source closure SHA-256
`eb0a8cff53696e211dbec2b707751e1d872adc661906084986bad50914923618`.
The manifest pins the Node addon, WASM binary/glue, and reference, Node, and
browser bundles. The frozen five-case inputs and current index remain in this
packet and are independently hashed in `SHA256SUMS`.

The prior top-level packet is preserved in Git revision `5999be676`;
[`historical/pre-domain-record-refreeze-20261027/`](historical/pre-domain-record-refreeze-20261027/)
retains its original checksum list and an exact-revision retrieval note.
Earlier historical cohorts remain under `historical/`.

This is bounded source-built evidence for five verifier cases and stated host
controls. It does not qualify an installed SDK archive, a release, every
Dataset semantic, or declaration retirement. See the sibling [Security And/Or
current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
