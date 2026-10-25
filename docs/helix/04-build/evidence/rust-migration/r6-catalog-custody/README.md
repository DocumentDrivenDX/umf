---
ddx:
  id: umf.evidence.rust-migration.r6-catalog-custody
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

# R6 catalog source-custody projection: opt-in candidate

This packet covers only the pure projection performed by
`umf_access.build.catalog._native_column_bindings` and its helper
`_native_binding_source`. It extracts ordered `{sourceId, documentJson,
documentSha256}` source references from unity-search and native ColumnSet
bindings, including source-then-destination traversal for a related-read
packet. It verifies the binding text's UTF-8 SHA-256 and exact three-member
shape. It does not interpret native schema meaning.

The stage-two `compile_catalog` function remains Python-owned. It resolves
explicit source files, imports selected generated Python declarations, reflects
on callables and annotations, captures DSL expressions and invokes the Weft
compiler. `publish_catalog` retains manifest and filesystem drift checks,
exclusive ownership, staging, swap and recovery. The new capability is
opt-in; `catalog.py` does not call it and the default route remains Python.

## Frozen predecessor packet

[`predecessor.json`](../../../../../../python/umf_access/tests/fixtures/rust-catalog-custody/predecessor.json)
contains 14 direct input/output/refusal cases captured from the Python helper.
Its SHA-256 is `fee787c899e42ae4d9ddb632e8ef5b79e5ee833fdc710e662e75ebb58d6bccc7`.
The source pin is
`python/umf_access/src/umf_access/build/catalog.py` SHA-256
`cb2bd0b998cd151ef513acb040b2431b33976bc1d44902479e83b9f7f6154471`.
Seven cases return exact ordered source references and seven refuse. The packet
covers unity-search references, ordered multiple ColumnSets, related-read
source/destination order, Python `True == 1` and `1 == 1.0` binding equality,
related nested/mismatched bindings, zero and 65 ColumnSets, missing/extra
binding members, digest mismatch, a lone surrogate in source text, and empty
non-native input. The Python test verifies that the pinned current helper still
produces every frozen outcome before comparing the Rust result.

## Rust/PyO3 boundary

`umf_core::access_catalog_custody::native_column_bindings` consumes the existing
source-preserving `PythonConsumerValue`; it does not import Python model classes,
read the filesystem, invoke Weft, or access a target connection. The opt-in
PyO3 calls are `_rust_core.access_catalog_custody_profile_version()` and
`_rust_core.access_native_column_bindings(target)`. The Python facade is
`umf_access.rust_catalog_custody.evaluate`. Successful results return the
ordered binding references. Structural refusals return stable codes
`RELATED_READ_CUSTODY`, `COLUMN_SET_BOUND`, `ORIGINAL_BINDING_SHAPE`,
`ORIGINAL_BINDING_UTF8`, `ORIGINAL_BINDING_DIGEST`, or
`NONFINITE_EQUALITY_UNSUPPORTED`, with the existing predecessor message where
one exists. The opt-in PyO3 entrypoint requires an exact built-in `dict` at
top level; the Python predecessor calls `.get` and raises on other top-level
types, while this wrapper fails closed with `ValueError` before conversion.
Within that dict, PyO3 conversion accepts JSON-shaped built-in values only and
rejects non-JSON objects and non-string dict keys before Rust comparison, so
caller-defined equality code is not executed. Conversion uses
`Context::ordinary()` limits: depth 128, at most 100,000 values and 4,000,000
text units per invocation. These are resource bounds, not an extension of the
predecessor's supported domain. Nested object equality sorts indexed key/value
references and compares them in O(n log n), avoiding quadratic scans for wide
bindings; duplicate keys in the internal carrier fail closed (they cannot
occur in a Python `dict`). A focused 20,000-field reversed-order test covers
the wide-object path; admission bounds still cap total conversion work/size.

Python equality for nested JSON values is retained for related-read binding
comparison, including bool/integer and exact integer/float equality. Nonfinite
float values are rejected in this opt-in profile; they cannot enter through the
current catalog configuration copier, which serializes with `allow_nan=False`.
This is an explicit direct-wrapper restriction, not a claim about arbitrary
Python object equality. Source ids and original text remain source-preserving
code-point values until the UTF-8 digest check.

## Verification

Captured on Darwin arm64 with Rust `1.90.0`, PyO3 `0.23.5`, maturin `1.9.6`,
CPython `3.11.17` (abi3 CPython 3.11), and Pydantic `2.14.1`. The separately
built opt-in extension wheel is
`umf_core_python-0.1.0-cp311-abi3-macosx_11_0_arm64.whl`, SHA-256
`581703023392dd4dbe9eef55ba2438d0774a9162ff0025c688465d3fd0837d05`; the
installed extension SHA-256 is
`24c0917e725dd5701224ba118a9319bf5e910a2d664a3ed91a10e6f0eee008ca`.

- `cargo test -p umf-core --lib access_catalog_custody::tests --offline -- --nocapture`: 3 Rust tests passed, including the 20,000-field wide-object check.
- `cargo check -p umf-core-python --offline`: passed.
- `test_rust_catalog_custody.py` plus the existing `test_native_column_custody.py`: 12 Python tests passed against the freshly built abi3 extension.
- The Python tests verify the unchanged default routing, all 14 frozen outcomes, no input mutation, stable refusal codes, nonfinite refusal, rejection of custom Python equality without invoking it, and fail-closed rejection of non-dict top-level targets.

The focused reproducibility sequence used the repository's pinned Rust toolchain
and an isolated wheel/target directory:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH \
  maturin build --manifest-path bindings/core/python/Cargo.toml \
    --target-dir /private/tmp/umf-catalog-custody-target \
    --out /private/tmp/umf-catalog-custody-wheels \
    --interpreter /Users/erik/.local/share/uv/python/cpython-3.11.17-macos-aarch64-none/bin/python3.11 \
    --offline
PYTHONPATH=python/umf_access/src:/private/tmp/umf-rust-py311-qual/lib/python3.11/site-packages \
  /private/tmp/umf-rust-py311-qual/bin/python \
    -m unittest python/umf_access/tests/test_rust_catalog_custody.py \
      python/umf_access/tests/test_native_column_custody.py -v
```

The temporary CPython environment receives the just-built extension before the
second command; the test loads `umf_access` from this checkout and the installed
`umf` runtime from that environment. Cargo's focused test and check commands are
shown above; both ran offline.

## Limits and next gate

This proves only the selected JSON-value custody projection against the pinned
Python helper on this host/profile. It does not prove stage-two catalog byte
parity, Weft equivalence, filesystem custody, target/native-schema correctness,
installed Python multi-version qualification, Python-to-Rust closure, default
route retirement, or R6/R8 completion. Before any default routing change, add
installed-wheel checks for all supported CPython cohorts and replay the complete
catalog build corpus, including Weft output/refusal order, native-column source
membership, writer drift/atomicity, and genuine native consumer reads. CONTRACT-
071's complete source-pinned catalog and CONTRACT-072's target verification and
host ownership remain governing.
