---
ddx:
  id: umf.evidence.rust-migration.r8-artifact-reference-core
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
---

# Artifact reference Rust core slice

`umf_core::artifact_references::inspect_artifact_references` implements the
ordered diagnostic pass of `inspectArtifactReferences` after structural domain
pack validation. It reports a duplicate collection identity once, preserves
the order and multiplicity of unresolved source and schema references, checks
source keys as own properties, and retains UTF-16 identifiers, including lone
surrogates. The operation never fetches referenced content.

Sol reviewed the implementation and independently ran
`cargo test --locked --offline -p umf-core artifact_references --lib` using
Rust 1.90.0 and an isolated target directory on macOS arm64: 2 tests passed.
The tests cover three duplicate identities, diagnostic ordering and a lone
surrogate source key. `rustfmt --check` also passed on the changed module.

This core checkpoint was followed by a bounded
[opt-in Node/WASM binding](../r8-artifact-reference-binding/README.md). That
binding has no installed-package differential replay or default-route
selection; Python, CLI and Chromium runtime routes remain unqualified.
`generateArtifactCollectionSchema` and the other domain-pack operations
remain separate executable gaps. The input precondition is a structurally
validated pack; behavior on arbitrary JavaScript host objects is not
qualified.

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/artifact_references.rs` | `1472213c2c6cd3448d2a9da840b54e1e7f64dc2a538cc3f0a3c2e8ace8851d65` |
| `crates/umf-core/src/full_modules.rs` | `7fa6d86bd4dd14b3acefe677421a0e95ea84d644736bf9435a4d7a2b941983af` |
| `src/domain-packs/artifacts.ts` | `de28494b466f7e28851aca0fe39f4ed47080ffa0b0012fee6d3795e3a48372b0` |
