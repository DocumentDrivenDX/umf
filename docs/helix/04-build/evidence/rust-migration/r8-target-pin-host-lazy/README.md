---
ddx:
  id: umf.evidence.rust-migration.r8-target-pin-host-lazy
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.target-pin-python-predecessor-20261028
      kind: informed_by
---

# R8 opt-in host-lazy TargetPin matcher

This packet qualifies one private, opt-in PyO3 candidate for matching a
`TargetPin` against a live host identity. The existing closed-value Rust matcher
continues to require exact tuple/string carriers. The additional
`access_target_pin_matches_host` binding performs the predecessor's ordered
attribute reads itself, then admits exact strings and tuple-shaped platform
values before invoking the shared Rust comparison. The Python wrapper is
`umf_access.rust_target_pin_host.matches`; it requires the named profile and
returns a real Python `bool`.

The focused tests rebuild the binding from the current checkout and run under
CPython 3.13.16. The combined `test_rust_target_pin.py` and
`test_read_plan_bind_predecessor.py` suite passes 10/10: eight target-pin tests
and two bind tests. Coverage includes the 13 frozen predecessor cases, applying
the current duplicate-name policy to the one recorded predecessor edge, exact
tuple/string carrier refusals, and seven live-object cases covering equality,
mismatches, and exceptions raised during field or platform observation. The
six bind packet cases compare the Rust host route's outcome and trace to the
Python predecessor. These tests establish only their exact carrier and
attribute/error cases.

The source cohort was compiled with Rust 1.90.0 and PyO3 0.23.5. Reproduction
from the repository root, using a writable temporary Cargo target directory:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo build -p umf-core-python
PYTHONPATH=python/umf_access/src:python/src:python/umf_access/tests \
  UMF_TARGET_PIN_RUST_LIBRARY=/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib \
  python/.venv/bin/python -m unittest test_rust_target_pin test_read_plan_bind_predecessor
```

The recorded source hashes are:

| File | SHA-256 |
| --- | --- |
| `bindings/core/python/src/lib.rs` | `98719d0fac75eea810807436f82f3ce05c96a9d575c99530838ae5ade4da61ac` |
| `python/umf_access/src/umf_access/rust_target_pin_host.py` | `596777a50ec84ae8e23415e3f98b4c585748a3e5d219ebb440aec81f623005df` |
| `python/umf_access/tests/test_rust_target_pin.py` | `8bd31f0821f1a620fce64c3c0729b1dff47aab902a515f8b99bf31357d2590b6` |
| `python/umf_access/tests/test_read_plan_bind_predecessor.py` | `cf6ae7077d0d0750f9e64bea00c465ac8c6c51767dc3ad27674016a7b89da75a` |
| predecessor packet | `188e816ccad9ed609c1382ea8090471a5ed1266f412742e69b7800d32ed455ec` |

This is bounded behavior evidence for the named Python method and test objects.
It does not establish parity for arbitrary attribute-bearing objects, all
`ReadPlan.bind` or dispatch cases, a general Python host ABI, or other Python
versions and platforms. The helper is not selected by the default runtime
route; it does not retire the Python method or establish a release artifact.
