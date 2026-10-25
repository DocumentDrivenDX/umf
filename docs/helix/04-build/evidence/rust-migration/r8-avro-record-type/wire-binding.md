---
ddx:
  id: umf.evidence.rust-migration.r8-avro-record-type-wire-binding
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-avro-record-type
      kind: references
---

# Opt-in Avro Record Type tagged binding

`umf_core_wire::record_type_binding` exposes the caller-selected
`classifyAvroRecordType` and `recoverAvroRecordTypeBundle` operations under
`umf.record-type-binding/1.0.0`. Both receive full tagged `Value` trees. The
classifier receives the complete source and operation request; recovery
receives the complete classified receipt and current target. Core classifier
and recovery validate their embedded Avro Record Type result/receipt schemas,
including the exact core, semantic-reference and kind-operation schema
references. Caller work control covers tagged transport and core operations.

This is an opt-in differential binding. It does not select Node/Bun, WASM,
browser or installed package routes and carries no raw JavaScript property or
proxy ordering claim. The Rust candidate's existing bounded Avro semantics and
unknown-content behavior remain the only implementation scope described by the
core evidence linked above.

Focused command:

```sh
cargo test --locked --offline -p umf-core-wire record_type_binding
```

The 4/4 focused binding tests passed on Rust 1.90.0. They include classify and
recover, stale-target refusal, wrong-profile/operation and malformed-index
rejection, caller work-limit refusal, and exact Parquet byte recovery. The
no-default-features check also passed; the module is compiled only with
`embedded-adapters`. The final-source host replay and source hashes are recorded
below; this packet does not claim predecessor-wide TypeScript parity.
Each operation now enforces its exact top-level member set and rejects repeated
or unknown envelope fields before dispatch.

## Final-source Node and browser tagged-wire binding replay (2026-10-25)

The final-source replay was built after the Avro classifier and Parquet
`authors` presence and `converted_type` fragment changes settled. The Node N-API
and browser WASM exports expose only the explicit
`umf.record-type-binding/1.0.0` tagged-wire operation through their public
facades. Rust 1.90.0 builds used locked, offline dependencies and fresh output
under `/private/tmp/umf-record-type-final-target`; no checked-in addon or WASM
artifact was used.

The final frozen predecessor packet hashes are Avro
`335537275bb992cbae9ecc0130a0df9510d6106431a25eeccd2de37b38bdc0bc` and
Parquet `dd1c939de24d02abec0e1cf2a9ed75eb6cb3e029655036805578fc850b4689ee`.
The fresh Node Bun test passed 4/4, including public facade Avro classify and
recover, frozen Parquet classify and exact-byte recover, malformed request
`REQUEST`, and host refusal `TEST_BUDGET`. A direct Node 26.12.1 public-facade
replay returned Avro and Parquet `classified`, Avro recovery `ok`, Parquet
recovery `exact`, profile refusal `REQUEST`, malformed refusal `REQUEST`, and
host limit `TEST_BUDGET`. The focused WASM facade suite passed 4/4.

The direct Node replay printed:

```json
{"profile":"umf.record-type-binding/1.0.0","avro":"classified","avroRecovery":"ok","parquet":"classified","parquetRecovery":"exact","profileRefusal":"REQUEST","malformed":"REQUEST","limit":"TEST_BUDGET"}
```

An escalated, no-listener Playwright harness used `page.setContent`, the bundled
current WASM public facade, the generated `wasm-bindgen` module, and the fresh
`.wasm` bytes. Real headless Chromium reported profile
`umf.record-type-binding/1.0.0`, Avro and Parquet `classified`, malformed
`REQUEST`, and host limit `TEST_BUDGET`; both recovery calls passed, including
exact Parquet bytes. The harness does not observe raw JavaScript getter/proxy
ordering, establish a default SDK route, or expand either Rust classifier's
bounded semantic subset.

Chromium printed:

```json
{"profile":"umf.record-type-binding/1.0.0","avro":"classified","parquet":"classified","malformed":"REQUEST","limit":"TEST_BUDGET"}
```

Reproduction commands (Bun 1.4.3, `wasm-bindgen` 0.2.100):

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-record-type-final-target \
  cargo build --locked --offline -p umf-core-node
cp /private/tmp/umf-record-type-final-target/debug/libumf_core_node.dylib \
  /private/tmp/umf_core_node-final.node
cp -R bindings/core/node /private/tmp/umf-core-node-final-facade
cp /private/tmp/umf_core_node-final.node \
  /private/tmp/umf-core-node-final-facade/umf_core_node.node
UMF_RECORD_TYPE_NODE_ADDON=/private/tmp/umf_core_node-final.node \
UMF_RECORD_TYPE_NODE_PACKAGE=/private/tmp/umf-core-node-final-facade \
  bun test ./bindings/core/node/tests/record-type-binding.test.js
UMF_RECORD_TYPE_NODE_ADDON=/private/tmp/umf_core_node-final.node \
  node /private/tmp/umf-record-type-node-final.mjs

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-record-type-final-target \
  cargo build --locked --offline -p umf-core-wasm --release --target wasm32-unknown-unknown
/private/tmp/wasm-bindgen-cli/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-record-type-final-wasm-pkg \
  /private/tmp/umf-record-type-final-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun build ./bindings/core/wasm/index.js --target browser --format esm \
  --outfile /private/tmp/umf-record-type-final-wasm-facade.mjs
bun build ./bindings/core/wasm/src/wire.js --target browser --format esm \
  --outfile /private/tmp/umf-record-type-final-wire.mjs
bun test ./bindings/core/wasm/tests/avro-wrapper.test.js
sed -e 's|/private/tmp/umf-record-type-wasm-facade.mjs|/private/tmp/umf-record-type-final-wasm-facade.mjs|g' \
  -e 's|/private/tmp/umf-record-type-wire.mjs|/private/tmp/umf-record-type-final-wire.mjs|g' \
  -e 's|/private/tmp/umf-record-type-wasm-pkg/|/private/tmp/umf-record-type-final-wasm-pkg/|g' \
  /private/tmp/umf-record-type-browser.mjs \
  > /private/tmp/umf-record-type-final-browser.mjs
bun /private/tmp/umf-record-type-final-browser.mjs
```

The Chromium launch requires the escalated local process permission in this
environment; the successful command was `bun
/private/tmp/umf-record-type-final-browser.mjs`. Source and artifact SHA-256s:

| Item | SHA-256 |
| --- | --- |
| `record_type_binding.rs` | `ba47048cb83b07065135e05cc1e89ded13a68655c80d0c2c13ecf116602f1aea` |
| Node addon export source `bindings/core/node/src/lib.rs` | `60fabfa94da791e7105471a160c55019c44c4cae7b1b77a5e51e66b59fb9e139` |
| WASM export source `bindings/core/wasm/src/lib.rs` | `55e82df6a43ad88eaba747162ea62224c5178ccd23a06cf6cebe134f8786eed5` |
| Node public facade `bindings/core/node/index.js` | `99d06632abee1d16b256ab43766d8f8f1a61e2c883467470db5d7e3015eb9a22` |
| WASM public facade `bindings/core/wasm/index.js` | `9816b1fefc4460820722055e2c1bfbac8de432dfa1a66434beb5b4210a95e731` |
| WASM shared-source manifest | `1a1c64bf9f06ad39281fb6744b36bcac5969f736291fb85a527dfb01569c847f` |
| `avro_record_type_classifier.rs` | `bfcbd20c454a584c8eae05fe5e30dd78c277e17b42ad96541bbea226e60c40f7` |
| `parquet_record_type_operation.rs` | `fd5f08c7dd6ea4a13db49c4de06395fd78de57d69204173c1e68c32aff2bd8bd` |
| Node addon (`.dylib`, copied `.node`) | `fe0119dbd5c43c59dd421baa0d8b9a5784815be3d01b2cddfaffb85431e892d3` |
| Node public `index.js` | `99d06632abee1d16b256ab43766d8f8f1a61e2c883467470db5d7e3015eb9a22` |
| release `umf_core_wasm.wasm` | `c4ac55517729f924ab4d624df94fbf195ee3897b3e2c64e02baf367e40fd63b2` |
| generated `umf_core_wasm.js` | `a48cac0a77c1f051067fcf9a4a38cd2124e4a4dacfc90a49921c9e220711c89b` |
| generated `umf_core_wasm_bg.wasm` | `e76a3410b2af403e4d06cc8f0591b1cdb7490d6f763975248b6661bacebf4247` |
| bundled WASM public facade | `8378cd3ba8c09966d129efa7ce755dec9354fda35a006778448c575b2ecad58e` |
| bundled wire transport | `d0038c639d88ebdb26adbc59351703787f332bdf757f68e2e57a53fbb6b00980` |
| final Chromium harness | `aa19a57036407480620f60bf1496a09be423c2e6d3ca698bc297346f75752c00` |
| direct Node replay script | `959e714b6b2ba44e1ceb9e8c2ba539618bc5365b7dec97d7adbd96f2c187dbe4` |
| Avro frozen predecessor packet | `335537275bb992cbae9ecc0130a0df9510d6106431a25eeccd2de37b38bdc0bc` |
| Parquet frozen predecessor packet | `dd1c939de24d02abec0e1cf2a9ed75eb6cb3e029655036805578fc850b4689ee` |
