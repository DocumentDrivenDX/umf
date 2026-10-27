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

The five-case packet is the byte-identical result of the live TypeScript R5
freezer. Its current source index is [`index-current.json`](index-current.json)
(SHA-256 `373c3f672e97ec9a2764a65a64acc6e3f75254503e789333937251ce9587899b`);
the historical `index.json` remains intact. All five frozen payload hashes are
recorded in [`SHA256SUMS`](SHA256SUMS). The newly refrozen payloads matched the
committed payloads byte for byte before the current index was refreshed.

The fresh source build is bound to the immutable
[`build-manifest.json`](build-manifest.json): manifest SHA-256
`2d204008769e77edbb8d4c78eee7cac2d589957dd9441f9f62303f0996b84cf3`, source
closure SHA-256 `fe21235aaf399b3adf616ef5ce4d6c9a91cafe75dd1b5e1ed22b084d63edb832`
across 1,958 files. It was built at
`/private/tmp/umf-r8-compact-v4-stable-20261027d` with Rust/Cargo 1.90.0,
wasm-bindgen 0.2.100, and Bun 1.4.3. The manifest pins all six artifacts:
Node addon `56215b6758d3e80777e0f99f3924929e490886467e64796a931ae85aac7162f0`,
WASM `3a00c562199d4331e48492b8925a229996d0e8dde8486374c8efba6d904101c9`, glue
`ea57d12a681ac63b7ccd6109c217afab539044bbd57488fdac0edf7d94ec9329`, reference
bundle `119ab7c142cc7a82d9eb9c867068b6fd4aa6fae4915a14894b4db84d23e6d56c`, Node
bundle `8faf7630972c52abceaa03fcf2f9d2cd6874ed6cf1e3f162058f7e820548e152`, and
browser bundle `ac4df5cba8234341945faf05126bba3a7e639046a3cf6fb9358c5c00b6f951ec`.

Node 26.12.1 and Bun 1.4.3 each passed all five cases with 14 Rust calls.
Real Chromium 153.0.8010.12 passed all five cases, loaded the pinned WASM,
made 14 dispatches, and had no Node globals. Each receipt verifies the same
source closure and all six artifacts. Receipt SHA-256 values are Node
`f5f0aec6f29eb6976717b051a200d6c5626c7a4b2472226f36159d1cc8ce4dcc`, Bun
`de10faeac830940b585517fdd07ddfa5b432775787f562b4ac2a88097b381137`, and
Chromium `37e5d715a2305c5237fcfafbcbd66f0801cfc39a918c8d0fc7e2b2dc3eef2781`.
The prior current-source cohort is preserved under
[`historical/pre-index-current-refreeze-20261027/`](historical/pre-index-current-refreeze-20261027/).

This is bounded source-tree evidence for the five verifier cases and stated host
controls. It does not qualify an installed SDK archive, a release, every Dataset
semantic, or declaration retirement. Reproduction uses `--build <fresh-private-output-dir>`,
then `--host node`, `--host bun`, and `--browser` against that same directory.
The browser replay uses a temporary loopback server.
