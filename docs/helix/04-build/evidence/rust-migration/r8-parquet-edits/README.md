# R8 Parquet footer edits: candidate evidence

This candidate covers exactly two opt-in identities from CONTRACT-019: `appendParquetKeyValueMetadata` and `renameParquetField`. Rust owns the footer edit, bounded Compact Protocol re-encoding, source-byte prefix retention, and refreshed `parquet.fields` projection. The Node, WASM, and CLI surfaces expose `parquet.appendKeyValueMetadata` and `parquet.renameField`.

The implementation deliberately does not expose `repairParquetDictionaryOffsets` or `parquetRegistry`. Dictionary-offset repair remains unported until its physical/value dependency closure is implemented, including the TypeScript `decodeParquetValues` behavior. `parquetRegistry` remains open until a generic Rust `Registry` binding can return the public instance with equivalent methods and callback semantics.

## Inputs and reproducibility

- `tests/rust-core/parquet-edits-parity.ts` builds the TypeScript candidates from the checked-in transform and rename fixtures, adds refusal controls, and compares complete ordered result envelopes against the source-built CLI with an empty `PATH`.
- `tests/rust-core/fixtures/parquet-edits-ts-freeze.json` freezes all 102 TypeScript outcomes and SHA-256 hashes of each serialized input.
- TypeScript freeze command: `bun tests/rust-core/parquet-edits-parity.ts --freeze-ts`.
- CLI differential command: `UMF_PARQUET_EDITS_CLI=/private/tmp/umf-parquet-edits-check/debug/umf bun tests/rust-core/parquet-edits-parity.ts`.
- Core compile: `PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:$PATH CARGO_TARGET_DIR=/private/tmp/umf-parquet-edits-check cargo check -p umf-core --offline`.

The frozen fixture currently records 102 TypeScript cases. The CLI was built successfully; the differential invocation was stopped before completion due to runtime. Therefore this packet does not claim Rust parity, Node/WASM execution, real Chromium, Python, or production artifact qualification. The independent full behavior work and those host checks remain open.

## Scope limits

The operation behavior is qualified only for the exact source-level implementation and frozen inputs above. No support expansion or default-route change is claimed. Unknown extension preservation and attached `parquet.fields` retention are explicit implementation requirements; additional independent negative controls and output-byte/native-reader evidence remain outstanding.

## Source review corrections pending execution

The current review found that the Rust rename path treated three Compact wire
list values as raw JSON arrays. Row groups, columns and column paths are tagged
list objects with an `items` array. The pending repair accesses those lists
through one kind-checking helper, matching the existing schema-list behavior.
The existing rename fixtures already exercise successful row-group edits; no
new pass is claimed before their actual CLI replay completes.

Append now retains the admitted entries themselves in `added`, preserving a
caller entry whose members occur as `value` then `key`; native footer encoding
still follows the Thrift field order. The authored parity controls add that
case and an empty key/value case. The old 102-case freeze is historical and has
not been refreshed for these additions. Reference computations are now deferred
until after the `--only` filter, so a focused comparison does not execute every
unselected reference edit. These changes are unexecuted and independently
unreviewed under the exhausted shared qualification allowance.

Further source repairs retain diagnostic paths as UTF-16 and separate
JavaScript positive-integer admission from host-width indexing. Authored
controls cover unpaired-surrogate scalar/array paths and large indexes with
both valid and empty names. These controls have not been executed; browser
parity remains required. Full JavaScript object coercion is still not modeled
by the current fallback for nonnumeric index arguments. This candidate is not ready to map as
an accepted Rust owner or select on default routes.

The candidate also adds Python `append_key_value_metadata` and `rename_field`
wrappers over the same wire dispatcher. They own argument transport and controls,
with no duplicate edit algorithm. Pending native tests compare two complete
frozen TypeScript results, recursively check member order, retain the original
capture, and check the byte prefix of an append with a value-first entry. These
Python tests have been authored only; no execution or installed-wheel claim is
made.
