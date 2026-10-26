---
ddx:
  id: umf.evidence.rust-migration.r8-extension-id-data
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-907
      kind: informed_by
---

# R8 extension identifier static-data candidate

This packet classifies 63 public `_EXTENSION` exports as direct string-literal
data candidates. The current source AST contains one exact value for each of the
63 names in the default Node, default browser, and explicit TypeScript reference
roots. The values are all distinct and each equals at least one authored
`spec/extensions/**/package.json` `id`. The full name, value, declaration
location, source hash and matching package-manifest paths/versions are in
[receipt.json](receipt.json).

The packet makes no source change and retires no declaration. It leaves
default-root initialization, adapter consumers, registration behavior and public
exports untouched. The R8 ledger therefore remains at 922 logical executable
default-route gaps. These receipts do not claim that adapter behavior is Rust
owned or that a static-data disposition has been approved for the whole module.

Two IDs have several package manifests: `umf.binding` is used by three manifests,
and `umf.security` by two. All exact ID matches are retained; the packet does not
choose a version or canonical manifest. Package identity equality does not prove
that a given package profile is registered or supported.

The source capture resolves declarations by TypeScript AST and checks each
initializer is a direct string literal. It validates the default Node, default
browser and reference route rows against the inventory, current source hashes,
and the condition-aware ledger's inventory digest. It also checks negative
controls: `CURRENT_CORE_VERSION`, generated vocabulary data, `SCALAR_TYPES`,
`scalarTypesForVersion`, profile/limit values, package descriptor factories and
the asynchronously initialized `generatePythonClient` are excluded.

## Host qualification

The canonical private package build completed at a source fixed point with
Rust 1.90.0 and wasm-bindgen 0.2.100. Its source and captured source tree hashes
both equal `6a6bef1345e9f90e0d26dd8841ed27ba2ca6f3db8e6dfd330fb78dd9f42cb14c`,
with zero source transforms. The private output was
`/Users/erik/.codex/worktrees/rust-binding-spike/umf/dist`.

Node 26.12.1, Bun 1.4.3 and real Chromium 153.0.8010.12 each imported the
package default and `./reference` routes from that private output. All three
checked all 63 names and found identical values across routes. Chromium also
confirmed there were no Node globals and no external requests. The exact
captures and qualification scope are in [host-matrix.json](host-matrix.json).

The host harness imports the package's default and `./reference` routes in Node
and Bun, and serves the browser and reference entries to headless Chromium with
an import map. The canonical private build and host captures were run with:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:$PATH \
  UMF_RUST_DEFAULT_BUILD_ONLY=1 UMF_RUST_DEFAULT_DIST=dist \
  bun scripts/package-sdk-rust-default.ts
node scripts/rust-migration/r8/extension-id-data-host.mjs node
bun scripts/rust-migration/r8/extension-id-data-host.mjs bun
bun scripts/rust-migration/r8/extension-id-data-host.mjs chromium
```

Each host check requires all 63 values on both routes to equal the AST receipt;
the Chromium check also requires no Node globals or external network requests.
No host result is inferred from the reference route alone.

## Reproduction

Regenerate the AST receipt after the inventory and source cohort is stable:

```sh
node scripts/rust-migration/r8/extension-id-data-capture.mjs --write
node scripts/rust-migration/r8/extension-id-data-capture.mjs --check
node --test scripts/rust-migration/r8/extension-id-data.test.mjs
```

At capture, the AST check reported 63 direct string exports and 63 unique IDs.
The focused regression passed 3/3 checks. The receipt pins the exact inventory
and ledger digests. Any later ledger recapture or source edit requires refreshing
the receipt; do not change the 922-gap denominator through this packet.

## Semantic boundary

CONTRACT-001 treats vocabulary IDs as exact opaque keys. Unknown extension
content must remain available, and unavailable versions leave semantic
validation incomplete. CONTRACT-005 scopes `umf.ddd` 0.1.0 to an explicit
profile; it does not make DDD UMF's governing worldview. CONTRACT-907 likewise
uses exact extension/version/local-kind identity and says package metadata alone
does not authorize reinterpretation. This packet establishes exact string and
manifest-ID correspondence only. It does not establish registration keys for
every consumer, extension validation, native adapter semantics, or adapter
fidelity under CONTRACT-002 through CONTRACT-011.
