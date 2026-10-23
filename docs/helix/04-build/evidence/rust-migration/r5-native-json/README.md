# R5 lossless native JSON Rust core

This bounded core slice adds `NativeJsonTree` to `umf-core`. It uses the shared
JSON grammar in `serialization.rs`, keeps number lexemes as ASCII strings and
all text as UTF-16 units, orders object members like ECMAScript own-property
enumeration, and exposes strict RFC 6901 lookup. Tagged-tree copies have their
own structural budget; unknown tagged representation fields survive copies and
block native rendering. This is not a JSON Schema adapter or a native-system
conformance claim.

## Frozen predecessor outcomes

Before this Rust slice was implemented, Bun 1.4.3 executed the unchanged
`src/model/native-json.ts` (SHA-256
`d09c92a9b7115ee469709bd1007f5ded8466810f`). The full captured input/output
envelopes and the ordinary 128-depth, 100,000-value and 4,000,000 UTF-16 source
limits are in `predecessor.json`. The successful case preserves `-0`, trailing
fraction zeros, exponent spelling, an isolated high surrogate and ECMAScript
integer-key ordering. Refusals freeze JSON syntax, duplicate-key, syntax-after-
duplicate, depth, value-count, source-length, pointer, and tagged-clone outcomes.

An iterative whole-source JSON preflight uses a heap stack and remembers
duplicate keys while continuing syntax validation. It reports malformed
syntax first, duplicate keys second, and only then runs depth/value-limited
native materialization. This preserves syntax > duplicate > tree-limit
precedence without recursively walking over-depth input. The shared grammar
and ordinary `Value` numeric profile were not forked.

## Verification

- `cargo check -p umf-core`: passed.
- `cargo test -p umf-core --test r5_native_json`: 11 passed, including
  10,000-level nesting, malformed-tail/duplicate precedence, extras-preserving
  subtree copies, admission-before-copy, and pre-allocation tagged-kind meter
  regressions.
- `cargo test -p umf-core`: passed across all unit, integration and doc tests
  after the iterative parser and number-token metering changes. A later rerun
  after the tagged-kind meter change is currently blocked by a concurrent
  `lib.rs` reference to the not-yet-present `json_schema_inspect` module; this
  is outside the native JSON files. The focused native suite passes on current
  source.
- `bun test tests/core/native-json.test.ts`: 4 passed, 16 assertions.
- Ajv 8.20.0 Draft 2020-12 validated the tagged JSON emitted by the Rust
  `r5_native_json_tagged` example. Four independent mutations were rejected:
  unknown tag, malformed exact-number token, missing array payload, and wrong
  boolean payload type. The actual Rust output is captured in
  `rust-tagged-output.json`; the outcome record is `ajv-results.json`.
- Python 3.9.6's standard JSON decoder, configured with `parse_int` and
  `parse_float` token callbacks, independently retained `1.2300`, `-0`, and
  `9e+003` and decoded the isolated surrogate as UTF-16 unit `0xd800`.

Tests cover raw parse/render/copy, strict pointer escaping and array indices,
syntax/duplicate/structural precedence, separate parse and tagged-clone bounds,
unknown representation-field retention/refusal, metered extras-preserving
`subtree_clone`, cooperative meter failure, and deep adversarial input with a
controlled `LIMIT` rather than process stack overflow. The frozen predecessor
result envelopes and competing error order are in `predecessor.json`. The generic
duplicate refusal envelope preserves the predecessor code/path and success /
refusal ordering; source-location text for the duplicate-key diagnostic is not
yet reproduced by Rust. Tagged input also refuses a one-million-unit unknown
kind through the host meter before allocating its ASCII conversion.

Current implementation hashes (SHA-256):

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/native_json.rs` | `473a1f40f96ac4cbbda388bd8ea4bce8558a09e34f15dd071607923142caa347` |
| `crates/umf-core/src/serialization.rs` | `dc9d87c01482f580877d0229745fcb659fb2bf5c69b41dd49f6e249c77f2af3b` |
| `crates/umf-core/tests/r5_native_json.rs` | `65d50093af1b251ea50537e11284930d3fcf60f65c9c7e8b95d61b45f234188a` |
No YAML, wire, bindings, default cutover or adapter interpretation is included.
