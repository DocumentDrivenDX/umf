---
ddx:
  id: umf.evidence.rust-migration.r8-json-number-predecessor
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
    - id: CONTRACT-002
      kind: informed_by
---

# R8 exact JSON number predecessor packet

This packet freezes the TypeScript behavior of the single unmapped
`assertExactJsonNumber` export from `src/model/internal/json-number.ts` and its
`UmfError` dependency. The R8 ledger now accepts a scoped opt-in Rust operation
on the Node and browser roots, backed by the predecessor and host replay
evidence below. Its default implementations remain TypeScript, and its
retirement disposition is unresolved. The predecessor capture itself selected
no default binding.

The complete outcomes and source pin are in
[`typescript-predecessor.json`](typescript-predecessor.json). The matrix covers
accepted exact decimals and safe integers, rejected negative zero and unsafe
integers, rounding and underflow, non-finite conversion, and spellings outside
the decimal helper's grammar. It also preserves a crucial boundary: this
low-level operation accepts `+1`, `01`, and the empty string when their numeric
result remains exact. It does not itself validate JSON number-token grammar;
its framed JSON callers perform that lexical check. Outcomes retain the
predecessor's exact error name, code, and message.

These refusals are portable operation semantics for string input under the
ECMAScript Number and BigInt behavior used by the TypeScript implementation.
There are no host I/O calls, callbacks, mutable objects, or resource reads in
this operation.
The implementation has no explicit token-size or work budget. The packet does
not establish behavior under adversarially large input.

## Opt-in Rust candidate

The current candidate exposes
`umf_core::json_number::assert_exact_json_number(&Utf16, &mut Context)` and
tagged `umf_core_wire::json_number_binding::execute_json_number_wire` under
profile `umf-json-number/0.1`. It passes the token as tagged UTF-16 text, uses
the core's ECMAScript string-to-number conversion and decimal canonicalizer,
and represents the TypeScript `void` success as tagged null. The scoped core
and tagged-wire packet replays match all 18 outcomes by error code and exact
message. The core operation also checks the predecessor's large-exponent zero
behavior.

The wire envelope has no exception-name field, so `UmfError` name parity cannot
be expressed there; `NUMBER` code and exact message are preserved. Rust applies
the explicit cooperative `Context` text/work limits, while the TypeScript
predecessor has no operation-local budget. Resource-limit refusals therefore
fall outside the 18-case semantic parity claim. The selected tagged profile
is opt-in and makes no default-route claim.

Reproduce from the repository root:

```sh
bun scripts/rust-migration/json-number-predecessor.ts
bun scripts/rust-migration/json-number-predecessor.ts --check
bun test tests/rust-migration/json-number-predecessor.test.ts
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target cargo test --locked --offline -p umf-core --test r8_json_number
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-rust-port-target cargo test --locked --offline -p umf-core-wire --test r8_json_number_wire
```

The runner writes only this directory's packet; `--check` recomputes all
outcomes and source hashes. Node/browser default routing, installed package
behavior, default retirement, and release readiness remain unqualified.

## Opt-in Node and browser binding

The Node and WASM package facades expose the opt-in profile
`umf-json-number/0.1` through `createJsonNumberEngine`. Both send the tagged
`assertExactJsonNumber` request to the Rust addon and return `undefined` on
success. For declared string inputs, the public wrappers replay all 18 frozen
outcomes with exact error codes and messages; the Rust wire does not carry an
exception-name field, so `NUMBER` failures are surfaced by the wrapper as a
plain `Error` whose `name` is `UmfError`. The evidence claims name, code, and
message parity only; it makes no `instanceof UmfError` claim. UTF-16 encoding preserves lone surrogate units, and host limits and
cancellation remain distinct control failures rather than number refusals.

The input decision is explicit: the opt-in Rust facade accepts only primitive
JavaScript strings. A direct predecessor call also permits runtime values
outside its declared `string` signature and invokes `Number(token)` before
later string coercion; the existing bounded probe records conversion order
and thrown host exceptions for an object. This tagged interface receives
already-materialized text and does not preserve that behavior. Non-string
inputs therefore throw `TypeError` without coercion. The binding is not
selected by either default root, and the predecessor's broader runtime
behavior remains outside this parity claim.

Real Chromium exercised the generated wasm-bindgen artifact through the public
WASM `index.js` facade, not a facade stub. The browser run also verified the
profile guard and absence of `process`, `Buffer`, and `require` in the bundled
facade. Node and Bun runs exercised the public Node `index.js` facade against
a freshly built addon. These are source-bound opt-in binding results, not
installed-package, release, default-route, or retirement evidence. Resource
limits were checked as wrapper controls, but are outside the frozen semantic
packet.

Scoped test results on Rust 1.90.0 and Bun 1.4.3:

| Check | Result |
| --- | --- |
| TypeScript packet check | 18 frozen outcomes pass |
| Bun predecessor and host-coercion tests | 4 tests, 38 expectations pass |
| Opt-in Node facade replay | Node 26.12.1, 18/18; zero mismatches |
| Opt-in Node facade replay | Bun 1.4.3, 18/18; zero mismatches |
| Opt-in public WASM facade replay | Headless Chromium 153.0.8010.12, 18/18; zero mismatches |
| WASM facade controls | profile mismatch, host budget, cancellation reset, UTF-16 surrogate, browser-global checks pass |
| Fresh Node and release WASM builds | locked/offline Rust 1.90.0 builds pass |
| Current `umf-core` integration test | 2 passed, 0 failed after Core Evolution source stabilized |
| Current `umf-core-wire` integration test | 2 passed, 0 failed |
| Rust formatting check | reports broad pre-existing formatting differences across addon crate roots; no bulk reformat applied |

The Rust packet tests load this documentation packet at test runtime using
`CARGO_MANIFEST_DIR`; production library sources do not compile against
documentation files.

### Host build and replay commands

Fresh Node release addon build (Rust 1.90.0):

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin CARGO_TARGET_DIR=/private/tmp/umf-r8-json-number-final-target cargo build --locked --offline --release --manifest-path bindings/core/node/Cargo.toml
UMF_JSON_NUMBER_PACKAGE_ROOT=/private/tmp/umf-r8-json-number-node/package node scripts/rust-migration/r8/json-number-binding-node.mjs
UMF_JSON_NUMBER_PACKAGE_ROOT=/private/tmp/umf-r8-json-number-node/package bun scripts/rust-migration/r8/json-number-binding-node.mjs
```

Fresh release WASM build and wasm-bindgen generation:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/wasm-bindgen-cli/bin:/opt/homebrew/bin:/usr/bin:/bin CARGO_TARGET_DIR=/private/tmp/umf-r8-json-number-wasm-target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 cargo build --locked --offline --release --target wasm32-unknown-unknown --manifest-path bindings/core/wasm/Cargo.toml
/private/tmp/wasm-bindgen-cli/bin/wasm-bindgen --target web --out-dir /private/tmp/umf-r8-json-number-wasm/package/pkg --out-name umf_core_wasm /private/tmp/umf-r8-json-number-wasm-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun build ./bindings/core/wasm/index.js --target browser --format esm --outfile /private/tmp/umf-r8-json-number-wasm/facade.mjs
```

Real Chromium replay, using the generated artifact and public facade:

```sh
UMF_JSON_NUMBER_WASM_PACKAGE=/private/tmp/umf-r8-json-number-wasm/package UMF_JSON_NUMBER_WASM_FACADE=/private/tmp/umf-r8-json-number-wasm/package/facade.mjs UMF_CHROMIUM_PATH='/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node scripts/rust-migration/r8/json-number-binding-browser.mjs
```

The replay outputs are stored with this packet in
[`node-replay.json`](node-replay.json), [`bun-replay.json`](bun-replay.json),
and [`chromium-replay.json`](chromium-replay.json). Their SHA-256 hashes are
`38a06d7319b9ba072e765761a709ef8932dcf412622c04bf4d7adb2f6e59d1f3`,
`6640aea5741db45acd65a57a4fe673c069dd47cc42ddc7f8470794cc082bf5aa`, and
`806a023a0cda3c09f3e5d0111e5ccee183124b89c5eda12b0444a7b9449f6d36`,
respectively. Packet SHA-256 is
`75105748e73c427088ae1d9e3c1235dadfb74024815c4b3351ec5ea73eb0c2c6` in all
three receipts. Temporary built artifacts have these SHA-256 values:

| Artifact | SHA-256 |
| --- | --- |
| Node addon `umf_core_node.node` | `24e67d2158db413461f21f5cb991d4b3258ab9699f16106e68e25fc7e4657e18` |
| wasm-bindgen glue `umf_core_wasm.js` | `309ee578f3d4ba7d44f66304592eaa9e2b6647839dabd9952098eb85c2c940cd` |
| wasm-bindgen module `umf_core_wasm_bg.wasm` | `a3994c3193d1ff1f393ff657280c661a4add4efdb4a2d854ec0dede8e977505d` |
| Bundled public facade `facade.mjs` | `35bcdb4f4278c5b77f5fdeecaa3672d38a9ce347472a6287680bf3844702787e` |

Temporary artifact paths are under `/private/tmp/umf-r8-json-number-*`; the
hashes pin the exact tested artifacts built after the Core Evolution compile
fix; they do not imply those artifacts are shipped in a package. Shared
Node/WASM helper source is mapped by
`scripts/rust-migration/r7/wasm-package-sources.ts --check` (15 shared files
current); helper SHA-256 is
`27b4404a59d038c5b717de52b4213e3bd88c598ea052d852647a6c28a7fc5141`.

## R8 raw-host default-route gate — blocked

The public TypeScript export remains selected through `src/model/serialization.ts`
and the V4 roots re-export `src/index.ts`; neither V4 entry currently overrides
`assertExactJsonNumber`. A source-pinned raw-host packet now captures ten values
outside the declared `string` type, including primitive values, `Symbol`, two
object coercion sequences, and a thrown sentinel. Its direct TypeScript test
passes 3 tests / 8 assertions. The packet is
[`raw-host-predecessor.json`](raw-host-predecessor.json); it hashes both V4
roots, the exporting module, implementation and `UmfError` source, candidate
Rust operation/wire, and case generator.

Fresh Node 26.12.1 and Bun 1.4.3 candidate comparisons each mismatch all 10
cases. The TypeScript predecessor accepts numeric `1` and a coercible object,
uses `Number` before its later string coercion (observable `number`, then
`string` hints), and rethrows the identical exception from a throwing
`Symbol.toPrimitive`. The opt-in Rust facade rejects each non-string immediately
with `TypeError: token must be a string`, before invoking those hooks. A freshly
compiled optimized Node addon was used; its SHA-256 is
`966af8c4e466ebec512b9c0d61099f433765a913abcd273d18225222437261d1`. The copied
Node facade, `json-number.js`, and `wire.js` hashes match the live source pins
in the receipt.

The same ten-case result was reproduced in real Chromium 153.0.8010.12 against
a freshly built optimized current-source WASM artifact: 10/10 mismatches, no
page errors, and no Node globals. WASM SHA-256 is
`619ed4ebdeb6ba01376f25ed75e2a3b6373444416464657b520ee54c4f39514f`;
wasm-bindgen glue SHA-256 is
`4fb317cf04f5a038fe88160fab5b4c225d15703f5384e93a8745fe94010b7b51`, and the
current bundled WASM facade SHA-256 is
`217db666db7db2fec9a236f51d73bc4bbd2ee59d47c12420bec3bb19e5666560`.
The exact host receipts are
[`raw-host-node.json`](raw-host-node.json),
[`raw-host-bun.json`](raw-host-bun.json), and
[`raw-host-chromium.json`](raw-host-chromium.json); each records the case-level
expected/actual values and source/artifact hashes.

There is a separate resource mismatch even for a string. The TypeScript
predecessor accepts a 4,000,001-character string of zeroes, while Rust refuses
it with `LIMIT: Text-unit limit exceeded` at the current 4,000,000-unit core
limit. Node and Bun receipts record this exact result. Chromium's raw-value
matrix intentionally omits the multi-megabyte performance probe; no browser
resource-parity claim is made for that input.

These two concrete blockers keep the default route unchanged. Preserving the
declared TypeScript `string` interface alone is insufficient: JavaScript callers
can observe the existing conversion order and exception identity. Matching the
unbounded predecessor behavior for large text also requires an explicit policy
decision about operation budgeting before selection. This work changes no V4
root, leaves the Rust operation opt-in, and does not reduce any R8 logical
retirement gap or qualify a release.

Reproduce the source packet and focused test with:

```sh
bun scripts/rust-migration/r8/json-number-raw-host-predecessor.ts --check
bun test tests/rust-migration/json-number-raw-host.test.ts
```

The tested browser reference and WASM facade were built with:

```sh
bun build ./src/model/internal/json-number.ts --target=browser --format=esm --outfile=/private/tmp/umf-r8-json-number-raw/reference.mjs
bun build ./bindings/core/wasm/index.js --target=browser --format=esm --outfile=/private/tmp/umf-r8-json-number-raw/facade.mjs
```

The fresh Node addon was built with Rust 1.90.0 and staged with the current
Node facade and helper sources under
`/private/tmp/umf-r8-json-number-node/package`; that same staged directory is
the default for the Node and Bun runners. Reproduce them with:

```sh
node scripts/rust-migration/r8/json-number-raw-host-node.mjs
bun scripts/rust-migration/r8/json-number-raw-host-node.mjs
```

The current WASM build was generated under
`/private/tmp/umf-r8-json-number-raw-wasm/package`. Reproduce Chromium with:

```sh
UMF_JSON_NUMBER_WASM_PACKAGE=/private/tmp/umf-r8-json-number-raw-wasm/package \
UMF_JSON_NUMBER_REFERENCE=/private/tmp/umf-r8-json-number-raw/reference.mjs \
UMF_JSON_NUMBER_WASM_FACADE=/private/tmp/umf-r8-json-number-raw/facade.mjs \
UMF_CHROMIUM_PATH='/Users/erik/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
node scripts/rust-migration/r8/json-number-raw-host-browser.mjs
```

The Chromium runner needs loopback access for its local page. The source and
artifact hashes in each receipt identify the tested artifacts; these are
private diagnostics and do not qualify a published or default package.

Operation and test source SHA-256 values at this evidence cut:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/json_number.rs` | `2ab551fe8d16394b965f0ec6a0d08d51667c6b4f5fa8a7c2d39c9dc5ab858dd3` |
| `crates/umf-core-wire/src/json_number_binding.rs` | `2e06f7c1d43bb79be11029e868da43798b69d9a856e34199e4deacc9ab75412f` |
| `crates/umf-core/tests/r8_json_number.rs` | `4f312ff77740d827b10b7c2d85aaabf959a0683cdd2acfe871d59bfe10b0ac80` |
| `crates/umf-core-wire/tests/r8_json_number_wire.rs` | `abe7410c0aab0c74d524ffd69465248e615600fa7a950588388f1cf1bda404ed` |
| `crates/umf-core/src/core_evolution.rs` (concurrent compiled dependency) | `bad9698bd1bf2a1fec23bc452150ceba27070bd6672b3498e55b07aca3e2db4b` |

These are selected source pins for the JSON-number operation and changed host
facade, not a hash of the full transitive crate closure. The rebuilt artifact
hashes above pin the exact binaries tested.

| Host source | SHA-256 |
| --- | --- |
| `bindings/core/node/src/lib.rs` | `c8ca655ef9437f34c98278a4da13a2caa4680bfc66bd1ae7b9b64a3246bcbb92` |
| `bindings/core/wasm/src/lib.rs` | `39fc2b38f4534cbe84bf97c2fc080fd6b84b183b33b049853e0bf742ea6f7d40` |
| `bindings/core/node/index.js` | `094741afa50d48f7b3f6ca27a91f6ad3e475d34904d0609216e0c5ec36c22f2e` |
| `bindings/core/wasm/index.js` | `0f68d3048f0ac353bd05f4dec6aa77677f9f3ae802e857525ed00a6f4e29f4c4` |
| Shared helper `bindings/core/node/src/json-number.js` | `27b4404a59d038c5b717de52b4213e3bd88c598ea052d852647a6c28a7fc5141` |
| `scripts/rust-migration/r8/json-number-binding-node.mjs` | `9a4db4e17d00ae13c8a8ccc9ec9619b6f36bb6be4d3d7884a0c30efc1a94b5ec` |
| `scripts/rust-migration/r8/json-number-binding-browser.mjs` | `eb3db27021efba90694e033185d81994caa70918bafa5458a058224737ab4c3d` |
