---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-host-read-v3.utf16-cumulative-transport
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
    - id: umf.evidence.rust-migration.r7-codegen-host-read-v3.repairs-p2
      kind: supersedes
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R7 V3 UTF-16 selection and cumulative transport successor

This packet records opt-in V3 repairs for unpaired-surrogate selection IDs and
cumulative transport accounting across host callbacks. The TypeScript default
`generatePythonClient` route remains unchanged. This receipt does not authorize
default activation or publication.

## Changes and remaining boundary

V3 now preserves selected record and action identifiers as UTF-16 through
matching and the legacy late `Selected Record not found` / `Selected Action not
found` refusals. This matches the predecessor for a selected ID containing a
lone high surrogate: `ACCESS_UNSUPPORTED`, path `\ud800.x`, and the corresponding
late “not found” message. The Node and Edge packed runs exercise both record
and action cases. The crossed semantic-gate order remains unchanged.

Each host-response decode still creates a fresh `Context`, but Node and WASM
now seed it with the invocation's cumulative `charged_work` and
`constraint_steps`, then carry the resulting counters forward. This keeps
per-response decode depth local while preserving invocation-wide work and
constraint accounting. The isolated Context tests and integrated packed tests
both cover this behavior.

The integrated adversarial meter test processes two identical text callback
responses. The first response reaches `943,972,697` units under a synthetic
meter budget of `943,978,491`; the next response contributes `5,795` units and
triggers `METER_FAILURE` at the third `text` getter read, with total observed
work `943,978,789`. A subsequent call on the same generator succeeds with fresh
per-invocation accounting. This proves cumulative meter control propagation
through the Node and browser bindings; it does not establish a global memory
cap.

The Node binding converts the JavaScript response string to an owned Rust
string before wire decoding, and WASM similarly materializes a JavaScript
string before decode. No response-size cap was added because an unqualified cap
could reject predecessor-admissible inputs. Pre-copy allocation bounds and a
chunked or token/frame response protocol remain open resource gates. The
candidate remains opt-in pending review and a final integrated-source rebuild.

## Verification

The focused Bun suite passed with the frozen 46-observation Gate 0 deep
equality comparison, 31 R3 requests, surrogate selection adversarials, and
control/recovery cases:

```sh
bun test --timeout=600000 ./scripts/test-rust-codegen-host-read-v3-repairs.ts
```

The extracted packed Node package passed on Node `v26.12.1`. The runner checked
46 Gate 0 observations, all 31 R3 requests, crossed semantic gate order,
UTF-16 output paths, control failure and recovery, record/action surrogate
selection, and the cumulative two-response meter case. It ran under the
extracted package root so its `@umf/core` imports resolved to the packed
artifact. The native-table JSON fixture was generated outside the repository
from `tests/unified/table-operation-fixture.ts`.

The extracted packed browser package passed the same cases in Microsoft Edge
`155.0.0.0` (`Edg/155.0.0.0`); the loopback harness recorded zero external
requests. This is an Edge result, not Google Chrome.

The exact browser command was:

```sh
UMF_PACKED_PACKAGE_ROOT=/private/tmp/umf-r7-hostread-utf16-unpacked \
UMF_CHROMIUM_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
bun scripts/test-rust-codegen-host-read-v3-repairs-browser.ts
```

The Node replay command, run from the extracted package root, was:

```sh
UMF_REPO_ROOT=/Users/erik/.codex/worktrees/rust-binding-spike/umf \
UMF_NATIVE_TABLE_FIXTURE=/private/tmp/umf-v3-native-table-source.json \
node ./run-v3-packed-node.mjs
```

The temporary native fixture was created with:

```sh
bun -e "import {tableOperationSource} from './tests/unified/table-operation-fixture.ts'; await Bun.write('/private/tmp/umf-v3-native-table-source.json', JSON.stringify(tableOperationSource()));"
```

`bun run typecheck`, `git diff --check`, focused `cargo check --offline -p
umf-core-node -p umf-core-wasm`, and the two focused Context unit tests passed.
The Rust toolchain is pinned to `1.90.0` in `rust-toolchain.toml`; builds used
offline Cargo, an isolated `CARGO_TARGET_DIR`, two jobs, and incremental
compilation disabled.

## Artifact identity

The tested archive was `@umf/core@0.5.6`, extracted at
`/private/tmp/umf-r7-hostread-utf16-unpacked`. Both runtime tests loaded the
extracted package. The tar listing contained the V3 Node/browser entrypoints,
WASM glue, and WASM binary at the expected `package/dist/` paths, without a
nested temporary package.

| Artifact | SHA-256 |
| --- | --- |
| Packed npm archive `umf-core-0.5.6.tgz` | `64c1e357f85112f6aa6e699bc02691517d8f5dc5e3bbd38c12941f3a805dfa30` |
| Packed V3 Node bundle | `8b0ea90e1366915d243b266376f3fae753af1949562e3715770b7afcb8aaca72` |
| Packed V3 browser bundle | `a02733767e5f9c1671337a60c090575ee9a4765353b1654af27c3b54db63b7a0` |
| Packed Node addon | `40f25c2f580c1bf8e0e03bab1ace979e95e4ce947a7d01241641e1197fc5ea8f` |
| Packed WASM glue | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| Packed WASM binary | `d2817bed3f9d38367b0d6f21c96c8ab2709fa90af249c20a5401ed85fb311c77` |

The source hashes below identify the repository files at this receipt capture.
Shared core-wire sources were changing concurrently around the package build,
so these current-source hashes are not asserted as a frozen complete build-time
closure. The artifact hashes identify the exact packed bits used by the Node
and Edge runs; a final integrated-source rebuild remains required.

| Current source at receipt capture | SHA-256 |
| --- | --- |
| `crates/umf-codegen/src/generation/client.rs` | `d3bd015b1aa32b5dbf3d28c766f3f39f7ed733878a55a91d489f2a91ee28dca5` |
| `crates/umf-core/src/context.rs` | `9aa29dc6eed44d4de887687efb07aa28ce220ea92ee0c7ece0c5ebd0f6264579` |
| `crates/umf-core-wire/src/lib.rs` | `ed10ae47abfe3d4039f889afb5b1bcc2d0f883434926c7a42fb003c4051ff507` |
| `bindings/core/node/src/lib.rs` | `da860bc54e2dfb1da85d7c6ed6158118fe754b7ba358541d8ac6ccdd38b6ae08` |
| `bindings/core/wasm/src/lib.rs` | `83febd8624a4e0f6eb23703c50fdc8b004625bc94f1e93e1bc6bf032783411d8` |
| `src/access/rust-host-reads-v3.ts` | `f3ab136e5666d6d60d1afbf35d42feff6a591153facbfdd3bb0562fe2ea13a90` |
| `src/access/codegen-resources.ts` | `85e978f08c2ff42c9347b653ed12b9205c2fd1d3c0d205617092138cdc589d14` |
| `src/access/rust-runtime.ts` | `7c5b60c59d5e3fa5e5611a1356d3d94103546cffc4cfe7303664f36ec69f2915` |
| `scripts/rust-migration/r7/codegen-host-read-v3-transport-budget-probe.mjs` | `a28e79d184fa432f236bb228e717091352cae1660e84ec0d2741415699075fa1` |
| `scripts/rust-migration/r7/codegen-host-read-v3-packed-node.mjs` | `72a00489f1369b369beb841ef29a90ba71fb9df5a555299f3fc3a49b7b802066` |
| `scripts/test-rust-codegen-host-read-v3-repairs-browser.ts` | `85ef7e69e948929c8e39e49594c53ea8b851815e944319de56f42ada3fa88822` |
| `scripts/test-rust-codegen-host-read-v3-repairs.ts` | `9d9add2980f01d0aaad4c8bb72aefbe4462491d75a9c006c6dc48470985fd57d` |
