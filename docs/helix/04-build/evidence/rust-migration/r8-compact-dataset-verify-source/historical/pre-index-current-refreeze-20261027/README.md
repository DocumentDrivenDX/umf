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

This current-source replay covers the five frozen predecessor cases through the
V4 default route. It includes the opt-in N-API `readJsonValue` primitive binding
and the `src/access` facade in the pinned implementation closure. The fresh
Node/WASM build and all 1,952 source-closure file hashes are bound to the
immutable [`build-manifest.json`](build-manifest.json). The closure includes
`bindings/core/node/src/read_json_value.rs`
(`e9b62271d474490e09c85736137cb8975cebcd6283217a871c4c2f6c39f1595f`) and
`src/access/read-json-value-ordinary.ts`
(`e1af34e745dec592851ff8eb88964a4bc8417f1f3d5fa96aacf0e327d6ffffd4`). It
walks implementation roots, bindings, specs, and configuration, excludes build
caches, and rejects symlinks. The builder pins sources before compilation and
rejects source drift before publishing its manifest. Each replay checks the
exact source closure and all six compiled artifacts before executing.

The build used fresh private output at
`/private/tmp/umf-r8-compact-v4-read-json-value-20261027a`. Its source-closure
SHA-256 is
`d0d54682e6bc91b1eaa31d55d2b425b0bfbe706b6e2fe3be966422cccd2cc264`; the
build-manifest SHA-256 is
`9d70a420cc76a308bd42d3984993bc616919e718f3073bceb332822625b363cc`. The six
artifact SHA-256 values are recorded in the manifest: Node addon
`080f647ff8eb37a5182b916c0be10b78561e1f60aad9837323cfa5a9b53d8aad`, WASM
`111007da675e270f072044dff0e7e39e6d5013bca2aca71af91fd22e177fad8a`, WASM glue
`ea57d12a681ac63b7ccd6109c217afab539044bbd57488fdac0edf7d94ec9329`, reference
bundle `a05e8167c27302982207782ea08776daa57390756cd5257926768a8a444bffbf`, Node
bundle `69313444952873614cd43afb7b3394d5554fdce8015a3cb8eebacc31c141e2a8`, and
browser bundle `99559dab1eaebc957b2061012d0ae2ea10e1b44a2203fee96ab03a957045c8d4`.
The manifest records Rust/Cargo 1.90.0, wasm-bindgen 0.2.100, and Bun 1.4.3.

Node 26.12.1 and Bun 1.4.3 each passed all five cases and made 14 native Rust
calls. Chromium 153.0.8010.12 passed all five cases, loaded the manifest-pinned
WASM, and had no Node globals. It made the expected WASM calls for every case.
Each receipt pins the same source closure and six artifacts. The exact receipt
hashes are Node
`c16c4252aadcbfce9735b7f0f7d46f62f5c6d96ff7f9d20d4c77c0a3c52c3d4a`, Bun
`a2b4097e5e1299f63dc33f9ae8a84eb219009bc76d05075a73ed032a87e2795b`, and
Chromium `e8f0a5c9840b57a7356831dd146affb79bf55fa1f2c5f7e334f9c9011ccc19d8`.

The five frozen payloads remain byte-identical. Their hashes, the current
manifest and receipts, and preserved historical artifacts are in
[`SHA256SUMS`](SHA256SUMS). The prior pre-metamodel index remains available as
[`historical-index-pre-metamodel-refresh.json`](historical-index-pre-metamodel-refresh.json).
The immediately prior source cohort, before the final action-plan identity regeneration, is preserved in
[`historical-pre-final-action-plan-identity/`](historical-pre-final-action-plan-identity/). The earlier pre-binding cohort remains in
[`historical-pre-read-json-value-binding/`](historical-pre-read-json-value-binding/).

This is source-tree evidence for the listed compact verifier cases and host
controls. It does not qualify an installed SDK archive, a release, every Dataset
semantic, or declaration retirement. Run `--build <fresh-private-output-dir>`
once, then Node, Bun, and browser replay modes against that same directory. See
[`compact-dataset-verify-v4-source-replay.mjs`](../../../../../../scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs).
