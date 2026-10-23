# R6 operation-frame values checkpoint

This bounded slice moves canonical JSON output, UTF-8 frame-size measurement,
SHA-256 digests, strict duplicate/non-finite JSON admission, and page-cursor
base64/HMAC/signature/capacity decisions to `umf-core` under
`umf-operation-values/0.1.0`. The cursor envelope remains
`umf.table-cursor/0.1`. Python retains exact built-in carrier extraction,
`json.loads` object creation/order, and conversion of native `ValueError`
diagnostics to `SessionError`. A missing or mismatched Rust capability fails
closed; no Python algorithm fallback is used.

The Rust parser reuses `NativeJsonTree`, retaining arbitrary numeric lexemes and
object member content while rejecting duplicate names. Literal and escaped
spellings of `$serde_json::private::Number` remain ordinary object keys. The
bounded-size PyO3 entry accepts only exact built-in `bool`, `int`, finite
`float`, `str`, `list`, `tuple`, and `dict` values with exact string keys. It
traverses these without invoking custom Python callbacks, tracks a lower bound
while collecting the tree, then stops Rust canonical output on the first UTF-8
byte beyond the requested limit. The current qualified host subset has a
128-level nesting ceiling. `canonical` and `digest` still use Python's standard
JSON encoder to extract built-in object values before Rust canonicalizes them;
their temporary input string is not frame-bounded. `loads` inherits the Rust
native parser's 4,000,000 UTF-16-unit, 128-depth and 100,000-value cooperative
limits. These are explicit compatibility/resource limits, not broad Python
`json` parity claims.

Cursor input text is capped at 12,239 raw UTF-8 bytes before envelope parsing
and base64url decoding; the complete encoded token is capped at 16,384 ASCII
bytes. Encoding bounds the compact Rust envelope while writing. The current
native JSON parser still builds a bounded tree before canonical or cursor
envelope output, and ordinary `canonical`/`digest` first materialize their
Python JSON text; these input-side allocations are documented control gaps.
Cursor decode validates the signed raw JSON and shape in Rust, then returns the
original payload text so Python object creation retains insertion order for
valid externally signed noncanonical JSON. Frame limits accept Python integers
of arbitrary precision; positive values beyond `usize` are clamped to
`usize::MAX` and negative values retain the predecessor's frame-bound refusal.

The predecessor snapshot records the original `operation_values.py` source
SHA-256 `90638f330104eeb9405e553ef03638fe26db3a2f0440a255c0242deba0ce8b77`
and selected outcomes for canonical spelling, UTF-8 byte counts, digests,
duplicate/non-finite parse refusal, token bytes and invalid-token refusal. The
independent Python standard-library oracle compares canonical strings, sizes,
SHA-256, base64url, HMAC-SHA256 and decoded cursor shape. Its cursor reference
and carrier cohort are deliberately finite; it is not the complete predecessor
test inventory.

Local Darwin-arm64 validation used Rust 1.90.0, CPython 3.14.0, and Pydantic
2.14.1. A locally built abi3 extension was imported from the source tree on
`PYTHONPATH`; no installed core/access wheel or clean wheel-install replay is
claimed. The focused Rust operation-values tests pass 3/3. The independent
Python oracle passes 7 tests, including signed noncanonical-order and huge
integer-limit regressions; existing table-read and batch-frame regression
tests pass 14 tests (21 total in the focused invocation). The Rust Python
binding builds with the locked offline workspace dependencies.
Independent Sol review replayed 300 randomized predecessor comparisons for
canonical Unicode/numbers, digest and size. After repair it also replayed
signed noncanonical cursor order, arbitrary-precision frame limits and the
exact 16,384-character capacity boundary; no P1/P2 remained in this bounded
source-tree slice.

This checkpoint does not port `native_arguments`, `native_batch_arguments`,
`value_from_native`, `key_literal`, or `result_frame`; those remain Python-owned.
It also does not qualify PostgreSQL, Weft, Truss, Ashlar, generated consumers,
other operating systems or interpreters, release artifacts, or behavior outside
the exact carrier and parser limits above.

The recorded source closure has these SHA-256 identities:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/operation_values.rs` | `bdf8b4e11253cfd0df7da30cccbcc1c717b8810fe06fe772cb4766a3fa500f36` |
| `crates/umf-core/Cargo.toml` | `4d7808f74c5b7ef69a58798d123a965367314cb6ecb8e9abbdb34d30e7e2cd6f` |
| `crates/umf-core/src/lib.rs` | `6976cc62294d9b818a804289ae31b688deb98b04673e7262a791fbaaa2492a0c` |
| `bindings/core/python/src/lib.rs` | `38f46047a2b4de34c02f6164c4f2cfee34bc8fcbb97bfbe942deb8b87e2e35fe` |
| `python/src/umf/rust_operation_values.py` | `81a9dfc477c108ff45e1a6602af75f7fe3aea325dc3afc9cd6aa18a3842c2ff4` |
| `python/umf_access/src/umf_access/unified/operation_values.py` | `b8d13aeb5a880e09fc06bdb297c4e012481b0d4886dcce5bd6558296cc796eb1` |
| `python/umf_access/tests/test_operation_values_rust.py` | `0c4203b73dc94d9b117e0931d1b31f13a126271ca66e604b4fc8f007bd415f35` |
| Locally built `_rust_core.abi3.so` | `4161d780eff7ed82df7ec921e735d4f9ff234aaa213bcd4e16180a8ea8f89ee5` |
