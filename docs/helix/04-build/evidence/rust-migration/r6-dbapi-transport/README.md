---
ddx:
  id: umf.evidence.rust-migration.r6-dbapi-transport
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
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

# R6 legacy DB-API transport predecessor packet

This packet freezes source-predecessor behavior for `reviewed.py`'s
`_parameter_positions_python`, `_dbapi`, and `_dbapi_order`, plus the compiler
transport seal predicate and its `ReviewedSQL.build` gate. It does not qualify
Rust/native DB-API consumers or installed packages.

The frozen path scans compiler SQL for `$N` ordinals, preserves lexical
refusals, doubles percent signs in every non-placeholder SQL slice, emits
`%s` for each placeholder, and selects order entries by zero-based ordinal.
Repeated ordinals repeat their order entry. Out-of-inventory ordinals are
checked only after the full lexical scan, so a later unterminated comment or
quote takes precedence. Python `int()` conversion happens while scanning and
retains the interpreter's configured digit-limit `ValueError`.

The hand-authored `cases.json` exercises literals/comments, percent escaping,
slot ordering, repeated/high ordinals, Unicode code-point spans, lone and
explicit surrogate elements, subclass-overridden `startswith`, malformed
comments/quotes/dollar quotes, inventory refusal, and digit-limit ordering.
Reports record exact results on CPython 3.11.17 (Unicode 14.0.0) and 3.14.8
(Unicode 16.0.0). U+1C89 before an E-string prefix is alphanumeric in the
latter Unicode database but not the former, changing the predecessor's
backslash-escape interpretation and resulting placeholder/refusal.

`capture.py` loads only selected predecessor AST definitions and binds
`_dbapi`/`_dbapi_order` to the frozen Python scanner, avoiding native imports.
It also captures `_compiler_transport` acceptance for sealed transport versus
legacy artifacts lacking transport, and verifies structurally that the
`ReviewedSQL.build` seal predicate guards fallback reconstruction. The
existing `test_reviewed_dbapi_transport.py` contains the full build-level
regression asserting that sealed SQL/order bypass `_dbapi` and
`_dbapi_order`; that dependency-bearing suite is not run by this source-only
packet.

Run `python3.11 -m unittest test_capture.py` and
`python3.14 -m unittest test_capture.py` from this directory. The reports are
source-predecessor evidence only; they do not establish compiler, Rust, driver,
or database behavior.
