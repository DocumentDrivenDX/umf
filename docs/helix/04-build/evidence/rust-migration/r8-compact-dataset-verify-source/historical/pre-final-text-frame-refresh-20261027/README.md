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

Node v26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each passed all five frozen verifier cases. Node and Bun each recorded 14 Rust calls. Chromium loaded the pinned WASM, recorded dispatches, and ran without Node globals. All three receipts bind the same fresh build manifest at `/private/tmp/umf-r8-copyjson-sparse-rrf-20261027/compact-dataset-verify-build-manifest.json` (SHA-256 `3fd773d003c1262542a404dbfcc83fbc6e8f444e484a8ec4035dbf281d5a8ece`) and source closure SHA-256 `757c36080591f98244010510a60ec20063135233aaf88de5114216bfe3da15aa`.

The live TypeScript predecessor generator remains byte-identical to the frozen payloads and current index. The superseded top-level receipts and build manifest are retained in [`historical/pre-copyjson-sparse-rrf-refresh-20261027/`](historical/pre-copyjson-sparse-rrf-refresh-20261027/); earlier cohorts remain under `historical/`.

This is bounded source-built evidence for five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement. See the sibling [Security And/Or current-source replay](../r8-security-and-or-v4-source-replay-current/README.md).
