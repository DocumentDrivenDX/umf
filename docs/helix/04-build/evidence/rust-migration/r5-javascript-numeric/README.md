---
ddx:
  id: umf.evidence.rust-migration.r5-javascript-numeric
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-002
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# R5 JavaScript numeric adapter evidence

This evidence qualifies the opt-in Rust-backed `umf.javascript-numeric/1.0.0` adapter for the five operations in CONTRACT-049: `admitJavascriptNumber`, `integerFromBigInt`, `integerToBigInt`, `exactDecimal`, and `numericToNumberLossless`. The retained TypeScript adapter remains unchanged and remains the default reference. The R4 seven-operation codegen protocol is unchanged. BigInt crosses the wire only as canonical decimal text; binary64 admission crosses as exact 64-bit hexadecimal text so transport policy cannot round or reject the host value before numeric policy runs.

The independent oracle uses Python 3.9.6 `decimal.Decimal`, `fractions.Fraction`, `struct.pack`/`unpack`, and a frozen corpus of 27 vectors. It verifies JSON token grammar and exponent/text limits, exact rational equality of decimal tokens and binary64 values, finite conversion, negative zero refusal, safe integer conversion limits, canonical BigInt spellings ending in zero, and integral-token-to-BigInt results. The oracle input is `scripts/rust-migration/r5/javascript-numeric-vectors.json`; its checked-in computed output is `oracle-output.json`. The Bun harness compares the Rust Node binding and retained TypeScript implementation against each oracle result and against each other. It also checks host refusal behavior for Infinity, NaN, `-0`, symbol keys, accessor members and extra carrier members.

The staged N-API addon passed the 27-vector harness on Node v26.12.1 under Bun 1.4.3. A separate explicit-resource context run compares exact thrown diagnostic `code`, `path`, `message`, and order with TypeScript for a valid current 0.10.0 Field, unsupported and malformed documents, a missing Field, a wrong-role target, integer range and `allowedValues` failures, an unknown relevant facet qualifier, an extra Field identity member, and an extra outer context member. All cases match; unknown relevant qualifiers refuse rather than being treated as understood. Additional whole-context admission cases prove that nested BigInt/function values refuse with `NON_JSON` and nested getters are not invoked. A 100,001-digit BigInt input and `integerToBigInt("1e99999")` output expansion refuse under host work budgets before numeric conversion/formatting.

The generated `wasm-bindgen 0.2.100` web package passed all 27 vectors in Chromium 153.0.8010.12, plus whole-context invalid-value/getter checks, BigInt input and expanded integer formatting work-budget refusals, Infinity/NaN/negative-zero refusal, and absence of `process`/`Buffer` browser globals. The release WASM library and matching JS glue were rebuilt for `wasm32-unknown-unknown` using rustc 1.90.0. Node and browser tests use only the opt-in numeric factory; no default API cutover is claimed.

The following digest table is the initial scalar-only qualification baseline; its artifacts predate the retained Rust stage below and are historical, not the current packet:

| Source or artifact | SHA-256 |
| --- | --- |
| `crates/umf-core/src/javascript_numeric.rs` | `09d3217c221ce2ad3fdc9296e6079535372a83ac7e7547eeca152d5d47056e36` |
| `crates/umf-core/src/literal.rs` | `7e49380b4139c58cd40705897b71dbba6306f4fff31dd06b919d46741544cd04` |
| `crates/umf-core/src/engine.rs` | `b1505a63d11bc8e68ab8b81b75c0b4f883b5bde3849dc6ff22b344972197c46a` |
| `crates/umf-core-wire/src/lib.rs` | `7c77a8a7c7bbbfaea3101d9c3db70b9a48ae716741bbcaeb75a8c614021864ac` |
| `bindings/core/node/src/lib.rs` | `711847feb473b8a47c728b019e7ff926ded807dda0783125d39c285940672e7f` |
| `bindings/core/node/src/javascript-numeric.js` | `a3145b1f434a028e8940ddc8a4c4c36e90fdf3465e59d44431e24a6fa50f73f5` |
| `bindings/core/wasm/src/lib.rs` | `cd229b9aa4f97800578bb54bfdd761cac99726afe569be18e2091c9c69b37f89` |
| `scripts/rust-migration/r5/javascript-numeric-oracle.py` | `7ed380625d284c276a77d54b511a86961fb7ce46420de6e2be2f473c784a1030` |
| `scripts/rust-migration/r5/javascript-numeric-vectors.json` | `f421f73dd70364e5329b03da62397e2bcf9549ab413a4caf9e7249d2e1454294` |
| Python oracle output (`/private/tmp/umf-r5-numeric-oracle.json`) | `417e21c1b46a353aa695b27bffbd03c9995c2ddb26f18c78996ce8359abdb4bd` |
| `scripts/rust-migration/r5/javascript-numeric-parity.ts` | `7a5b865f2517ad2fff7f310f0c5fedc4e90e533c802c70721a380a827b7d82d6` |
| `scripts/rust-migration/r5/javascript-numeric-browser.ts` | `904d0e1bbd9ca54d6a4fe334c3c42f8fe7154e6d7afb99ad86319991e0610963` |
| Staged Node addon (`umf_core_node.node`) | `7b90cc321b4f435881712913d805c329803f5ab54eea5c4e2e7436d5dba518f6` |
| Rebuilt WASM (`umf_core_wasm_bg.wasm`) | `b64720063b097dc2a73f9b30242f96b47380ac9aeff3086774c54d4a8cd0ae24` |
| Generated wasm-bindgen JavaScript | `6d57f66abf7fecfa077994b46342fa23cea89497a713cd5afb75f9355f881d88` |
| Checked-in oracle output | `53ab48a3cb59e91ed0e7e7ab7fa80b7a975a32fdc74eecbb1c90650d4eb3a161` |
| Checked-in Node parity result | `8a66e0d2562ad696ced8d35593dc225c9cf02d6543b3dcf67b7d5bd856f28075` |
| Checked-in Chromium parity result | `c3e31229da368185af396fdfc827c2ac4a9e8dd4b7dc1de9d04978f7b3a12705` |

Validation completed for that initial revision: four focused `umf-core` numeric unit tests; the previously completed `umf-core-wire` tests and Node/WASM crate checks; native Node addon and release WASM builds; matching wasm-bindgen package generation; Node/Bun oracle and TypeScript parity; and Chromium/WASM parity for 27 vectors, context edges, and precharged expanded integer formatting. Its old `tsconfig.tools` blockage has since been cleared; current typecheck status appears below. A fresh full workspace Cargo run is not represented by the focused test result.

This qualifies only the five numeric adapter operations, including binary64 admission and lossless conversion, and their Node/WASM opt-in bindings. It does not qualify default adoption, downstream family adapters or float codecs, database codecs, semantic widening, Python binding integration, or TypeScript retirement.

## Retained Rust stage and separate setup controls (2026-10-24)

The former tagged `validateJavascriptNumericContext` request is no longer accepted. A direct-wire forgery carrying caller-provided `literal` and `result` receives `REQUEST`. With explicit resources, the Node and WASM factories construct one retained Rust `Engine` at factory creation under the distinct `setupControls` ledger. Each public numeric call creates its own operation control bridge. Rust computes and retains the scalar literal/result in an opaque stage. A context call validates first, returns only validation, then lets the facade request the output from that same single-use stage; `numericToNumberLossless` defers lossless binary64 conversion until after successful Field validation. The stage carries `TransportUsage` from scalar admission through context decode, Field validation, conversion and output encoding. Context-backed calls fail closed if a retained resource runtime is unavailable; scalar-only calls without resources continue through the legacy one-request wire route. This remains opt-in and no TypeScript/default route changed.

Fresh native and WASM release artifacts passed the 27-vector Python Decimal/Fraction/struct oracle and TypeScript differential packet. Node stage controls prove forged-wire refusal, setup work metering, resource snapshot behavior, a separate setup refusal, successful stage consumption, and refusal after both successful and failed consumption. Node/Bun host-order controls match the predecessor for invalid decimal and unsupported numeric family before accessor-backed context; whole-context Proxy trace is identical (`keys, keys, field, document`), malformed document/Field cases and extra Field member match, and extra outer context remains accepted. The crossed `numericToNumberLossless({decimalToken:'0.1'}, missingFieldContext)` case returns the predecessor's invalid-Field diagnostic before the lossy-conversion error. Malformed decimal and fractional integer-carrier grammar also refuse before context with matching code/path/message. The scalar call measured 383 work units; a context call measured 2,009,159 and the crossed cumulative budget refused at one below the measured total. Repeated fresh calls at the calibrated limit succeed, proving per-call reset. Factory setup admission measured 400,381,003 work units, while its first scalar operation measured 200; setup work is separate from the operation meter. `bun run typecheck` passes on the current tree, and the current `umf-core-wire` forged-stage refusal test and Node/WASM release builds pass.

Fresh Microsoft Edge 156.0.4314.42 replay passed the same 27 vectors, scalar host-order cases, crossed invalid-Field/lossy conversion, malformed token order, context cumulative budget and reset, separate factory setup work control, expanded formatting budget, browser-global absence, opaque context stage, and a no-context output stage with second-use refusal. Direct scalar semantics and context stage are checked through the opt-in factory; no claim is made about default adoption, Python parity, installed SDK qualification, or TypeScript retirement. The retained Engine setup cost is large and remains an explicit opt-in setup cost; do not conflate it with per-call work.

Final isolated package paths for this packet: `/private/tmp/umf-r8-numeric-final/node` and `/private/tmp/umf-r8-numeric-final/wasm`. The harnesses are `scripts/rust-migration/r5/javascript-numeric-stage-node.mjs`, `scripts/rust-migration/r5/javascript-numeric-parity.ts`, and `scripts/rust-migration/r5/javascript-numeric-browser.ts`. Native addon SHA-256 is `7fe79a33055bee33a8105a654715f0cc06e5694101dd03b825efb002ac88329d`; WASM SHA-256 is `14a10507acdbaa1289f70d5c8b309b1baa089f622daf6824d92f4919d2c6e8a9`; generated bindgen JS SHA-256 is `42d466c02f653f0d5cae17fef70790ed1cf51853bdff3e5c92f2f84bc0d4826`. The exact current-source and package hashes are in the table and receipt files below. The initial scalar-only artifacts above are historical, not this retained-stage implementation.

The browser harness extracts the production numeric factory from the WASM index and creates a small isolated index for the replay; production WASM index SHA-256 is `b3d0b5ce1d56812d58d84ecc26d8768de560312ba95cb5a966873f365ad4d29d`, while the isolated replay index SHA-256 is `cce19fabe3db4902112f863296cbc428b584c735115d2fbce6ff8fa3a63b2770`. The Node package uses the complete production index (`ca0ad4ffc541d3e2ffc7fc6383a24802ed4b0a15a9bf08513968875cc3296f7e`).

| Current source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/javascript_numeric.rs` | `df41418d989e9795a265370d7f3fdf44b33caf57da3e27e3e36c8242fb8842bd` |
| `crates/umf-core-wire/src/javascript_numeric_runtime.rs` | `81c73540102c2ff8ae63f0c93f7b581357e4a2860c5d44df5b3b7fe8aeb68dea` |
| `crates/umf-core-wire/src/lib.rs` | `ecc5f46ff7493f4cb4d9492f4688fedda6f384a6912604caf7c9d7eb911b2b2f` |
| Node runtime binding | `5abfd402a75eb4c924babdd0fd84ab4c34c4344f38d90456481d7b433a42d7bc` |
| WASM runtime binding | `b8f18a9fe1c73651238b75f36574cc75361e898e240bf26353e88159a88fa385` |
| Node/WASM numeric facade (identical) | `8355ddb54985270b396e78a2cd5cab25574cdf5d4c5384df5f34798d50e2654f` |
| Node index / declarations | `ca0ad4ffc541d3e2ffc7fc6383a24802ed4b0a15a9bf08513968875cc3296f7e` / `c72252c65d69a286e63b41ad479ec85dcef1e3e7aa8745ca4cf3baa8ec486494` |
| WASM index / declarations | `b3d0b5ce1d56812d58d84ecc26d8768de560312ba95cb5a966873f365ad4d29d` / `1a9b5f4b1a553e5d5ac9cd93b03b45bb606e376042a958164d09d2ebfa7d99c5` |
| WASM source manifest | `26b0836d4bc2f5ade71c11b46c8c695180e052b3c809773a0d5511061d49ca9c` |
| Node stage / differential / browser harnesses | `89223e5f3c7a367b257e2aaabdef95a9e360ba27b435f38f0ab78f2d483e572e` / `3e734290d7d9e7b99764a06b08793f1ac323c6576e60ebc6bbadf0b452cb8edc` / `6e3565c082c522adf2ae6a32ad567d85ddde6cd8e446bfe43a5ed38e428605d6` |
