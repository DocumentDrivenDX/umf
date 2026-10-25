---
ddx:
  id: umf.evidence.rust-migration.r7-sdk-selected-operation-replay
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-sdk-source-default-route
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-keys-default-route
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-default-cutover
      kind: informed_by
---

# Historical private SDK selected-operation replay

This receipt records two independent Node/Bun replays against the extracted
SDK archive identified below. The archive is a derived private snapshot with
11 generated-input transforms; it is not a fixed-point or publishable release
artifact, and this result is not current-source qualification.

The machine-readable receipt is `archive-replay.json` (SHA-256
`7590385fe13f91ef1de29c83c9f78cf10023cbdd631f6983eadbef2914bf4a9d`).
The expanded harness prepared for a later clean cohort is
`scripts/test-sdk-rust-default.ts` (SHA-256
`8af50a3c60fac8bbdd57574f797602f633642d6f66f33aec4cb24e292f544e4a`); this
hash identifies the harness source only and does not qualify the old archive.

Node 26.12.1 and Bun 1.4.3 each passed four selected Core Keys root operations:
`inspectCoreKeys`, `lookupCoreKey`, `declareCoreRecordMembers`, and
`declareCoreKey`. Their semantic envelopes matched the frozen packet, and the
recursive result prototype shapes matched the archive's `./reference` route.
Each runtime also passed the 19 compact Dataset validation vectors listed in
`archive-replay.json`, including accepted and first-refused near-threshold
cases, structural/work limits, retained unknown content, and the commerce,
supply-chain, archaeology, and ecology fixtures. The verifier-only forged
receipt vector was excluded from validation.

The compact Dataset comparison checked frozen result values and refusal
`code`, `path`, and `message`. That temporary replay did not compare thrown
error names, result prototypes, or recursive `Object.keys` order. The Key
prototype check did not compare key order. The replay imported extracted
`dist/umf-node.js` and `dist/umf.js` paths directly; it did not verify
package-name condition resolution. These limits are recorded so the old
archive result is not confused with the expanded installed harness.

The extracted Chromium replay against the same archive timed out after the
10-minute browser wait without emitting a receipt. No browser case is counted
as passed; the cause and case reached are unknown. The archive does contain
browser entry, native addon, and WASM assets with hashes recorded in
`archive-replay.json`, but their presence does not establish a browser replay.

## Successor: corrected lightweight Chromium smoke

The earlier timeout was traced to the temporary harness using the incomplete
`kp.fixtures.source` as a successful `declareCoreKey` copy-isolation operand.
That fixture intentionally lacks `members`, so the implementation correctly
refuses it. The harness did not surface the page exception and instead waited
for its success marker. The valid isolation check now uses the successful
frozen declaration source; a separate negative control asserts that the
incomplete fixture is rejected atomically and matches the same-runtime
TypeScript reference.

The corrected Chromium smoke receipt is `chromium-smoke.json` (SHA-256
`7e03ceb98edcf032f84560d24c4d13b8962bd13f7687c7fe6b12b3936b45b070`). Its
full temporary browser receipt is preserved at
`/private/tmp/umf-r8-root-api-replay/chromium-receipt.json` (SHA-256
`19fe0d6edfb56e580e4ab03a42cab2c94129632f8d05145fe62a444bf12efdc3`), and
the staged harness is `/private/tmp/umf-r8-root-api-replay/staged-smoke.mjs`
(SHA-256 `addbbbbc22ecb37658f2baa75a6911b57cfaeb26776898f65057fb68003ebbea`).
It uses the same historical private archive identified in
`archive-replay.json`: archive SHA-256
`0461710e62958d47ee366f52fe0b36ce4cfd503a282363587f247c5d647836e7`, source
tree `5962d3f6d3c04df146675423d1291accb2c53a25041c6e2180d207a4abc9c11e`, and
manifest SHA-256
`824dcb19ceccd6c3047d83ffb96afa810d4808475f14ab0dfb09100748ddf47e`. The
manifest asset check covered every packaged asset before launch. The relevant
browser bundle (including its wasm-bindgen glue) is `dist/umf.js`, SHA-256
`4bc80dd1c59eddc1b4538253b8f1838d35bc64386a8dce664c1988e579477fcf`; the
WASM module `dist/umf_core_wasm_bg.wasm` is
`b48e748618c4e0819e280c61263d4ceaad10fc1f249b520d4221c86456f4be60`.
`bindings/core/wasm/src/core-keys.js` is pinned in the archived closure at
`a22a5feca048ef93a3f003c7b16cc157c2565034cec2b5248565bdfa8ad5981e`, and
the key Rust source `crates/umf-core/src/core_keys.rs` at
`65b8934a08e817d7a6a854ca5a7d2be6dac79d3d9da6f4803dd42c470b3912e4`.

Chromium `153.0.8010.12` passed the four selected Core Key operations and
their prototype-shape checks, the invalid-fixture refusal, valid declaration
copy isolation, and one commerce compact Dataset validation with input/source
isolation. The invalid fixture was 271 UTF-8 bytes and produced the same
`UmfError` envelope in Node and Bun as the same-runtime TypeScript reference:
`CORE_KEY_CONFLICT`, empty path, and two ordered
`SEMANTIC_TYPE_STRUCTURE` diagnostics at `/modules/0/elements/0` (required
`members`, then the conditional-schema failure). The input remained unchanged.
The committed expanded harness is pinned at
`scripts/test-sdk-rust-default.ts` SHA-256
`00254da13506e379432d4f57e4d0702e6bf47aafad1c2059cac4857413c25ca4`; its
typecheck passed after the negative regression was added.

This is a lightweight historical-archive smoke only. It does not qualify the
current source tree, release artifact, package publication, the 19-case
compact Dataset browser matrix, or Dataset resource controls. The prior
10-minute attempt remains recorded as inconclusive; this successor identifies
the harness defect and proves only the cases listed above. Default-route and
release gates remain open.

The next clean private SDK cohort uses the expanded
`scripts/test-sdk-rust-default.ts` replay, which compares the 19 compact
Dataset vectors against the package root and `./reference` in Node, Bun, and
Chromium, including complete same-runtime error names, recursive prototypes,
and recursive `Object.keys` order. That future result must be captured as a
separate source-bound receipt.

## Successor: compact Dataset semantic cases

A follow-up on the same immutable archive passed 15 compact Dataset semantic
cases in Chromium. The exact case list, archive/source pins, excluded vectors,
and temporary harness/receipt hashes are recorded in
`chromium-small-dataset.json` (SHA-256
`f730fb261289fa7fc76b3917024ead783ca23ca7c7cbaf0ff19d737dc3f10449`). The
cases cover domain examples, unknown/residual content, absent and present-null
states, decimal tokens, duplicate keys/locators, link behavior, and source or
input diagnostics. The structural/work/near-threshold vectors and verifier-only
forged receipt were excluded. This replay provides no resource-control
qualification; the full 19-case browser gate and current-source/release gates
remain open.
