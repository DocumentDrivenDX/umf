---
ddx:
  id: R5-AVRO-FIELDS-PREDECESSOR
  type: evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: verifies
    - id: CONTRACT-001
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R5 `deriveAvroFields` predecessor freeze

This packet freezes the current TypeScript `deriveAvroFields` kernel before its bounded Rust implementation. It captures exact tagged native input, full returned field metadata or error, selected expected scalar outcomes, and the source/dependency closure. It does not assert Rust parity or complete Avro conformance. CONTRACT-007 and its exact-source preservation requirements govern expected Rust behavior where a predecessor observation is defective or underqualified.

## Frozen source and reproduction

Run from the repository root:

```sh
bun docs/helix/04-build/evidence/rust-migration/r5-avro-fields/capture.ts
PYTHONPATH=/path/to/apache-avro-1.12.0:/path/to/fastavro-1.12.2 python3 docs/helix/04-build/evidence/rust-migration/r5-avro-fields/native-oracle.py
```

The TypeScript capture used Bun 1.4.3 and pinned `avsc` 5.7.9 (17 installed files, closure SHA-256 `50bd108a29463a8fb1df8f43ef7ca8799f57cbe952b6cfc29c90d6bd0510af54`). The capture report contains hashes for 48 source, contract, test, schema, and fixture paths and a per-file avsc package closure. The upstream corpus is Apache Avro `release-1.12.0`, commit `8c27801dc8d42ccc00997f25c0b8f45f8d4a233e`; all 20 selected `.avsc` files match their pinned manifest hashes.

Frozen TypeScript output: [`predecessor.json`](predecessor.json), SHA-256 `2cf1aa4a26aecfb0050a29458f43ff97eb94b1c3a5e20498b36ac118b41cce16`. Capture source: [`capture.ts`](capture.ts), SHA-256 `368f364f8ce31eb4d30aa693dcbc81a25423c3448c63df2284d3689c64d3ccc5`. The JSON report includes complete input payloads and output values for 100 cases: the authored 26-field profile, 15 exact numeric cases, 54 temporal annotations, all 20 upstream schemas, and ten adversarial cases. Expected scalar classifications for the 26/15/54 groups are asserted during capture; every upstream manifest file hash is also asserted.

The independent native observation runner (`native-oracle.py`, SHA-256 `37bb5b808de89af411db13eac7707d9a9dc9fb1e08b75823f493d455917596c4`) uses Apache Avro 1.12.0 and fastavro 1.12.2. [`native-oracle.json`](native-oracle.json), SHA-256 `3ea42c1d1388910a69c18bb99dea220f5c78248ab3b1eecb57ed0d92c2593e5f`, records Python 3.12.15, both package versions and 128 dependency-file hashes, 200 parse observations, and 15 Decimal checks. On this host the runner used already cached package contents through `PYTHONPATH`; it did not install dependencies or access the network. `python/.venv/bin/python` is Python 3.13.16 but has neither package, so the report records that primary environment's failed import attempt separately.

## Observations and interpretation

The 26 shapes preserve the existing mapping: booleans, integer and float carriers, strings, bytes/fixed and enum, compatible nullable/named unions, and recognized date/time/timestamp/decimal logical carriers. Arrays, maps, null-only/mixed unions, unknown logical annotations, malformed decimal qualifiers and unsupported named references do not acquire a scalar family. The 15 numeric cases exercise precision, scale and fixed-size tokens including decimal spellings beyond safe-integer or finite-number interpretation; Python `Decimal` independently classifies exact token integrality/safety rather than relying on JSON float conversion. The 54 temporal cases exercise exact annotation spelling, all millisecond/microsecond/nanosecond timestamp and local-timestamp forms, wrong carriers, non-string annotation shapes, and whitespace/control-character suffixes.

The adversarial captures preserve these implementation details for review: dependencies are visited before the root and all discovered names are available to later family resolution; a duplicate fully qualified name becomes ambiguous and yields no guessed family; namespace lookup does not treat aliases as declarations; recursive references do not expand indefinitely or gain a scalar family; nullable unions inherit a family only when every non-null branch agrees; defaults and arbitrary native annotations do not alter the derived family; unusual field and metadata keys survive in the copied native field tree; and mutating a returned tree does not mutate the input or later derivations. The output gives exact record/path/element IDs and each full native field tree.

For the pinned upstream subset, both native parsers accept 19 standalone schemas and reject `ApplicationEvent.avsc` without its external `DocumentInfo` dependency (one rejection per engine). Across all 100 captured inputs, the native runner records 166 accepts and 34 rejects; most rejections are expected for exact-decimal malformed/out-of-range qualifier probes, unusual logical type encodings, and intentionally unresolved adversarial dependency/name controls. These are behavior observations, not a validity score. Standalone parsing also rejects both dependency-order adversarial inputs because the native scripts intentionally do not merge dependency roots into a parser registry; the TS kernel does collect declarations from each provided dependency in order. The frozen source metadata pass itself processes all 20 upstream files and preserves its standalone unknown/unresolved outcomes; its purpose is field metadata derivation, not Avro compilation.

One exact-number behavior deserves an explicit Rust design check: `deriveAvroFields` calls `readJsonValue` and accepts a numeric qualifier only when it is a safe JavaScript integer. Therefore safe integer tokens such as `1.00e0` can classify, while unsafe, fractional, underflowing, and negative-zero exact tokens cannot. Rust must preserve the source token and match the declared CONTRACT-007 scalar interpretation deliberately; native parser acceptance alone is not an oracle for exact qualifier meaning.

## Scope and remaining gates

The packet does not cover import/inspect/export/edit parity, JSON/YAML recovery, Chromium/browser execution, or dependencies resolved across multiple parser registries. The native Avro observations are schema parsing/warnings only, not datum behavior or proof of scalar constraints. An opt-in, versioned Python host binding is authored in `bindings/core/python/src/lib.rs` and `python/src/umf/rust_avro_fields.py`; it admits tagged native trees and ordered tagged dependencies, returns copied tagged subtrees, and forwards cooperative work, cancellation, and deadline controls through `Context`. Its installed-host qualification passed all 110 tests in `python/tests/test_rust_avro_fields.py` on a CPython 3.11.17 installation of the 0.11.0 wheel: 100 frozen cases/294 fields plus ten packet, isolation, carrier, resource, callback, cancellation, deadline, and profile controls. The latest Sol delta finding for `None` clock handling is repaired and covered by the passing deadline test. This qualifies only the versioned host-binding profile; there is no adapter activation or full source-to-Rust parity claim.

## Additive executable-closure and Rust source checkpoint

`executable-closure.json` and `executable-closure.ts` are a separate completeness
record and checker; they do not rewrite either frozen packet above. The Bun
metafile identifies 88 local executable inputs, and the manifest hashes all 17
installed `avsc` files and all 233 installed `yaml` files, for 298 files total.
It includes the previously omitted local JSON framing/number/error helpers.
The strict historical comparison is
`bun docs/helix/04-build/evidence/rust-migration/r5-avro-fields/executable-closure.ts --check`.
For current executable qualification, use
`bun docs/helix/04-build/evidence/rust-migration/r5-avro-fields/executable-closure.ts --check-executable`;
it verifies all 298 captured files and their counts exactly while permitting
only the explicitly reported `rust-migration-plan.md` governance-context hash
to drift. The strict historical check remains unchanged.

The closure records one capture-context drift: `rust-migration-plan.md` was
captured at `be1d589880aae857c87242a4e1fb7131a661b176f3635a816c666149dadb9f57`
and was `3c40f066adcb3c1457d07d1b9d528fb027220b5ebf81f26484e3f19da2cc374e`
when the additive closure was recorded; the current plan hash is
`69155f6990c35efdb97329b2b737209d1860af1d4ab0f6b2f1fcfc22f6655b91`.
This is historical planning context; it is not an Avro runtime dependency. The
closure checker verifies the current files against its additive manifest and
reports that drift explicitly. The immutable predecessor remains SHA-256
`2cf1aa4a26aecfb0050a29458f43ff97eb94b1c3a5e20498b36ac118b41cce16`.

The separate executable closure remains SHA-256
`91f1601c0df737afd57d35a39b66deb231e7b2877bd9c43db71e0b8ec3d78b65`. The
current Rust kernel source is
`b78ace9d77f74ae1f0bbdc9e8ce852bf3fad20079aea02f200808ea89bc6985c`, and its
focused test source is
`561255e3ee19791e5132ed16b175e69440254e9400d025f6b68f90683fd242fc`.
At the installed-host replay, the whole shared PyO3 source file
`bindings/core/python/src/lib.rs` had SHA-256
`eb745611b91f409d6854d70f727dbac99644222cfafc5617717bae7775c18342`; the
versioned bridge `python/src/umf/rust_avro_fields.py` had SHA-256
`9032f4993c9f06e46f3f9dae32406086cf2098a25708cbd5f674963135380346`, and its
host replay/control tests had SHA-256
`f64e039886a654a9c8d005655c2a814ae5e8d1977e7bf7dbe54fb2004dcd8357`. The
PyO3 fingerprint covers the full shared binding module, including other
independently qualified shards.

[`supplemental.json`](supplemental.json) is an additive Bun observation of
five controls omitted from the original packet: missing and empty record
names, an empty field name, and fixed decimal size/precision values of
4294967297. Its capture source is [`supplemental-capture.ts`](supplemental-capture.ts).
The supplement SHA-256 is
`fa270649be2796517a7962aeabc15665991ea9f38b9138f3a4f32626d3e83828`, and its
capture source SHA-256 is
`66ddf3cd26893cafe81122a8d908679215e17a8387e3f5cdd3a134b186c0b041`.

An opt-in Rust core kernel and focused test source now live in
`crates/umf-core/src/avro_fields.rs` and
`crates/umf-core/tests/r5_avro_fields.rs`. The kernel derives primitive,
logical, exact-decimal, nullable-union and named-reference families from ordered
dependencies, retains complete copied native field subtrees, and bounds
traversal/copy work through `Context`. The focused tests compare the exact
tagged native subtree for all 100 frozen cases, including numeric tokens and
representation extras, and cover the additive controls and cancellation/depth
bounds. The latest coordinated run reported 12 passing tests for the Rust
kernel's focused suite. The installed Python host binding passed 110 tests on
CPython 3.11.17 with the 0.11.0 wheel, including exact comparison of all 100
frozen cases and 294 output fields. The wheel replay covers the versioned
source-bound metadata surface and host controls; it does not qualify native
Avro datum behavior, browser execution, or default adapter activation. Sol
delta review after the latest clock fix and the native-oracle rerun remain open.
No cutover or full adapter parity claim is made.

## Opt-in Node/Bun and WASM binding evidence — 2026-10-23

The opt-in `umf-r5-avro-fields/0.1.0` interface exposes
`createAvroFieldsEngine({controls})` in the Node binding and
`createAvroFieldsEngine(module, {controls})` / `initializeAvroFieldsWasm()` in
the browser wrapper. `deriveAvroFields(root, dependencies)` accepts the same
tagged native JSON trees as the Python facade, keeps dependencies ordered, and
returns the predecessor's ordered `path`, `record`, `nativeField`, and derived
`element` metadata. Tagged strings retain UTF-16 code units and tagged numeric
values retain their source tokens; errors use the `umf.core-wire/1` envelope.
The operation is cooperative and reports work-budget, cancellation, deadline,
and callback failures. It is metadata derivation only; it does not parse Avro
source, activate the default adapter, or claim full Avro import/export or datum
behavior.

`UMF_NODE_BINDING_DIR=/private/tmp/umf-r5-avro-fields-node node
scripts/rust-migration/r5/avro-fields-bindings-node.mjs` passes under Node
26.12.1, replaying the same 100 cases/294 fields and checking resource refusal
and cancellation.

`bun test tests/rust-core/avro-fields-bindings.test.mjs` passes four tests and
216 assertions under Bun 1.4.3, replaying all 100 frozen predecessor cases and
294 exact field observations. The cases exercise dependency resolution/order,
unknown metadata, source-number tokens, UTF-16 lone surrogates and copy
isolation. Resource refusal, cancellation, deadline, and callback failures are
also checked. The test used the Darwin arm64 N-API addon built from this
checkout with Rust 1.90.0.

`UMF_WASM_PKG_DIR=/private/tmp/umf-r5-avro-fields-wasm-pkg bun
scripts/rust-migration/r5/avro-fields-bindings-browser.ts` passes in real
Chromium 153.0.8010.12. It repeats all 100 cases/294 fields in WASM and checks
unknown content, ordering, resource refusal and cancellation. The browser
artifact is from the Rust 1.90.0 `wasm32-unknown-unknown` release build and
wasm-bindgen 0.2.100. `bun run typecheck` passes.
The compile-time consumer fixture
`tests/rust-core/avro-fields-bindings.types.ts` verifies that Node and WASM
expose matching metadata types, with nested `element` properties and an optional
dependency ID.

These selected source files and observed build artifacts are fingerprinted by
the following SHA-256 values (paths relative to the repository root). This
selection is evidence for the recorded replay, not an exhaustive transitive
build closure:

| Source or artifact | SHA-256 |
| --- | --- |
| `crates/umf-core/src/avro_fields.rs` | `b78ace9d77f74ae1f0bbdc9e8ce852bf3fad20079aea02f200808ea89bc6985c` |
| `crates/umf-core/tests/r5_avro_fields.rs` | `561255e3ee19791e5132ed16b175e69440254e9400d025f6b68f90683fd242fc` |
| `crates/umf-core-wire/src/lib.rs` | `b6d65a5c617bfa24402a23fbca67d479be9e19b6937307ba9527e1bdb742aa71` |
| `bindings/core/node/src/lib.rs` | `b733498de6dc99b78eee90897ea5f83b2f1771d6314c119420694b2e4221b73f` |
| `bindings/core/node/index.js` | `2202461f7004ab7461386d69d89f3480e51233e750f628973b2a52da7165b34c` |
| `bindings/core/node/index.d.ts` | `47516c8f39657a780901694617f8bb00e9d511273520bea8e3f456b6c71caae3` |
| `bindings/core/wasm/src/lib.rs` | `3e64406d31934e4f24935fbdc3c5e96b6f5a2c85069355499a4abf691b408d78` |
| `bindings/core/wasm/index.js` | `cf50701bf7c865cd3efc1efd017fdc213293f948f613e27e4a91ac8e62141a03` |
| `bindings/core/wasm/index.d.ts` | `2ec42c5e8353a8368522f0f240c9f01bd2e60c27fc6aed307f06dfc503f3dc2a` |
| `tests/rust-core/avro-fields-bindings.test.mjs` | `535442193f3a576659214123291f073a85992b0d44d0a22a3f012c2d736ee9a9` |
| `tests/rust-core/avro-fields-bindings.types.ts` | `5f08562d6d4db95fbf8e45ab2537ed991becb23a1125649e0f6bba57c86f8c36` |
| `scripts/rust-migration/r5/avro-fields-bindings-browser.ts` | `da3390508f4bd78c14f8e556fde6f30f7320d3d3c435c6695561e86fe0cb1dd2` |
| `scripts/rust-migration/r5/avro-fields-bindings-node.mjs` | `c52e8276a1782fa37ff845914da446fb86f6888b74924845316ae9a421234865` |
| frozen `predecessor.json` | `2cf1aa4a26aecfb0050a29458f43ff97eb94b1c3a5e20498b36ac118b41cce16` |
| Darwin arm64 Node addon | `99ccbfa113f2a75900c7d5885c27c4177223dfbc730995e8013ed4e63ff9abad` |
| WASM module | `b683089b1ef83c0edf63fec8605a584fb14a0cc3ec91038194f6eb7d7379615c` |
| wasm-bindgen JavaScript glue | `5eb546f44b8d6e8f42e7dfda6804faf860378bfeac8df4b0c042615bfd364c57` |
| Chromium result | `5fe0c9ac5407f374f77cecc4d10fa293913898661df1d6919b9cfbff01477216` |
| Node result | `03af2f700d36be1c0b616ddbb3f00d3153107a9920546f835953a4cbd9ba59f0` |

This qualifies the exact frozen packet and one local Darwin arm64/Bun, Node and
Chromium cohort. Full Avro import/export, schema validation, datum operations,
projections, broad Node version coverage, and default host cutover remain
separate R5 work.
