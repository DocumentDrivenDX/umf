---
ddx:
  id: R8-PROTOBUF-SOURCE-EXPORT-HOST
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: R5-PROTOBUF-SOURCE-EXPORT
      kind: informed_by
    - id: R8-PROTOBUF-SOURCE-IMPORT-HOST
      kind: informed_by
---

# R8 Protobuf source export host boundary

This packet records an additive opt-in Node and browser WASM host boundary for
`exportProtobufSources`. It does not change default TypeScript routing. The
caller supplies a trusted asynchronous `emitter.emit(bytes)` callback, which
receives exactly one argument. The Rust session prepares descriptor bytes,
admits the callback result, then copies the post-callback document, using one
cumulative `TransportUsage` and one JS control bridge across the stages.
Rejected callback values propagate by identity; only successful fulfillment is
followed by a control checkpoint and result admission. The descriptor archive
is retained in the returned source document and is not used as emission input.

The host admission order is: full host JSON copy for the predecessor's
`inspectProtobuf(document)` validation; original-object ordinary reads of
`modules`, `modules.find`, matching module `elements`, `elements.find`, the
matching element `extensions`, and the Protobuf payload; original vocabulary
and version reads; selected-payload copy; pinned Draft 2020-12 payload schema
validation; representation checks and descriptor writing. After successful
emitter-result copy and shape validation, the post-callback document is copied
and inspected. This keeps payload-only refusals in the payload phase rather
than revalidating a patched containing document.

The payload schema is compiled once from the pinned embedded
`spec/extensions/protobuf/package.json`, then each payload instance is
validated under the operation Context. The Rust schema-only checkpoint is
separate from the descriptor writer. Rust tests show a schema-valid malformed
unknown-wire payload passes schema admission and then fails as
`PROTOBUF_DESCRIPTOR`, matching the TypeScript writer phase. Unknown archive
members also pass the package schema and are rejected later as
`PROTOBUF_REPRESENTATION`, preserving the predecessor's check order.

## Frozen predecessor and controls

The governing predecessor is
[`r5-protobuf-source-export/predecessor.json`](../r5-protobuf-source-export/predecessor.json),
SHA-256 `699ef9545e9f9e40cbb2ed34ecc084501e5a9d85ba215624ef209309c26625a8`;
its capture program SHA-256 is
`ebbfecff46714e14849e84f59268102c64d7c86773111a30055e33b57ca42ed9`. Its
successful descriptor bytes are 83,233 bytes with SHA-256
`78ce5e414d52e36f6dab8cf01e9dd58ff6ed230d2a2abc486b7275096d05d5a8`.

The focused host corpus in
[`tests/rust-migration/r8-protobuf-source-export-host.test.js`](../../../../../../tests/rust-migration/r8-protobuf-source-export-host.test.js)
pins successful callback arity, archive and unknown result-field retention,
ordinary document reads after inspection, a proxy-selected payload mutation
that must fail as `PROTOBUF_PAYLOAD`, result failure before post-callback
document access, rejected emitter identity, unknown archive refusal, and
schema-valid/writer-invalid ordering. The latter is captured by a Bun
predecessor probe as `PROTOBUF_DESCRIPTOR: RangeError: premature EOF`; the
Rust schema checkpoint and direct writer have corresponding unit coverage.

## Bounded host-reflection limitation

`HostJsonEvent::ReadProperty` performs an ordinary JavaScript read, so inherited
getters and Proxy `get` traps retain their identity and order. The Rust array
traversal reads `.find` but implements bounded dense-array traversal itself; it
does not invoke a replaced `Array.prototype.find` method. The test suite pins
that divergence as an explicit open behavior. Arbitrary replaced array methods,
array prototype behavior, and proxy mutations beyond the frozen event subset
remain unqualified; this packet does not establish full source-export parity or
default route selection.

## Validation status

The source adapter and schema-only stage passed focused tests with pinned Rust
1.90.0:

```sh
TMPDIR=/private/tmp CARGO_TARGET_DIR=/private/tmp/umf-protobuf-export-target \
  cargo test --locked --offline -p umf-core --test r5_protobuf_source_export
TMPDIR=/private/tmp CARGO_TARGET_DIR=/private/tmp/umf-protobuf-export-target \
  cargo test --locked --offline -p umf-core payload_schema_tests --lib
TMPDIR=/private/tmp CARGO_TARGET_DIR=/private/tmp/umf-protobuf-export-target \
  cargo check --locked --offline -p umf-core-wire --features embedded-adapters
TMPDIR=/private/tmp CARGO_TARGET_DIR=/private/tmp/umf-protobuf-export-target \
  cargo check --locked --offline -p umf-core-node
```

Results: source-export integration tests 5/5, schema-checkpoint unit tests 2/2,
and both checks passed. `bun run typecheck` passed.

The Node/Bun packet replay command was:

```sh
UMF_PROTOBUF_SOURCE_EXPORT_PACKAGE=/private/tmp/umf-r8-protobuf-export-node-pkg \
  bun test tests/rust-migration/r8-protobuf-source-export-host.test.js
```

It passed 9 tests / 35 assertions, including all 14 frozen predecessor cases
paired live against `src/adapters/protobuf/source.ts`. Independent runs took
158.85s and 177.24s for the packet test. This is a material throughput concern
for default-route use; the result qualifies semantics only and does not establish
acceptable production latency.
The exact frozen predecessor packet remains pinned above. The real Chromium
replay command was:

```sh
UMF_PROTOBUF_EXPORT_WASM_PACKAGE=/private/tmp/umf-r8-protobuf-export-wasm-pkg \
  bun scripts/rust-migration/r8/protobuf-source-export-browser.mjs
```

Chromium 153.0.8010.12 matched all 14 packet outcomes. For the null emitter
result only, comparison normalizes the platform-specific native `TypeError`
wording; code and path are null on both hosts, and the binding reproduces the
ordinary `result.files` access after Rust copy admission. The frozen Bun text
is `null is not an object (evaluating 'result.files')`; Chromium reports
`Cannot read properties of null (reading 'files')`.
The compact Chromium receipt is
`/private/tmp/umf-r8-protobuf-source-export-browser-receipt.json`, SHA-256
`dd7f81411403f2cfffead27d7245a9d1f17529d395320805e41fdcbf7b4cb6fc`.

The source-bound Node package is
`/private/tmp/umf-r8-protobuf-export-node-pkg`; addon SHA-256 is
`6548fa99396f77f4e039cc24535b561c84dc2bb86065db461ac5b01fdd373ff7`.
The source-bound WASM package is
`/private/tmp/umf-r8-protobuf-export-wasm-pkg`; WASM SHA-256 is
`cc3cc9f1cf925feafa9fde9f38b1d0e0964f7a1b2c55896cef4477920571daa3` and
generated wrapper `index.js` SHA-256 is
`e1b86c2fec0a39327424a53a529b79d146b620325243141b43bdf8b63e737843`.
The frozen authored descriptor fixture is 83,233 bytes and has SHA-256
`6d64e6f8cc8eb240d181b2715b455e62a933a19bd18112620a892ea3ae285bf6`; the
emitter receives 83,233 bytes with SHA-256
`78ce5e414d52e36f6dab8cf01e9dd58ff6ed230d2a2abc486b7275096d05d5a8`.

Final source pins:

| Source | SHA-256 |
| --- | --- |
| `bindings/core/node/index.js` | `aa1821a31a9c5403ebebda208f32b97b81f1697b2f5b5cee8093c752f49fecb7` |
| `bindings/core/wasm/index.js` | `e1b86c2fec0a39327424a53a529b79d146b620325243141b43bdf8b63e737843` |
| `bindings/core/node/src/host-json.js` and WASM mirror | `7a3554d0774fc0046a823b021a93ae0a78bb506c5cc0b4cddc9379ef7eb290a2` |
| `crates/umf-core/src/protobuf_source.rs` | `25bfe873e6b7d6821186d7216c8bae7b817377ab3f0fb06e0ad53d430a8f1a16` |
| `crates/umf-core/src/protobuf_inspect.rs` | `66f00f4f2392b5b9c43b96b644def5a0d90e45b251c58776b153c32296601311` |
| `crates/umf-core/src/protobuf_descriptor.rs` | `46199fc7e85936017ba6a6d7dfc22bf71f026f97599362c5e01d4bcfceb6b6f6` |
| `crates/umf-core/src/protobuf_document.rs` | `294a5f3304e631992fbd5450e7ea1418988ac523d2be90fa1b0a1564afb1cd62` |
| `crates/umf-core/src/host_json.rs` | `1e44ea5c8df6e4c4950a771ae308434dc50f3efa688780c8ce97f923fd95eb8f` |
| `crates/umf-core-wire/src/protobuf_source.rs` | `792610454f4629b4db40abf846c8595fa2707e1689479c99d383d934f366ad83` |
| `bindings/core/node/src/protobuf_source.rs` | `1332521092f1975778660e5083ea7dc39cd051d76c123a44ba18358b85699d97` |
| `bindings/core/wasm/src/protobuf_source.rs` | `094ea3064b9642e609376d88c2961062f84bafde14a5a0d7d079acab538230e8` |
| `tests/rust-migration/r8-protobuf-source-export-host.test.js` | `cd759061a99864d8caa57aa78f10d59c0cb1f71ad604c14a44c24db3fe95fc34` |
| `scripts/rust-migration/r8/protobuf-source-export-browser.mjs` | `2a17644f82c7e84280973caf91838765351c7a401feaaaa66e2bd05e6d7a7050` |

The built artifacts passed the complete frozen 14-case subset. The replaced
`Array.prototype.find` method is still a named host-reflection gap: Rust reads
the property but performs its own bounded dense-array traversal. Arbitrary
replacement methods and proxy mutation patterns outside the captured ordinary
property event sequence remain unqualified. This is an additive opt-in host
profile only; default TypeScript routing remains unchanged.

This receipt is a historical isolated cohort: its Node/WASM wrapper hashes and
packages are pinned to the source hashes above. Later numeric-route work changed
the shared indexes to Node `ca0ad4ffc541d3e2ffc7fc6383a24802ed4b0a15a9bf08513968875cc3296f7e`
and WASM `b3d0b5ce1d56812d58d84ecc26d8768de560312ba95cb5a966873f365ad4d29d`;
those later sources were not used to build or replay the artifacts in this
receipt.
