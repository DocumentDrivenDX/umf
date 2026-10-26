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

# R8 private Python read-frame core

This core-only slice models the structural post-host read-frame decisions in
`python/umf_access/src/umf_access/unified/operation_values.py::result_frame`.
The frozen predecessor in `evidence/rust-migration/r6-operation-values/
frozen-operation-values.py` owns the ordering reference. Rust exposes separate
shape and post-decode cardinality checks in `crates/umf-core/src/access_stream.rs`.

The shape seam requests each row width through a callback in predecessor order:
count mode checks row count before requesting width zero; other modes request
row widths left to right and stop at the first arity mismatch. Host callback
errors remain opaque. Post-decode cardinality is separate because the
predecessor decodes every row before checking `one`, `optional`, `many`, or
`page` limits. The existing database call, row acquisition, scalar decoding,
cursor construction, and public/default route remain Python-owned.

With Rust 1.90.0, these focused checks passed:

```text
cargo test --locked -p umf-core --lib post_host_read_frame --target-dir /private/tmp/umf-outcome-effect-target
  2 passed
cargo test --locked -p umf-core --lib access_stream::tests::read_frame --target-dir /private/tmp/umf-outcome-effect-target
  1 passed
cargo check --locked -p umf-core --lib --target-dir /private/tmp/umf-outcome-effect-target
  passed
rustfmt --check crates/umf-core/src/access_stream.rs
  passed
```

This does not include a PyO3 bridge or Python parity run. A future bridge must
perform the host `len(row)` observations only when requested by Rust, preserve
the predecessor's short-circuit order and rethrow a host exception unchanged.
It must also perform cardinality only after every row has been decoded. No
native database read, installed package, public default, or release behavior is
qualified here. The predicate currently has no shared `Context` charge and
accepts a caller-supplied `usize` row count; it cannot be exposed on a public
route until the admitted program/native-host bound and one cumulative resource
budget are established.
