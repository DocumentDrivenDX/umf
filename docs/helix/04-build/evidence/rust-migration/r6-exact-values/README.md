---
ddx:
  id: umf.evidence.rust-migration.r6-exact-values
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R6 exact integer and Decimal admission

This evidence covers the typed-access integer-width and Decimal precision/scale
decision slice. The public bridge capability is `umf-access-values/0.1.0`.
Python retains carrier checks, Decimal tuple extraction, and the original
object; Rust owns exact arbitrary-width integer admission and Decimal
coefficient/exponent decisions. No power-of-ten expansion or integer metadata
narrowing is used. Zero coefficients return after metadata validation, leaving
the original Decimal sign, exponent, and trailing zeros intact. Error order
matches the frozen predecessor outcomes.

`frozen-predecessor.json` records 21 representative outcomes captured before
replacing the predecessor implementation. Its source SHA-256 is
`65de1b9acad297d8de4bc706cce4d7845f9ce8c0d9c391e4eb599222c5908c87`.
`test_rust_exact_values.py` replays those outcomes and checks original-object
identity, compares integer results with an independent interval oracle, and
checks bounded Decimal cases with a `Fraction` oracle.

Validation on 2026-10-23:

- `cargo test --offline --locked -p umf-core access_values::tests`: 2 passed.
- `cargo check --offline --locked -p umf-core-python`: passed.
- Installed wheel replay with `test_rust_exact_values.py`,
  `test_values_red.py`, and `test_access_temporal_codec.py`: 14 passed. Tests
  ran against the locally built and installed wheels under CPython 3.11.
- macOS arm64 CPython 3.11 abi3 core wheel
  `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` SHA-256:
  `91e0f32bfc26f2a7fc2c31c5d3401d1f7ee632fc26cac5b5f5aa7976fe929995`
- Access wheel `umf_access-0.1.0.dev6-py3-none-any.whl` SHA-256:
  `d9177075c738ca2bba148948db6d283cb2757b5f2f8b51729e69ede00626f974`

Independent Sol review reproduced both wheel hashes, installed those exact
artifacts in a clean environment, and replayed all 14 focused tests. Its
additional checks covered 10,000 independent integer interval cases, eight
malformed raw inputs, arbitrary-size integer metadata, and huge-exponent
negative-zero identity; it reported no P1/P2 correctness finding. Two older
reused environments lacked the new `umf.rust_values` facade and were stale.
The reviewer replayed the frozen predecessor outcomes but did not independently
reproduce the retained predecessor source hash.

Root reinstalled the same recorded wheels in a Python 3.11 environment with
Pydantic 2.14.1 and replayed local access consumers: five runtime-driven codec
tests, nine codec boundary tests, one non-temporal golden-vector test, and two
Spark Delta projection value tests passed. The projection tests use unit-level
native-value inputs; they are not a reached PostgreSQL/Weft/Spark engine run.
The generated client installation and native consumer qualification are still
open.

These hashes identify the tested built artifacts, not an immutable
whole-source closure while other R5 binding files are changing. Other Python
versions and platforms remain unqualified.

The raw binding creates `Context::ordinary()` and has no host meter,
cancellation callback, deadline, or configured work budget. Its accounting calls
therefore do not create a hard payload/work bound. This slice intentionally
preserves the predecessor's unbounded numeric domain; it does not claim a
resource ceiling. Exact Python integer conversion allocates a byte buffer
proportional to the value's bit length, and the Decimal bridge copies the tuple
digits. A reviewed control-bearing binding contract is still needed to provide
hard limits or late interruption. No downstream codec or driver behavior is
covered by this evidence.

## Binary32 vector and scalar admission

The next R6 slice exposes `umf-access-float32/0.1.0` through
`umf.rust_values`. Rust classifies each admitted binary64 scalar as finite and
exactly representable, requires float32 rounding, overflows at the IEEE binary32
round-to-nearest overflow midpoint, or nonfinite. The raw PyO3 function accepts
only an exact Python `float`; it refuses integer, boolean, string and subclass
carriers. Python keeps exact tuple and dimension checks, ordered element
admission, original tuple return, and the predecessor `ValueRuleError` messages.
The bridge fails closed when the native capability is absent or mismatched.

`float32-frozen-predecessor.json` was captured before the source edit from
`python/umf_access/src/umf_access/values.py` SHA-256
`2abd59670aa788c45408fc35ca92629a2049dad465d1d2f6e0af20fab1e15dc6`.
It records tuple/dimension and scalar carrier refusal, negative zero, subnormal
and normal boundaries, overflow values below/at/above the midpoint, halfway
ties, NaN/infinity and validation order. The frozen rows retain the original
tuple object on success.

On macOS arm64 with Python 3.11.17, the newly built and installed core and
access wheels have SHA-256:

| Wheel | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `60d566a0afca090a3732353429dac68ce57619802fbdffcc99823b9f9d8f3ac4` |
| `umf_access-0.1.0.dev6-py3-none-any.whl` | `833b27d362ca47305f5da091884a731e4d495443cdb2af55c18f99b3f3aa1cb6` |

The focused installed-wheel tests passed: four float32 predecessor/oracle/raw
binding tests, four exact integer/Decimal tests, six value tests, four temporal
codec tests, two PostgreSQL search projection value tests, two PostgreSQL
projection value tests and two Delta read projection value tests. The float32
oracle compares 1,500 seeded binary64 bit patterns with an independent exact
rational test for finite binary32 representation. Rust's focused access-values
module passed five tests; the PyO3 binding passed `cargo check`.

Independent Sol review reproduced both wheel hashes, replayed 18 installed
float32, exact-value, basic-value and temporal tests, and passed five focused
Rust tests. Its separate differential replay checked 100,000 seeded binary64
patterns and 34 signed overflow-midpoint neighbors, plus negative-zero and
tuple-identity controls. The reviewer found no P1/P2 in this bounded slice;
the historical predecessor source hash was not independently reconstructed.

These installed tests exercise value conversion and local codec/projection
helpers. The projection tests do not reach a live PostgreSQL, Weft, Spark or
other native engine; no engine behavior or cross-system native equivalence is
claimed. Vector-bearing generated access packages and reached native search
consumers remain open. The test cohort is CPython 3.11 on macOS arm64; other
platforms and Python versions remain unqualified. The worktree contains
concurrent R5 edits, so the two wheel hashes identify the installed artifacts
but do not establish a complete immutable source-to-wheel closure.

Vector work limits remain open: Python admits an already materialized tuple with
no maximum dimension, and performs one scalar native call per element. The raw
scalar function has no caller-supplied meter, cancellation callback, deadline or
maximum work control. The capability makes no hard vector-size or interruption
claim; adding those limits requires a separate control-bearing vector boundary
and its own qualification.
