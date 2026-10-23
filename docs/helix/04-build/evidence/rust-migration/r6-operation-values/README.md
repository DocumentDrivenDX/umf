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

## R6 operation follow-up — 2026-10-23

The next bounded source slice ports `key_literal` for an exact built-in `str`
carrier through `umf-core`; Python retains the original object in the returned
wrapper. Carrier subclasses and custom equality/truth-conversion objects remain
on the original Python path so their callbacks and exception identity are
preserved. The absent-key refusal keeps its predecessor diagnostic and occurs
before any custom carrier comparison. Focused source-tree checks cover string,
boolean and pass-through modes, object identity, absent values, custom equality
exceptions, truth-conversion exceptions and `str` subclasses. This is source
test evidence for that helper only; no installed-wheel or consumer qualification
is claimed.

`native_arguments` remains Python-owned. Its predecessor hash is
`b8d13aeb5a880e09fc06bdb297c4e012481b0d4886dcce5bd6558296cc796eb1`. The helper
builds a Python dictionary from arbitrary IDs and source objects, then performs
each source-kind decision and carrier lookup in DB-API order. The selected
mapping methods, key equality/hash behavior, exception precedence and Python
`__index__` handling are observable. An eager structural projection into Rust
changes those traces for unselected malformed sources and for an earlier host
lookup failure followed by a later unknown source. The attempted bounded port
was discarded; this operation remains unclaimed until a slice preserves those
host interactions or explicitly qualifies a narrower contract.

## `value_from_native` typed-token follow-up — 2026-10-23

The next bounded operation-values shard moves exact text classification for the
`integer`, `decimal`, `uuid` and `bits128` result carriers into `umf-core`.
Python still checks `None` first and reads `output['nullable']` only in that
branch; for non-None it reads `output['carrier']`, enforces exact bool/string
carriers, and calls UTF-8 encoding before token admission. This preserves host
mapping access and Unicode failure order. Python also retains the original token
text and creates the existing result wrapper. Date, timestamp, float,
`nativeEncoding`, and other carrier decisions remain Python-owned.

Predecessor evidence was frozen before edits. The original active source
`operation_values.py` had SHA-256
`123dbe5d4897ebf6a82f3cd8c73b5f2c71485b69fcd6b3ea6720aaf38ce3fd92`; its
previous frozen copy `frozen-operation-values.py` has SHA-256
`90638f330104eeb9405e553ef03638fe26db3a2f0440a255c0242deba0ce8b77`. Frozen
behavior accepts and preserves `-0` for integer, canonical lowercase UUID only,
and lowercase 32-hex bits128 only. Decimal admission uses the predecessor
grammar plus `Decimal(value).is_finite()`; its constructor exponent limits include
`MAX_EMAX=999999999999999999` and `MIN_ETINY=-1999999999999999997`, including
adjusted-exponent checks for the coefficient. Rust combines the explicit exponent
with the negative fractional scale before applying these limits. A source review
caught and repaired an initial raw-exponent check that incorrectly refused
`1.0e999999999999999999` and `0.01e1000000000000000000`, and incorrectly admitted
`0.1e-1999999999999999997`. The frozen CPython 3.14.8 predecessor oracle now
replays 10 accepted and 15 refused token vectors including those boundaries.
For grammar-valid constructor exponent overflow, Rust returns a distinct
`DecimalInvalidOperation` decision; the thin Python adapter sets only the current
thread's `decimal.InvalidOperation` context flag before returning the established
`SessionError`. This matches both default trapped and trap-disabled Decimal
contexts. Malformed grammar, including a huge exponent followed by trailing junk,
remains a plain refusal and does not set the flag.

Rust charges token length to a per-call ordinary `Context` work counter and scans
the coefficient without allocating a second token-sized string. The predecessor
has no token-size ceiling, so this slice introduces no new semantic size cap; a
hard host deadline/meter and unbounded-input qualification remain open.

New focused tests add exact accepted/refused token vectors and verify that
nullable-only `None` access and lone-surrogate UTF-8 failure happen before Rust
classification. The frozen CPython 3.14.8 oracle also confirms flag behavior for
default and disabled `InvalidOperation` traps, malformed grammar, and huge
exponent trailing junk. Python syntax compilation and `git diff --check` pass. Rust
builds and the focused Rust/Python extension tests are intentionally pending the
release coordinator's macOS build hold; this source change therefore has no
current executable Rust or installed-wheel qualification. Native Weft/consumer
integration remains a later CONTRACT-079 gate.

Current source identities for this follow-up are:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/operation_values.rs` | `a2bef35886f79d522a62aa400a2c16a5af1cfb9037b932eb7f06b1547be71812` |
| `bindings/core/python/src/lib.rs` | `208b760c8019ac691c256fd145dc7e04c865a7f4d7b32e766ded8762516dc60b` |
| `python/src/umf/rust_operation_values.py` | `6f6b5444319a36732b75ad57367f72013bd74ca081e0e0e49ad06238160aac25` |
| `python/umf_access/src/umf_access/unified/operation_values.py` | `106cd256e4976d37855eb6ef838c553de717bbcf09be269fbe374f1bdb4f852a` |
| `python/umf_access/tests/test_table_read_values.py` | `47e5e1ee7a1ec3f87f137e36993aac5a93dd4c23a8749b51bfdd13684c7c58d0` |

## Typed-token installed-wheel replay — 2026-10-23

The exact integer, decimal, UUID and bits128 classifier now has a fresh
Darwin-arm64 source-to-wheel build and installed replay. Rust 1.90.0 built
`umf-core` 0.11.0 as a CPython abi3 wheel with an isolated
`CARGO_TARGET_DIR`; the `umf_access` 0.1.0.dev7 pure-Python wheel was rebuilt
from the same source cohort. SHA-256 values are recorded in
[`typed-token-wheel-replay-2026-10-23.json`](typed-token-wheel-replay-2026-10-23.json).
The source closure hashes were identical immediately before and after both
wheel builds and again after replay.

Focused Rust operation-values tests pass 5/5. The same two wheels were installed
into a fresh target and exercised on CPython 3.12.15 with Pydantic 2.14.1:
`test_table_read_values.py` passes 11/11 and `test_operation_values_rust.py`
passes 8/8. The table-read suite reaches `result_frame` count conversion and
cardinality checks, in addition to the direct accepted/refused token vectors,
nullable lookup ordering, Unicode failure order and Decimal context-flag cases.

The same installed wheels also pass those 19 tests on CPython 3.11.17. Pydantic
2.14.1, its CPython 3.11 arm64 `pydantic-core` 2.50.1 wheel, and its cached
pure-Python dependencies were copied from the existing local uv cache into a
temporary target without network access. Both `umf` and `umf_access` then imported
from the installed wheel target normally. The replay used `unittest` discovery
because `pytest` is not installed in this interpreter; all 19 tests passed. The
3.12 replay also imports the installed packages normally.

This closes focused Rust/PyO3 build and installed-module replay for the typed-token
helper only. `result_frame` is an in-package consumer path over supplied native
rows, not a database-backed consumer. Native PostgreSQL, Weft, Truss, Ashlar and
TableSpec acceptance, broader `value_from_native` carriers, a hard host deadline
or meter, and the remaining R6 operations remain open under CONTRACT-079. This
does not close `value_from_native` as a whole or R6.
