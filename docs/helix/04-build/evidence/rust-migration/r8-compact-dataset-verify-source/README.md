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

The live TypeScript predecessor generator was rerun from the current source. All five regenerated payloads are byte-identical to the previously frozen outcomes. `index-current.json` was refreshed to the current schema hashes (SHA-256 `ce4bb1f351e8eb03d6c97fb39f70e2dfb917463a806d86720a94d3df3c561beb`); the five payloads are pinned by `SHA256SUMS`.

Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed all five verifier cases. Node and Bun each recorded 14 Rust calls. Chromium loaded the pinned WASM and ran without Node globals. All three receipts verified the same final source-built manifest at `/private/tmp/umf-r8-copyjson-final-refrozen-20261027/compact-dataset-verify-build-manifest.json` (SHA-256 `7acacd541cb89814ca04f20d3443ac3b166290fac9d4a8bd1173876e8f5d0d87`) and source closure SHA-256 `58faa724a3ca71315ab8337a8bc060841ba6a882797a8bbb85a22025f29b270b`. It pins the Node addon, WASM binary/glue, and reference/Node/browser bundles.

The superseded top-level receipts, manifest, and indexes are retained in [`historical/pre-final-text-frame-refresh-20261027/`](historical/pre-final-text-frame-refresh-20261027/); earlier cohorts remain under `historical/`.

This is bounded source-built evidence for five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement. See the sibling [Security And/Or current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
