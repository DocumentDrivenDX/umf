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

The five-case TypeScript predecessor was regenerated after its prior index rejected the updated core schema source hash. All five regenerated outcome payloads are byte-identical to prior frozen payloads; only predecessor source provenance/index changed. Superseded current receipts and indexes remain in `historical/`.

A single fresh source build at `/private/tmp/umf-r8-access-rrf-final-build-4` backs this Compact replay, Security And/Or replay, and RRF scorer replay. `build-manifest.json` has SHA-256 `3961bd5542e601c262ea68dfffe0923178bf00a76ef6d54145228d83d9fddba2` and source closure SHA-256 `108829f9bc1afe227b7b1a1adcdb2f2171190464f2cb5c826638338cf3c9928d`. It pins six artifacts, including Node addon, WASM binary/glue, and reference/Node/browser bundles. Rust/Cargo are 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3.

Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed all five cases. Node and Bun each recorded 14 Rust calls. Chromium loaded pinned WASM and recorded dispatches with no Node globals. Receipts bind the same build manifest as the 68-case Security And/Or and five-case RRF replays.

This is bounded source-tree evidence for five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement. See the sibling [Security And/Or current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
