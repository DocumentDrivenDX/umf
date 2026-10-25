---
ddx:
  id: umf.evidence.rust-migration.r8-avro-adapter-wave
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-007
      kind: verifies
    - id: CONTRACT-008
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-avro-full-predecessor
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-avro-semantic-inspection
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-avro-candidate-edit
      kind: informed_by
---

# R8 Avro adapter operation wave

## Default-root inventory and bounded selection

`src/index.ts` exports the Avro adapter barrel. The executable adapter surface
in `src/adapters/avro/index.ts` is `avroRegistry`, `inspectAvro`,
`importAvroSchema`, `getAvroFieldMetadata`, `exportAvroSchema`, `getAvroNode`,
`editAvroNode`, `proposeAvroNodeEdit`, and `exportAvroBundle`. The metadata
barrel also exposes `deriveAvroFields` from `metadata.ts`. Package data and
schema constants are intentionally not counted as operations. The selection
below is opt-in; no default root or inventory retirement state changes here.

The highest-readiness executable operations for a bounded binding wave are:

| Predecessor operation | Rust wire operation | Current Rust ownership/evidence | R8 work and limit |
| --- | --- | --- | --- |
| `inspectAvro(document)` over an imported root/dependency set | `avro.schema.inspect` | Rust structural inspector; Node wrapper; Rust tests plus independent Apache Avro 1.12.0 and fastavro 1.12.2 parser observations | Add WASM export and an opt-in WASM wrapper. `complete` stays false and `AVRO_PROFILE_LIMIT` remains present. |
| `proposeAvroNodeEdit(document,path,text,dependencyId?)` | `avro.schema.proposeNodeEdit` | Rust candidate construction; Node wrapper; focused Rust candidate tests | Add WASM export and wrapper. This produces an explicit candidate report; it is not conservative edit acceptance and does not substitute for TypeScript's `validation` field. |

`getAvroFieldMetadata` / `deriveAvroFields` already have Rust Node and WASM
bindings and a 100-case, 294-field opt-in packet. The document preservation
operations have Rust core ownership, but do not yet have corresponding
Node/WASM wire operations. They are not included in this two-operation slice.
`editAvroNode` also remains outside the slice because its conservative
completeness guard is distinct from candidate proposal.

## Implementation in this packet

The proposed WASM Rust exports are isolated in `bindings/core/wasm/src/avro.rs`
and the host wrappers are in `bindings/core/wasm/src/avro.js`. The wrappers
require the exact versioned profile and operation IDs, preserve the incomplete
inspection result, enforce candidate-report shape, and forward cooperative
work/cancellation controls. `bindings/core/wasm/tests/avro-wrapper.test.js`
exercises these wrapper contracts with a mock wire module.

These files are not yet connected to `bindings/core/wasm/src/lib.rs` or the
public WASM root. The mock tests establish wrapper behavior only. They are not
WASM, Node/Bun native-addon, real-browser, package-root, predecessor-parity, or
native-parser evidence. A later integrated qualification must bind both Rust
exports, run the frozen predecessor outcomes against the installed package in
Node and Bun, and execute fresh Chromium WASM. The Rust candidate report's
intentional shape difference must be reconciled explicitly; it must not be
smoothed into false exact-output parity.

## Predecessor and native evidence mapping

The frozen TypeScript packet is
[`r5-avro-full-predecessor/outcomes.json`](../r5-avro-full-predecessor/outcomes.json).
It captures import, export, inspection, node read, edit proposal and bundle
behavior including dependency order, unknown native metadata, exact numeric
tokens, unknown representation refusal, copy isolation and refusal precedence.
It is the current-source predecessor baseline for these operations only at its
recorded source hashes.

The native parser comparison for the selected inspector operation is
[`r5-avro-semantic-inspection/native-oracle-results.json`](../r5-avro-semantic-inspection/native-oracle-results.json).
It compares selected authored and Rust-exported schemas using Apache Avro
1.12.0 and fastavro 1.12.2. This is scoped structural evidence, not complete
Avro 1.12 validation. No independent Avro parser oracle is claimed for
candidate-proposal report shape or acceptance.

The Rust core candidate evidence is
[`r5-avro-candidate-edit/README.md`](../r5-avro-candidate-edit/README.md).
Its candidate report deliberately differs from the TypeScript proposal's
`validation` member; source admission and structural inspection are separate
report fields in Rust. The binding must preserve this versioned difference.

## Verification so far

Current-source focused checks pass on Bun 1.4.3:

```sh
bun test ./bindings/core/node/tests/avro-inspector.test.js ./bindings/core/node/tests/avro-candidate.test.js
# 6 tests, 29 assertions; existing opt-in Node addon path
bun test ./tests/avro/native.test.ts --test-name-pattern='AC2|AC3'
# 2 TypeScript predecessor tests, 14 assertions
bun test ./bindings/core/wasm/tests/avro-wrapper.test.js
# 3 mock-module wrapper tests, 15 assertions
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
  CARGO_TARGET_DIR=/private/tmp/umf-r8-avro-wave-target \
  cargo test -p umf-core-wire --test r5_avro_inspect_wire --offline
# 4 Rust inspector wire tests
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
  CARGO_TARGET_DIR=/private/tmp/umf-r8-avro-wave-target \
  cargo test -p umf-core-wire --test r5_avro_candidate_wire --offline
# 4 Rust candidate wire tests, including the frozen packet replay
```

The Node checks invoke the existing local addon; they do not constitute an
installed package replay. The TypeScript checks cover only AC2/AC3. Rust wire
tests establish the current core-wire paths, and the WASM wrapper tests use a
mock module. The Rust WASM module is awaiting integration into the shared root.
No real WASM/browser or installed-package parity run has been performed for
this packet. The prior native-parser results remain scoped to the source and
artifacts in their own evidence record.

Selected source fingerprints at this packet revision:

| File | SHA-256 |
| --- | --- |
| `src/index.ts` | `acfc8529b437fc6daa279a6586acb25644bae4c3c0b0fe15541d07eba20658da` |
| `src/adapters/avro/index.ts` | `c8f3bceb8f7e347565578b8003c12860968abdcd4a5ec4f6991668edd9d00dff` |
| `bindings/core/wasm/src/avro.rs` | `e273e152daf18d24b5f051674a327e85688a008fd8a47f9c05f1aaa4c4cbad09` |
| `bindings/core/wasm/src/avro.js` | `0cdea30d7fed941167cb5efd59d335aa29710f3a8a239b58f4275788074825b1` |
| `bindings/core/wasm/tests/avro-wrapper.test.js` | `63858d4ddf932efbbf7f8dd0094dd325638f7db5aacd1cb7f6ced48800f85460` |
| `r5-avro-full-predecessor/outcomes.json` | `2569299ce5ddaf7bd54934139291077487244382df0ffb2b97902ca051db954c` |
| `r5-avro-semantic-inspection/native-oracle-results.json` | `c7051e290246fb3d3a477c008811a52a9315af5405191219c7666823c3f6f12e` |

These selected fingerprints are not an exhaustive build closure. No Avro root
export is retired by this candidate packet.
