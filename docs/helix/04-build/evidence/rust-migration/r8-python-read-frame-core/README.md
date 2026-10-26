---
ddx:
  id: umf.evidence.rust-migration.r8-python-read-frame-core
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-081
      kind: informed_by
---

# R8 private Python read-frame admission

This private opt-in slice models the structural post-host read-frame decisions
in `python/umf_access/src/umf_access/unified/operation_values.py::result_frame`.
The frozen predecessor in `evidence/rust-migration/r6-operation-values/
frozen-operation-values.py` owns the ordering reference. Rust exposes separate
shape and post-decode cardinality checks in `crates/umf-core/src/access_stream.rs`.

The PyO3 shape operation asks Python for width observations in predecessor
order. Count mode calls `len(rows)` first and only then indexes row zero and
calls `len(row)`. Other modes iterate rows and call `len(row)` one at a time,
stopping at the first arity mismatch. A host `PyErr` is propagated unchanged.
Post-decode cardinality is a separate operation because the predecessor
decodes every row before checking `one`, `optional`, `many`, or `page` limits.
The new private Python helpers require exact profile
`umf-python-read-frame/0.1.0`; missing capability raises
`native read-frame capability unavailable`, and a different version raises
`native read-frame capability profile mismatch`. The public/default
`result_frame` route remains unchanged; database calls, row acquisition, scalar
decoding, and cursor construction remain Python-owned.

With Rust 1.90.0, the focused core checks passed:

```text
cargo test --locked -p umf-core --lib 'access_stream::tests::' --target-dir /private/tmp/umf-outcome-effect-target
  5 passed
cargo check --locked -p umf-core --lib --target-dir /private/tmp/umf-outcome-effect-target
  passed
rustfmt --check crates/umf-core/src/access_stream.rs bindings/core/python/src/lib.rs
  passed
```

A fresh `umf-core-python` extension was built with
`cargo build --locked -p umf-core-python --target-dir
/private/tmp/umf-read-frame-target`. Its SHA-256 is
`c8c087b490c8d97d652b75db19760bc2c8b12c8e5cd34e9a3d23870bb05b5316`.
Using that extension in a temporary overlay on CPython 3.14.8, Darwin 27
arm64, the focused Python suite passed **7/7**. It covers predecessor error
messages, count host-read order, later-row short circuit, identity-preserving
row and iterator failures, separate decode/cardinality stages, a decode failure
preceding cardinality refusal, and profile mismatch/unavailability.

Source SHA-256 values at this receipt are:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/access_stream.rs` | `bb3ddbd3badcfaa59b8a78809f433297bfa8ed0bebab1250cb97e269ccb9a209` |
| `bindings/core/python/src/lib.rs` | `bcddb360102144677c026bf0a3e026f7192dd6a6887b9e23ab9a95e61303d7cc` |
| `python/src/umf/rust_values.py` | `bf277688876f2fcd43a3a80202f74d340778d4f70db4f587a97db3a4602dbab1` |
| `python/umf_access/src/umf_access/unified/operation_values.py` | `5fffac946bb01f16d2667e4f4fd7eb757fc3ca538bba54726634684e0e2a6d4e` |
| `python/umf_access/tests/test_rust_read_frame.py` | `540437a9b0d88c0b300aa91071f653a3baad5632a75e6b859e7407a78dc3f5b0` |

The private predicate has no shared `Context` charge, and cardinality accepts
caller-supplied `usize` row count and bound. It cannot be exposed on a public
route until admitted program/native-host bounds and a cumulative resource
budget are established. This is not an installed-wheel or live database check,
and makes no public release claim.
