---
ddx:
  id: umf.evidence.rust-migration.r8-read-plan-bind-default-python-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-read-plan-bind-rust-opt-in-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.read-plan-bind-python-predecessor-20261028
      kind: informed_by
---

# R8 public Python `ReadPlan.bind` Rust route

`ReadPlan.bind` now delegates to the Rust-owned ordered selector through the
lazy Python adapter. Python still performs argument inventory and validation,
continuation validation/conversion, and strict Pydantic parameter construction.
The selector receives the original plan and invokes artifact, identity,
presence, pin, selected-artifact, and parameter callbacks at the recorded
predecessor points. Callback exceptions propagate as their original Python
exceptions. No fallback is used when the installed Rust profile is unavailable.

The six frozen predecessor outcomes and full observation traces pass through
the public method. Causal controls exercise invalid inventory and continuation
before callbacks, failing artifact and identity observations, dynamic presence
failure, platform failure, zero and multiple matches, selected-artifact failure,
parameter validation failure, and original exception-object propagation. The
public route is separately asserted to enter the Rust adapter. The old opt-in
path remains as a direct candidate comparator.

Catalog exception classes now live in `catalog_errors.py` to keep the public
method's local Rust-adapter import acyclic under the Python boundary checker.
Their public imports and `__module__` values remain `umf_access.catalog`,
preserving their established identity and repr/pickle path.

## Installed wheel cohort

On Darwin arm64 with CPython 3.13.16, the current `umf_access` source was built
as `umf_access-0.1.0.dev7-py3-none-any.whl` and installed into an isolated
target directory with `uv pip install --no-deps --target`. The test import path
placed that installed wheel before repository Python sources. The UMF native
extension was independently built offline from this worktree using Rust 1.90.0,
PyO3 0.23.5, and the locked dependency set. All eight bind predecessor tests
passed with the installed wheel and that extension.

This is an installed `umf_access` wheel plus source-built extension replay. It
does not qualify a complete dependency-resolved installation, another Python
version or platform, package release, or the whole runtime. The public Rust
route requires an installed extension exposing
`umf-access-read-plan-bind/0.1.0` and refuses if it is absent or mismatched.

## Checks and source pins

The focused Rust `read_plan_bind` unit set passed 3/3. The combined Python
TargetPin, duplicate-name, ReadPlan.bind and access-boundary suite passed 30/30.
The access-boundary checker scanned 103 Python modules and reported zero
violations. The repository's Bun access-boundary suite passed 31/31. Ruff
passed for the touched Python files and checker.

| Artifact | SHA-256 |
| --- | --- |
| Installed `umf_access` wheel | `c1e15cea03f8edf21ac6e8bfdde868687904673eae6938d8a9d55de267595f09` |
| Source-built Rust extension | `531b5b0819e2dce7cbb18443f26dbfbcbc3baaf1b72f537f69cb7cd0744721f0` |
| `python/umf_access/src/umf_access/catalog.py` | `6410a8ebc2fcd3fa80336a875094a7303c0b2f353e63c941a3b05d6057af0345` |
| `python/umf_access/src/umf_access/catalog_errors.py` | `958142a29b20da74a5a034e65fd0f6fe0c899bdebc8921cb6f325929178fffb4` |
| `python/umf_access/src/umf_access/rust_read_plan_bind.py` | `b275786bbae127b52ba5edee95cf9916017ed144d0524c9f22c6fc94abde8a8d` |
| `python/umf_access/tests/test_read_plan_bind_predecessor.py` | `03523a4567bfe285ad1fa7161b57c51912e118dce4bbe5bf0d3e1616a8125b1c` |

Reproduction from the repository root:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo test -p umf-core --lib read_plan_bind --locked --offline

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo build -p umf-core-python --locked --offline

PYTHONPATH=/private/tmp/umf-read-plan-bind-installed-final2:python/src:python/umf_access/tests \
  UMF_TARGET_PIN_RUST_LIBRARY=/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib \
  python/.venv/bin/python -m unittest test_read_plan_bind_predecessor

python/.venv/bin/python scripts/check-access-python-boundaries.py
python/.venv/bin/ruff check --no-cache \
  python/umf_access/src/umf_access/catalog.py \
  python/umf_access/src/umf_access/catalog_errors.py \
  python/umf_access/src/umf_access/rust_read_plan_bind.py \
  python/umf_access/tests/test_read_plan_bind_predecessor.py \
  scripts/check-access-python-boundaries.py
```

## Source-pinned interpreter matrix follow-up

Because other repository files were changing, matrix qualification used an
immutable copied source snapshot at
`/private/tmp/umf-read-plan-bind-multiversion/source-snapshot`, not the live
checkout. The snapshot covers Cargo manifests/lockfile, Rust crates and
bindings, PyO3 sources, UMF runtime resources, the access package and tests,
and the two predecessor packets. Its 2,233-file digest manifest is pinned by
SHA-256 `11cd2fb935aa356c698df9090d0e7c40afeea6d838145037904b2bf1afd43ca1`;
the manifest was byte-identical before and after wheel and extension builds.
This is a source-pinned candidate snapshot, not a claim about a final committed
repository cut.

An `umf_access` wheel was built from that snapshot with Hatchling 1.27.0
(`uv build --python <build-python> --wheel --no-build-isolation`). Its SHA-256 is
`c1e15cea03f8edf21ac6e8bfdde868687904673eae6938d8a9d55de267595f09`, matching
the earlier 3.13.16 installed-wheel artifact. The snapshot PyO3 extension was
rebuilt offline with Rust 1.90.0 / PyO3 0.23.5; its SHA-256 is
`f8df42921cb68b4f46fa485dd41dab8fe028ce3ce611d32f32f5ce1c466bdd59`.
The package wheel was installed using `uv pip install --offline --no-deps
--target`, so this replay does not claim a complete dependency-resolved
installation. The CPython 3.13.16 cohort was rerun from this wheel and
extension, using the packet copies in the snapshot, and passed 8/8.

The same snapshot also built a Linux x86_64 PyO3 extension in the approved
`umf-r8-sdk-linux-x64` container, with the snapshot copied into the container
at runtime and the Cargo registry mounted read-only. Rust 1.90.0 / PyO3 0.23.5
completed offline; the extension SHA-256 is
`d14a1f260fd5746bcdab5ae84b012e1bdf86e569bfc4f8b4e62f6abc15f8a170`. This is
build evidence only because the Linux interpreter images lack a compatible
Pydantic dependency for the replay below.

The requested CPython 3.11.17 and 3.12.15 macOS arm64 wheels were installed
into isolated targets, but their 8-case suites could not start: the available
3.11 venv has Pydantic 2.11.9, which lacks `pydantic.MISSING` and
`pydantic.experimental.missing_sentinel`; the offline uv cache contains no
Pydantic 2.13+ wheel for the 3.12 venv. The two approved Linux x86_64 bootstrap
images (3.11.17 and 3.12.15) also contain Pydantic 2.11.9, so neither can run
the current package. These are dependency availability blockers, not parity
failures. CPython 3.11/3.12 Darwin and Linux qualification for this pinned
snapshot remains open. No image was built with a repository mount; Linux images
were inspected and run offline only.

During the first packaging attempt, `uv build --sdist --no-build-isolation`
failed because the generated action-runtime manifest differed from canonical
spec resources. The owning root task refreshed the canonical nine-resource
manifest and digest pin, after which the manifest check and a live-checkout
`umf_core` sdist build succeeded. The first attempt remains a recorded blocker;
the successful core sdist build is not part of the immutable snapshot packet,
and is not an installed `umf_core` dependency cohort.

The source hashes below pin the bind implementation and PyO3 profile used by
the rebuilt wheel/extension. The refreshed generated manifest files are also
recorded to identify the source cut that cleared the build blocker.

| Source input | SHA-256 |
| --- | --- |
| `python/umf_access/src/umf_access/catalog.py` | `6410a8ebc2fcd3fa80336a875094a7303c0b2f353e63c941a3b05d6057af0345` |
| `python/umf_access/src/umf_access/catalog_errors.py` | `958142a29b20da74a5a034e65fd0f6fe0c899bdebc8921cb6f325929178fffb4` |
| `python/umf_access/src/umf_access/rust_read_plan_bind.py` | `b275786bbae127b52ba5edee95cf9916017ed144d0524c9f22c6fc94abde8a8d` |
| `python/umf_access/tests/test_read_plan_bind_predecessor.py` | `03523a4567bfe285ad1fa7161b57c51912e118dce4bbe5bf0d3e1616a8125b1c` |
| `bindings/core/python/src/lib.rs` | `39f8c373e9ad7d3e50cc3e96a35d09cefaf3258b1faeea54cd4eb1d36d6208ee` |
| `python/src/umf/action_runtime_resource_manifest.json` | `dcdf83194aa16eb2a7de51e23bde5bcb2e7b945f2e9ef869565dd00efc22d8f7` |
| `python/src/umf/action_runtime.py` | `b16fddfb04cfe0a194a884e3e0e095cf8b7622dc3d9fa815b344420a6711f898` |

The eight replayed cases and observed ordered host traces are:

| Case | Outcome | Ordered trace |
| --- | --- | --- |
| `two-variants` | success, selects `second` | `artifact:first`, `artifact:second`, `target.identity`, `identity.platform`, `identity.platform`, `artifact:second`, `parameters.model_validate:second` |
| `no-match` | `NotCompiledForTarget` | `artifact:only`, `target.identity`, `identity.platform`, `identity.platform` |
| `identity-error` | original `RuntimeError` | `artifact:only`, `target.identity` |
| `artifact-error` | original `RuntimeError` | `artifact:first`, `artifact:second` |
| `inventory-error` | `CatalogError` | *(empty; refused before callbacks)* |
| `platform-error` | original `RuntimeError` | `artifact:only`, `target.identity`, `identity.platform` |
| `selected-artifact-error` | original `RuntimeError` | `artifact:only`, `target.identity`, `identity.platform`, `identity.platform`, `artifact:only` |
| `parameter-error` | original `RuntimeError` | `artifact:only`, `target.identity`, `identity.platform`, `identity.platform`, `artifact:only`, `parameters.model_validate:only` |
