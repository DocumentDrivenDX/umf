---
ddx:
  id: umf.evidence.rust-migration.r5-bit128-binding
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-076
      kind: evidence_for
    - id: SD-005
      kind: references
    - id: ADR-006
      kind: references
---

# R5 `umf-128/1` Node/Bun and browser binding

This is an opt-in binding over the reviewed pure Rust `umf-128/1` codec. Node
and Bun expose `createBit128Engine(options?)` from
`bindings/core/node/index.js`. Browser callers use
`createBit128Engine(module, options?)` or `initializeBit128Wasm(loader?, host?,
options?)` from `bindings/core/wasm/index.js`. The API covers the eleven
CONTRACT-076 operations: `parseBits128`, `parseUuid`, `bits128FromBytes`,
`bits128ToBytes`, `uuidFromBits128`, `uuidToBits128`, `compareBits128`,
`bits128ToWords`, `bits128FromWords`, `bits128ToInteger`, and
`bits128FromInteger`. Existing TypeScript defaults remain active.

The public interface needs no schema catalog. JavaScript owns host admission
and presentation: metered ordered shape/descriptor preflight snapshots codec
records before the shared `umf.core-wire/1` serializer builds the tagged
envelope. Rust retains profile, value, UUID consistency, and word semantics.
Byte input uses
intrinsic typed-array brand/length/offset/buffer accessors, accepts Uint8Array
subclasses and Node `Buffer`, requires exactly a 16-byte view, and copies its
view snapshot. Own properties on the typed-array object do not change its byte
carrier. Parsed codec records are copied to frozen ordinary objects; the
predecessor's `bits128ToWords` and `bits128ToInteger` result records remain
mutable. Returned bytes are fresh `Uint8Array` instances. Each operation gets
one host work budget spanning admission, Rust work, and result presentation;
the same engine resets the budget for the next operation. Cancellation, clock
and deadline checks use the same bridge. Rust's
`execute_bit128_wire_with_control` decodes the tagged request, dispatches the
operation and encodes its result through `umf-core-wire` with one `Context` and
the same host-control hook. Codec rules remain in `crates/umf-core`; the adapter
does not duplicate them.

## Frozen predecessor and checks

The predecessor Rust shard's frozen Bun 1.4.3 packet was retained before the
binding work. It records twelve exact success/refusal cases for large and
negative exponents, negative zero, malformed decimal syntax, double-sign word
syntax, and malformed bits/UUID snapshot shapes. The independent Python
integer/`struct`/`uuid` fixture contains 389 fixed vectors (seed 1289562),
including every bit position and random 128-bit values. The pre-binding source
manifest pins the TypeScript codec files, both Bun test files, the Python
oracle generator and fixture; the tests include accessor non-invocation,
symbol keys, malformed object shape, signed boundaries and copied byte views.
The recorded digests are unchanged.

The focused Bun binding suite passes 4 tests and 5,540 assertions. It replays
all 389 Python vectors across parsing, bytes, UUIDs, words and integer tokens;
checks exact frozen error codes/messages; verifies shape-before-accessor and
profile-before-hex refusals for bit and UUID snapshots, integer-token
shape-before-type refusals for undefined, BigInt, Symbol, function and
accessor-plus-extra carriers, and getter non-invocation; validates typed-array
subclass/Buffer carriers even with ignored own metadata, unencodable comparison
operands and malformed word ordering; and exercises per-operation work-budget,
cancellation, and deadline refusal. Proxy key enumeration is preflighted and
metered before descriptor traversal. Fixed-width text lengths are preflighted
before wire construction: a recording invoke confirms that 100,000-character
bit and UUID snapshot fields become bounded sentinels in envelopes under 2,000
characters. Exact Rust refusals retain bit profile precedence and UUID
`originalText` precedence. A Node 26.12.1 smoke replay passed all 389 vector
rows and seven oversized-field refusal cases, and confirmed ordinary frozen
result prototypes.

A release `wasm32-unknown-unknown` build was processed with wasm-bindgen 0.2.100
and run in headless Chromium 153.0.8010.12. Browser execution passed all 389
vectors, confirmed snapshot accessors were not invoked and exact primary,
UUID, integer-literal, and oversized-field refusal precedence, accepted a Uint8Array subclass with symbol metadata, confirmed
`RESOURCE_LIMIT` refusal, and observed 1,507
metered host work units. Reusing an engine with `maxWork: 1507` admitted two
successive parse operations, confirming budget reset at the operation boundary.
The packaged WASM browser script is
`scripts/rust-migration/r5/bit128-binding-browser.ts`.

`cargo check -p umf-core-wire -p umf-core-node -p umf-core-wasm` passed, and
`cargo test -p umf-core --test r5_bit128` passed all four focused Rust tests.
Existing pure-core focused results are recorded separately in
[`r5-bit128`](../r5-bit128/README.md).

`bun run typecheck` passes both repository TypeScript projects. The Chromium
qualification stages the WASM entrypoint with shared implementation siblings
from `bindings/core/node/src`; an individual WASM package allowlist does not
currently contain those sibling imports. Standalone package self-containment
remains an R7 packaging gate and is not qualified here.

## Exact scope

Evidence applies to Bun 1.4.3 and Node 26.12.1 on Darwin arm64, the listed Rust
and wasm-bindgen versions, the packaged Node addon and the released WASM module
used by the Chromium harness. It supports the eleven pure `umf-128/1`
operations and the exact carrier/admission path above. It does not qualify
Python exposure, default JS/browser cutover, Field integration, key tuple
composition, native UUID ordering or enforcement, or any adapter's UUID
recovery behavior.

## SHA-256 inputs and outputs

Frozen predecessor and oracle inputs:

```text
scripts/rust-migration/r5/bit128/frozen-predecessor-edge-vectors.json  5e029e1d866a77bbf2e1ac5ed0ff809ac96dee06ca9890409fbf7a6fa84bffd7
scripts/rust-migration/r5/bit128/predecessor.sha256                  748c2d1b601ec24d6a090ddeb1ce52cd4022f13a9aea2e200e2c8401d4b6e413
src/model/bit128.ts                                                   c4db81a14022db2413ee991e8705d3bee688d0ed1e7c880e6170520a2694d543
src/model/uuid.ts                                                     43b2ea37b050a835e7723c9ea9b32f886fca63f5bb94eb5f8b17b242cf4444f7
tests/bit128.test.ts                                                  2c1f5b54c2ed4924588f2f2d43f2f7c4f89c631765f3ea0cf243fd3f9938948b
tests/uuid.test.ts                                                    549836713a191175f2ee088194aaf57a1d1654809ddfbe4c6a3fb65151715171
scripts/bit128-oracle.py                                              f2289c32ff3920b2707d3111da6bb6dfb3975b9d14bb18b48e5f9b3357c0707a
fixtures/validation/uuid/bit128-oracle.json                            52cab3fc2217144a0d1f2780b2a3102b09a66d04f6689ed7e918b13e2c4c3a47
```

Binding sources and test inputs:

```text
crates/umf-core-wire/src/lib.rs                   57d5c6c014fa8d73ac0628ab64c24bded086de23c57d0972ec1db02d8b0377e0
bindings/core/node/src/lib.rs                    41900a9f677b00add6832a656e3600d139c04abfa66c3c48dbbf8e36a97a4eaf
bindings/core/wasm/src/lib.rs                    10d98f32fcfb1e21bc52df9ba7276410d9558ff1e8d2dcd2cff5dfc72e941790
bindings/core/node/index.js                      30cab525d91348a67ae6106d16126789ff8cdb5ab1bcc7679e842361bbe08757
bindings/core/wasm/index.js                      0a7db66b5bd2c73480b238872de5635ecc02d33a9bff122d28b7c0671f64d99e
bindings/core/node/src/bit128.js                 ce8718f0761c1a171aa03b31b39d03fd21abc5f513649b93651a1239aaf43956
bindings/core/node/index.d.ts                    d904201a1f0e3bdb6f3d1b489c23d407c6ac2acf70316115a2494044e63366e0
bindings/core/wasm/index.d.ts                    12bb419219b8abe21e3acc70ab15cdd28ded26755289d485d164cb2f0f4856a9
bindings/core/node/package.json                  1a7bf1a34272651531cd2f2a896b5a626939d8cff422563f059541102416d695
bindings/core/wasm/package.json                  720cbfaaa9b7d37a8f55b30db97af2571f518213e733a87b017f2ea87b8c5f27
tests/rust-bit128-binding.test.ts                4fc55a6c1bec57b64bc8403899d39f303e52d4cc9a0353d7f8f48b8598d99824
scripts/rust-migration/r5/bit128-binding-browser.ts 13b16cc23f048ca868e24a709f2ea47271911d256ba6e8ff8afd967320561863
```

Built local artifacts used in this run:

```text
bindings/core/node/umf_core_node.node                           4f08b584970ec2d0e1a1a53dd50ddfa172840c6f2ed5e78fdbba90f630dd8bc5
wasm-bindgen output umf_core_wasm.js                            a00065eab3b8d3db1ecd09da9ff3ed7b79e777dabf923eb0840818789cfff9d5
wasm-bindgen output umf_core_wasm_bg.wasm                       55c9081ff14901f9b182604d30a0340897a89b9cdbd18806cc751f2fc57c2f68
```
