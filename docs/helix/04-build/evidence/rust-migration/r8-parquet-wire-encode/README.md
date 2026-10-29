# Parquet Compact wire encoder: private production port evidence

Base: official committed `31f7dbbe933eb46c7ae0a76ac38033b4fae19a84` in an isolated `/private/tmp/umf-parquet-encode-sol` clone. No official checkout, old Rust spike API, or concurrent pages worker was edited. Governed by CONTRACT-019 US-019-AC10 and the R8 migration plan.

## Exact owner candidate

| Public declaration | Rust semantic owner | Tagged wire operation | Existing opt-in hosts |
| --- | --- | --- | --- |
| `src/adapters/parquet/encode.ts:encodeParquetWire` | `crates/umf-core/src/parquet_wire_encode.rs:encode_parquet_wire` | `crates/umf-core-wire/src/parquet_capture_binding.rs`, `parquet.encodeWire` | `umf parquet-capture`, Node/Bun `createParquetCaptureEngine`, WASM `createParquetCaptureEngine`, Python `execute_parquet_capture_wire` |

The Rust owner takes `Value`/`Utf16`, preserves raw UTF-16 object keys, encodes Compact bytes in source order, and meters nodes, text scanning and output bytes through `Context`. It uses fallible output reservation and publishes no partial output. The wrapper returns lowercase hex through the existing tagged wire envelope. The JavaScript facades only convert the returned hex to copied bytes and perform existing host admission. No TypeScript encoder calls or Rust spike implementation are on this route.

## Frozen comparison and current source execution

- TypeScript source SHA-256: `6b5c0a48cee4c8036a9bea2ce2eded8aa0c6bc088042b8ecb4f767701f9c8a14`.
- Rust kernel SHA-256: `e219e0f31da3ceeb8fdbb7adb1eccffdfa891e3057e9bd29151e9ade4dd25b06`; wire binding: `65c83626ecfa29abf05512d02984f4b70b4e06d6120d7928cffe7cde7686589e`.
- Frozen TypeScript bytes and `{code,message,path}` refusal outcomes: `tests/rust-core/fixtures/parquet-wire-encode-ts-freeze.json`, SHA-256 `dc485c3cadc9dc9be56cf7a125a0187eb32b08c30e271ffb1f7fc3ad8bbf61f0`.
- `tests/rust-core/parquet-wire-encode-parity.ts` SHA-256 `524676a66f3eb99d602442992c44706567fac2e479b6f0023c066c6b780652b4`: 44/44 frozen TS and Rust CLI outcomes matched with `PATH=''`. Cases cover every kind, signed width endpoints, list/set/map/struct ordering, bool field headers, empty collections, malformed numbers and hex, unknown lone-surrogate field names, entry/field unknowns, and encoded byte refusal. The large binary input is generated, not duplicated in the fixture.
- Pure Rust kernel: 3/3 tests, including 65-level depth refusal, 49,999/50,000 child node boundary, exact 1,000,000 output bytes, raw UTF-16 unknowns and a failing work meter.
- Existing TypeScript Parquet transform suite: 3/3 tests, 439 assertions. Existing Parquet capture wire test: 1/1. Existing capture CLI suite: 3/3. Existing Node/WASM wrapper tests: 4/4.
- Built Node addon SHA-256 `5005d20efdbc3f8ac1b403185765ec9c31c723fd5696a13829e64176dd251bf2`: real Node 9/9 and Bun 9/9 public wrapper cases.
- Release WASM SHA-256 `497473b95a45c3d5ce071db48c96fc4c974d8c6b07370daa691db7a3475eac7e`: Node-hosted WASM 9/9; Chromium 153.0.8010.12 real WASM positive and lone-surrogate refusal, zero page errors. Debug WASM exceeded bindgen's local-variable limit; release bindgen completed.
- Built Python extension SHA-256 `ecfae2545d5d5393fd2a5a449ffee251c98520d25dd53e623b7bdd2c5e9672c3`: direct tagged-wire success and lone-surrogate refusal, 2/2.
- Generated WASM source manifest checked current after `scripts/rust-migration/r7/wasm-package-sources.ts` regeneration. Rust 1.90.0, wasm-bindgen 0.2.100, Bun 1.4.3, Node 26.12.1, and CPython from the supplied private environment were used.

## Admission and claim boundary

The exact compatibility claim is for admitted JSON-compatible wire-value trees: plain data objects/arrays on Node, Bun and browser facades, and equivalent tagged `Value` trees on CLI/Python. The existing JavaScript `encodeRequestWire` host admission enforces plain prototypes/descriptors with request limits of depth 256 and `Number.MAX_SAFE_INTEGER` JSON values, plus its work control. The encoder separately enforces depth 64 and 50,000 wire nodes. Non-data host objects, accessors, proxies, sparse arrays and cycles are governed by transport admission, not by the TypeScript function's unchecked property access. Malformed missing nested properties that TypeScript would throw as raw host `TypeError` are outside the admitted typed wire-value subset. The profile does not replace the default TypeScript route. Installed SDK, release, retirement and broader Parquet support remain unqualified.

[Independent Sol code review](sol-review.md) approved the explicit opt-in composition and required correction of the documented request admission ceilings above. No runtime code changed to resolve that finding. Composed-source qualification and exact owner accounting remain separate gates.
