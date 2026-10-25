---
ddx:
  id: umf.evidence.rust-migration.r6-reviewed-parameters
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# R6 legacy reviewed SQL parameter scanner: predecessor packet

This Gate 0 packet freezes only `reviewed.py._parameter_positions`, the
left-to-right scanner used by the legacy DB-API transport helpers. It does not
port or replace `_dbapi`, `_dbapi_order`, artifact admission, SQL compilation,
database execution, or any connection/session/transaction behavior. SQL
lowering and backend parameter details remain Weft-owned under CONTRACT-071 and
CONTRACT-079. Current compiler-sealed `dbapiSql` and `dbapiParameterOrder`
continue to pass through unchanged; the existing focused transport test checks
that the SDK scanner is bypassed for those artifacts.

The frozen function is
[`frozen/reviewed_parameter_scanner.py`](frozen/reviewed_parameter_scanner.py).
Its `ReadBuildError` and scanner ASTs match the active source at capture time.
The active `reviewed.py` SHA-256 was
`175526a3af2a9634e218355a6035181a3b21518f56f98118ee96a991a9133a84`; all
source, harness, independent-fixture, test, and report hashes are in
[`source-hashes.json`](source-hashes.json).

The independent packet contains 17 hand-authored scanner outcomes plus one
Unicode-versioned outcome; the harness adds two `int()` digit-limit controls.
CPython 3.11.17 and 3.14.8 reports
are retained as
[`cpython-3.11.json`](frozen/cpython-3.11.json) and
[`cpython-3.14.json`](frozen/cpython-3.14.json). Both profiles match the frozen
implementation and independent spans/refusals. Inputs retain exact Unicode
code points; returned spans are Python string code-point offsets. The cases
cover repeated and reordered ordinals, supplementary-character offsets, nested
comments, newline-terminated and EOF line comments, doubled quotes, E-string
backslash handling, Unicode `isalnum()` and underscore boundaries before an E
prefix, tagged and empty dollar quotes, malformed dollar markers, large integer
ordinals, isolated lone-surrogate and explicit two-surrogate code-point spans,
unclosed lexical regions, and Python's default/disabled integer string digit
limit. U+1C89 is non-alphanumeric under CPython 3.11's Unicode 14.0 tables and
alphanumeric under CPython 3.14's Unicode 16.0 tables; the same E-string probe
therefore refuses as an unterminated quote on 3.11 and returns two slots on
3.14. The raw 4,301-digit default-limit `ValueError` is recorded verbatim for
each interpreter.

Reproduce the source-only captures with:

```sh
python3.11 docs/helix/04-build/evidence/rust-migration/r6-reviewed-parameters/capture.py \
  --output /tmp/r6-reviewed-cpython-311.json
python3.14 docs/helix/04-build/evidence/rust-migration/r6-reviewed-parameters/capture.py \
  --output /tmp/r6-reviewed-cpython-314.json
python3.11 -m unittest python/umf_access/tests/test_reviewed_parameter_scanner_packet.py
python3.14 -m unittest python/umf_access/tests/test_reviewed_parameter_scanner_packet.py
```

This packet is predecessor evidence only. It does not establish an installed
wheel, a broader SQL grammar, or native PostgreSQL/Weft consumer qualification.
The active Python source now retains this scanner as
`_parameter_positions_python` for `str` subclasses; the source-only capture
compares that retained function AST with the frozen predecessor. Exact builtin
strings use the native event interface. The PyO3 binding reads CPython code
points directly into a fallibly reserved Rust vector, avoiding a temporary
Python list; Rust capacity/allocation failures remain ordinary Python memory
failures and are not claimed to match the predecessor's allocation profile.

The host must preserve Python operation order, integer-conversion failures,
Unicode prefix decisions, and code-point spans. It continues to bypass scanner
reinterpretation for compiler-sealed transport and keeps legacy framing
explicit. The focused host protocol tests are
[`test_reviewed_parameter_native_adapter.py`](../../../../../../python/umf_access/tests/test_reviewed_parameter_native_adapter.py).
