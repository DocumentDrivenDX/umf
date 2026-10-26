---
ddx:
  id: umf.evidence.rust-migration.r8-selection-callback-trace
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-host-trace
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-selection
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Private `selectCoreElements` semantic callback route

This is an additive, private Rust host-JSON route. It does not change either
public V4 root or claim default-route parity. The implementation invokes
caller-owned semantic callbacks at the Rust registration traversal point and
retains returned diagnostic objects as opaque host handles until source
validation materialization.

The tested subset covers an Array result and one custom iterable, callback
receiver and context prototypes, document/payload copy boundaries, callback
registration and warning order, callback throws and `String(error)` failures,
diagnostic `emit` getter order (`severity`, `path`, `code`, `message`), a
separate post-traversal `.some` severity read with short-circuit, malformed,
null, undefined, string and numeric diagnostics, and getter-thrown object
identity. Unmodeled native spread/iterator failures remain refused. `Registry`
`kindRuntime` delegation remains unsupported; arbitrary Proxy/accessor behavior
outside the pinned cases is not qualified.

## Reproduction

From the repository root, build the native addon into a private target and run
the host-specific suites:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-selection-callback-target cargo build --locked --offline --release -p umf-core-node
cp /private/tmp/umf-selection-callback-target/release/libumf_core_node.dylib /private/tmp/umf-selection-callback-target/release/umf_core_node.node
UMF_SELECTION_ADDON=/private/tmp/umf-selection-callback-target/release/umf_core_node.node node scripts/rust-migration/r8/selection-callback-node.mjs
UMF_SELECTION_ADDON=/private/tmp/umf-selection-callback-target/release/umf_core_node.node bun scripts/rust-migration/r8/selection-callback-node.mjs
bun scripts/rust-migration/r8/selection-callback-browser.mjs
```

The Node/Bun runner uses the private addon at the path above and compares each
case with the same-host TypeScript implementation from `dist/umf-node.js`.
The browser runner builds a fresh `wasm32-unknown-unknown` package with the
pinned wasm-bindgen CLI and compares against `dist/umf.js` in the same Chromium
page. Chromium needs the approved local launch environment. Each JSON receipt
pins the relevant live source, reference bundle, resources, fixtures, and
native/WASM artifact hashes.

## Results and limits

Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each passed 15/15 outcome
and exact host-trace comparisons with zero mismatches. The native addon SHA-256
is `2f2b3569814351285f1c21bfb56b4bfe533b203fe4a3a48876b750504c13e982`; the
fresh WASM binary SHA-256 is
`619ed4ebdeb6ba01376f25ed75e2a3b6373444416464657b520ee54c4f39514f`. Exact
source and artifact pins are in [node.json](./node.json), [bun.json](./bun.json),
and [chromium.json](./chromium.json).

This qualification is limited to the private Selection host bridge and the
listed fixtures. It does not establish whole-SDK source closure, release
qualification, arbitrary JavaScript host parity, `kindRuntime` support, or
default V4 routing. Keep the package default route unchanged pending broader
review and the remaining Selection boundary work.

## Reusable engine and source facade — 2026-10-26

The Node and WASM private host adapters now expose an invocation engine factory
around the raw host dispatcher, and
[`rust-selection-default.ts`](../../../../../../src/access/rust-selection-default.ts)
provides the typed source facade with the predecessor's synchronous arity of
two. The facade forwards the original source, query, and optional caller
Registry references directly and preserves thrown-value identity. A focused
Bun test passes 2/2 checks for those properties. The three-host 15-case parity
replay now exercises the reusable Node/WASM engine factory; updated receipts
pin its host adapter and harness sources.

This is still an opt-in implementation seam. The receipts do not qualify full
raw-host parity, `Registry.kindRuntime`, all proxy/accessor cases, final
installed source closure, or public V4 routing. The R8 route decision's Sol
review and remaining host/resource gates still apply.
