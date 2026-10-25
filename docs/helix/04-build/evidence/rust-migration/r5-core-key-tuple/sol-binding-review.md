---
ddx:
  id: umf.evidence.rust-migration.r5-core-key-tuple.sol-binding-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-key-tuple
      kind: references
---

# Independent Sol review: opt-in Key tuple binding

I reviewed the tagged Rust wire dispatch, Node/WASM wrapper routing, frozen
predecessor replay, and source-bound installed [receipt](node-bun-installed-replay.json)
for the captured native candidate. The authoring Luna agent did not perform
this review. I independently reran the four wrapper tests (28 assertions),
checked all 13 archive members, and confirmed the archive SHA-256
`877ec9480964236e4fb275c2bdadc97c27b5084cc1b52f54ac1e733489bd9f66`
and extracted addon SHA-256
`4def550a00f4ec2e2af802e9a16592191216a51f47d2ca956ae942fc10c27cc3`.
The durable Node and Bun receipts each record exit 0, 87 exact encoder
outcomes, five exact verifiers, one byte extraction, prepared-source checks,
and resource/cancellation/meter controls. I inspected the replay harness and
verified that the one unsafe JavaScript Number case is counted separately;
its Rust transport refusal path `/0` differs from the TypeScript
`/0/integerToken` path. I did not independently rerun the long installed
87-case loops.

The first receipt described prepared calls as revalidation evidence, although
the runtime assertions only prove one encode/verify and copy isolation. The
agent corrected the report: wrapper source at SHA-256
`684c01d780622a063f89356066e34ac7cb0bbed64cf5783dc3d163a7f77df438`
routes every prepared call through tagged Rust wire; the executed harness hash
and the reporting-only successor hash are both pinned. That source inspection
supports the routing claim without inflating the runtime case count. The
100,000-wire-value byte limit is also explicit beside the larger core byte
ceiling. No P1/P2 remains in this opt-in native binding cohort.

Nine of the receipt's 19 source pins have since advanced, including shared
wire, host entrypoints and the reporting harness. The captured archive cannot
qualify the moving worktree or a release. Python, real browser/WASM,
source-distribution, broader resource and default-route gates remain open.

## Retained-handle and cross-target follow-up — 2026-10-24

I independently inspected the staged receipt-first byte-read path in the Node
and WASM wrappers and Rust bindings, verified the fresh Chromium receipt hash
`1a53b59bd0de89dfdcf140cf895fef63d2ba57a08994128559878ec4a9c8d972`,
the Node addon hash
`0f28e89cb22107d122db3b0e53ce154335af3dc194c385d0be98ab7f42c2288d`,
and the frozen predecessor hash
`1e0649ea8a723ce9f9836eceda2fd7cb83c6554bf5f01d908016baf0b69aefb5`.
The fresh direct Node and Bun receipts each report 87 exact in-profile encoder
cases, five exact verifiers, both 100,001- and 4,000,000-byte reads, and
malformed-receipt refusal before touching `current`. Chromium reports the same
bounded packet, plus cancellation and deadline recovery. I reran the focused
Rust target-width precision regression (1/1); the full wire and cross-host
packets were executed by the implementing Luna agent, not independently rerun
here. The one host-number case is explicitly outside the representable packet.

This accepts the bounded *opt-in* handle/byte path only. The Key tuple runtime
still lazily admits immutable resources on the first `prepare` or byte read,
using that operation's bridge; CONTRACT-080's production factory interface
admits them at setup. I therefore hold default source selection and retirement
until eager factory admission, source-frozen packed SDK replay, and another
independent review. The moving shared indexes have changed during parallel
work, so these isolated native/WASM receipts cannot qualify the integrated
source cohort or a release.

## Eager factory follow-up — 2026-10-24

I reviewed the retained `CoreKeyTupleRuntime` and Node/WASM factory wiring.
The factory now admits and owns five resource trees under its setup control
bridge; the Rust wire runtime moves decoded values into `ResourceSet` after a
charged lookup, avoiding the prior unmetered clone. A new operation Context
is used for each prepare, encode, verify and byte-read stage. The opt-in
factory fails closed if the retained binding is absent. I independently ran
a focused installed Node smoke against the final isolated addon: a hostile
resource getter remained untouched, factory `maxWork: 0` returned
`RESOURCE_LIMIT`, and the frozen `empty-string-present` case encoded the exact
bytes `554d464b31010400`.

I independently verified final receipt and artifact hashes and modification
times. The Node and Bun receipts, SHA-256 `a728cfcc…` and `087a5f21…`, were
written at 17:20:33 EDT after addon `04072062…` at 17:18:42. The Chromium
receipt `efe70a78…` was written at 17:20:07 after WASM `7baad26d…` at
17:18:43. The final receipts report 87 exact in-profile encoders, one
separately pinned out-of-profile host Number refusal, five exact verifiers,
100,001- and 4,000,000-byte reads, 4,000,001-byte refusal, receipt-before-
current ordering, and eager factory controls. I inspected the browser harness
and its exact frozen-result comparisons but did not independently rerun the
long browser or native packet. The agent corrected an earlier evidence
description and distinguished the executed harness SHA from a later reporting
file. The factory cost sample is 1.86 seconds and 401,221,260 charged units
on its cited host/resource set; this is a setup cost, not a measured operation
regression.

The eager opt-in revision is accepted for the captured Node 26.12.1, Bun
1.4.3 and Chromium 153 packet. Default-root selection remains held for
source-frozen integrated installed-package replay, broader resource bounds,
the declared Python host scope, and R8 retirement review. These receipts do
not qualify the moving shared source cohort or a release.

## Default-root factory split follow-up — 2026-10-24

I reviewed the scoped Node/WASM factory split. The public generic model and
standalone tuple factories still eagerly construct their retained tuple
runtime, while the internal v4 root factories omit all four tuple methods and
skip tuple-runtime construction because those package-root exports still
inherit TypeScript. This avoids admitting an unused runtime at module import
without changing the public opt-in factory behavior. I independently ran the
five focused Node/WASM tests (33 assertions) and `bun run typecheck`; both
passed. A single local cold Bun import of `src/index-node-v4.ts` completed in
6,733.21 ms versus an earlier roughly 10,378-ms sample; this is diagnostic,
not a release performance threshold.

I inspected the agent's [browser/package receipt](factory-split-browser-receipt.json)
and independently checked its tarball SHA-256 `b9b08a22…`, WASM binary
`ad581820…`, and both v4 root-entry hashes against the files. The agent's
fresh package replay passed Node, Bun and Edge/Chromium 156, and its separate
browser factory harness confirmed omitted root methods, present public
methods and no Node globals. I did not independently rerun that browser
packet. The packaged WASM index was captured before a concurrent additive
Protobuf index edit, and the focused Node test used an older addon; therefore
this accepts only the scoped factory-shape change and captured package cohort.
It does not qualify the current combined source, select tuple defaults, close
the eight R8 route gaps or authorize an SDK release.

## Direct retained-runtime follow-up — 2026-10-24

I independently reviewed the one-shot Node stage handles and `TransportUsage`
carry across receipt and current admission. The implementation consumes the
verification or byte-read handle before current admission, so a failed or
successful stage cannot be reused. The host wrappers charge the final typed
array copy before allocating it. I verified every source hash in the
[direct-runtime receipt](direct-runtime-receipt.json) against the worktree,
the receipt SHA-256 `5f4d39c16ea36ec0b5b5a733239cf07833a16901dc41a0ce0d1cbb85f4640521`,
and the addon/WASM artifact SHA-256 values recorded there. I independently
reran the fresh-addon Node/Bun test pair: 7 passed, 153 assertions in 15.88
seconds. That includes the 87 in-profile frozen encoders, five verification
outcomes, cumulative receipt/current work refusal, one-shot reuse refusal,
100,001/4,000,000-byte success and 4,000,001-byte refusal. The implementing
Luna agent ran the fresh Edge 156 browser packet; I inspected its harness and
hash but did not independently rerun the browser.

This accepts only the direct opt-in Rust runtime and staged boundary for the
receipt's captured source and artifacts. The public factory's encode/verify
methods still use their generic wire routes, and the Node/browser package roots
still inherit the four TypeScript tuple exports. Selecting those routes
requires a separate source-frozen installed package replay and independent
review. The 922-export R8 denominator and release gate remain open.

## Direct public factory follow-up — 2026-10-24

I reviewed the opt-in public factory's switch to retained direct Rust methods.
The first candidate reset its value-count limit across arguments, which Sol
checked against the predecessor: `encodeCoreKeyTuple` copies source, identity,
and values separately, with a 100,000-value limit per copy. A second review
found that options must be observed only after identity and current-source
checks. The final binding admits those three arguments in order, runs a Rust
prefix check, then admits options through a one-shot encode stage; one host
bridge and its `TransportUsage` span both Rust stages. I independently
confirmed the predecessor's invalid-identity case returns
`KEY_TUPLE_IDENTITY` at `/identity` with zero options-getter reads.

The [final direct-factory receipt](direct-factory-route-receipt.json), SHA-256
`cebd5c1cb21037489bb07d1718649b691909c04e96fb0d9fd505de532d983000`,
pins the bounded source and isolated artifacts. I verified all 15 listed
source, harness and artifact hashes against the files. I independently reran
the exact isolated Bun package: 11 tests and 273 assertions passed, including
the frozen 87 in-profile encoders, five verifiers, crossed per-argument
admission, invalid identity/source before options, receipt-first verification,
cumulative work and output-copy limits. I also independently reran its local
Edge 156 WASM harness against the recorded binary and source hashes. It
reported 88 low-level encoder outcomes (including the separate host-number
refusal), 87 public encoders, five public verifiers, the 100,001 and 4,000,000
byte successes, the 4,000,001-byte refusal, exact host order and late output
copy refusal. I independently ran the focused locked/offline Rust wire suite
in an isolated target directory; all seven tests passed, including the long
frozen encoder/verifier packet (509.83 seconds for the test phase).

This accepts the public **opt-in** direct factory for the receipt's exact
source/artifact cohort. It does not select the four default Node/browser tuple
exports, retire their TypeScript implementation, or qualify an installed SDK.
The shared indexes will change again for the separate Protobuf source-export
packet, so current combined-source qualification remains an R8 gate.
