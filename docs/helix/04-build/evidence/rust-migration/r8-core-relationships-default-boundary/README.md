---
ddx:
  id: umf.evidence.rust-migration.r8-core-relationships-default-boundary
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-relationships
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Core relationship default-boundary replay

The Node and browser V4 roots now route `inspectCoreRelationships`,
`lookupCoreRelationship`, `declareCoreRelationship`, and
`verifyCoreRelationshipOperation` through the staged Rust relationship binding.
`./reference` remains the TypeScript predecessor. The staged host boundary
copies one operand at a time and lets Rust admit/validate each stage before the
host reflects on the next operand. Invocation handles are one-use.

The frozen [`predecessor.json`](predecessor.json) contains eleven exact
outcome/error/reflection-trace cases. Its SHA-256 is
`1122fc4d019f055570ea72baf88788818091dd513c05f9070624cba15dedb71e`; the
capture script SHA-256 is
`59a1e2ef6d5617c48c2be07e97f22f7a72cd46c74d29cab12aca600d1c2e2936`.
[`bun-replay.json`](bun-replay.json) and [`node-replay.json`](node-replay.json)
each record 11/11 exact parity, including host admission order. Node ran the
packaged entry using a Node-target bundle of the TS harness because direct
Node ESM cannot resolve the harness's extensionless TS fixture imports. The
generated `/private/tmp/umf-r8-relationship-replay.mjs` SHA-256 is
`c9ad6d44ea3566210c63c32087ecddbd030e0564d167a06f895df6367e951e40`.
[`browser-replay.json`](browser-replay.json) records 11/11 exact parity in
Chromium 153.0.8010.12, with `process` and `Buffer` absent. All three runtime
replays used the private package produced at
`/private/tmp/umf-r8-relationship-candidate-dist`.

Build and replay commands from the repository root (toolchain paths pinned for
the private build):

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin \
UMF_RUST_DEFAULT_BUILD_ONLY=1 \
UMF_RUST_DEFAULT_DIST=/private/tmp/umf-r8-relationship-candidate-dist \
bun scripts/package-sdk-rust-default.ts

UMF_R8_RELATIONSHIPS_NODE_ENTRY=/private/tmp/umf-r8-relationship-candidate-dist/umf-node.js \
UMF_R8_RELATIONSHIPS_NODE_RECEIPT=docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/bun-replay.json \
bun scripts/rust-migration/r8/relationships-default-route-parity.ts

bun build scripts/rust-migration/r8/relationships-default-route-parity.ts \
  --target=node --outfile=/private/tmp/umf-r8-relationship-replay.mjs
UMF_R8_RELATIONSHIPS_NODE_ENTRY=/private/tmp/umf-r8-relationship-candidate-dist/umf-node.js \
UMF_R8_RELATIONSHIPS_NODE_RECEIPT=docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/node-replay.json \
node /private/tmp/umf-r8-relationship-replay.mjs

UMF_R8_RELATIONSHIPS_WASM_PKG=/private/tmp/umf-r8-relationship-candidate-dist \
UMF_R8_RELATIONSHIPS_BROWSER_RECEIPT=docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/browser-replay.json \
bun scripts/rust-migration/r8/relationships-default-browser.mjs
```

Package and replay artifact digests are pinned in the receipts. The builder's
manifest has SHA-256
`23e4d3ca3dc86163857559ea78d9af5608d49e505ac797aa33b86bca4805d374` and
reports package version `0.5.6`, source closure
`64a1c040fba85e67521eb0f636f08e0711278bd09347beab96e18dfc1459665b`, and
captured live source closure
`2e625a1713b6860c2abfac949bf643cf4bfac8b728496eec586f1583f788d9d2`. It
also reports eleven generated inputs transformed in its private snapshot and
`releaseStatus: private-r7-default-route-qualification-source-drift-not-publishable`.
This is private route qualification for the captured candidate only. It is
not a release-fixed-point result or publication authorization; the generated
source drift must be reconciled and a new fixed-point package replayed before
release claims.

## Regenerated fixed-point candidate

The follow-up used the repository generators to refresh exactly the eleven
inputs listed by the earlier package manifest: `bun run build:metamodel` and
`bun scripts/actions-plan-identity.ts`. The generated diff contains those
eleven files only. Both generators' check-only modes pass, as do
`bun run typecheck`, the focused relationship wire test (2/2), the Node/Bun
relationship wrapper tests (6/6), and `git diff --check`.

A new package at
`/private/tmp/umf-r8-relationship-fixed-point-dist` reports
`sourceClosure.transform.status: fixed-point`, zero transformed inputs, and
identical live/captured source closure hashes
`64a1c040fba85e67521eb0f636f08e0711278bd09347beab96e18dfc1459665b`. Its
manifest SHA-256 is
`266731cf3139f33b060b13a7581e8536a6a66266c8fb71832d2a7c8de0adc418`. The new
[`fixed-point-build.json`](fixed-point-build.json) records generated file
hashes, focused checks, and package artifact hashes without replacing the
earlier diagnostic candidate's receipts.

The package command was
`PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:/opt/homebrew/bin:/usr/bin:/bin UMF_RUST_DEFAULT_BUILD_ONLY=1 UMF_RUST_DEFAULT_DIST=/private/tmp/umf-r8-relationship-fixed-point-dist bun scripts/package-sdk-rust-default.ts`.

The fixed-point package passed the same eleven cases under Bun 1.4.3
([receipt](fixed-point-bun-replay.json)), Node 26.12.1 ([receipt](fixed-point-node-replay.json)),
and Chromium 153.0.8010.12 ([receipt](fixed-point-browser-replay.json)); each
has exact outcome and host-admission-order parity, and Chromium reports no
Node globals. Node again used the bundled Node-target harness described above.
The package manifest still marks the artifact `private-r7-default-route-qualification-not-publishable`.
This closes only the generated-input fixed-point and relationship-route
private replay checkpoint; it does not qualify or publish a release.

## Historical fixed-point archive replay — 2026-10-25

This earlier private archive replay used
`/private/tmp/umf-r8-inspector-admission-20261025/umf-sdk.tgz` and has SHA-256
`9a05bf2957775b90a97e26d7e1e1495916f0897fc836bb47f4ec91877c5acb0e`. It is retained as historical evidence and is superseded for the current source state by the final archive replay below. Its
outer manifest lists 1,788 package members; every member digest passed. The
inner Rust SDK manifest reports a 3,431-file source closure at
`85d43b8aae4cd7546e14a864d99a723fe2d68bbdc7a24b1204bcb42273d2499e`, the
same captured-live digest, zero generated-input transforms, and matching
hashes for every source input in this checkout. The package routes Node to
`dist/umf-node.js`, browser to `dist/umf-browser.js`, and `./reference` to
`dist/umf.js`. Archive and source preflight details are in
[`archive-source-preflight-20261025.json`](archive-source-preflight-20261025.json).

The existing frozen 11-case Core Relationships boundary packet passed exactly
in installed Bun 1.4.3, Node 26.12.1, and real Chromium 153.0.8010.12. All
outcomes and host reflection/admission traces match the predecessor; Chromium
reports no `process` or `Buffer` globals. The per-host receipts pin each
installed entry/WASM artifact and the current operation source hashes:
[Bun](installed-archive-bun-20261025.json),
[Node](installed-archive-node-20261025.json), and
[Chromium](installed-archive-chromium-20261025.json). The packet SHA-256 is
`1122fc4d019f055570ea72baf88788818091dd513c05f9070624cba15dedb71e`.

This is source-coherent private route evidence for these four operations and
the recorded host cohort. It does not retire ledger rows, qualify the complete
SDK, establish broader operating-system or architecture parity, qualify
`./reference`, or authorize publication.

## Final source-current fixed-point archive replay — 2026-10-25

The final private archive at
`/private/tmp/umf-r8-provenance-final-20261025/umf-sdk.tgz` has SHA-256
`591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711`.
Archive/member/source preflight passed: all 1,787 package members matched the
outer manifest; the Rust SDK source closure has 3,431 inputs, fixed-point
status, zero generated-input transforms, and closure SHA-256
`65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d`, matching
all captured live inputs and a recomputation over this checkout. Details are
in [the final archive preflight receipt](final-archive-source-preflight-20261025.json).

The existing frozen 11-case Core Relationships packet passed in Bun 1.4.3,
Node 26.12.1, and real Chromium 153.0.8010.12. All hosts matched exact
outcomes and host-admission traces; Chromium reports no `process` or `Buffer`
globals. Node used a Node-target bundle of the TS replay harness because
direct Node ESM cannot resolve its extensionless TS fixture imports. Receipts:
[Bun](final-archive-bun-20261025.json),
[Node](final-archive-node-20261025.json), and
[Chromium](final-archive-chromium-20261025.json). The packet SHA-256 remains
`1122fc4d019f055570ea72baf88788818091dd513c05f9070624cba15dedb71e`.

This is private archive evidence for the four recorded operations and these
host versions. It does not qualify the complete SDK, establish broader
operating-system or architecture parity, qualify `./reference`, or authorize
publication.
