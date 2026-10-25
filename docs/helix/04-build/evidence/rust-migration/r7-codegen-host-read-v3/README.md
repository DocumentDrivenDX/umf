---
ddx:
  id: umf.evidence.rust-migration.r7-codegen-host-read-v3
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-067
      kind: informed_by
    - id: umf.evidence.rust-migration.r3
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-codegen-host-read-gate0
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# R7 codegen host-read V3

This packet records the opt-in Rust-backed route for the existing direct
`generatePythonClient` API. It does not qualify CONTRACT-067's distinct
`generateAccessPackage` API. The root/default export remains TypeScript, and no
default cutover or publication is authorized by this evidence.

The latest bounded host-response transport cohort is recorded in
[`hex-ascii-transport`](./hex-ascii-transport/README.md). It supersedes the
typed-array frame receipt for the fresh Node/Bun/Edge artifacts and adds the
browser-host `Uint16Array` poisoning control. Earlier UTF-16 selection repair
findings and transport resource limits remain in the predecessor receipts.

## Boundary

The candidate subpath is `@umf/core/rust-codegen-candidate/v3`. Its asynchronous
factory initializes the Node native binding or browser WebAssembly (WASM) module
and returns a synchronous generator. The wire profile is
`umf.python-client-host-read/3`; Rust drives the closed synchronous event set
`InitialPackage`, `ParseText`, `ParseFormat`, `DigestText`, `SelectRecords`,
conditional `NativeFormat`, `SelectActions`, `OutputPackageSuffix(suffix)`, and
`OutputSourceText`.

The original request stays in the per-invocation JavaScript closure. Callback
exceptions are caught as raw JavaScript values, represented to Rust by a closed
`HostAbort` marker, and rethrown by identity before result conversion. The
request state and callback are per call, so no generator-wide lock spans a host
callback. Rust stops at the marker. Nine recursively frozen repository
resources initialize the engine; caller input cannot replace them. The V3
subpath is opt-in. The default `src/access/index.ts` bundle contains neither
the V3 host-read route nor its error-constructor-name normalization.

## Qualification

The frozen Gate 0 probe was run against the legacy generator and the candidate,
then compared by complete JSON equality, including all read traces and reported
outcomes:

| Runtime | Result |
| --- | --- |
| Bun `1.4.3` | 46 Gate 0 observations equal; 4 text reads, changing-text digest, package reads, conditional native `_table_runtime.py`, and thrown-object identity matched. |
| Node `v26.12.1` | 46 Gate 0 observations equal; same stable trace, output paths and exception observations. |
| Chromium-based Microsoft Edge `155.0.4283.62` | 46 observations equal in the extracted packed browser entry; zero external requests. |

The browser row is Edge only. Playwright's pinned Chromium executable was not
installed in this environment, so this packet makes no Google Chrome-specific
claim. The observed User-Agent identifies HeadlessChrome/155 with Edg/155.

The frozen R3 corpus passed all 31 `generatePythonClient` requests against the
legacy direct function in Node. The same 31 cases passed against the extracted
npm-packed V3 Node entry. A work meter observed `952629617` units for a valid
generation. `maxWork: 0` refused with `RESOURCE_LIMIT`; cancellation refused
with `CANCELLED`, and the same generator recovered after cancellation was
cleared and returned seven files. A hostile thrown object's `toString` throws;
the Node probe verified that the caught value was still the identical object.

`bun test tests/access-host-read-v3.test.ts` passed 4 tests and 30 assertions.
`bun run typecheck` passed. The V3 Node crate and release WASM crate compiled
offline with Rust `1.90.0`. The ignored repository WASM glue and binary were
temporarily replaced with the newly generated V3 package for the package build
and browser check, then restored by a shell trap. The repository's restored
generated WASM hashes are recorded below. The browser test loaded the extracted
package's `dist/umf_core_wasm_bg.wasm` and packed V3 browser entry, not the
restored stale glue.

The differential reused the frozen probe
[`codegen-host-read-gate0-probe.mjs`](../../../../../../scripts/rust-migration/r7/codegen-host-read-gate0-probe.mjs),
the commerce fixture (SHA-256
`19c018888066d391599d4bc8079ec8f3479266e6ecc55237c57825bc33c3003d`), and the
generated native-table fixture (SHA-256
`81cfab25e02f16d99fd653b76b5fdd359b175071b9be74936e92c1fa4991aab4`). Gate 0's
218-input source closure digest is
`e5be416acfaaf116999163188f311deec8c34604791389e31291e2fdaac0c136`; the
existing test checks the test, probe, fixture helper, generated fixture,
dependency metadata, and runtime pins. V3 mock tests are pinned by SHA-256
`c927480f424051b4573a487b44a064831c0f26c168cda838a23310d2b7057c33`.

## Build and replay identities

The local build used isolated target directories and no network access:

```sh
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
  CARGO_TARGET_DIR=/private/tmp/umf-hostread-v3-node-target \
  RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  build --offline -p umf-core-node

CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
  CARGO_TARGET_DIR=/private/tmp/umf-hostread-v3-wasm-target \
  cargo build --offline --release --target wasm32-unknown-unknown -p umf-core-wasm

/private/tmp/umf-r7-wasm-bindgen-cli/bin/wasm-bindgen --target web \
  --out-dir /private/tmp/umf-hostread-v3-wasm-pkg \
  /private/tmp/umf-hostread-v3-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm

bun run build:rust-codegen-candidate

npm_config_cache=/private/tmp/umf-npm-cache \
  npm pack --pack-destination /private/tmp/umf-r7-hostread-pack --json
```

The packed artifact was `@umf/core@0.5.6`, extracted under
`/private/tmp/umf-r7-hostread-install/node_modules/@umf/core`. The packed Node
R3 run imported `@umf/core/rust-codegen-candidate/v3`. The browser run served
the extracted `dist/umf-rust-codegen-candidate-v3-browser.js` and WASM binary
from a loopback-only server, launched Microsoft Edge through Playwright, and
made zero external requests. No package was published.

| Artifact | SHA-256 |
| --- | --- |
| npm archive `umf-core-0.5.6.tgz` | `1bc1d220447e2330814a79c52471a6dc1467374da04859285a0f826e4e09b67f` |
| Packed V3 Node bundle | `9ed462fefd24e170a089b0621927d1542f14844248c0cd4ea9a2da22ddbdafbc` |
| Packed V3 browser bundle | `a02733767e5f9c1671337a60c090575ee9a4765353b1654af27c3b54db63b7a0` |
| Packed Node native addon | `a48e82f6634725d8c5a71edb25da31c87b0f6aaf5544a2b7c84499fdeb488286` |
| Packed WASM glue | `a529650ad33bc71fe6e319fc315b5c25ef8da223dbe59f69396b1a10ce3d45c5` |
| Packed WASM binary | `27df687e07032e060f7343120009eea1bb5192bf75434953a0874e019e512b59` |
| Restored repository WASM glue | `8a1b5dd6f45172e5947e678921209c33cb9a7d1a0236bab1c7aa9b76485ff303` |
| Restored repository WASM binary | `95f391c1f3ed6b7ef9488f5699a64fa98879833d6f7de2a9278eaf519d3dd946` |

The source closure digest below is SHA-256 over 26 path/hash rows, sorted by
path and encoded as UTF-8 `path`, NUL, lowercase SHA-256, newline. It pins the
V3 facade, host protocol, Node/WASM bindings, Rust codegen/wire path, build
script, package metadata, and all nine trusted resources.

| Source path | SHA-256 |
| --- | --- |
| `src/access/codegen-resources.ts` | `85e978f08c2ff42c9347b653ed12b9205c2fd1d3c0d205617092138cdc589d14` |
| `src/access/rust-host-reads-v3.ts` | `f3ab136e5666d6d60d1afbf35d42feff6a591153facbfdd3bb0562fe2ea13a90` |
| `src/access/rust-runtime.ts` | `7c5b60c59d5e3fa5e5611a1356d3d94103546cffc4cfe7303664f36ec69f2915` |
| `src/node-v3.ts` | `1e8c2741a66ce50cedfbace7d4a81e37afd5008301104a9167c69d59d9a0db3a` |
| `src/browser-v3.ts` | `9a877bb4a284089e6e649cf8aefa04f00667250a8ae34c84ef0b894c41b0189f` |
| `bindings/core/node/index.js` | `224878d5c5467ea8e2c8cf1c9a9d048c7eeba5bec44091b1c9af553c9ecbd3b9` |
| `bindings/core/node/src/lib.rs` | `f108f2f4e317564899b2cef779ee54cd6f4294f95adcc9184dcc1170cfe9ac78` |
| `bindings/core/node/package.json` | `0ff64693213fd76529d1acaaa890f2bd193c5dbbb784b637490803d7570251e5` |
| `bindings/core/wasm/index.js` | `9a2569fdf1eab0a05a68f8e9812fd8736e8f855926a0953765282fc555313f2b` |
| `bindings/core/wasm/src/lib.rs` | `13f8b221a5a54d26c3fd243095285648381267970ec405bb8b205a6d0cd187e2` |
| `bindings/core/wasm/package.json` | `fb8671743700da211e9a17c29f521b24cc2069e5f4947d09cb7c9c513c231f90` |
| `crates/umf-codegen/src/generation/client.rs` | `147453ae079a57488d4be7c1f6e201b627242c5630f6a33dc0680cd076c75446` |
| `crates/umf-codegen/src/generation/mod.rs` | `c503df5258f40b20b1914a99787ed044998a6bbad2d6249f299b9737b8a6d923` |
| `crates/umf-core-wire/src/codegen.rs` | `2d72cb35e651350a085ce326af2c884bfde4da69941415b59e0187af8818354a` |
| `crates/umf-core-wire/src/lib.rs` | `e39924ac8f4672f81de2ed681adc14f915560b959699d50b5e50f5acc545c20b` |
| `spec/core/schema.json` | `1cef049948bf2c743dacf0348f0f17444e72f81d9a74034ff823429f4c7c4fb1` |
| `spec/core/semantic-type-reference.schema.json` | `adca63532b1424637f49f7e2c8e1c35ce68edd71b3904f476d28322e54d24747` |
| `spec/core/extension-package.schema.json` | `3b47c85750357831c13d902c9375a081c8ed97bc16db5df71fb7607523d9cd2a` |
| `spec/metamodel/generated/core-constraints.json` | `0972db27e5d272dd4ca6a978e33a55e5e8b0406edc3a01f0856e71de30708c13` |
| `spec/metamodel/generated/domain-policy.json` | `0dd7b527889037d849452410bf662b285a9c74d70ce8f6449e792b02270313cd` |
| `spec/extensions/tables/package.json` | `beeb8749216b20d98211700c0a81cdd210b1eaea4060f7ae81b8a91f061da18d` |
| `spec/extensions/actions/package.json` | `b77e7cee2ac6ad9d482122a63d0ab6044c341b2757135a0c896213c3fa596d62` |
| `spec/extensions/binding/package.json` | `f3326533dcf3d2227955bae2261ab005eaf8692e289c7461f2015fd40565a78f` |
| `spec/extensions/binding-stable/package.json` | `0550ae86d0cf07f9e61fb78bbb3a2eeb370838681a1483b1088409ddaeb0631e` |
| `package.json` | `e567355206d33cbf235ad7302e793427160f5075fff759764e966b627007af82` |
| `scripts/build-rust-codegen-candidate.ts` | `298b78b2e26a1d57c88247dd6aede399607998397c8a4bc07bc17d3400353956` |

Closure digest: `91a162cfd15d6de76ba752d611662f923e8cca10213ed9792513ce01657991dc`.

## Limits

This qualifies one synchronous codegen operation and its legacy host-read
boundary. The package/test cohort does not qualify the other codegen operations,
default Rust activation, or Google Chrome specifically. The temporary browser
and Node differential runners were local qualification harnesses; durable
source artifacts are the frozen Gate 0 probe, the V3 mock test, the extracted
package hashes above, and this receipt. Independent Sol review and the final
R7 source-cohort integration gate remain required.
