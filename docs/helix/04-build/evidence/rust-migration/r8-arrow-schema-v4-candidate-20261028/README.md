---
ddx:
  id: umf.evidence.rust-migration.r8-arrow-schema-v4-candidate
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-arrow-typescript-predecessor
      kind: informed_by
---

# R8 Arrow schema V4 candidate route

This candidate binds the five schema JSON operations in CONTRACT-016 to the
existing Rust core wire engine for the V4 Node and browser entry points:
`importArrowSchema`, `inspectArrow`, `exportArrowSchema`, `getArrowNode`, and
`proposeArrowNodeEdit`. The V4 Node and browser root source selects these five
Rust bindings. The explicit `./reference` entry remains TypeScript and was
replayed independently. The bounded offline installed-package receipt is
[`darwin-arm64-installed-receipt.json`](darwin-arm64-installed-receipt.json).
It pins the exact fixed-point archive and source closure; the ledger gap stays
open, and no declaration is retired.

The adapter restores public `UmfError` instances only for errors branded by
the shared Node/WASM `isNativeUmfCoreError` guard and the Arrow/JSON Schema
codes. Node and WASM Arrow failures are now created by the branded native
error factory, including disposed-engine failures. Non-native errors and
source exceptions pass through unchanged. The binding does not implement
Arrow IPC, record batches, or data behavior.

The frozen R5 predecessor packet SHA-256 is
`f408879504a24999d06619182ccf8f9d0ffeeedf93f469003c6572b768bf7200`.
Its 52-schema corpus passed all 260 operations in Node 26.12.1, Bun 1.4.3,
and real Chromium 153.0.8010.12. Focused parity passed 16 imports and 26
operations in Node, Bun, and Chromium. These cover exact error code/path/message,
public `UmfError instanceof`, output JSON and native output bytes, source
immutability, unknown/future types and extension content, exact numeric
lexemes, metadata order, JSON Pointer reads and edits, unknown UMF
representation refusal, and operation error controls.

The explicit reference entry also passed the complete 52-schema/260-operation
corpus in Node, Bun, and Chromium. This independently pins the existing
`./reference` behavior and shows that selecting the V4 default does not rewrite
that route.

The options test supplies a getter for `id` and verifies it is read once before
the malformed JSON result. A separate throwing options getter passes the exact
thrown object through. A Proxy around an imported source object throws a
sentinel from `ownKeys`; its identity is preserved by `inspectArrow` in Node,
Bun, and Chromium. The frozen predecessor's dedicated
`proxy-reflection-throw-identity` row is intentionally skipped: that source
exception is host-specific and cannot be represented in its Rust JSON-wire
packet. The live host control above covers identity without treating that
frozen row as transferable evidence.

The Chromium harness first initializes the checked WASM package and binds the
V4 Arrow adapter. It then imports the combined-build `dist/umf-browser.js`
root and its same-directory `dist/umf_core_wasm_bg.wasm`, plus the built
`dist/umf.js` reference entry. Real Chromium passed 260 corpus operations for
each built root and for the separate adapter/reference entries. Focused
adapter tests passed 16 imports and 26 operations. Public browser-root
controls confirmed the `options.id` getter is read once and source Proxy trap
identity is preserved. `process` and `Buffer` are absent. The built browser
root SHA-256 is
`b3a16851565572259905bfa048357eae9adb443cbc6fd81a480fe267211adc09`, the
reference root is
`79c754cae9523f87d67467a09ef248e93ff1279411e8f893f59b76c24fe505bc`, and
the root's WASM is
`ec524af40dbc940e1960a8e955b01cdc046b0e50e6a838e957a537d705658828`.
This is a successful combined-build `dist` replay, not an installed SDK
archive receipt; installed default-route qualification remains open.

A later exact-source fixed-point SDK archive (SHA-256
`d110587e1066921afffe65fbe9ffbfe194524fd5e676412cb1db0632577e0370`)
captured 3,668 inputs at source-closure SHA-256
`fcc5649f22be059ae2c13c017c824f4bfe0c5e6993a212be1c4df89b81c3ca99`
with zero generated transforms. Its built `umf-node.js` and `umf.js` each
passed the same 52-schema/260-operation packet plus 16 focused imports and
26 focused operations on Node 26.12.1 and Bun 1.4.3. Extracting that archive
under a temporary `node_modules/@umf/core` directory, without resolving its
declared dependencies, also passed both `@umf/core` and
`@umf/core/reference` package exports on those hosts with the same counts.
Real Chromium 153.0.8010.12 passed the final built V4 browser root and
reference root at 260/260 operations each, using their matching WASM binary;
the focused imports and operations, one-read options getter, Proxy exception
identity, and absence of Node globals also passed. The final browser root
SHA-256 is
`baf1fecfc976d3ebfae64227b5eb06f5dc6fda5272785d46356ee1df6bc3a4f0`,
reference root SHA-256 is
`069d318ec8508ac5f1fbf1bc9b7c9cd9546b5c767b858996509c38319f355d56`,
and WASM SHA-256 is
`08ab99f3d12de6b8b484412e2123d0e7b2dfe7c0ddf4efd2f0b77a3917f7d17f`.
For this final archive replay, a temporary copy of the checked Chromium
harness repointed only its three built-asset reads to the final8 dist; its
SHA-256 is `026e32173b2cc1c51eaa85c387c704f960ceb9c71be742bf06ab29da89377539`
and the repository harness SHA-256 is
`c1c5e9ce1df3d784661558e9b1f55d61fb29338f08628ce852e976fde0c81ba2`.
These are archive-extracted and built-root observations, not a complete
dependency-resolved package installation or default-route retirement.

Rust wire checks passed with
`PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-arrow-r8-target cargo test --locked --offline -p umf-core-wire --test r8_arrow_schema_wire`
(2 passed). `bun run typecheck` passes, including the generated tools project.
The dependency-resolved offline installation harness checks the current
source closure, every packaged asset, the npm lock's exact local archive path
and SHA-512 integrity, the installed package identity, Node/Bun default and
`./reference` replay, and Chromium WASM success and refusal. Its receipt belongs
at [`darwin-arm64-installed-receipt.json`](darwin-arm64-installed-receipt.json).
A prior archive reached npm installation but was superseded by the strict
identity-gate fix before full replay. This evidence does not claim
default-route retirement or release qualification.

Candidate source hashes:

- `src/adapters/arrow/rust-default.ts`: `bb03bc474bbd0f706d39509c8e045d5f8f9cb60b1419f991dbf36b725d1adcee`
- `src/index-node-v4.ts`: `661e6b48d436ab0a8457d5ef1547e4befc830a661f819386f24f434502209cee`
- `src/index-browser-v4.ts`: `526f61b6ecb7db3c896295cae2a88f595f1a6fb7cc87c2af102f5cfb2ab2f1a3`
- `bindings/core/node/index.js`: `fe9bc6c33a801d5da01561a30aab0e0b57e321b4844f50e6a2421c53ff968517`
- `bindings/core/wasm/index.js`: `62a4ca08d729416ca83d29a4e247d79435ffc846bb0fcecb174ebcffc6a4cfc7`
- Node/Bun replay: `51cba44a9ea5e18ec2178877a1c95ce87bf77a090f3259f4a86ee3c45d74591a`
- Chromium replay: `c1c5e9ce1df3d784661558e9b1f55d61fb29338f08628ce852e976fde0c81ba2`

The inventory/ledger remains generated by the repository owner. The status is
draft until the exact ledger retirement gates and independent release cohorts
are reviewed.
