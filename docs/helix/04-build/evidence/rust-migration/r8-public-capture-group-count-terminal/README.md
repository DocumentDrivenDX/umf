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

Status: local source-overlay and Darwin arm64 installed-wheel qualification.

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
`r8-public-capture-exact-terminal/README.md`; that remains a separate
five-operation profile `0.2.0` receipt. The profile `0.3.0` qualification
below is a fresh wheel build and installed replay.

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

The source-overlay evidence is scoped to this local build and test environment.
It does not qualify the full captured-expression surface, a clean dependency
resolution, other platforms or Python versions, hosted builds, generated
metamodel coherence, or installed wheels.

## Current-source installed-wheel qualification — 2026-10-26

Both wheels were built offline from the current source cohort after the
action-runtime resources were synchronized to manifest pin
`d47f23b213a8ae42ba46ab0d65750d6a60bec54eaa943bf84b7ae8981672ddc9`. Build
host: macOS 27.0.1 arm64, Rust 1.90.0, CPython 3.11.17 as the wheel build
interpreter, Hatchling 1.27.0, and uv 0.13.3. The resulting core wheel is
`cp311-abi3-macosx_11_0_arm64`; the access wheel is `py3-none-any`.

Build commands:

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO=/opt/homebrew/opt/rustup/bin/cargo \
CARGO_TARGET_DIR=/private/tmp/umf-group-count-installed-20261026/target \
UV_CACHE_DIR=/private/tmp/umf-group-count-installed-20261026/uv-cache \
/opt/homebrew/bin/uv build --offline --no-build-isolation --wheel \
  --python /private/tmp/umf-r4-build-env/bin/python \
  --out-dir /private/tmp/umf-group-count-installed-20261026/wheelhouse python

CARGO_TARGET_DIR=/private/tmp/umf-group-count-installed-20261026/target \
UV_CACHE_DIR=/private/tmp/umf-group-count-installed-20261026/uv-cache \
/opt/homebrew/bin/uv build --offline --no-build-isolation --wheel \
  --python /private/tmp/umf-r4-build-env/bin/python \
  --out-dir /private/tmp/umf-group-count-installed-20261026/wheelhouse \
  python/umf_access

/opt/homebrew/bin/python3.14 -m venv --system-site-packages \
  /private/tmp/umf-group-count-installed-20261026/installed-current
/private/tmp/umf-group-count-installed-20261026/installed-current/bin/python \
  -m pip install --no-deps --force-reinstall \
  /private/tmp/umf-group-count-installed-20261026/wheelhouse/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl \
  /private/tmp/umf-group-count-installed-20261026/wheelhouse/umf_access-0.1.0.dev7-py3-none-any.whl
```

The installed replay constructed exact base `Node` terminals for `all`,
`first`, `one`, `count`, `exists`, and direct empty-step `group_count`. For
each operation it patched installed `umf_access.capture._validate_node` to
raise, ran public `capture()`, and asserted the installed Rust profile wrapper
was called four times across the two capture invocations. All six succeeded
with profile `umf-access-capture-exact-empty-terminal/0.3.0`. The installed
Python was CPython 3.14.8; the modules resolved from
`/private/tmp/umf-group-count-installed-20261026/installed-current/lib/python3.14/site-packages/umf_access/`
and the extension from the corresponding `site-packages/umf/` directory.

The installed-access fallback was also exercised against the historical core
wheel used by the earlier 0.2.0 receipt. That wheel has no profile-version
preflight function. With the current access wheel installed beside it, all six
operations succeeded through `_validate_node`; the predecessor ran four times
per operation and the wrapper returned to Python before invoking the old
validator. A direct call to that old core's validator returned profile
`0.2.0` and `outside-profile` for `group_count`. The new wrapper checks the
profile version before handing it a graph: an absent capability and the known
0.2.0 profile select Python; unknown profile versions and malformed validator
responses still raise. The focused test suite covers both known-old and
unknown profile behavior.

The focused source-overlay test command was rerun against the rebuilt
extension and completed with 64 passed:

```sh
PYTHONDONTWRITEBYTECODE=1 \
DYLD_LIBRARY_PATH=/private/tmp/umf-group-count-installed-20261026/overlay/umf \
PYTHONPATH=/private/tmp/umf-group-count-installed-20261026/overlay:python/umf_access/src:python/src \
python/.venv/bin/python -m pytest -p no:cacheprovider -q \
  python/umf_access/tests/test_capture_rust_graph_validator.py
```

Wheel and installed member hashes:

| Item | SHA-256 |
| --- | --- |
| Current `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `766f8154952c6ec63db519b7ff77111f618c09db6896940d753075544b9cae1b` |
| Current `umf_access-0.1.0.dev7-py3-none-any.whl` | `39ea10d9135b8b30cd16b7710b9cbf18c13a4d929409b5ca2507b7e05654a4ac` |
| Current core wheel and installed `_rust_core.abi3.so` member | `5c29dca0d401c06a049bdab004a5256b43c36bfbbd63e7a493c32754642a218b` |
| Historical core wheel with profile 0.2.0 | `22e00f6f90af5d465bbcbbcfe674fa6ea3bb4a179fa0f4908ade13e0f0301ef2` |
| Historical core wheel and old installed `_rust_core.abi3.so` member | `b309c9b06f92dd1821356d67496c8d604522f6e92cceccffac5d45778e9147cb` |
| `umf_access/capture.py` source and wheel member | `fec90c58b407f1e41c3241ab87fe22279065479c2a60ad26a5030ccfa6ea6348` |
| `umf_access/rust_capture_observe.py` source and wheel member | `88dd9bc9283e237f499f1aba1f9d32d2b7e8816b212ea458c9a8fb8ffe89909a` |
| `bindings/core/python/src/lib.rs` | `d279261e3cf988e99939dccb807c001f363a9c1f0861c7bd9cf2f57cb2be0126` |
| `python/umf_access/tests/test_capture_rust_graph_validator.py` | `f668be4359c7a4482d0b2583f362ff5cd1c24f2700e00e6b36226c53a40a6ff9` |

Installation used `--no-deps` and `--system-site-packages`. The environment
reported `umf-core` 0.11.0, `umf-access` 0.1.0.dev7, Pydantic 2.14.1 and
typing-extensions 4.16.0. `pip check` reported the inherited environment issue
`wheel 0.48.0 requires packaging`; it did not affect imports or the capture
replays. These checks establish matched wheel members and installed paths for
this Darwin arm64 cohort. They do not establish complete Rust-core transitive
source closure, clean dependency resolution, other platforms or Python
versions, hosted builds, full capture-surface parity, or release readiness.

After the final metamodel/action-runtime regeneration, the canonical resource
pin remained `d47f23b213a8ae42ba46ab0d65750d6a60bec54eaa943bf84b7ae8981672ddc9`.
The existing wheel members were compared against the post-sync checkout:
all 45 Python/resource members checked in the core wheel and all 92 Python
members in the access wheel matched byte-for-byte. The separately built core
extension member matched the installed extension, and the current Rust
binding source remained SHA-256
`d279261e3cf988e99939dccb807c001f363a9c1f0861c7bd9cf2f57cb2be0126`.
Because the pinned resources and all packaged source members were unchanged,
the existing wheel pair and installed replay remain applicable; no rebuild or
replay was needed after this regeneration.
