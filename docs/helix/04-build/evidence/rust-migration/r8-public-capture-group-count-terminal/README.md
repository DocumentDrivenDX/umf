---
ddx:
  id: umf.evidence.rust-migration.r8-public-capture-group-count-terminal
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: umf.evidence.rust-migration.r8-public-capture-exact-terminal
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R8 public capture empty-step `group_count` candidate

Status: local source-overlay qualification; not installed-wheel evidence.

This candidate extends the private exact empty-terminal profile from five
operations to include exact base `Node("group_count", (RecordRef, ()))`. The
Python predecessor `_validate_node` accepts this direct terminal shape. It is
not a claim that the normal DSL builder emits an empty-step grouped count; the
shape is currently reachable by constructing the public `Node` directly.

Admission remains limited to the existing exact built-in `Node`, `RecordRef`,
tuple and bounded-dictionary profile. Only the admitted operation set and
profile version changed. Rust retains the same raw side-effect-free admission,
header checks, empty selection/group/join checks, root owner reads and
recursive visit tail. `group_count` adds no operation-specific preflight, so
the candidate follows the same repeated access sequence as the five existing
operations. Unsupported shapes continue through `_validate_node`.

The Rust-directed extension was built offline and the seven-file capture
predecessor cohort passed. This checks the new direct-Node shape against
`_validate_node`, confirms that public `capture()` chooses the Rust profile,
and reruns the existing selection/fallback and predecessor tests. It does not
extend the historical installed-wheel qualification recorded in
`r8-public-capture-exact-terminal/README.md`; that remains five operations at
profile `0.2.0`. This change uses profile `0.3.0` and needs a fresh wheel build
and installed replay before any installed qualification can include it.

Build command:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
CARGO_TARGET_DIR=/private/tmp/umf-group-count-target \
cargo build --locked --offline -p umf-core-python
```

Overlay and focused differential test:

```sh
mkdir -p /private/tmp/umf-group-count-overlay/umf
cp -R python/src/umf/. /private/tmp/umf-group-count-overlay/umf/
cp /private/tmp/umf-group-count-target/debug/lib_rust_core.dylib \
  /private/tmp/umf-group-count-overlay/umf/_rust_core.abi3.so
PYTHONDONTWRITEBYTECODE=1 \
DYLD_LIBRARY_PATH=/private/tmp/umf-group-count-overlay/umf \
PYTHONPATH=/private/tmp/umf-group-count-overlay:python/umf_access/src:python/src \
python/.venv/bin/python -m pytest -p no:cacheprovider -q \
  python/umf_access/tests/test_capture_rust_graph_validator.py
```

Result: 62 passed. Broader predecessor cohort:

```sh
PYTHONDONTWRITEBYTECODE=1 \
DYLD_LIBRARY_PATH=/private/tmp/umf-group-count-overlay/umf \
PYTHONPATH=/private/tmp/umf-group-count-overlay:python/umf_access/src:python/src \
python/.venv/bin/python -m pytest -p no:cacheprovider -q \
  python/umf_access/tests/test_capture.py \
  python/umf_access/tests/test_capture_resource_budget.py \
  python/umf_access/tests/test_capture_field_observation.py \
  python/umf_access/tests/test_capture_rust_graph_validator.py \
  python/umf_access/tests/test_captured_declaration_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_predecessor.py \
  python/umf_access/tests/test_captured_logical_render_positive.py
```

Result: 139 passed, 3 subtests passed. Build host was macOS arm64 with Rust
1.90.0 and the repository `python/.venv` test environment. The built extension
SHA-256 was
`1b27580399430c5ba363e04f8446629826e8cada35fe503e9653492d8975ccf4`.
Sol independently reran the same seven-file overlay cohort and obtained
139 passes and three subtest passes.

Recorded source hashes:

| File | SHA-256 |
| --- | --- |
| `bindings/core/python/src/lib.rs` | `914f29abd248655cac9cda59a7028e4c69b78a1cff6f35474c53925098fb4843` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `3570593ca51dbdeb5ad6e8131a7f1e28fc215c712f000273243c68ce9fb570d7` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `95e0b8a08d2fbbcb325117d86b62d3de585148d3fc2dff0def071644c8a5d3d0` |

The evidence is scoped to this local build and test environment. It does not
qualify the full captured-expression surface, a clean dependency resolution,
other platforms or Python versions, hosted builds, generated metamodel
coherence, or installed wheels.
