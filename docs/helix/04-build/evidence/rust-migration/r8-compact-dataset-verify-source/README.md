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

The five-case packet contains live TypeScript R5 freezer outcomes. The refreshed [current source index](index-current.json) has SHA-256 `e734676b0e248f4d197c5b4c8bb4bf4650d0386e2cf62f952616ed025825a71f`; all five current frozen payloads remain byte-identical to their prior copies. Historical `index.json` remains intact. Payload and receipt hashes are recorded in [`SHA256SUMS`](SHA256SUMS).

The fresh source build is bound to the immutable [build manifest](build-manifest.json), SHA-256 `50f19d4e492f8f00afbfe9a91ccfe94e093839703adfbd8b72b44e59f18aa5c8`, with source closure `8ef3b7d6e5eec0e64dbd3f9b7d1170602de3882dbc0db5173cb037cbe33bb711` across 1,958 files. It was built at `/private/tmp/umf-r8-r8-replays-final-20261027` using Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3. The six pinned artifacts are Node addon `c69aed83fb652175c3924c6d857c1dad6e8168601cebd73d99b44cc59d90cf9b`, WASM `20980c76c0d33ad3c43de5110e6aa012405ff35d1bf8923c0599e1afef450205`, glue `ea57d12a681ac63b7ccd6109c217afab539044bbd57488fdac0edf7d94ec9329`, reference bundle `6824c099a11def3bed3729b27ea34b6e8c9a02e0b13dd702ca8977b2f826df30`, Node bundle `85614ac311dc2262a0ae1d14a79e409998de558209f6f0f2bc317e05c05e5ce7`, and browser bundle `d385c44b4c76013c9bf6563c770fba278267d7a44c18da1abde26459972d9289`. Every replay verifies the source closure and all six artifact hashes before execution.

Node 26.12.1 and Bun 1.4.3 each passed all five cases with 14 Rust calls. Real Chromium 153.0.8010.12 passed all five, requested the pinned WASM, made 14 dispatches, and had no Node globals. Receipt SHA-256 values are Node `50dff5f1959a03c29e2009e883186f38e24180f7d2f88e273833f0058eda769e`, Bun `d8c828ddd56b8776a275fb537fa359ca5c051fb3bf212ca2a39ccf2203f1dd88`, and Chromium `0f7e25e4faa601ff635379a0d3bb71147bb022f37ac82b6cf251e7b38916d53a`.

The earlier current-source cohort is preserved under [`historical/pre-index-current-refreeze-20261027/`](historical/pre-index-current-refreeze-20261027/). This remains bounded source-tree evidence for the five verifier cases and stated host controls; it does not qualify an installed SDK archive, a release, every Dataset semantic, or declaration retirement. To reproduce, run `compact-dataset-verify-v4-source-replay.mjs --build <fresh-private-output-dir>`, then `--host node`, `--host bun`, and `--browser` against that same directory. The browser replay uses a temporary loopback server.
