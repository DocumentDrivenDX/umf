---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-host-read-v3.framed-response-transport
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
    - id: umf.evidence.rust-migration.r7-codegen-host-read-v3.utf16-cumulative-transport
      kind: supersedes
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R7 V3 framed host-response transport

This successor receipt qualifies the opt-in V3 `generatePythonClient` route
after replacing whole tagged-response strings with a closed descriptor and
bounded UTF-16 token/frame exchanges. The TypeScript default export is
unchanged. This evidence does not authorize default activation or publication.

## Protocol and bounds

The host retains each original string and returns only a small descriptor.
Rust charges the exact token count that the prior tagged wire decoder would
have charged before it requests frames or allocates the decoded string/array.
Frames carry a call-scoped token, exact UTF-16 offset, and count, with at most
8,192 UTF-16 units per frame. Frame boundaries preserve surrogate pairs.
Arrays are admitted only when they are ordinary `Array.prototype` arrays with
an own `length`, exactly the expected own-key count, and enumerable own string
data entries. The host snapshots each selected string once, and Rust checks
per-item and aggregate unit counts against the descriptor before accepting the
array. Abort values must be ordinary objects with exactly one enumerable own
data property, `kind: "umf.host-abort/3"`.

Both bindings retain `TransportUsage` per invocation and seed/capture work and
constraint counters around each response decode. A new generator invocation
starts with fresh counters. Response depth remains local to each bounded
decoder. No aggregate semantic cap was added.

The JavaScript host-helper tests mutate `Object.getOwnPropertyDescriptor`,
`Reflect.ownKeys`, `Object.hasOwn`, `Number.isSafeInteger`, `Math.min`,
`String.prototype.charCodeAt` and `split`, `RegExp.prototype.test`,
`Map.prototype.get/delete`, `Uint16Array`, and `Object.freeze` from a host
callback. Captured intrinsics preserve subsequent descriptor and frame reads.
The test also installs `Array.prototype[0]` as a setter and confirms snapshot
copying uses an own data property. Sparse arrays up to the maximum JS array
length, extra and symbol keys, non-enumerable indices, subclasses, and invalid
abort prototypes/entries are refused before a per-index copy loop.

The JS bridge must still obtain own keys for a returned dense array and copy
its selected string references before Rust receives its descriptor. A very
large dense host array therefore still has an unbounded JavaScript-side key
list/snapshot cost before Rust can precharge it. The implementation preserves
the old admission and read semantics; per-entry cancellation before this
snapshot is not qualified because adding calls would change the legacy meter
trace. This remains a resource-hardening gate for default cutover.

## Verification

The freshly packed Node package passed the frozen full Gate 0 observation
comparison (46 observations) and all 31 R3 `generatePythonClient` requests on
Node `v26.12.1`. It also passed crossed semantic gating, the late output path
with an unpaired UTF-16 code unit, host control failure/recovery, and missing
record/action selection with lone-surrogate IDs. A Bun `1.4.3` replay of the
same packed Node entry passed; Bun reports `process.version` `v26.3.0`.

The packed browser entry passed the same 46 Gate 0 and 31 R3 cases in
Microsoft Edge `155.0.0.0` (`Edg/155.0.0.0`), with zero external requests. This
is an Edge result, not a Google Chrome result.

The packed invocation-level cumulative probe used two identical source-text
responses and a synthetic host meter. It observed a first-response work
upper-bound of `943972697`, a second-response debit of `5795`, threshold
`943978491`, and `METER_FAILURE` at total `943978789` on the third text getter
read. The following call on the same generator recovered with fresh
per-invocation behavior. This proves that the packed bindings forward the
second response's debit and that callback failure/recovery works. Since the
test's synthetic JavaScript meter maintains its own cumulative total, this
integration test would still fail if `TransportUsage` carry were removed.
The independent Rust `TransportUsage` test is mutation-sensitive for
`seed/capture/reset`, but it does not run through Node/WASM binding code. A
binding-level assertion of the carried internal counters remains open.

The focused Rust tests passed:

```text
cargo test --offline -p umf-core-wire host_response_frames -- --nocapture
6 passed
cargo test --offline -p umf-core --lib transport_responses_share_one_work_budget_but_new_calls_reset_it -- --nocapture
1 passed
```

The JavaScript helper suite passed 9 tests and 44 assertions:

```text
bun test ./bindings/core/node/tests/host-response-frames.test.js
```

`git diff --check` passed for the V3 bindings, shared frame helper, accounting,
and focused tests. `bun run typecheck` is currently blocked by concurrent
R5 facet-freezer errors in `scripts/rust-migration/r5/freeze-core-facets-regressions.ts`
(literal `umf` type and facet shape). It reported no errors in the V3 files.
The final integrated-source typecheck remains open.

## Reproduction and artifact provenance

Release builds used Rust `1.90.0`, offline Cargo, two jobs, no incremental
compilation, and isolated target directory
`/private/tmp/umf-host-response-frame-target`:

```sh
cargo build --offline --release -p umf-core-node
cargo build --offline --release --target wasm32-unknown-unknown -p umf-core-wasm
/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen --target web \
  --out-dir bindings/core/wasm/pkg --out-name umf_core_wasm \
  /private/tmp/umf-host-response-frame-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun /private/tmp/umf-host-response-v3/build-candidate.mjs
npm_config_cache=/private/tmp/umf-host-response-v3/npm-cache \
  npm pack --silent --pack-destination /private/tmp/umf-host-response-v3
```

The generated ignored `bindings/core/wasm/pkg` directory was saved under
`/private/tmp/umf-host-response-v3/repo-original-pkg` before the fresh glue
build and restored after the packed Edge replay. The package was copied to an
isolated root, packed as `@umf/core@0.5.6`, extracted under
`/private/tmp/umf-host-response-v3/package/node_modules/@umf/core`, and used by
the Node, Bun, and browser runs. The Node replay command was:

```sh
UMF_REPO_ROOT=/Users/erik/.codex/worktrees/rust-binding-spike/umf \
UMF_NATIVE_TABLE_FIXTURE=/private/tmp/umf-host-response-v3/native-table.json \
node run-v3-packed-node.mjs
```

The native-table JSON was generated from
`tests/unified/table-operation-fixture.ts`. The Edge browser command was:

```sh
UMF_PACKED_PACKAGE_ROOT=/private/tmp/umf-host-response-v3/package \
UMF_CHROMIUM_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
bun scripts/test-rust-codegen-host-read-v3-repairs-browser.ts
```

The exact packed artifacts used in the final three-host replay are:

| Artifact | SHA-256 |
| --- | --- |
| npm archive `umf-core-0.5.6.tgz` | `9c4681d59e8da499ceb654859265df153c72c59529ff1e2f5d4fe03377d613ec` |
| V3 Node bundle | `b10f695fe64b64af83a79565fc0a86991d1a0d27daec81cae919e8f88615201b` |
| V3 browser bundle | `4634ba647b0518c52f458d7f871d2b2896c50eec6a5606517b5f61b29e3af9a2` |
| Node native addon | `7b6cf59d56a5b83fdc92c117c47062d11f60234d6d1664f3cc719284a9c420f0` |
| WASM glue | `895a8fd62a6c1ac1314f1e2ca3a8059d371f5f8e2b7eb21056e2e97d501aa34e` |
| WASM binary | `b343d01f09e503ffa5f869513b94781cefb744c1b7a1686074bfc05af85a49e1` |
| package `package.json` | `e567355206d33cbf235ad7302e793427160f5075fff759764e966b627007af82` |
| native-table fixture | `458cbd3c07a1e930586a69727650404cfcb8512af602b81ea1d85f13ec4288c1` |

The source hashes below were captured after replay. Other agents changed shared
core sources during the build window, and a complete build-start source
manifest was not captured. These hashes therefore identify the receipt-time
files, not a frozen complete source closure for every binary. The replay is an
exact artifact cohort; final integration still requires one clean build after
the shared core edits settle.

| Receipt-time source | SHA-256 |
| --- | --- |
| `bindings/core/node/src/lib.rs` | `6ea1a672ae53ba2d46e44046cfbe2efed50fcf286d7df9a7ee16ba072f41e869` |
| `bindings/core/wasm/src/lib.rs` | `6c008a7cb29c2c369417f167f5d2db1e08af247722afd4aa189f780df9f3f655` |
| `bindings/core/node/src/wire.js` | `f623cbf1368f49045c16aad6bb25d0afa7cd93ced51994f25e85b70f07a5aed1` |
| `bindings/core/wasm/src/wire.js` | `f623cbf1368f49045c16aad6bb25d0afa7cd93ced51994f25e85b70f07a5aed1` |
| `bindings/core/node/index.js` | `11fd21442acccc3afecc4b049cdd9c8573c39c9354e94b34396292ebb945ad20` |
| `bindings/core/wasm/index.js` | `b45c02a251aefedce8e2cdb0d43a489426a53a3b0ae2178282c446697ce42085` |
| `bindings/core/node/tests/host-response-frames.test.js` | `6f5bf4b2133622124b981e64937cba445e39a77c5ac187bf8a2b646d6da7e33a` |
| `crates/umf-core-wire/src/host_response_frames.rs` | `15452fe2b5bf57f6f021d0bfe970764e84299ce2d9060eb0f0a136dd284e5539` |
| `crates/umf-core-wire/src/lib.rs` | `4912fb00a99bf575b1dc875d10bcf52f51d1c599a01d17b1b1a928546941885d` |
| `crates/umf-core/src/context.rs` | `9c11ddc66cfa98431432351005ffff3410effbe1aaa12901515ef66e66a45e16` |
| `src/access/rust-host-reads-v3.ts` | `f3ab136e5666d6d60d1afbf35d42feff6a591153facbfdd3bb0562fe2ea13a90` |
| `src/access/rust-runtime.ts` | `7c5b60c59d5e3fa5e5611a1356d3d94103546cffc4cfe7303664f36ec69f2915` |
| `src/access/codegen-resources.ts` | `85e978f08c2ff42c9347b653ed12b9205c2fd1d3c0d205617092138cdc589d14` |
| `src/node-v3.ts` | `1e8c2741a66ce50cedfbace7d4a81e37afd5008301104a9167c69d59d9a0db3a` |
| `src/browser-v3.ts` | `9a877bb4a284089e6e649cf8aefa04f00667250a8ae34c84ef0b894c41b0189f` |
| `scripts/rust-migration/r7/codegen-host-read-v3-transport-budget-probe.mjs` | `a28e79d184fa432f236bb228e717091352cae1660e84ec0d2741415699075fa1` |
| `scripts/rust-migration/r7/codegen-host-read-v3-packed-node.mjs` | `72a00489f1369b369beb841ef29a90ba71fb9df5a555299f3fc3a49b7b802066` |
| `scripts/test-rust-codegen-host-read-v3-repairs.ts` | `9d9add2980f01d0aaad4c8bb72aefbe4462491d75a9c006c6dc48470985fd57d` |
| `scripts/test-rust-codegen-host-read-v3-repairs-browser.ts` | `85ef7e69e948929c8e39e49594c53ea8b851815e944319de56f42ada3fa88822` |
