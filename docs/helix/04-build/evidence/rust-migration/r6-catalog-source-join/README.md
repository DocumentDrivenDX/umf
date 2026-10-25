---
ddx:
  id: umf.evidence.rust-migration.r6-catalog-source-join
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
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R6 stage-one source membership join: opt-in candidate

This candidate moves only the deterministic post-filesystem join inside
`_check_native_column_sources`: given native binding references and the parsed
`sources.json` value, require each `sourceId` to identify exactly one source
object and require that object's `text` to equal the binding's original
`documentJson`. The implementation indexes exact string IDs, preserves
duplicate match counts, ignores non-object source list entries as Python does,
and checks bindings in their original order. Empty binding lists succeed
without validating `sources`, matching the predecessor's early return.

Python retains path construction, manifest inventory membership, symlink/file
and size checks, source-file SHA-256 verification, and `json.loads`. This
candidate consumes only the parsed JSON-shaped values after those checks; it
does not read the filesystem, import declaration modules, call Weft, inspect
Python classes, or access target connections. The stage-two catalog and
`catalog.py` default route remain Python-owned.

## Frozen predecessor

[`predecessor.json`](../../../../../../python/umf_access/tests/fixtures/rust-catalog-source-join/predecessor.json)
contains eight captured outcomes from the live `_check_native_column_sources`
helper. Its SHA-256 is
`672d858ecd77e6cf6ee940ae6562652ff7af01853548aaeb47aa8e78618f1eaa`.
The helper source pin is `catalog.py` SHA-256
`cb2bd0b998cd151ef513acb040b2431b33976bc1d44902479e83b9f7f6154471`.
Cases cover exact and extra source members, tolerated non-dict entries, absent
and duplicate aliases, changed text, non-list source inventory, empty binding
short-circuit, and a first binding failure before a later valid source. Tests
replay the original filesystem-owning helper against each packet case before
comparing the Rust result.

## Rust/PyO3 boundary

The core operation is
`umf_core::access_catalog_custody::check_native_column_sources`. The explicit
Python facade is
`umf_access.rust_catalog_custody.check_sources(bindings, sources)`, gated by
`umf-access-catalog-source-join/0.1.0`. Input conversion and Rust admission use
`Context::ordinary()` limits (depth 128, 100,000 values, 4,000,000 text units).
Bindings must be an exact built-in list; values must be JSON-shaped built-ins,
and custom Python objects are rejected before comparison. Stable refusal codes
are `SOURCE_INVENTORY_SHAPE` and `SOURCE_MEMBERSHIP`, carrying the predecessor
messages for those conditions. Invalid binding carrier shapes fail closed.

The source-ID index is O(n log n) to construct and each binding lookup is
O(log n), avoiding the predecessor's repeated linear scan. Duplicate ID entries
remain ambiguous and refuse rather than being collapsed by the index.

## Verification

Captured on Darwin arm64 with Rust `1.90.0`, PyO3 `0.23.5`, maturin `1.9.6`,
CPython `3.11.17` (abi3 CPython 3.11), and Pydantic `2.14.1`. The offline abi3
wheel `umf_core_python-0.1.0-cp311-abi3-macosx_11_0_arm64.whl` has SHA-256
`8ea9937992cb5dfb9eed8ddfbc586a97d35ba2c336d2ad37a22fc82359bbcf59`; the
installed extension SHA-256 is
`d6723d9ec6bc99881c605433d5d485ecc616b8300bd8332de8a8ec7b5019b0aa`.

- `cargo check -p umf-core-python --offline`: passed.
- `cargo test -p umf-core --lib access_catalog_custody::tests --offline -- --nocapture`: 4 Rust tests passed, including source-object filtering and duplicate-ID refusal.
- `maturin build --manifest-path bindings/core/python/Cargo.toml --target-dir /private/tmp/umf-catalog-custody-target --out /private/tmp/umf-catalog-custody-wheels --interpreter /Users/erik/.local/share/uv/python/cpython-3.11.17-macos-aarch64-none/bin/python3.11 --offline`: passed.
- `test_rust_catalog_source_join.py`, `test_rust_catalog_custody.py`, and `test_native_column_custody.py`: 15 Python tests passed against the freshly built extension. The source-join tests replay all eight cases through the unchanged filesystem-owning predecessor before comparing Rust output.

This evidence qualifies only this pure source membership check; it does not
establish filesystem custody, the complete source-pinned catalog, Weft parity,
generated package behavior, or default route retirement. CONTRACT-071
source-pinned catalog controls and CONTRACT-072 target/runtime ownership remain
governing release gates.
