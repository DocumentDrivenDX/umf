---
ddx:
  id: umf.evidence.rust-migration.r8-capture-dto-budget
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
---

# Private Rust-backed capture DTO budget

This slice moves private capture-session accounting for DTO encoding from
per-adapter Python counters into the shared PyO3 `CaptureResourceSession`.
Python retains traversal and `JSONEncoder.iterencode`; the bridge records node
visits, UTF-8 text bytes, and cumulative output characters and bytes. Shared
work remains charged once per DTO node, as in the predecessor. Text and output
units are separate resource ceilings, not additional work charges.

The tested ceilings preserve the predecessor's 50,000 DTO nodes, depth 64,
and 8 MiB UTF-8 text and serialized output limits. Native counters persist
across adapter objects sharing one session. Node work is charged before
DTO-specific checks. Text character preflight precedes strict UTF-8 encoding,
and text-byte totals commit only after encoding succeeds. JSON output totals
commit only after the complete iterator succeeds; per-chunk checks bound
allocation while preserving encoder traversal and exception order. Native
budget errors are translated to `_DtoBudgetExceeded` at the Python adapter
boundary; shared-work `ValueError` and `UnicodeEncodeError` remain unchanged.

Focused tests cover exact and over node/depth/text/output boundaries, work
limit precedence, malformed UTF-16 text, output atomicity on NaN, and a second
adapter encountering a nearly exhausted shared output budget. These tests
exercise the private helper and session directly; they do not establish
whole-capture semantic parity.

## Verification cohort

Source base: `ea7a41b2132e839ff03fb27ed121f0549aec1039`. The build used Rust
1.90.0 and the repository lockfile without modifying it:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-capture-budget-target \
cargo build --locked --offline -p umf-core-python
cp /private/tmp/umf-capture-budget-target/debug/lib_rust_core.dylib \
  /private/tmp/umf-capture-budget-overlay/umf/_rust_core.abi3.so
```

The resulting Darwin arm64 extension SHA-256 was
`547b5e661209068d73448b80510b10f9cb865b2d1c8ddf3b7e79497aeae333b8`.
Against that overlay and CPython 3.13.16, this focused command passed 100 tests
and 3 subtests:

```sh
DYLD_LIBRARY_PATH=/private/tmp/umf-capture-budget-overlay/umf \
PYTHONPATH=/private/tmp/umf-capture-budget-overlay:python/umf_access/src \
python/.venv/bin/python -m pytest -p no:cacheprovider -q \
  python/umf_access/tests/test_capture.py \
  python/umf_access/tests/test_capture_resource_budget.py \
  python/umf_access/tests/test_capture_field_observation.py \
  python/umf_access/tests/test_capture_rust_graph_validator.py \
  python/umf_access/tests/test_captured_declaration_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_positive.py
```

`git diff --check` passed. The relevant source and fixture hashes are:

| Input | SHA-256 |
|---|---|
| `bindings/core/python/src/lib.rs` | `39e6ca8b264694bb06cfd5c626dc0a243efd9f2f0bcee0eef0bf6a702b92633e` |
| `python/umf_access/src/umf_access/rust_catalog_render.py` | `8630a201c61d5a0f4824672ab25b4945815a0f7d159a1bfb8d76d1228093cb02` |
| `python/umf_access/tests/test_capture_resource_budget.py` | `bfd03ffd9b5b3595077a4c639c94b48ce5063f9de387d83e1f623132ef0fc652` |
| `python/umf_access/tests/test_capture.py` | `f259325fbfc743452b443761196dc8cec7d7fb95ebaccf6d7ecc59e0455737df` |
| `python/umf_access/tests/test_capture_field_observation.py` | `eb0ac0c23c6be6da8ebb0d06583b04bb5386befb5f314912a1269059448a5256` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `6e7c6a3e5470f628bd5a5ee55134cbd9c604633167ba7de9776abc8658d26c1a6` |
| `python/umf_access/tests/test_captured_declaration_predecessor.py` | `c7e393fbdfd835d77ebaf38ca5ab84fcb59dc90c98e07299d02792ce839e813e` |
| `python/umf_access/tests/test_captured_logical_render_predecessor.py` | `2d1725684c2b6c0c9fc0e45e3e9fdb107a7de17c8db9d4d375cb7da398087cb0` |
| `python/umf_access/tests/test_captured_logical_render_positive.py` | `bb6eef710a9d1d2a27c661eff4fa9c115fbbc99a6b787cbb98bab8c3bde2d2d1` |

## Limits and public-route blocker

This remains private bridge infrastructure. It does not move traversal or JSON
encoding into Rust, does not reconcile the legacy DTO ceilings with the Rust
`Context::ordinary()` limits, and does not cover the rest of `_validate_node`.
The public `capture()` route remains unchanged and continues to use the Python
validator. No installed-wheel or default-route claim follows from this
evidence; public cutover still requires complete first-fault semantic parity
and the installed-wheel gate.
