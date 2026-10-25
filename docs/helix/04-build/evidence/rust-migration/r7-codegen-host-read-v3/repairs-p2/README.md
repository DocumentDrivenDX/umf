---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-host-read-v3.repairs-p2
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-067
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-codegen-host-read-gate0
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-codegen-host-read-v3
      kind: supersedes
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R7 host-read V3 P2 repair replay

This successor packet records three fixes to the opt-in
`generatePythonClient` V3 route. The earlier V3 receipt remains unchanged as
the predecessor evidence. The default export remains TypeScript; this packet
does not authorize default activation or publication.

## Repairs and limits

Rust now requests `SelectRecords` after the legacy-action declaration and
qualified-identity gates. A crossed fixture with an unsupported legacy action
and a throwing `records` getter returns the legacy semantic refusal without
reading `records`.

V3 output paths now remain `Utf16` through `File`, inventory, and wire output.
The changing-package control reads `shop` for the first four package checks,
then `x\ud800`; the first generated path remains the JavaScript string
`x\ud800/__init__.py`.

Node and WASM host-response wire decoding preserve an `EngineError` marked as a
control failure. Other malformed host-response wire values still map to
`HOST_READ_BRIDGE`. A one-shot meter exception during host-response decoding
returns `METER_FAILURE`, and the same generator succeeds after that one-shot
failure is cleared.

One separate UTF-16 selection issue remains open and was independently
reproduced by the root task. With the commerce fixture (SHA-256
`19c018888066d391599d4bc8079ec8f3479266e6ecc55237c57825bc33c3003d`),
`package: 'shop'`, and
`records: [{module: '\uD800', element: 'x'}]`, the predecessor returns
`ACCESS_UNSUPPORTED` at path `\ud800.x` with message `Selected Record not
found`; current V3 returns `ACCESS_UNSUPPORTED` at `/records` with message
`Selection callback returned invalid data`. This is a known semantic mismatch,
not a parity claim. The analogous `actions` case is not qualified.

Each Node/WASM host-response decode currently creates a fresh transport
`Context`; the host control bridge is shared. Cumulative transport decode
resource accounting across callback responses remains unqualified. A final
integrated-source rebuild is also required because other shared core-wire
sources changed concurrently after the candidate builds.

## Verification

The focused V3 suite passed under Bun `1.4.3` with a 600,000 ms per-test
timeout: 5 tests, 40 assertions, 0 failures in 464.73 seconds. It includes the
complete frozen 46-observation Gate 0 deep equality, the three repair
adversarials, and all 31 R3 `generatePythonClient` requests. The exact command
was:

```sh
bun test --timeout=600000 ./scripts/test-rust-codegen-host-read-v3-repairs.ts
```

The extracted npm-packed Node entry passed the same 46 Gate 0 observations,
31 R3 requests, and the three repair adversarials on Node `v26.12.1`. Its
runner is
[`codegen-host-read-v3-packed-node.mjs`](../../../../../../../../scripts/rust-migration/r7/codegen-host-read-v3-packed-node.mjs).
The table fixture was serialized to a temporary JSON file with Bun because
Node's TypeScript source loader rejects one imported JSON assertion in that
fixture helper. The generated fixture was outside the repository. The exact
fixture command was:

```sh
bun -e "import {tableOperationSource} from './tests/unified/table-operation-fixture.ts'; await Bun.write('/private/tmp/umf-r7-hostread-repair-unpacked/native-table.json', JSON.stringify(tableOperationSource()));"
```

The packed Node replay used `UMF_REPO_ROOT` and `UMF_NATIVE_TABLE_FIXTURE`
pointing to the repository and generated fixture, then ran
`node /private/tmp/umf-r7-hostread-repair-unpacked/packed-node-smoke.mjs`.

The extracted npm-packed browser entry passed the same 46 Gate 0 observations,
31 R3 requests, and repair adversarials in Microsoft Edge `155.0.0.0`
(`Edg/155.0.0.0`); the loopback harness observed zero external requests. This
is an Edge result, not Google Chrome. The exact command was:

```sh
UMF_PACKED_PACKAGE_ROOT=/private/tmp/umf-r7-hostread-repair-unpacked \
UMF_CHROMIUM_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
bun scripts/test-rust-codegen-host-read-v3-repairs-browser.ts
```

The Edge result reported `gate0Cases: 46`, `r3Cases: 31`,
`crossedGate: ACCESS_UNSUPPORTED`, `recordReads: 0`,
`latePath: "x\\ud800/__init__.py"`, `controlCode: METER_FAILURE`,
`recovered: true`, and `externalRequests: 0`.

The three focused Node adversarials also passed independently: 3 tests, 7
assertions, 0 failures. `bun run typecheck`, Rust formatting checks on the
three changed Rust files, `git diff --check`, and
`cargo check --offline -p umf-core-node -p umf-core-wasm` passed. Rust was
`1.90.0`; builds used isolated targets, offline Cargo, two jobs, and disabled
incremental compilation.

## Commands and artifact identities

The fresh Node addon and release WASM module were built as follows:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-hostread-v3-repair-target \
  CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
  cargo build --offline -p umf-core-node

CARGO_TARGET_DIR=/private/tmp/umf-hostread-v3-repair-wasm-target \
  CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
  cargo build --offline --release --target wasm32-unknown-unknown -p umf-core-wasm

/private/tmp/umf-r7-wasm-bindgen-cli/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-hostread-v3-repair-wasm-pkg \
  /private/tmp/umf-hostread-v3-repair-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm

bun run build:rust-codegen-candidate

npm_config_cache=/private/tmp/umf-npm-cache \
  npm pack --pack-destination /private/tmp/umf-r7-hostread-repair-pack --json
```

The package archive was `@umf/core@0.5.6`, extracted under
`/private/tmp/umf-r7-hostread-repair-unpacked`. The browser replay loaded the
extracted browser bundle and WASM binary; the Node replay imported the
extracted package's Node subpath. Temporary swaps of the repository's ignored
generated binding files were restored after builds and Bun tests.

| Artifact | SHA-256 |
| --- | --- |
| Packed npm archive `umf-core-0.5.6.tgz` | `050ace9e682cb0ef18ac701929e1deb03528b6b533af4e8c812c5b0d2a227f1e` |
| Packed V3 Node bundle | `9ed462fefd24e170a089b0621927d1542f14844248c0cd4ea9a2da22ddbdafbc` |
| Packed V3 browser bundle | `a02733767e5f9c1671337a60c090575ee9a4765353b1654af27c3b54db63b7a0` |
| Packed Node addon | `9b088ed419ec11d8c647568b5db5a38cca109d95ce87bbcd7ab50191005b2675` |
| Packed WASM glue | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| Packed WASM binary | `82441d600278abb0ec74c49978264414c5d7cbf18c319030f341f2d946f77beb` |

The prior V3 receipt's addon hash `a48e82f...` and WASM hash `27df687...`
refer to its predecessor build; they are superseded for this replay by the
full hashes above. The JavaScript Node/browser bundle hashes stayed unchanged.

The 26-path source closure pinned by the predecessor receipt, recomputed over
the same paths after the candidate build and before later shared-file edits,
has digest `d9a4ef56f836b75aa57d4ebdc22b5ae2126a88f40bc93b053f4b3c5d59e2a8fe`.
That build-time row for `crates/umf-core-wire/src/lib.rs` was
`f517c38bfae80606830cb2d530e958ec3085893814bc61d844db64e7cf3b5472`. The
shared file subsequently moved to
`093857dfd9ebadd3daeb073ff52651aabb9b1dde5108422d826bcf5891d7af70`; the
current 26-path closure is therefore
`7726de0327e928a52152f397f81e08835e4b64935b41f15d7283c3bd420ad549`, not the
source closure built into this package. V3 source hashes at build-time capture:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-codegen/src/generation/client.rs` | `a7b3fa2c5a46685c56e895122fd9442fff09785c042df79e3e3ad7ab6204514b` |
| `crates/umf-core-wire/src/lib.rs` | `f517c38bfae80606830cb2d530e958ec3085893814bc61d844db64e7cf3b5472` |
| `bindings/core/node/src/lib.rs` | `d3f0d0f468f7fcad82977a8e3e5202f06cbdd8048056df4fc4df993b09102cc7` |
| `bindings/core/wasm/src/lib.rs` | `691104f20da7b23100dc29af99fe750da705c3c2323908c2e78ea46a3936be34` |
| `scripts/test-rust-codegen-host-read-v3-repairs.ts` | `67757837fd97f9569b074e894e993303d7e13aa59f3c3680f34f1f37a9b58176` |
| `scripts/test-rust-codegen-host-read-v3-repairs-browser.ts` | `7aea349f957b615032919f4ed6c16f2cda19e6a27e0fa6744afcaaca2fbdc08d` |
| `scripts/rust-migration/r7/codegen-host-read-v3-packed-node.mjs` | `eac0f598a909d6dbda49fa17ddbd6c5ee9bc9a7fea85bb6673f0b1d288e9d832` |
| `src/access/rust-host-reads-v3.ts` | `f3ab136e5666d6d60d1afbf35d42feff6a591153facbfdd3bb0562fe2ea13a90` |
| `src/access/rust-runtime.ts` | `7c5b60c59d5e3fa5e5611a1356d3d94103546cffc4cfe7303664f36ec69f2915` |
| `src/access/codegen-resources.ts` | `85e978f08c2ff42c9347b653ed12b9205c2fd1d3c0d205617092138cdc589d14` |

The packed artifact hashes identify exactly what the Node and Edge runners
loaded. The source closure table records the repository inputs at receipt
capture; concurrent changes to shared core-wire sources mean a final integrated
rebuild and source pin refresh remain necessary before any activation decision.
