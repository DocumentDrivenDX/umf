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

After the V4 semantic-error facade fix, Node, Bun, and real headless Chromium
replayed the five unchanged frozen predecessor cases through the source-built
V4 default route and matched the frozen TypeScript outcomes and errors. The
fresh compiled artifacts and their complete implementation source closure are
bound to the immutable [`build-manifest.json`](build-manifest.json). The
harness deterministically inventories `src`, `crates`, both core bindings,
`spec`, `.cargo`, relevant root toolchain/build configuration, and the explicit
frozen packet/contracts; it excludes build caches and rejects symlinks. It
captures source pins before compilation and rejects source drift before writing
the manifest. Replay verifies the exact source closure and all six artifacts
before executing either route. Negative controls cover transitive Rust source
drift, build-time source drift, and stale compiled artifacts.

The build source-closure SHA-256 is
`fe43b2381febcef45413b0b2d4dd218cdd983f513c8493f1b4605f81ebd2d12d`; the
manifest SHA-256 is
`cc64757207ebe4416ae6e06d8da15c7286cf14ef8746c024b1229a2062e8ec49`. Its six
artifact pins are the Node addon, WASM module, WASM glue, TypeScript reference
bundle, Node bundle, and browser bundle. The private build directory used for
replay was `/private/tmp/compact-v4-build-semantic-20261027a`.

All five frozen case payloads remain byte-identical to the prior cohort. Their
SHA-256 values are recorded in `SHA256SUMS`; the historical pre-metamodel index
remains at
[`historical-index-pre-metamodel-refresh.json`](historical-index-pre-metamodel-refresh.json).
The current [index](index.json) updates only source-closure pins for the two
schema files after the separate byte-for-byte refreeze.

Node 26.3.0 and Bun 1.4.3 each passed all five cases and dispatched 14 native
Rust calls. Chromium 153.0.8010.12 passed all five cases, loaded the exact
manifest-pinned WASM, and had no Node globals. The separate R5 semantic-types
Chromium assertion also passed 16 cases with public `UmfError` identity and no
Node globals using this build's browser bundle and WASM.

Receipt SHA-256 values:

- Node: `06e084a562c9fcc01fd6142335e105c2bdd0cad7334b8cb47a6a01030692399a`
- Bun: `4676eefb98115e43911d8f8326bc6d96a3e02250816cc3baad4e0f1d1acaabf2`
- Chromium: `b72ddea19361976cc42b30a0fb5dc88db1b157d565c07d1624a75f4dab15400b`

For each case, reference results match frozen outcomes and default routes invoke
the corresponding Rust implementation. Malformed receipts stop before later
argument traversal; stale verification copies current before expectedInput;
caller Proxy `ownKeys` failures retain object identity. The evidence is bounded
to these five compact verifier cases and the listed host controls. It is not
installed SDK archive/release qualification, complete Dataset semantics
evidence, or declaration-retirement evidence. The prior source/build cohort is
preserved, with its hashes, in
[`historical-pre-semantic-error-fix/`](historical-pre-semantic-error-fix/).

Run `--build <fresh-private-output-dir>` once, followed by Node, Bun, and
browser replay modes against that same directory. See
[`compact-dataset-verify-v4-source-replay.mjs`](../../../../../../scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs).
