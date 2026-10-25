---
ddx:
  id: umf.evidence.rust-migration.r8-captured-logical-render-rust
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
    - id: umf.evidence.rust-migration.r8-captured-logical-render-positive
      kind: extends
    - id: umf.evidence.rust-migration.r8-captured-logical-render
      kind: references
---

# R8 opt-in Rust logical-render slice

This evidence records an opt-in Rust implementation of a small pre-Weft
`render_logical()` cohort. The normal `umf_access.build.catalog` route remains
Python-owned. The operation accepts only the versioned tagged DTO profile
`umf-access-logical-render/0.1.0`; it does not capture Python declarations,
resolve package files, compile through Weft, lower to SQL, select a backend, or
execute a request.

## Boundary and acceptance

[CONTRACT-067](../../../../02-design/contracts/CONTRACT-067-access-sdk-generator.md)
keeps filesystem and package custody in the build host. [CONTRACT-070](../../../../02-design/contracts/CONTRACT-070-access-extension.md)
provides authored source and column facts. [CONTRACT-071](../../../../02-design/contracts/CONTRACT-071-query-command-catalog.md)
separates UMF's logical request from Weft dialect/backend lowering and result
decoding. [CONTRACT-072](../../../../02-design/contracts/CONTRACT-072-runtime-targets.md)
keeps runtime target and connection ownership outside this build-time slice.
The source observations are the [positive authored-name cohort](../r8-captured-logical-render-positive/README.md)
and the [negative missing-identity cohort](../r8-captured-logical-render/README.md).

The core function consumes a tagged `CapturedVariant` plus its explicit profile
envelope. It rejects unknown or missing members at every consumed object,
non-admitted carrier/key/source/temporal/alias shapes, unsupported query steps,
join steps requiring build-time bindings, and malformed parameter/presence
relationships. Input tree admission and output text are charged to the ordinary
core `Context`; the PyO3 boundary requires an exact `dict`. The public
`umf.rust_access_catalog` bridge owns the private extension import, and
`umf_access.rust_catalog_render` validates the complete response shape. No
default Python routing changes.

The positive packet's four renderable variants reproduce their exact frozen
logical request strings: direct, required equality filter, optional omission,
and optional equality filter. The four negative packet variants reproduce the
exact `CAPTURE_UNSUPPORTED: Record requires authored namespace and logical
name` refusal. The Record identity check runs before query-step semantic
interpretation, including when the authored Record name is empty. An empty
rendered Field logical name returns `Field has no authored logical name`.
Unknown variant members return `CAPTURE_DTO_INVALID`; an unbound `join` returns
`CAPTURE_UNSUPPORTED` with `join rendering requires declared build-time
bindings`.

The selected Key is structurally checked for its single Field shape and owner,
but is not rendered: the frozen `all` query grammar selects `r.*`, and the
Python predecessor does not render Key identity in this query. Key-ordering,
mutation, projection, grouping, related reads, multi-filter logic, arbitrary
parameter carriers, joins, Weft compilation, SQL output, backend acceptance,
and installed wheel release qualification remain outside this profile.

## Reproduction

With the repository's Rust toolchain and pinned Python environment:

```sh
cargo test -p umf-core access_logical_render --lib --offline
cargo check -p umf-core-python --offline
PYTHONPATH=python/umf_access/src:python/src python/.venv/bin/python -m pytest -p no:cacheprovider -q python/umf_access/tests/test_rust_catalog_logical_render.py
bun run check:access-boundaries
```

The focused core tests passed 4/4. The PyO3 crate compiled with `cargo check`.
The Python packet/facade tests passed 7 tests and 8 packet subcases against the
freshly compiled extension. The extension build used the pinned offline Cargo
dependencies; the generated extension was loaded for that test and the
pre-existing ignored source-tree binary was restored afterward. The access
boundary check passed with 95 modules and zero violations. Existing unrelated
workspace compiler warnings remain.

## Source and fixture pins

| File | SHA-256 |
| --- | --- |
| `crates/umf-core/src/access_logical_render.rs` | `261fbd0dd3e8452657ff6938254391b627430644d5badbaefae348a21f96f68e` |
| `crates/umf-core/src/lib.rs` | `39923628822b717e9481921d9a06f7e423824dbeb885f2be484ed3a9d8d4ba52` |
| `bindings/core/python/src/lib.rs` | `d59826d918e774b8346ea271b3ecf0ba2e38cddf1e0535755254e806e1f8713f` |
| `python/src/umf/rust_access_catalog.py` | `dd64ed441ea96b64573c275265feb409f7ea237df4cd28a5a80ddc2904a8b524` |
| `python/umf_access/src/umf_access/rust_catalog_render.py` | `ccd4838e0adc60df061fb0eae196f5020e9bec22d6b4548d04b161b2cc9a739c` |
| `python/umf_access/tests/test_rust_catalog_logical_render.py` | `4925554270947cdb32a582c34be618c48b9fd562d0f3366a1e1e9d068a8e1632` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-positive-v1.json` | `08ea0f4a70292be9b363c3d0c554708d212af3442673bf41be96c086bcc811e4` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-v1.json` | `af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/declarations-v1.json` | `d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e` |
| `python/umf_access/src/umf_access/dsl/render.py` | `8e57926de9cb62d499e549e5edf575d93220c5e0f460fb376a475e774d9c845b` |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
