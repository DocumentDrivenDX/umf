---
ddx:
  id: umf.evidence.rust-migration.r8-target-pin-host-dynamic-controls-20261028
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
    - id: umf.evidence.rust-migration.r8-target-pin-host-lazy
      kind: informed_by
---

# R8 host-lazy TargetPin dynamic-object controls

This evidence extends the direct `TargetPin.matches` comparison against the
opt-in `umf_access.rust_target_pin_host.matches` PyO3 path. It adds bounded
parity for dynamic behavior while leaving the default Python route unchanged.

The Python method accepts non-string identity fields when their equality says
they match, accepts tuple subclasses for platform data, and can consume
list-backed platform entries. The host-lazy binding now compares the field
tuples through Python's tuple equality protocol and runs platform length,
iteration, set/dict construction, membership, and truth conversion through
Python protocol calls from Rust-controlled flow. Tests assert parity for these
carriers and for custom `__eq__` call order and raised exceptions.

The exact-carrier live-object tests continue to compare attribute read order,
mismatch results, and exceptions from properties. Competing identity-field and
pin-field failures verify which property fault is first. Custom platform
iterables verify that a fault during pin-name iteration wins and that `all()`
short-circuits before requesting a later failing observed item. Exception
classes and messages are compared for these injected cases. Remaining
unqualified behavior includes arbitrary pathological Python protocols (such as
objects that mutate across repeated hashing/equality), full CPython ABI
coverage, and Python implementations other than CPython.

The candidate was rebuilt from the current source with Rust 1.90.0 and PyO3
0.23.5. CPython 3.13.16 ran 13 focused tests, including the expanded dynamic
controls and the `ReadPlan.bind` predecessor suite; all passed. Reproduce from
the repository root:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo build -p umf-core-python
PYTHONPATH=python/umf_access/src:python/src:python/umf_access/tests \
  UMF_TARGET_PIN_RUST_LIBRARY=/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib \
  python/.venv/bin/python -m unittest test_rust_target_pin test_read_plan_bind_predecessor
```

The closed-value candidate and default runtime route are unchanged. This is
source-built Darwin arm64 evidence for the listed calls only; it does not
qualify an installed wheel, other operating systems, other Python versions,
or a general Python host ABI.
