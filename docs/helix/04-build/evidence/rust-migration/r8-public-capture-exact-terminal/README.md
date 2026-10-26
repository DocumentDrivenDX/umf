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
`python/umf_access/pyproject.toml`. The earlier 137-test cohort above imported
`umf_access` from the checkout and used a copied `umf` source overlay with a
fresh extension; it remains source-path evidence. The installed-wheel
qualification below separately closes this route for one locally built
Darwin arm64 wheel pair and one installed CPython 3.14.8 environment.

## Current-source installed-wheel qualification — 2026-10-26

The core wheel was rebuilt offline from the recorded source cohort after the
generated action-runtime resources were synchronized. The access wheel was
also built offline; its `capture.py` and `rust_capture_observe.py` member bytes
were checked against the matching files in that source cohort. The
synchronization pin was
`809d420aacc03d536cdad896316d5b764a0035f6e3f12b47c5d05fde31511140`. Build
host: macOS 27.0.1 arm64, Rust 1.90.0, CPython 3.11.17 and Hatchling 1.27.0.
The core wheel is tagged `cp311-abi3-macosx_11_0_arm64`; the access wheel is
`py3-none-any`.

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO=/opt/homebrew/opt/rustup/bin/cargo \
CARGO_TARGET_DIR=/private/tmp/umf-capture-closure-20261026/target \
UV_CACHE_DIR=/private/tmp/umf-capture-closure-20261026/uv-cache \
/opt/homebrew/bin/uv build --offline --no-build-isolation --wheel \
  --python /private/tmp/umf-r4-build-env/bin/python \
  --out-dir /private/tmp/umf-capture-closure-20261026/wheelhouse python

CARGO_TARGET_DIR=/private/tmp/umf-capture-closure-20261026/target \
UV_CACHE_DIR=/private/tmp/umf-capture-closure-20261026/uv-cache \
/opt/homebrew/bin/uv build --offline --no-build-isolation --wheel \
  --python /private/tmp/umf-r4-build-env/bin/python \
  --out-dir /private/tmp/umf-capture-closure-20261026/wheelhouse python/umf_access

/opt/homebrew/bin/python3.14 -m venv --system-site-packages \
  /private/tmp/umf-capture-closure-20261026/installed-current
/private/tmp/umf-capture-closure-20261026/installed-current/bin/python \
  -m pip install --no-deps --force-reinstall \
  /private/tmp/umf-capture-closure-20261026/wheelhouse/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl \
  /private/tmp/umf-capture-closure-20261026/wheelhouse/umf_access-0.1.0.dev7-py3-none-any.whl
```

The installed-route assertion used this focused script:

```python
from importlib import import_module
from unittest.mock import patch

from umf import _rust
from umf_access.dsl import FieldRef, RecordRef, Terminal, query
from umf_access.dsl._nodes import Node

capture = import_module("umf_access.capture")
observer = import_module("umf_access.rust_capture_observe")
core = _rust._rust_core
assert callable(core.CaptureResourceSession)
assert callable(core.access_validate_capture_exact_empty_terminal_with_session)

for op in ("all", "first", "one", "count", "exists"):
    node = Node(op, (RecordRef("demo", "Thing", (
        FieldRef(module="demo", element="Thing", field="id"),
    )), ()))

    @query
    def declaration():
        return Terminal(node)

    with patch.object(
        capture, "_validate_node",
        side_effect=AssertionError("Python predecessor selected"),
    ):
        with patch.object(
            observer, "validate_exact_empty_terminal_profile",
            wraps=observer.validate_exact_empty_terminal_profile,
        ) as rust_profile:
            captured = capture.capture(declaration)
    assert captured.variants[0].node.op == op
    assert rust_profile.call_count == 4, (op, rust_profile.call_count)
```

The installed environment reported CPython 3.14.8, `umf-core` 0.11.0 and
`umf-access` 0.1.0.dev7. Its `umf_access.capture` and
`umf_access.rust_capture_observe` modules resolved under
`/private/tmp/umf-capture-closure-20261026/installed-current/lib/python3.14/site-packages/umf_access/`;
the extension resolved under the corresponding `site-packages/umf/` directory.
The installed public `capture()` route passed for `all`, `first`, `one`,
`count`, and `exists`. For each operation, the Rust exact-profile observer was
called four times and `_validate_node` was patched to raise, so success proves
that the installed public path selected the installed Rust extension for these
five exact empty-terminal shapes. The root agent independently replayed the
same five-operation check and confirmed five successes with four observer calls
per operation.

The `umf_access` wheel's `capture.py` and `rust_capture_observe.py` members
matched the corresponding source files in the recorded cohort byte-for-byte.
The core wheel's `umf/_rust_core.abi3.so` member matched the installed
extension byte-for-byte.
These hashes identify the source and artifacts used:

| Item | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `22e00f6f90af5d465bbcbbcfe674fa6ea3bb4a179fa0f4908ade13e0f0301ef2` |
| `umf_access-0.1.0.dev7-py3-none-any.whl` | `84ed08a87bb17973ebb2c00ded44213a97632abbf0023166392d161ccbbb73a1` |
| Core wheel and installed `_rust_core.abi3.so` member | `b309c9b06f92dd1821356d67496c8d604522f6e92cceccffac5d45778e9147cb` |
| `bindings/core/python/src/lib.rs` | `825dcadacf72b60eb22726224bd247a747a9fa66f1d8412e143822ff0f93b210` |
| `crates/umf-core/src/lib.rs` | `0a206d20ae57fdc1a83865536f90815189f8933a666047f2cdcfd5c216c266ad` |
| `python/umf_access/src/umf_access/capture.py` and wheel member | `fec90c58b407f1e41c3241ab87fe22279065479c2a60ad26a5030ccfa6ea6348` |
| `python/umf_access/src/umf_access/rust_capture_observe.py` and wheel member | `860c82835cdc412e230cfd229691e047352c6013c1ba872d38b8660ac77938d9` |
| `python/umf_access/pyproject.toml` | `3fd107c0ad3b89530dfa3156b6e21875f928e35e43796cfe9d9f647f7396658e` |

The access wheel declares `umf-core==0.11.0`, `pydantic>=2.13,<3`, and
`typing-extensions>=4.16,<5`. Installation used `--no-deps`; Pydantic 2.14.1
and typing-extensions 4.16.0 came from the venv's system-site packages. This
checks the matched wheel members and installed path for the recorded source
cohort; it does not establish the full transitive source closure or clean
dependency resolution. `pip check` reported the inherited environment issue
`wheel 0.48.0 requires packaging`; it did not affect the imports or focused
capture run.

This closes the local installed-wheel gate for the listed Darwin arm64 wheel
pair and five-operation Python 3.14.8 cohort. Hosted wheel builds, other
platforms/interpreters, full R8 source closure, the broader capture surface,
general resource parity, and release remain unqualified.

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
