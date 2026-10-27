---
ddx:
  id: umf.evidence.rust-migration.r5-core-semantic-types
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# R5 core semantic type operations

This opt-in Rust module implements `inspectCoreSemanticTypes`,
`getCoreSemanticTypes`, `declareCoreSemanticTypes`, and
`verifyCoreSemanticTypeDeclaration` from active CONTRACT-078. It retains source
and unknown JSON members, requires exact identities and core 0.10.0 for typed
read/authoring, blocks edits to unknown qualifiers, and recomputes declarations
before accepting receipts. Semantic vocabulary resolution, interim extension
APIs, bindings, and default route changes are not included. Registry lookup and
semantic value validation have separate companion evidence in
`r5-semantic-type-registry` and `r5-semantic-value`.

[`frozen-typescript.json`](frozen-typescript.json) records 15 TypeScript
predecessor cases from Bun 1.4.3 and pins the direct implementation, validation,
schema, and core resource files. All 13 pinned predecessor files match the
captured SHA-256 values. The Rust replay compares complete inspection
and declaration envelopes, copied reads, clear refusal details, receipt
recomputation, schema-first malformed receipt refusal, old-version document
refusal, validation-order errors for invalid identity/request inputs, and a
schema-valid receipt whose recomputation must preserve an unknown-qualifier
refusal. Verification propagates recomputation errors and nested meter or
cancellation failures without converting them to malformed-receipt errors.
Receipt verification compiles and checks the versioned operation schema before
recomputation. Source/target copies, diagnostic conversion, element scans,
semantic reference checks, canonical receipt sorting/comparison, and final
receipt copies charge the shared `Context`; the focused suite checks the
invocation meter and cancellation hooks.

The focused Rust replay passed:

- `cargo test -p umf-core --test r5_core_semantic_types --offline`: 2 tests
  passed with the repository-pinned Rust 1.90.0 toolchain.

This is core-only opt-in evidence. CONTRACT-078 describes `inspect` returning
an opaque `legacy` meaning for older core versions, but the current TypeScript
implementation validates the document against core 0.10.0 first, and the
2.0.0 operation schema restricts `source` to core 0.10.0. The frozen 0.9.0
cases therefore return `SEMANTIC_TYPE_DOCUMENT` before the typed-version guard;
the older-core `legacy` case is an upstream contract/source gap and is not
claimed here. Independent Sol re-review, Node/Python/browser/WASM or wire routes,
maximum-budget and allocation-failure boundary studies, and production/default
cutover remain open. Registry/value semantics remain unfinished.

Independent Sol re-review of the four final pinned files checked the complete
Rust operation flow against `src/model/semantic-types.ts`, the versioned receipt
schema, and the 13-source predecessor closure. The prior recomputation error
conversion is gone: a schema-valid receipt now propagates the frozen
`SEMANTIC_TYPE_UNKNOWN` refusal, and a nested meter failure propagates without
becoming `SEMANTIC_TYPE_RECEIPT`. Sol reran the focused Rust suite independently
(2/2), checked all 13 predecessor hashes, and ran `bun run typecheck` after the
unrelated R5 freezer annotation repair. No P1/P2 remains in the bounded four
core operations. The allocation and maximum-budget studies above remain open;
this review does not extend to the remaining semantic-type APIs or host routes.

SHA-256 pins:

- Rust core module: `60558611dbd5c966cd54990c262b6ad7f2dfefec78e58757a9f77ca30d186453`
- focused Rust test: `b4fa897f06f277708da9e68d4041b259edf91ab4f83bd7271602802d53da4bde`
- TypeScript freeze runner: `ac5967ed94ee0745710ce5c2ccdfd6724ea3a6060e2e45925b6c2d1b27206c95`
- frozen predecessor packet: `14fbb89ad5384d1060bba00463f5db3380a8cf9ab7cfe6eab78692783416e6cd`

The packet was produced by `bun scripts/rust-migration/r5/freeze-core-semantic-types.ts`
with Bun 1.4.3. This evidence remains scoped to the four operations listed
above. Node/Python/browser/WASM and wire bindings, broader allocation-boundary
qualification, and default route review remain open.

## V4 default-route source replay

The four core semantic-type metadata operations are now exported directly from
the Rust-backed V4 core-model root in both Node and browser source entrypoints:
`inspectCoreSemanticTypes`, `getCoreSemanticTypes`, `declareCoreSemanticTypes`,
and `verifyCoreSemanticTypeDeclaration`. The exports are the raw model-engine
closures, preserving the established signatures, optional `types` omission,
undefined sentinel conversion, and wire error order without executing the
TypeScript predecessor from the default route.

The default and `./reference` routes each matched all 16 cases in
`frozen-typescript.json`, including omitted versus null declarations, identity
and request admission order, older-version refusal, forged/extra/malformed
receipt refusal, unknown-qualifier recomputation, and unknown qualifier content
preservation. Bun exercised the source entrypoints directly. Node exercised
temporary Node-target bundles produced from the same source entrypoints by Bun.
Real Chromium replayed the browser root from the private SDK bundle and current
WASM artifact; all 16 outcomes matched, with no Node globals present.

Commands:

- `UMF_R5_DEFAULT_SPECIFIER=../../../src/index-node-v4.ts UMF_R5_REFERENCE_SPECIFIER=../../../src/index.ts bun scripts/rust-migration/r5/replay-core-semantic-types-default-node.mjs`
- Build Node-target temporary bundles from `src/index-node-v4.ts` and `src/index.ts`, then run `node scripts/rust-migration/r5/replay-core-semantic-types-default-node.mjs` with `UMF_R5_DEFAULT_SPECIFIER` and `UMF_R5_REFERENCE_SPECIFIER` set to those bundle paths.
- `UMF_R5_BROWSER_BUNDLE=.cache/sdk-distribution/security-and-or-current/umf-browser.js UMF_R5_WASM_PATH=.cache/sdk-distribution/security-and-or-current/umf_core_wasm_bg.wasm node scripts/rust-migration/r5/replay-core-semantic-types-default-browser.mjs`
- `bun run typecheck`
- `bun run check:unified-client-boundaries`

The Chromium cohort used source closure
`704123921b5a5b0902387eb41cad01f2da07306c9a2abc46207fd30a0e41d101`, Chromium
153.0.8010.12, browser bundle SHA-256
`62fd92e8d187beed8be71eadd7ac20b211dc38a8341d38835fbeae0a855aee93`, and WASM
SHA-256 `cdc53f9cfb35856b1715b00d360be866978bc799c5e46034225dc96892114a14`.
This is bounded source-route and private-bundle evidence only. It does not claim
full installed archive acceptance, Python parity, CONTRACT-078 completion,
allocation/budget boundary completion, or retirement of the TypeScript route.
The R8 ledger records current source selection but treats this replay as a
historical cohort: the three host outputs were not preserved as immutable
receipts with build-time source pins, so later source edits cannot inherit its
16-case qualification.

## Fixed installed SDK cohort replay — 2026-10-27

The frozen 16-case packet was also replayed through the four opt-in Core
Semantic Types operations from the exact installed private SDK cohort
`.cache/sdk-distribution/cohorts/b14148f1/umf-sdk.tgz`. The archive SHA-256 is
`372f4c9d91202d904e1a1c736389563d0b023d9bf0fb9a6858e9ed902aa688ad`; its
declared fixed source closure is
`b14148f15a6a3a77864c42e305857a6abb6e0b700aa21a797ed21b0751f97f9c`, with zero
transforms. Package metadata identifies `@umf/core` version `0.5.6`.

Node `v26.12.1` and Bun `1.4.3` each ran the existing 16-case replay against the
archive's `dist/umf-node.js` default root and `dist/umf.js` reference root. Both
reported `status=pass`, `cases=16`, and preservation of unknown qualifier
content. Chromium `153.0.8010.12` ran the existing browser replay using the
archive's `dist/umf-browser.js` and `dist/umf_core_wasm_bg.wasm`; it reported
`status=pass`, `cases=16`, no Node globals, and unknown qualifier preservation.
The default route initialized and dispatched through the packaged Rust/WASM
model engine.

Replay commands, from repository root:

- `UMF_R5_DEFAULT_SPECIFIER=/private/tmp/umf-r5-installed/package/dist/umf-node.js UMF_R5_REFERENCE_SPECIFIER=/private/tmp/umf-r5-installed/package/dist/umf.js node scripts/rust-migration/r5/replay-core-semantic-types-default-node.mjs`
- The same command with `bun` in place of `node`.
- `UMF_R5_BROWSER_BUNDLE=/private/tmp/umf-r5-installed/package/dist/umf-browser.js UMF_R5_WASM_PATH=/private/tmp/umf-r5-installed/package/dist/umf_core_wasm_bg.wasm node scripts/rust-migration/r5/replay-core-semantic-types-default-browser.mjs`

Installed executable/resource hashes: `umf-node.js`
`93e0be27d33e4e36b52af07838e1cbfadcf99655649e768cd1155927b5b89037`,
`umf-browser.js`
`42133fa03dc7034755dd8b95436c5a80f4fb3e3b78a0bc6593380675ace9de58`,
`umf.js` `6832dbbc4232b8d17817f380a44fde89fde87d5ec13da61caa82a5ac95dc8680`,
and `umf_core_wasm_bg.wasm`
`8fee3e45812be0da201bcd70ceaf8c4c065138a09641809c804fe4eeb2fa8af8`.

This receipt adds evidence for these four operations on this fixed private
archive only. It does not claim broader CONTRACT-078 completion, Python parity,
allocation/budget boundary completion, public release acceptance, or retirement
of the TypeScript route.
