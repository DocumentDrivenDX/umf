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

# Compact Dataset verifier V4 source replay

This current packet replays the five frozen Compact Dataset verifier cases against a fresh source-built Rust V4 default route and the TypeScript reference route. The current predecessor index SHA-256 is `74854e253f79e5cbbdfa1d939f7271a612332b4f2cc92fafab7641de2994c0d0`; all five case payloads were revalidated against that index during each host replay.

The fresh source build lives at `/private/tmp/r8-compact-security-replay-20261027/dist`. Its manifest SHA-256 is `43a735c629f357ca85d99708055a86c38a73522375ac7334eae79d7138ad8b3e`, with a 1,975-file source closure SHA-256 `ca6d3b7c893833073d2cd79a8a13d3909f0428dd16c6305f9115d6c2a33b2c21`. The closure captures `src/extensions/actions/plan-identity.ts` at SHA-256 `ce429d59eec48618584f52a7390b4fec9c2633ab6441dfa0d60ce705062a615f`. It was built with Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. Node v26.3.0, Bun 1.4.3, and Chromium 153.0.8010.12 replays each verified the complete source closure and six built artifact hashes against this manifest before execution.

Node v26.3.0 and Bun 1.4.3 each passed all five cases with 14 aggregate Rust calls, including host controls. Real Chromium 153.0.8010.12 passed all five with 14 aggregate WASM dispatches, requested the pinned WASM, and had no Node globals. Receipt SHA-256 values are recorded in [`SHA256SUMS`](SHA256SUMS). Current files and retained historical cohorts are pinned there; earlier current-source cohorts remain under [`historical/`](historical/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
