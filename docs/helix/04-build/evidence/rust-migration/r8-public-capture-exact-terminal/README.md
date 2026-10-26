---
ddx:
  id: umf.evidence.rust-migration.r8-public-capture-exact-terminal
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: umf.evidence.rust-migration.r8-capture-dto-budget
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-captured-graph-selected-key
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# Public capture exact empty-terminal route

`capture()` now chooses the existing no-DTO PyO3 validator only for an exact
empty parameter tuple and exact base `Node` / `RecordRef` empty-step terminal
shape. The admitted operations are `all`, `first`, `one`, `count`, and
`exists`. It invokes the validator from the existing capture callback after
each declaration invocation; introspection, declaration invocation, repeated
capture determinism, canonical rendering, and all other shape validation stay
on the established Python path. The private graph DTO route is not used.

The admission boundary is bounded before any live graph accessor read. The
Node instance dictionary must have exactly two keys; RecordRef allows at most
eight. Scanned keys must be exact strings of at most 32 characters and `op`
at most 16 characters. Oversized or otherwise outside-profile shapes go
straight to `_validate_node`; admission does not inspect custom key hashes or
comparisons. The fixed profile uses `u64::MAX` as its session ceiling because
the admitted graph has fixed shallow shape and the public predecessor has no
resource cap. This does not establish general capture resource parity.

The seven-file CPython 3.13.16 Darwin arm64 capture cohort passed **137 tests
and 3 subtests** using an isolated Rust 1.90.0 offline extension build. The
suite covers accepted operations against the Python predecessor; accepted-path
Rust selection; oversized dictionaries, long raw strings and custom dict keys
falling back; accessor first-fault identity; nonempty-parameter exclusion and
parameter-map first-fault preservation; and fallback when the installed core
lacks the capability. Full command:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \\
CARGO_TARGET_DIR=/private/tmp/umf-public-capture-target \\
cargo build --locked --offline -p umf-core-python

mkdir -p /private/tmp/umf-public-capture-overlay/umf
cp -R python/src/umf/. /private/tmp/umf-public-capture-overlay/umf/
cp /private/tmp/umf-public-capture-target/debug/lib_rust_core.dylib \\
  /private/tmp/umf-public-capture-overlay/umf/_rust_core.abi3.so

PYTHONDONTWRITEBYTECODE=1 \\
DYLD_LIBRARY_PATH=/private/tmp/umf-public-capture-overlay/umf \\
PYTHONPATH=/private/tmp/umf-public-capture-overlay:python/umf_access/src:python/src \\
python/.venv/bin/python -m pytest -p no:cacheprovider -q \\
  python/umf_access/tests/test_capture.py \\
  python/umf_access/tests/test_capture_resource_budget.py \\
  python/umf_access/tests/test_capture_field_observation.py \\
  python/umf_access/tests/test_capture_rust_graph_validator.py \\
  python/umf_access/tests/test_captured_declaration_predecessor.py \\
  python/umf_access/tests/test_captured_logical_render_predecessor.py \\
  python/umf_access/tests/test_captured_logical_render_positive.py
```

The repository dependency is pinned to `umf-core==0.11.0` in
`python/umf_access/pyproject.toml`. This test environment reports that version,
but its ordinary source-path import resolved to the checkout's `python/src/umf`
and a pre-existing local extension without the new capability. Tests that
prove the route used a fresh extension in `/private/tmp` and a copied `umf`
source package overlay. The `umf_access` Python source and tests were imported
from the checkout. The old-core missing-capability fallback is covered, but
this is not a built-wheel/source-closure test: published `umf-core==0.11.0`
contents, dependency resolution from an installed `umf_access` wheel, and
platform wheel coverage remain release gates. A release must ship a matching
`umf-core` extension containing the new capability before claiming that
installed public `capture()` selects Rust.

Other boundaries remain explicit: captures with parameters or nonempty steps,
non-base classes, get/page and general graph shapes continue on Python. This
slice does not qualify Rust parity for invocation ordering outside the tested
callback, canonicalization, declaration side effects, interpreter platforms,
or general resource use. The matching overlay extension SHA-256 is
`64186cf69dfdfb34844eb6fb522feb18d8d484ce417ecbf7844f4c3982680320`.

## Source hashes

| Source | SHA-256 |
| --- | --- |
| `bindings/core/python/src/lib.rs` | `825dcadacf72b60eb22726224bd247a747a9fa66f1d8412e143822ff0f93b210` |
| `python/umf_access/src/umf_access/capture.py` | `fec90c58b407f1e41c3241ab87fe22279065479c2a60ad26a5030ccfa6ea6348` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` | `860c82835cdc412e230cfd229691e047352c6013c1ba872d38b8660ac77938d9` |
| `python/umf_access/tests/test_capture.py` | `f259325fbfc743452b443761196dc8cec7d7fb95ebaccf6d7ecc59e0455737df` |
| `python/umf_access/tests/test_capture_resource_budget.py` | `6571425c5236f731505ac02f1e8bb504232e87ea519b1fa3affcb853986b5c95` |
| `python/umf_access/tests/test_capture_field_observation.py` | `eb0ac0c23c6be6da8ebb0d06583b04bb5386befb5f314912a1269059448a5256` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `b63e51e2212d70912bb3abc9805e407705b23d15ca6a911ec161441c4a6a059c` |
| `python/umf_access/tests/test_captured_declaration_predecessor.py` | `c7e393fbdfd835d77ebaf38ca5ab84fcb59dc90c98e07299d02792ce839e813e` |
| `python/umf_access/tests/test_captured_logical_render_predecessor.py` | `2d1725684c2b6c0c9fc0e45e3e9fdb107a7de17c8db9d4d375cb7da398087cb0` |
| `python/umf_access/tests/test_captured_logical_render_positive.py` | `bb6eef710a9d1d2a27c661eff4fa9c115fbbc99a6b787cbb98bab8c3bde2d2d1` |
