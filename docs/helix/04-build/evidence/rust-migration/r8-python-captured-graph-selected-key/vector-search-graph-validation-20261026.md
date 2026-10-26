---
ddx:
  id: umf.evidence.rust-migration.r8-python-captured-graph-vector-search-leg
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-captured-graph-search-leg
      kind: extends
---

# Private vector SearchLeg observer — 2026-10-26

The private captured-graph observer now admits an exact `SearchLeg(kind="vector")`
whose bound value is an exact `Node("param", (declared_name,))`, whose already
resolved `CapturedParameter.carrier` is `Vector`, and whose nested-leg iterator
is empty. The existing keyword `Param[str]` case remains supported. This is a
Rust-directed live observation prefix; it does not select public `capture()` or
qualify a general search graph.

The observer retains the predecessor's demand order: separate `record` reads
for module and element; root module/element reads; the first bound-value read;
the second value read and `op`; the third value read and exact-Node check; args
index zero; `kind`; then the fourth value read and the seven recursive `op`
reads, followed by argument traversal and the legs iterator. Same-host tests
compare the observer trace with `_validate_node` and retain the original
exception from a faulting `kind` property. A wrong resolved carrier is refused
at the `CAPTURE_SIGNATURE` boundary before `legs` is read. Unsupported kinds,
non-parameter values, nonempty/nested legs and subclass graphs remain refused.

The Rust unit suite for `access_graph_host_observation` passes 10/10, including
the vector carrier path. The `umf-core-python` PyO3 cdylib builds successfully.
Sol built a fresh PyO3 cdylib with pinned Rust 1.90 and ran the repository
virtual environment with that extension overlaid; the focused captured-graph
pytest file passed 24/24. The package's
installed-artifact and public-route behavior are not qualified by this record.

This capability increments the private observer profile to
`umf-access-capture-graph-observation/0.4.0`. It does not change the default
route, retire any TypeScript operation, or claim completion of captured-graph
validation.

## Source identity

The focused source files at this capture have these SHA-256 digests:

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/access_graph_host_observation.rs` | `fde0a1214cd0c96acac24b597c790cc7916365358bb021b804a4babafff67f56` |
| `bindings/core/python/src/lib.rs` | `e043fa77116ade4c793463bc76d300cc58b877639b57872fa679d1bab9c3b7e7` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `7ae5dd7835c45c596a8663dc31f18c4320fba95bb7b413c10b95c8a8e562f937` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `6e7c6a3e5470f628bd5aee55134cbd9c604633167ba7de9776abc8658d26c1a6` |
