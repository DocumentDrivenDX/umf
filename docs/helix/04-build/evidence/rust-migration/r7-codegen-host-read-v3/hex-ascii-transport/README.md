---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-host-read-v3.hex-ascii-transport
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-067
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-codegen-host-read-v3.framed-response-transport
      kind: supersedes
    - id: umf.evidence.rust-migration.r7-codegen-host-read-gate0
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R7 V3 ASCII hex host-response frames

This successor changes only the private V3 host-response frame representation.
The candidate remains opt-in, and the TypeScript default export is unchanged.

## Protocol

Node and WASM now use the same ASCII descriptor:

```text
UMF-HOST-FRAME-V3|token|offset|count|hex
```

Each UTF-16 unit is four lowercase hexadecimal digits. A frame contains at
most 8,192 units and therefore at most 32,768 payload characters, plus its
small header. JavaScript keeps the original string in the call-scoped host
closure. The helper emits one bounded string per frame without consulting a
live `Uint16Array`. Both bindings pass that string to the shared Rust parser;
Rust validates the prefix, token, exact offset and count, exact hex length,
and all hex digits before growing the assembled UTF-16 result. The parser
preserves lone surrogate units and frame boundaries continue to avoid
splitting a valid surrogate pair.

The Node and WASM `wire.js` copies are byte-identical. WASM no longer decodes a
frame through generated glue's `Uint16Array` `instanceof` path or uses a
reflective frame object. The Rust frame unit tests reject malformed prefixes,
token/offset/count mismatch, oversized count, wrong payload length, and
non-hex payload without changing assembly state.

## Verification

The fresh extracted `@umf/core@0.5.6` package passed the frozen full Gate 0
differential and all 31 R3 `generatePythonClient` requests in packed Node
`v26.12.1` and Bun `1.4.3` (`process.version` `v26.3.0`). Both runs also passed
crossed semantic gating, late unpaired-UTF-16 output path, host-control
failure and recovery, cumulative response work, and lone-surrogate record
and action selection cases. The cumulative probe reported a first-response
work upper bound of `943972697`, second-response debit `5795`, limit
`943978491`, and `METER_FAILURE` at `943978789` on getter read three; the next
invocation recovered.

The packed browser entry passed the same 46 Gate 0 observations and 31 R3
requests in Microsoft Edge `155.0.0.0`, with zero external requests. A new
browser adversarial mutates `globalThis.Uint16Array` from the original `text`
getter before Rust requests response frames; generation still succeeds and
the original global is restored in `finally`. The browser identifies as
HeadlessChrome/155 with Edg/155; this is an Edge result, not a Google Chrome
claim. The first browser attempt used restored, old ignored glue and failed
with an operation-surface mismatch. The final pass rebuilt its browser bundle
against the fresh glue and WASM binary; the ignored repository package was
restored afterward.

Focused tests passed:

```text
bun test ./bindings/core/node/tests/host-response-frames.test.js
10 passed, 52 assertions
cargo test --offline -p umf-core-wire host_response_frames --lib
7 passed
bun run typecheck
passed
```

The Rust tests used Rust `1.90.0`, offline Cargo, `CARGO_BUILD_JOBS=2`,
`CARGO_INCREMENTAL=0`, and isolated `CARGO_TARGET_DIR=/private/tmp/umf-v3-hex-frame-target`.
Release Node and WASM bindings both built successfully. The generated WASM
glue used wasm-bindgen CLI `0.2.100`. `npm pack` succeeded using the isolated
cache `/private/tmp/umf-host-response-v3/npm-cache`; the package was not
published.

## Artifact and source identities

The final packed artifact hashes are:

| Artifact | SHA-256 |
| --- | --- |
| npm archive `umf-core-0.5.6.tgz` | `9fc970c30ec69b5e5358a92dfb29ad7a07e6fd589d99702811e4eb9e1d877f4f` |
| Packed V3 Node bundle | `74c1bceaeab62d37481a1ad67a4552f85c6160aa3329ed157f50108def71de8b` |
| Packed V3 browser bundle | `5c5a5ff68f5a5235cd3477c6ecc6b74eaaeb52029ce8b2d247fa908da5ee5f16` |
| Node native addon | `d1d7487c07602081f25aa68005c4cb371a5f6d904aead3f2d8af498a326d5096` |
| WASM glue | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| WASM binary | `dcc605f58898b2bb479236f5904443ec739720051b4ab6cd4f3432785a465bc8` |
| Node and WASM frame helper copies (same hash) | `020a58d34afaad50bc2b562d405d7ce8d052e4d0f7185444188a1d1d3e50ecd1` |
| `package.json` | `e567355206d33cbf235ad7302e793427160f5075fff759764e966b627007af82` |
| Commerce input fixture | `19c018888066d391599d4bc8079ec8f3479266e6ecc55237c57825bc33c3003d` |
| Browser qualification harness | `cdfa2738180ba2b2b37a545abf3f44ae2e9638eddfc2ee52f0b1cc69e94b234f` |
| Frame helper tests | `2e101c51a9ecd572307fe5f1dc4cab2556f507f4d0175c63083562b50fea438d` |
| Shared Rust frame parser | `a9d4646ac36f939d4430b2330193ed4c4fdf2009e5dd2f85cbe40877709fd28a` |
| Node binding source | `a35d230d1480d1c5d2b0600729ce7956d8e2fe98bb36a913d74c5fa90972b0c0` |
| WASM binding source | `e3de1d9889558eb9be13d47b50ec1b163513a3214b13bdfccefd60521333a651` |
| Host-read V3 dispatcher | `f3ab136e5666d6d60d1afbf35d42feff6a591153facbfdd3bb0562fe2ea13a90` |
| Runtime facade | `7c5b60c59d5e3fa5e5611a1356d3d94103546cffc4cfe7303664f36ec69f2915` |
| Trusted codegen resources | `85e978f08c2ff42c9347b653ed12b9205c2fd1d3c0d205617092138cdc589d14` |
| Codegen wire implementation | `2d72cb35e651350a085ce326af2c884bfde4da69941415b59e0187af8818354a` |
| Core wire dispatcher source | `4912fb00a99bf575b1dc875d10bcf52f51d1c599a01d17b1b1a928546941885d` |
| Rust codegen client source | `d3bd015b1aa32b5dbf3d28c766f3f39f7ed733878a55a91d489f2a91ee28dca5` |

This is a bounded artifact cohort from a shared, moving worktree. The listed
V3/frame sources were captured after the release builds and replay, and the
Node/WASM helpers match byte-for-byte. Other agents were changing adjacent
core modules during the same work window, so this receipt does not claim a
complete immutable workspace closure. A fresh integrated rebuild and replay
is still required after those shared edits settle.

Independent Sol review confirmed the prior WASM live-`Uint16Array` defect is
closed in this receipt-pinned opt-in transport. The reviewer verified helper
identity, critical source hashes, packed archive/bundle/glue/binary hashes,
frame validation before destination growth and the absence of a typed-array
frame path in fresh glue. The Bun helper suite passed independently (10 tests,
52 assertions). The reviewer found no remaining P1/P2 within this bounded
scope. A separate Rust replay was interrupted by concurrent, unrelated edits
to `record_values.rs`, so the seven Rust frame tests and full packed Node/Bun/
Edge runs above remain implementer-executed evidence for this artifact cohort.
The reviewer did not independently rerun the complete browser matrix.

## Remaining qualification gates

This change does not close the previous transport caveats. JavaScript must
still enumerate and snapshot a returned dense selected-ID array before Rust
can precharge its descriptor; the cost before precharge is not bounded here.
The binding-level cumulative `TransportUsage` carry still lacks a direct
mutation-sensitive observer test; the packed meter probe has its own
cumulative JavaScript meter. Full response conversion into a JS string before
framing is avoided, but the dense-array snapshot gate remains open. The
opt-in route is not default-qualified, and the broader shared-core integrated
build remains pending.
