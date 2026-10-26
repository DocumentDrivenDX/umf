---
ddx:
  id: umf.evidence.rust-migration.r8-capture-visit-field-join-tuple
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

# R8 private captured-graph observation prefixes

This evidence records two private Rust-directed host-observation prefixes in
the capture migration: terminal/root/sequential-Join observation, and the
bounded `FieldRef`/`Join`/tuple branch of `_validate_node.visit`. Both preserve
the observable order of the covered live reads and retain accessor exceptions.
Neither changes public `capture()` routing or establishes complete captured
graph validation.

## Bounded visit branch

The source predecessor is
`python/umf_access/src/umf_access/capture.py::_validate_node.visit`. For a
value admitted to this slice, Rust requests the Python branch probes in the
same order as the predecessor: `FieldRef`, `SearchLeg`, `Join`, `Node`, then
tuple. A `FieldRef` reads `module`, `element`, and `alias` in tuple-construction
order before owner comparison. A `Join` reads `ref` once and visits that value.
Tuples are iterated once and visited depth-first in yielded order. First
foreign-field refusal stops before later tuple children. A passive value that
matches none of those branches remains a no-op.

`SearchLeg` and `Node` are refused by this slice. Their predecessor branches
perform declaration, parameter, navigation, aggregate, temporal, and other
semantic checks before recursing. The private observer does not report success
for those shapes. Exact Python accessor `PyErr` objects are retained and
re-raised; UTF-16 text conversion preserves lone-surrogate owner strings.
Missing structural-probe capability fails closed. A single ordinary Rust
`Context` is shared across all observations inside this route, with each host
operation charged once and a 64-level recursion guard.

The allowed owner tuples are explicit exact `(module, element, alias)` tuples
supplied by the private Python bridge. The route does not derive a full owner
set itself and does not combine its budget context with the separate terminal
prefix call.

## Terminal and Join prefix

The earlier terminal observer reads terminal structure in the predecessor's
pass order, then root and sequential Join owner identity. It preserves repeated
`relation.ref` and `relation.target` accessor reads, the `node.op` re-reads in
group/scalar checks, and iterator handles across `iter`/`next`. Its exact
read-order and identity cases are in
`python/umf_access/tests/test_capture_field_observation.py`.

## Evidence scope and exclusions

The implementation is confined to
`crates/umf-core/src/access_graph_host_observation.rs`,
`bindings/core/python/src/lib.rs`,
`python/umf_access/src/umf_access/rust_capture_observe.py`, and
`python/umf_access/tests/test_capture_field_observation.py`. It is private
opt-in infrastructure. Public `capture()` continues to select the Python
validator. The observer does not replace `_encode_capture`, serialize a DTO,
admit Node/SearchLeg/related-navigation semantics in the new visit route, or
reconcile the legacy 50,000-node, depth-64, and 8 MiB capture limits as one
end-to-end budget. No installed-wheel or package-release claim is made.

## Verification

The focused Rust core suite passed seven observer tests:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-field-owner-observation-target \
cargo test --locked --offline -p umf-core --lib access_graph_host_observation
```

The PyO3 extension built successfully:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-field-owner-observation-target \
cargo build --locked --offline -p umf-core-python
```

With that built extension copied into the temporary overlay used by the test
command, the focused Python parity file passed 22 tests:

```sh
PYTHONPATH=/private/tmp/umf-field-owner-observation-overlay:python/umf_access/src \
python/.venv/bin/python -m pytest -q -p no:cacheprovider \
  python/umf_access/tests/test_capture_field_observation.py
```

These results qualify only the listed observer paths and fixtures. The module
does not claim whole-package parity, default-route behavior, or an installed
artifact cohort.
