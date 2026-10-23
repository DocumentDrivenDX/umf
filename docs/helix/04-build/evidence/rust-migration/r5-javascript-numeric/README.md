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

The exact source digests recorded for this run are:

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

Validation completed for this revision: four focused `umf-core` numeric unit tests; the previously completed `umf-core-wire` tests and Node/WASM crate checks; native Node addon and release WASM builds; matching wasm-bindgen package generation; Node/Bun oracle and TypeScript parity; and Chromium/WASM parity for 27 vectors, context edges, and precharged expanded integer formatting. `tsconfig.tools` typecheck remains blocked by concurrent type errors in `scripts/rust-migration/r5/kind-nullability/freeze.ts`. A fresh full workspace Cargo run is not represented by the focused test result.

This qualifies only the five numeric adapter operations, including binary64 admission and lossless conversion, and their Node/WASM opt-in bindings. It does not qualify default adoption, downstream family adapters or float codecs, database codecs, semantic widening, Python binding integration, or TypeScript retirement.
