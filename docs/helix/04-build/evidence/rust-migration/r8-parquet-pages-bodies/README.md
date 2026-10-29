# R8 Parquet page and body Rust slice

CONTRACT-019 AC13/14 and the Rust migration plan govern this explicit opt-in extension to `umf-r8-parquet-capture-inspection/0.1.0`. The exact TypeScript sources are `src/adapters/parquet/pages.ts` and `bodies.ts`; `compact.ts`, `idl-map.ts`, `snappy.ts`, metadata/schema inspection, and the pinned Parquet IDL are semantic dependencies. The Rust owner is `umf_core::parquet_pages` with wire operations `parquet.inspectPages` and `parquet.decodePageBodies`.

The page kernel checks the same declared chunk boundaries, header types, offsets, values, rows and size budgets as AC13. The body kernel checks supported codecs before processing pages, verifies present CRC32 over stored bytes, preserves V2 level prefixes, and decodes bounded raw Snappy or uncompressed bodies. It returns physical bytes only. Source is copied as a raw UTF-16 `Value`; only the known native metadata and header projections pass through UTF-8 JSON. Unknown source keys, values and IDs remain untouched. Unsupported codecs block the whole result, and control/resource errors escape as errors.

`tests/rust-core/fixtures/parquet-pages-bodies-ts-freeze.json` pins 34 input SHA-256 identities and complete ordered page/body outcomes. The source field is reconstructed from the pinned bytes and case ID to avoid duplicating source hex in each outcome. It includes the prior 26 cases, seven `valid-v1.parquet` header mutations at offset 4 covering unknown wire types, boolean, binary, length, collection, map and field-ID failures, and a 426-byte zero-length Snappy literal-overflow fixture. The TypeScript freezer records both operation envelopes for every input. The Rust test compares the full reconstructed envelopes; a direct codec test checks further malformed prefix error order and verifies the legacy decoder's separate diagnostic profile. The 25 native Snappy vectors and malformed blocks remain separate kernel tests. The zero-length Snappy fixture exercises the ordinary public body operation in the production-feature WASM build; the optional `parquet-test-hooks` helper remains feature gated.

This evidence supports only the named local source and host executions recorded with the private commit. It does not establish installed-package parity, raw host admission, complete Parquet support, valid level/value encodings, Arrow schema projection, default-route retirement, or release qualification.

## Pinned inputs and local execution

Base: `68469ea9434af5a30f4d1b9546147ddb6c64c7e5`, private branch `codex/parquet-pages-body`. The fixture packet records each of 34 input paths and SHA-256 values, including base and changed hashes for mutations. Its SHA-256 is `4b9a8102dae9920a56d60a2626e335e6d18d798e683ff1189c4e0f981de657a6`; its TypeScript freezer is `14127ec8d272fd14d51fedd988134085eaa0bd3e37e10e5ef178fca8721d4a86`. The persisted Snappy fixture is `4cd819a9fd4009e020eb656e5f1b7e48ee1dab9c55b363af4e3d6371569fab1e`. The freezer uses Bun 1.4.3. Direct TS sources: `pages.ts` `50bbacffd30c5606a1585a823d4c4c394055f8dc497f2f072d3e97ee3f303293`, `bodies.ts` `af78e66c7fb89e2b4d43778a9928291df151076a46a39578a58260396dad8649`, `compact.ts` `4e57450b4591a9a977a502b1136d7fbb6838d656521a02e7bed441f71e5bb6a5`, `snappy.ts` `1cbb2029479f9984a089ff3074c657f269991dd5852309a560547b7a6c4f6046`, and `idl-map.ts` `f64a11e714b01dd7c0fccb09d1eab1eae05e54830d4567c8a1c6c6c823608232`.

Rust source SHA-256: `parquet_pages.rs` `e1fc6ebbdb61740bf0da618e893840b39df27fdfad0405196ad624004d68e19e`, `parquet_capture_inspection.rs` `bd68471337ae50161b66869f16118e35e010beb38d8f12e81b723dcefbe1dfde`, `parquet_schema_decode.rs` `f91ba063b6d9c65ad6e0cd7c62a8a808db7d9147c4f693a6008757ed016675e1`, and `parquet_capture_binding.rs` `583a9a97ff1d8b5b726f2e3ffa85ee3f6bcfa54e5cac2b42fbb4f3c07458338b`. Node and generated WASM facade source `parquet-capture.js` each hash to `ff1a769474336d0ce0b2d33fce0167d4624bdb89a164900eb810f700e205c7bf`.

Local checks use rustc 1.90.0 and `CARGO_BUILD_JOBS=1`, private `/private/tmp/umf-parquet-pages-target` and `/private/tmp/umf-parquet-pages-wasm-target` directories. `bun test tests/parquet/pages.test.ts tests/parquet/bodies.test.ts` passed five tests/675 assertions. `cargo test -p umf-core --offline page_prefix_matches_compact_error_order_and_keeps_legacy_profile --lib` passed 18 direct adversarial prefix cases plus a legacy-profile assertion. `cargo test -p umf-core --offline page_and_body_inspection_match_frozen_typescript_public_envelopes --lib` compared 34 complete page and 34 complete body outcomes. The earlier Rust Snappy and CLI tests remain predecessor evidence; they were not rerun in this correction. Production-feature WASM, the source-built Node addon, and real Chromium 153.0.8010.12 each passed the 34-case, two-operation public-envelope replay plus a raw UTF-16 source round trip. The first Chromium attempt hit macOS sandbox launch permission denial; the same harness passed when launched with approved escalation. These are local source-built executions; Node and Chromium compare full enumerable envelope content through tagged JSON, with raw UTF-16 checked separately.

A source-built debug Python extension passed focused full-envelope replay for the seven new malformed-header cases and the persisted Snappy fixture. The single pytest case covering all 34 inputs was interrupted after 362.66 seconds in that unoptimized build without completing; it is not claimed as a pass. The release Python extension built, but macOS refused to load the copied `.so` with `mis-aligned LINKEDIT string pool`. Neither attempt changes the Node/WASM/browser qualification above.

The stable wasm32 artifact was rebuilt without `parquet-test-hooks`, generated with wasm-bindgen 0.2.100, and executed through Node and Chromium using the public facade. Its binary SHA-256 is `b6e026cd9fb448394af5bad279ae433a0f615e13db933f5b0b9bc8be1dfd22be`; the stable Node addon SHA-256 is `9b554c808c978892d8d1569780bc4ea6869d9625d5dfaa6d692333be84fbbac7`. The current 34-case packet is hash-pinned above. No archive or installed distribution is claimed. `bun scripts/metamodel/build.ts --check` reports `METAMODEL_STALE_OUTPUT spec/core/schema.json` after the source change; canonical regeneration and broader ledgers remain for parent integration. This correction did not rewrite them.

Next kernel inventory after composition with the separately reviewed encoder: `appendParquetKeyValueMetadata`, `assembleParquetRows`, `decodeParquetLevels`, `decodeParquetPhysical`, `decodeParquetValues`, `getParquetArrowSchema`, `parquetRegistry`, `renameParquetField`, `renameParquetFieldWithArrowSchema`, and `repairParquetDictionaryOffsets`. The page operations and encoder reduce the original 13 remaining runtime functions to these ten; package/constants remain data.

## Private footer and resource-provenance follow-up

On top of private `3edb00e441d9aa01d60e4e15b71b0300232dbf79`, the public `decodeParquetFooter` route now selects the TypeScript-compatible bounded Compact prefix decoder already used for page headers. The legacy `decode_schema` and `decode_compact_footer` callers retain their native diagnostic profile. Wire conversion failures become `PARQUET_FOOTER_DECODE` diagnostics; trusted control failures still escape. The public object inserts `diagnostics` before the optional value fields, matching TypeScript key order. No global wire conversion or serde source conversion changed. The parser preserves the original source and duplicate, unknown, ordered wire fields. Framing, encryption and trailing-byte handling retain their existing bounds and diagnostics.

`scripts/rust-migration/r8/freeze-parquet-footer.ts` regenerates `tests/rust-core/fixtures/parquet-footer-malformed-ts-freeze.json` byte-identically from the TypeScript public API. It freezes the full enumerable outcomes for 14 synthetic footer captures: seven prior malformed page-header analogues, truncated double/UUID, three valid empty structures/collections, a wide varint, and an empty footer region. Each input includes exact bytes and SHA-256. The Rust comparison checks complete result envelopes and top-level key order, while an isolated source test retains unknown keys, values and an ID containing lone UTF-16 surrogates. The existing 48-case metadata whole-outcome goldens remain unchanged and matching.

Fallible allocations in the Compact decoder and page/body helpers now originate trusted `RESOURCE_LIMIT` control failures. Page diagnostic conversion propagates only trusted controls, so an ordinary source error carrying a resource-like code cannot escape as a host failure. Small contract tests verify both sides without forcing an out-of-memory condition; this does not claim live allocator failure injection.

The source-built Rust core run passed 62 Parquet-filtered tests, including the 14 footer outcomes, 34 page/body envelopes, the unchanged 48 metadata cases, the direct prefix/legacy assertions and the resource-origin controls. Bun 1.4.3 passed eight Parquet footer/page/body tests with 914 assertions. The actual CLI binary passed four tests, including host-control and page/body routes. Source-built WASM and Node each passed the older ten-operation capture profile with three frozen metadata examples, then all 34 page/body and 14 footer public envelopes. Real Chromium 153.0.8010.12 passed the latter 48 cases and raw UTF-16 source retention through the production-feature WASM facade. Its first sandboxed launch failed macOS Mach port registration; the approved unsandboxed launch passed without disabling browser checks. This is current-source local evidence for the explicit opt-in profile; it does not qualify raw host prototypes, default routing, complete Parquet semantics or installed artifacts. The parent's separate release Python build used the explicit macOS target/debug-symbol workaround successfully on the predecessor `3edb00e` source. Python replay of this follow-up belongs to the parent and is not claimed here.

Source SHA-256: `parquet_capture_inspection.rs` `9e41bcdce7ec54ee61501e4df7c3d33d2171dbe3c573bbe72fcab8979e99970a`; `parquet_schema_decode.rs` `53e6cafa019703b7ae86e08170c33358eb03a4ef878b68172bc841d3003dd8f8`; `parquet_pages.rs` `b0c4870ced9b59c952c00713ab05495cc7e4ad0bc085d572631467eec6401945`; footer freezer `1387073111face7ed892519e2f11ecf725afa32dc9af95b4ed8faea8fd5cd273`; frozen packet `ebaa919940144dad53996c47c242afb7780643d24b93aef0136174fea9c7605a`.

Replay harness SHA-256: older ten-operation Node/WASM `e629c52ac075ca6965f53b1593322ce2069c047a8cd0dce8dd801152a68c3a3b`; combined Node/WASM `ee83a041325c6d465a9cf9048efeaee16368843cecbeae5b5f147c5abe44b890`; Chromium `f45bebde3c2786ff98e27f18648e21f8ebf181eb07f9b954fdb7acc811b45d53`. Source-built release Node addon SHA-256: `d04bc7c43f207e55e4078845b359c594c04f93022040dca9399a064c075946fd`; generated production-feature WASM binary SHA-256: `fbb468edee7bdcda17ac5bf62dee763d3b838c7b45c7eff6eba9e62720c98c5b`. The host artifacts were rebuilt from this private checkout using rustc 1.90.0 and the cached separate target directories. The WASM module was generated by wasm-bindgen 0.2.100 without `parquet-test-hooks`.

Reproduction commands from the repository root, with the installed Rust toolchain and cached targets selected as above:

```sh
bun scripts/rust-migration/r8/freeze-parquet-footer.ts
bun test tests/parquet/footer.test.ts tests/parquet/pages.test.ts tests/parquet/bodies.test.ts
cargo test -p umf-core --offline parquet_ --lib
cargo test -p umf-cli --offline --test parquet_capture_cli
UMF_PARQUET_CAPTURE_NODE_PACKAGE=/private/tmp/umf-parquet-pages-node-package node bindings/core/node/tests/parquet-capture-current-source.mjs
UMF_PARQUET_CAPTURE_NODE_PACKAGE=/private/tmp/umf-parquet-pages-node-package node bindings/core/node/tests/parquet-pages-body-current-source.mjs
UMF_PARQUET_CAPTURE_WASM_PACKAGE=/private/tmp/umf-parquet-pages-wasm-pkg UMF_PARQUET_PAGES_HOST=wasm node bindings/core/node/tests/parquet-capture-current-source.mjs
UMF_PARQUET_CAPTURE_WASM_PACKAGE=/private/tmp/umf-parquet-pages-wasm-pkg UMF_PARQUET_PAGES_HOST=wasm node bindings/core/node/tests/parquet-pages-body-current-source.mjs
UMF_PARQUET_CAPTURE_WASM_PACKAGE=/private/tmp/umf-parquet-pages-wasm-pkg bun bindings/core/wasm/tests/parquet-pages-body-browser.mjs
```

## Parent composition

[Independent Sol review](sol-review.md) approves private `b508fd95` for the
bounded opt-in source profile. The parent composed it with the independently
reviewed Compact encoder, retaining all 13 advertised operations. A separate
composition review checks those routes and the exact owner mappings. Canonical
metamodel/resource generation has been refreshed for that combined source;
the fixed-point checks pass. The composed Rust core suite passes all 579 tests,
the exact inventory/ledger controls pass 83 tests, and the Python distribution
resource suite passes 134 tests. Both TypeScript configurations and the source,
compilation and Python boundary checks pass. The broad wire suite and final
composed CLI replay are still running and are not claimed as completed here.

The [release Python predecessor observation](predecessor-release-python-observation.json)
and [test log](predecessor-release-python.log) record all 34 page/body cases on
CPython 3.13.16 in 90.65 seconds. The extension uses the production Hatch Darwin
target and unstripped/debug-symbol workaround, with frozen Python sources and
generated resources from `3edb00e`. Import-origin guards reject ambient packages.
This proves the page/body predecessor under release flags, not the later footer
or allocation changes, an installed wheel, a current SDK, or a release.


The parent made two type-only corrections to the replay scripts: the page-byte
mutation uses a non-null indexed read, and intentional malformed encoder inputs
use an `unknown[]` collection. Both fixture generators reproduce the recorded
packets byte-identically. The current page freezer SHA-256 is
`de771211088e941d209cb376914d53ec875bed6515937f1049fb79bca2a2a567`; the
earlier freezer hash above identifies the private predecessor. No Rust runtime
source changed after the independent source and composition reviews.
