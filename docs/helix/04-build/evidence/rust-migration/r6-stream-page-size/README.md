# R6 stream page-size evidence

## Scope and ownership

This slice moves the closed owner-declared page-size domain and range decisions to `umf-core` Rust. Python keeps the original arbitrary `Mapping.get`, equality, truth, direct indexing, exception identity, and short-circuit interactions. The Python entry point calls the public `umf.rust_streams` capability and does not provide a Python-rule fallback. The implementation does not claim a resource ceiling for arbitrary Python mapping or slot carriers.

## Frozen predecessor

`predecessor.json` records 23 outputs and interaction traces from the checked-in predecessor `pages.py`, exercised through Python 3.11.17. It includes bool and integer subclasses, request and owner bounds, missing and malformed domains, exact dictionary/list requirements, slot cardinality and nullability, arbitrary mapping/get/equality behavior, exception identity, mutation, and short-circuit order. The predecessor source SHA256 at capture was `47fb8eddeb91a0987efeb4e7e7dd7119b765fe4c3636f27e3f61c4f3e9da2234`.

## Qualification

Fresh release wheels were built offline from the final source and installed into a new Python 3.11.17 environment with Pydantic 2.14.1:

- Core: `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl`, SHA256 `290c05813b260790e66db950fb7045e800b7cbb611790ddd90d3676201a80bf5`.
- Access: `umf_access-0.1.0.dev6-py3-none-any.whl`, SHA256 `d84d55473517b0ddfde01d2e1f5b4629dd101b300253a49449316a01804198e6`.
- Installed R6 tests: 12 passed, including an independent finite integer oracle, every compiled maximum from 1 through 1000, exact-carrier checks, invalid-carrier short-circuiting, callback mutation, hostile str-subclass dictionary keys with lookup-order mutation and exception identity, stateful comparison truth conversion, and mapping traces.
- Focused existing stream, catalog, Delta, PostgreSQL projection/resolution, and reviewed-read tests passed in the installed environment. PostgreSQL-dependent tests skipped because no explicit isolated PostgreSQL test cluster/DSN was configured; 2 Weft-backed catalog cases skipped because Weft was unavailable. `test_related_projection_stream` was excluded because this checkout lacks its generated `commerce` fixture module.
- `cargo test --offline --locked -p umf-core access_stream` passed both Rust unit tests using an isolated `CARGO_TARGET_DIR`. `rustfmt --check crates/umf-core/src/access_stream.rs` passed.

The focused installed test suite also passed separately in isolated mode. This evidence does not claim native PostgreSQL or Weft coverage, and does not close the broader resource-ceiling requirement.

## Source hashes

SHA256 values for the final source used to build the wheels:

| File | SHA256 |
| --- | --- |
| `crates/umf-core/src/access_stream.rs` | `f5a1a1172533022ee84e7753a56d5d6f69e0b2b0c74b7b62ac71aa781791ad4b` |
| `bindings/core/python/src/lib.rs` | `fe6457994fa8c5a0874a5c840827e118c1c3c5f1aa44b85d74730697283c2652` |
| `python/src/umf/rust_streams.py` | `a69f0eb386a7744d4b7a1cef347a9b19223ebaaa271b1f7781b314aa0634f7ef` |
| `python/umf_access/src/umf_access/pages.py` | `69605b4154d1b46086bdd3467351597431728630fb78deda88d1043437b282a6` |
| `python/umf_access/tests/test_rust_stream_page_size.py` | `fab57b1d4c34a549ef0a9e3422dc78c305d710d3987af382d4eb58d7b5a5a086` |
