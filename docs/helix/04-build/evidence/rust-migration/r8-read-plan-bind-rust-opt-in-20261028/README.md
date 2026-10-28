---
ddx:
  id: umf.evidence.rust-migration.r8-read-plan-bind-rust-opt-in-20261028
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
    - id: umf.evidence.rust-migration.r8-read-plan-bind-rust-seam-design-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.read-plan-bind-python-predecessor-20261028
      kind: informed_by
---

# R8 opt-in Rust `ReadPlan.bind` orchestration slice

This evidence records an opt-in `umf_access.rust_read_plan_bind.bind` path. Rust
now owns the ordered selection loop: preflight every candidate artifact, obtain
target identity once, evaluate presence-eligible pins in declaration order,
refuse zero or multiple matches, then call the selected-artifact and parameter
callbacks. The Python default `ReadPlan.bind` route remains unchanged.

Python still owns exact argument inventory and argument validation, continuation
validation and conversion, pin matching through the lazy `TargetPin.matches`
host bridge, native parameter extraction and strict Pydantic model construction.
Each host operation runs at its predecessor point. PyO3 propagates callback
`PyErr`s without translating them, including an asserted original identity
exception object. Candidate `presence` access and Python tuple equality also run
through a lazy callback after identity is observed; an adverse property control
proves the access and original exception occur at that point. The callback
object is deliberately left as a host interface; this slice does not claim fully
native `ReadPlan.bind` ownership.

The opt-in path replays all six frozen predecessor cases from
`read-plan-bind-python-predecessor-20261028/packet.json`. Outcome, error class
and message, and complete callback trace match for second-variant success,
no match, identity failure, initial artifact failure, invalid inventory and
platform failure. Added causal controls cover multiple matches, selected
artifact failure, strict parameter-model failure, invalid continuation before
callbacks, original identity-error object preservation and a throwing
`presence` property after identity. Rust unit controls also prove preflight
order, exhaustive candidate evaluation, no late callbacks on zero/multiple
matches, and stopping at throwing preflight and presence callbacks.

The focused CPython 3.13.16 run passed eight tests. `umf-core` passed its three
focused unit tests, and `umf-core-python` built successfully with Rust 1.90.0,
PyO3 0.23.5 and the locked offline dependency set. The candidate extension was
loaded from `/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib`.
Its SHA-256 at replay was
`1da614a6f7b35c7845a412d367b5e14ce1d99db3d24f724175dd930946b6290b`.
Relevant source SHA-256 values at that replay were:

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/read_plan_bind.rs` | `c70cdf81877d4ff37a550480a3bdfa483e87653ead7afd2ecb245c818d569bee` |
| `crates/umf-core/src/full_modules.rs` | `1bec1bb71a55eb54786f580cdcff28d2b02cf92a37ec0eed77d89e6ef1e1c224` |
| `bindings/core/python/src/lib.rs` | `39f8c373e9ad7d3e50cc3e96a35d09cefaf3258b1faeea54cd4eb1d36d6208ee` |
| `python/umf_access/src/umf_access/rust_read_plan_bind.py` | `e0a1fe0b21fe9e4caf3525593b37d8720130141de72096bd4b65a0a57f8cc18e` |
| `python/umf_access/tests/test_read_plan_bind_predecessor.py` | `7638c79e9c7b4893b7e235404754414814e3c22a3fdb3fe4139cd9947e71339b` |

These are local source-build results, not wheel or installed-package
qualification. Other Python versions, native targets, and package release
artifacts are unqualified.

The public route is not switched. Full package and installed-wheel
qualification are open. See the source design for additional promotion gates.

Commands run:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo test -p umf-core --lib read_plan_bind --locked --offline

PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-rust-binding-evidence-target \
  cargo build -p umf-core-python --locked --offline

PYTHONPATH=python/umf_access/src:python/src:python/umf_access/tests \
  UMF_TARGET_PIN_RUST_LIBRARY=/private/tmp/umf-rust-binding-evidence-target/debug/lib_rust_core.dylib \
  python/.venv/bin/python -m unittest test_read_plan_bind_predecessor

python/.venv/bin/ruff check --no-cache \
  python/umf_access/src/umf_access/rust_read_plan_bind.py \
  python/umf_access/tests/test_read_plan_bind_predecessor.py
```
