---
ddx:
  id: umf.evidence.rust-migration.r8-python-logical-render-v02-bridge
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-renderer-v02-interface-decision
      kind: implements
---

# R8 Python logical renderer v0.2 private bridge

This adds an opt-in installed PyO3 bridge for the existing
`umf-access-logical-render/0.2.0` Rust implementation. It does not change
`umf_access.dsl.render.render_logical`, `render_related_logical`, or the
catalog build default. The bridge selects the v0.2 profile explicitly and
returns a closed rendered/refused result. Missing or mismatched installed
capabilities fail closed; there is no Python semantic fallback.

The Python facade accepts a tagged captured-variant DTO and an explicit
`binding`/`ownerBound` pair, builds the exact v0.2 envelope, and applies the
existing private UTF-8 output budget. The live-object helper checks the exact
installed profile before encoding the object. Its Python DTO traversal and
output-byte checks currently use separate `_EncodingBudget` instances before
PyO3's single ordinary `Context` handles native conversion, Rust rendering,
and response conversion. These distinct accounting domains do not reproduce
the predecessor's resource first-fault order. Rust resource failures cross
PyO3 as errors. The adapter is an installed capability plumbing proof, not a
public default-route switch.

## Evidence

Commands run against the current dirty source:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-python-render-v2-target \
  cargo check --offline --locked -p umf-core-python
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-python-render-v2-target \
  cargo build --offline --locked -p umf-core-python
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  CARGO_TARGET_DIR=/private/tmp/umf-python-render-v2-target \
  cargo test -p umf-core access_logical_render --lib --offline --locked
PYTHONPATH=/private/tmp/umf-render-v2-pytest:python/umf_access/src:python/src \
  python/.venv/bin/python -m pytest -q -p no:cacheprovider \
  python/umf_access/tests/test_rust_catalog_logical_render_v2.py \
  python/umf_access/tests/test_rust_catalog_logical_render.py
```

Both Cargo commands succeeded, and the focused core renderer tests passed 8/8.
PyO3 emitted existing workspace warnings. The
temporary import package loaded the newly built extension without changing the
read-only source-tree extension. The focused Python run passed 22 tests and 15
subtests, including eight v0.2 facade tests, frozen positive render packet
parity, the existing v0.1 packet, and exact missing/mismatched capability and
response-shape checks.

## Scope limits

The frozen positive packet covers direct, equality-filter, and optional-filter
render requests only. Rust-local v0.2 unit cases are not predecessor
differential proof for all Python logical renderer behavior. The current
bridge's 50,000-node, depth-64, and 8 MiB DTO/output limits remain
unqualified against the Python predecessor's first-fault behavior. Related
rendering, full binding admission, mutation/update decisions, multi-join and
group/search profiles, exact error precedence over the complete predecessor
domain, Weft acceptance, target execution, and release-installed artifact
qualification remain open. These gaps prohibit default routing or a complete
Rust-ownership claim.
