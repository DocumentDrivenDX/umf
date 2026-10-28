---
ddx:
  id: umf.evidence.rust-migration.r8-target-pin-default-python-20261028
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
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.target-pin-python-predecessor-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-target-pin-rust-candidate-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-target-pin-host-dynamic-controls-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.read-plan-bind-python-predecessor-20261028
      kind: informed_by
---

# R8 public Python TargetPin Rust route

This packet records the bounded source-built cutover of
`TargetPin.matches` in `python/umf_access/src/umf_access/catalog.py` to the
existing lazy host-call PyO3 bridge. It does not move `ReadPlan.bind` orchestration
to Rust. The bridge import occurs only when matching is requested; absent or
incompatible native profile state raises `TargetPinRustUnavailable` without
falling back to Python matching.

The duplicate-platform policy follows current CONTRACT-072: both pinned and
observed component names must be unique. The unchanged 13-case historical
predecessor packet includes `duplicate-observed-name-misses-other-pinned-name`,
which expected `true` under the old implementation. The current-route oracle
explicitly expects `false` for this case; the remaining 12 outcomes retain their
recorded values. Separate controls cover duplicate pinned names and duplicate
observed names.

The previous Python `_matches_platform` implementation was removed after a
repository search found no production callers. The tests retain a small
frozen-Python helper based on the captured predecessor algorithm. It preserves
the old live attribute-read sequence so candidate comparisons do not use the
new public route as their own oracle. For the equal dynamic-object case, tests
pin three reads of `pin.platform` and two reads of `identity.platform`; an extra
read fails the asserted trace. Other controls compare ordered identity/platform
reads, custom equality calls, thrown exception class/message, list and tuple
subclasses, custom iterables, short-circuiting, and malformed tuple behavior.

The public route and direct host-lazy route both match the frozen 13-case packet
under current policy, all dynamic protocol controls, and six frozen
`ReadPlan.bind` outcome/trace cases. The latter only confirms behavior while
`ReadPlan.bind` continues to orchestrate in Python. Missing and wrong native
profile controls both refuse through the public method. The focused CPython
run at initial capture passed 15 tests; after the opt-in Rust bind seam was
added, the combined current-source replay passed 20 tests, including its five
additional bind controls.

## Source-built cohort

The candidate was built offline from this worktree with Rust 1.90.0 on Darwin
arm64. The extension loaded for the focused tests was
`/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib`,
SHA-256 `1da614a6f7b35c7845a412d367b5e14ce1d99db3d24f724175dd930946b6290b`
for the combined current-source replay.
The runtime was CPython 3.13.16. This is a source-built extension result, not an
installed wheel result.

Relevant source hashes at evidence capture:

| File | SHA-256 |
| --- | --- |
| `python/umf_access/src/umf_access/catalog.py` | `cc3cf5b8484b20230d7ede51f74abfb52d2c5ab72c1fcb566b78eaebd557109e` |
| `python/umf_access/src/umf_access/rust_target_pin.py` | `7b6ae16e245fb0b401e64a812631f63868b3201a9e03afb7ce97342982808d63` |
| `python/umf_access/src/umf_access/rust_target_pin_host.py` | `02cf27e16bc262ca1b6bd5f67486a917a1b51a364b4c1ed4f7aa52c754768ada` |
| `bindings/core/python/src/lib.rs` | `39f8c373e9ad7d3e50cc3e96a35d09cefaf3258b1faeea54cd4eb1d36d6208ee` |
| `Cargo.lock` | `c55364fa3058e7a90bb2833dda6288621b863bed13a629c9bbf2f706401d602c` |
| `python/umf_access/tests/test_rust_target_pin.py` | `4b198dad0e7b3f10a0f7b18312038895f98001c70316b465ae2a5c52c28d1066` |
| `python/umf_access/tests/test_read_plan_bind_predecessor.py` | `7638c79e9c7b4893b7e235404754414814e3c22a3fdb3fe4139cd9947e71339b` |

## Reproduction and limits

Build and test commands:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo build -p umf-core-python --locked --offline

PYTHONPATH=python/umf_access/src:python/src:python/umf_access/tests \
  UMF_TARGET_PIN_RUST_LIBRARY=/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib \
  python/.venv/bin/python -m unittest test_rust_target_pin test_read_plan_bind_predecessor

python/.venv/bin/ruff format --check \
  python/umf_access/src/umf_access/catalog.py \
  python/umf_access/src/umf_access/rust_target_pin.py \
  python/umf_access/tests/test_rust_target_pin.py \
  python/umf_access/tests/test_read_plan_bind_predecessor.py

python/.venv/bin/ruff check \
  python/umf_access/src/umf_access/catalog.py \
  python/umf_access/src/umf_access/rust_target_pin_host.py \
  python/umf_access/tests/test_rust_target_pin.py \
  python/umf_access/tests/test_read_plan_bind_predecessor.py
```

The build succeeded; the combined focused unittest command passed 20/20. Ruff formatting
and lint passed, and `git diff --check` passed. The pinned `mypy`, `pyright`,
and `ty` executables were unavailable locally, so Python static type checking
remains unverified.

No installed wheel, CPython 3.11/3.12, Linux, Windows, alternate Python
implementation, or full package-host ABI is qualified here. Dynamic tests cover
the listed Python protocols, but not arbitrary objects that mutate during repeated
hashing/equality or every possible Python callback behavior. `ReadPlan.bind`
remains Python-owned; its broader callback and orchestration port is still open.
This packet retires only the source-level duplicate platform matcher reached by
the default `TargetPin.matches` route, and does not claim package release support.
