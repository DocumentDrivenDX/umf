# R8 Parquet capture and metadata operations

This evidence packet records an opt-in Rust implementation of ten Parquet operations under `umf-r8-parquet-capture-inspection/0.1.0`: source capture/export, framing and footer inspection, metadata/schema inspection, logical/container inspection, field metadata, and schema import. The bounded tagged-wire profile represents source bytes as lowercase hexadecimal. It does not qualify raw host admission or change TypeScript package-root routing.

The implementation preserves the distinctions in CONTRACT-019 between source bytes, native Parquet structure, logical annotations, and UMF field metadata. Original UMF source/wire subtrees bypass UTF-8 JSON conversion, retaining isolated UTF-16 keys, values, and document IDs byte-for-byte through metadata inspection. Unknown logical annotations remain retained or explicitly uninterpreted, while invalid known annotations and contradictory `parquet.fields` metadata retain their TypeScript refusal behavior. `ARROW:schema` extraction, Arrow schema projection, and the other Parquet exports are outside this profile.

Evidence is source-local and bounded:

- `tests/rust-core/fixtures/parquet-metadata-ts-freeze.json` contains 48 frozen TypeScript whole-envelope cases for the four metadata operations. `cargo test -p umf-core --offline metadata_inspection_matches_frozen_typescript_public_envelopes --lib` compares complete ordered results.
- `cargo test -p umf-cli --offline --test parquet_capture_cli` exercises the actual CLI binary with a Parquet fixture.
- `node bindings/core/node/tests/parquet-capture-current-source.mjs` replays three frozen fixtures through a locally built Node addon; each fixture covers the ten operation entry points.
- `UMF_PARQUET_CAPTURE_WASM_PACKAGE=<built-wasm-bindgen-output> node bindings/core/wasm/tests/parquet-capture-current-source.mjs` replays the same three fixtures through a locally built WASM module.
- `python/tests/test_rust_parquet_capture.py` exercises the opt-in Python binding surface. This packet does not claim installed-wheel qualification.

These checks establish only the listed operation subset and vectors. They do not establish complete Parquet conformance, default-route replacement, installation parity, or retirement of TypeScript exports.
