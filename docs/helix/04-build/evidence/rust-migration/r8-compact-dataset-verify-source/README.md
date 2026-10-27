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

This current five-case packet replays the live TypeScript R5 freezer outcomes against a fresh source-built Rust V4 default route. The refreshed [current source index](index-current.json), SHA-256 `da11a3227cb3916ffa14c20fcf3247692f02d5170df8527ee8ce87652a284672`, binds the cases; all five frozen payloads remain byte-identical to their historical copies. Historical `index.json` is preserved.

The build is bound to the immutable [manifest](build-manifest.json), SHA-256 `8b3a7fa5d854f709d6ca7888758e7099ef9b8c5707f0722bdc16f64735890cf2`, with source closure SHA-256 `0f8f116988ba2da74a13085790824cb9a4f2dc8deda9a5abdb2a594aa14f20dd` across 1,958 inputs. It was built at `/private/tmp/umf-r8-compact-postmerge-v2-20261027` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. The manifest records hashes for the native addon, WASM and glue, reference, Node, and browser bundles. Each receipt verifies this source closure and all six compiled artifacts before execution.

Node 26.3.0 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Real Chromium 153.0.8010.12 passed all five cases with 14 WASM dispatches, requested the pinned WASM, and had no Node globals. Receipt SHA-256 values are Node `1f5b6f0e676b97d7e8bff5f6c295ecca0409f717c5c871413580b1b3a15bded9`, Bun `f6c96d65002861510ba4cb4394bc73b0d6ef1f371b8a5803677bd6aa041cc8c3`, and Chromium `92226474377b2c117419818b04ecf90e9effbf8414482603e83606d4e25a3d8e`. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS). The prior current-source cohort remains under [`historical/pre-index-current-refreeze-20261027/`](historical/pre-index-current-refreeze-20261027/).

This is bounded source-tree evidence for the five verifier cases and stated host controls. It does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement.
