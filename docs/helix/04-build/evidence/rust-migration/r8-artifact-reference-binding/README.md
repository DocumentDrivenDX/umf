---
ddx:
  id: umf.evidence.rust-migration.r8-artifact-reference-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: umf.evidence.rust-migration.r8-artifact-reference-core
      kind: informed_by
---

# Opt-in artifact-reference binding

The private `artifactReferences/inspect` wire operation exposes the Rust
diagnostic pass through Node-API and WASM bindings. It accepts a tagged
UTF-16 `umf.core-wire/1` request containing `op` and `pack`, and returns
ordered diagnostic strings. Callers must structurally validate the domain
pack first; this operation does not perform that validation or fetch referenced
content. It does not replace `inspectArtifactReferences` on either package
root or the explicit TypeScript reference route.

The opt-in profile admits at most 64 artifact collections, 1,000 schemas and
10,000 reference entries after ordinary tagged-wire decode and tree copying.
It returns `RESOURCE_LIMIT` beyond those dimensions. Decode, copy and encode
use the ordinary core work/depth/value accounting and optional host control;
the diagnostic pass itself is bounded by the profile dimensions rather than
charged step by step. This is a narrower profile than the full structural
schema, not general resource parity.

Sol independently reran two focused Rust wire tests and four Bun Node-addon
tests. The Node differential structurally validates its pack first, then
matches TypeScript diagnostic order, duplicate handling and a lone-surrogate
source key. Negative controls cover a missing pack, host work refusal and
profile-cap refusal. The Node addon builds, and the WASM crate checks for
`wasm32-unknown-unknown`; Chromium/WASM runtime parity and installed-package
qualification have not been run for this binding. No default route changes.

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/artifact_references.rs` | `1472213c2c6cd3448d2a9da840b54e1e7f64dc2a538cc3f0a3c2e8ace8851d65` |
| `crates/umf-core-wire/src/artifact_references_binding.rs` | `649c43b988637ed0d8950612c3fcb737f64453852cca795d0b6e4a39f69e4aaa` |
| `crates/umf-core-wire/src/lib.rs` | `f6f3c31794976874f213dcb07dde4f6c3be77ff85fec118a154508a92131c5de` |
| `bindings/core/node/index.js` | `e2ca62ddf26d8e6aca16006160d0cb37607ccfcdcb7fc3a7e0627c572ff468cc` |
| `bindings/core/node/index.d.ts` | `348301d3c1957f28d046e3dce8385aadc743f45d76c40e1b1e7ba6771aa4b525` |
| `bindings/core/node/src/lib.rs` | `9f796c5d3ea77a3ed0ca94bd01b7eb5fda0c55ab29ebe13a0fe2581ebc9c5c3e` |
| `bindings/core/wasm/index.js` | `8b266ca45427f676a2f57459e4ad83db857f2e95893ecbb18565adca4407001c` |
| `bindings/core/wasm/index.d.ts` | `812d7bc75f6a5293acfb11e5613e31bef2069a3b295102376254fac432a4eb0e` |
| `bindings/core/wasm/src/lib.rs` | `1afd5f9c15be80c9f26d78d1a8db13ad8196abba42a4f2aa9bad1d4b2d19495f` |
| `bindings/core/node/tests/artifact-references.test.js` | `897b0f9fc897ac038fb074e29129132d1e0934d0a91513794573941a7564d493` |
