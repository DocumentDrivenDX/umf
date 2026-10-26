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
identity. The bounded spread-failure cases described below are also covered;
broader native spread/iterator failures remain unqualified. `Registry`
`kindRuntime` delegation remains unsupported; arbitrary Proxy/accessor behavior
outside the pinned cases is not qualified.

## Reproduction

From the repository root, build the native addon into a private target and run
the host-specific suites:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-selection-callback-target cargo build --locked --offline -p umf-core-node
cp /private/tmp/umf-selection-callback-target/debug/libumf_core_node.dylib /private/tmp/umf-selection-callback-target/debug/umf_core_node.node
UMF_SELECTION_ADDON=/private/tmp/umf-selection-callback-target/debug/umf_core_node.node node scripts/rust-migration/r8/selection-callback-node.mjs
UMF_SELECTION_ADDON=/private/tmp/umf-selection-callback-target/debug/umf_core_node.node bun scripts/rust-migration/r8/selection-callback-node.mjs
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

The initial 2026-10-26 checkpoint passed 21/21 outcome and exact host-trace
comparisons. The later primitive iterator-result checkpoint below supersedes
that case count and its receipts. The original native addon SHA-256
is `fd34bf7828d4e27bb0340db303d66effb557cdf38a5aa4238006dc858ace39f1`; the
fresh WASM binary SHA-256 is
`fc9ae0be48fa2bda7073a9a4d63f2f82a4185b3feaba923bbaab00efd415e8c5`.
The current [Node](./node.json), [Bun](./bun.json), and
[Chromium](./chromium.json) receipts pin the later 24-case checkpoint.

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
Bun test passes 2/2 checks for those properties. The three-host 18-case parity
replay now exercises the reusable Node/WASM engine factory; updated receipts
pin its host adapter and harness sources.

The [spread-failure extension](../r8-selection-spread-boundary/README.md)
also covers abrupt failures from iterator `next`, the step's `done` getter and
the step's `value` getter. In all three hosts these failures propagate after the
same reads, and array spread leaves the iterator's `return` getter untouched.
Broader native spread TypeError wording remains unqualified.

This is still an opt-in implementation seam. The receipts do not qualify full
raw-host parity, `Registry.kindRuntime`, all proxy/accessor cases, final
installed source closure, or public V4 routing. The R8 route decision's Sol
review and remaining host/resource gates still apply.

## Primitive iterator-result spread parity — 2026-10-26

The callback corpus now adds callable `Symbol.iterator` methods that return a
number, `null`, and `undefined`. The first probe found Rust's unresolved native
spread refusal diverged from the predecessor's native `TypeError`. Rust now
passes the exact returned primitive through `HostSpreadFailureTarget` to a
private host materializer, which performs a synthetic spread using the same
predecessor expression shape. Its placeholder `payload` and `doc` are local
null-prototype objects; placeholder copying is side-effect-free and does not
read caller objects or invoke caller callbacks again.

Fresh Node 26.12.1 and Bun 1.4.3 addon runs and fresh Chromium 153.0.8010.12
WASM execution each match TypeScript on all 24 outcomes and exact host traces,
including the three primitive iterator-return cases. The extra materialization
has no caller-visible events; the compared callback/Registry/iterator trace is
unchanged. The Node addon is SHA-256
`23cf55d93a52ffb6e872d9a30f93574deeb7ba5be641bf2d7c3a24dd76614728`; the
WASM binary is SHA-256
`54924c8a602290513f0b364fcc88d1b922129fa97e3930f3ac0324ec57fc7707`. Exact
source, runtime and artifact pins are recorded in the refreshed [Node](./node.json),
[Bun](./bun.json), and [Chromium](./chromium.json) receipts.

The three primitive cases establish the exercised host versions and values
only. Other host versions and additional native spread failure shapes remain
unqualified. This remains a private route; default Selection, complete host
parity, resource boundaries, installed package qualification and retirement
remain open.
