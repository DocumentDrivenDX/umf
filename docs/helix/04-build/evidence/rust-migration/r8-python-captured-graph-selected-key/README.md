---
ddx:
  id: umf.evidence.rust-migration.r8-python-captured-graph-selected-key
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: umf.evidence.rust-migration.r8-python-access-semantic-ownership-decision
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R8 opt-in captured-graph selected-Key validation

Rust `access_graph_validate` now admits closed `all`, `get`, and `page`
captured-variant DTOs. For `get` and `page`, it applies the predecessor's
group/scalar checks, complete join-owner check, selected-Key preflight, and
expression visit in that order. It retains the two exact selected-Key
`CAPTURE_SIGNATURE` refusal messages. Malformed identity DTOs fail closed as
`CAPTURE_DTO_INVALID`; public Python `capture()` still uses its existing
validator. This is a bounded opt-in slice, not full graph parity.

`rustfmt --check` passed. The focused offline Rust test command
`cargo test -p umf-core access_graph_validate::tests --lib --locked --offline`
passed **20/20** with Rust 1.90.0 and an isolated target directory. The
Python wrapper suite passed **2/2**, but it mocks the native call.

For a real native check, `cargo build -p umf-core-python --locked --offline`
built a fresh PyO3 extension in an isolated target directory. An overlay copy
of the current `python/src/umf` package loaded that extension as
`_rust_core.abi3.so`, SHA-256
`7bc19f08b0192f6eff40ef489566038b2348011e27e678347a1460abbb14f9d4`.
On CPython 3.13.16, Darwin 27 arm64, the
[replay harness](native-parity.py), SHA-256
`26e7431c1525e1dacfb873748de64d8193bae55b98e9e58708db7131e7b34336`,
and [result](native-parity.json), SHA-256
`29035e9bd5220fcdaea62fb249837edcad245d766b8bf095d489f69bbd745e1f`,
record **8/8** comparisons to public capture. They cover valid `get`/`page`
Key parameters, foreign and mismatched selected Keys, empty identity on a
source-bound root, and selected-Key-before-expression refusal order. The
accepted captured declaration shapes and exact refusal code/messages match.

The overlay and built extension remain under `/private/tmp`; the saved harness
requires a freshly built matching extension for reproduction. This run does
not establish full `_validate_node` parity, native `type-error` translation,
other Python versions or platforms, installed wheel behavior, or default-route
retirement. The source edit invalidates the prior fixed-point SDK archive's
current-source gate until the archive is rebuilt and replayed.
