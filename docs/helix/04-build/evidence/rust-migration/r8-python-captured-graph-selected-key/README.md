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

## Rust-directed live get/page selected-key preflight — 2026-10-26

The private PyO3 binding now exposes
`umf-access-capture-selected-key-observation/0.1.0` for the live
`key_param` selected-key stage. It retains the original key, RecordRef and
source handles, performs no graph DTO conversion, and charges a caller-owned
`CaptureResourceSession`. Its explicit precondition is that the predecessor's
terminal/header/root-owner pass and complete sequential Join-owner closure have
already run; this observer does not perform those earlier stages. Public
`capture()` and the private candidate routing remain unchanged.

Admission checks exact base Node/RecordRef classes and the raw `key_param`
instance shape before observable accessors. Once any live getter is read,
`unsupported-after-read` is terminal and callers must never retry Python
validation. Direct parity controls compare the Python `_validate_node`
predecessor with this post-owner observer for `get` and `page`: key `op` and
`args` faults beat the repeated selected-key root reads; both root owner fields
precede `key_id` and `source`; source getter exceptions retain object identity.
Python `dict` construction, duplicate-key handling and equality order are used
for identity checks, including missing-key `KeyError` and non-string dynamic
owner values. This evidence covers only the tested `key_param` shape and
preflight stage; it does not authorize route integration or certify all
state-changing accessors, key literals, general graph semantics, or resource
parity with public capture.

A fresh isolated Rust 1.90.0 PyO3 build used target
`/private/tmp/umf-selected-key-observation-target` and overlay
`/private/tmp/umf-selected-key-observation-overlay`. The seven-file CPython
3.13.16 macOS 27 arm64 capture cohort passed **124 tests and 3 subtests**:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-selected-key-observation-target \
cargo build --locked --offline -p umf-core-python
cp /private/tmp/umf-selected-key-observation-target/debug/lib_rust_core.dylib \
  /private/tmp/umf-selected-key-observation-overlay/umf/_rust_core.abi3.so

PYTHONDONTWRITEBYTECODE=1 \
DYLD_LIBRARY_PATH=/private/tmp/umf-selected-key-observation-overlay/umf \
PYTHONPATH=/private/tmp/umf-selected-key-observation-overlay:python/umf_access/src:python/src \
python/.venv/bin/python -m pytest -p no:cacheprovider -q \
  python/umf_access/tests/test_capture.py \
  python/umf_access/tests/test_capture_resource_budget.py \
  python/umf_access/tests/test_capture_field_observation.py \
  python/umf_access/tests/test_capture_rust_graph_validator.py \
  python/umf_access/tests/test_captured_declaration_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_positive.py
```

The captured artifact and live-source hashes are:

| Artifact | SHA-256 |
| --- | --- |
| Overlay `_rust_core.abi3.so` | `0321e183eb1f52adab1c23c9e26068106f34139603e9f2e34c5276cc4adc94a3` |
| `bindings/core/python/src/lib.rs` | `5aee38a328e1a5466808cae30aab5a0ee9c422b5b687caefdb870e2e3ea4d8fa` |
| `rust_capture_observe.py` | `860c82835cdc412e230cfd229691e047352c6013c1ba872d38b8660ac77938d9` |
| `test_capture_rust_graph_validator.py` | `4c44c2a68a17fe5b350f611e2abbbfb2252ad877fd03d71e51536fe5c410fd06` |
