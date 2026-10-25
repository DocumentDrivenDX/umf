---
ddx:
  id: umf.evidence.rust-migration.r8-captured-declaration-rust-bridge
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
    - id: umf.evidence.rust-migration.r8-captured-logical-render-rust
      kind: extends
    - id: umf.evidence.rust-migration.r8-captured-logical-render-positive
      kind: references
---

# R8 opt-in live capture to Rust logical-render bridge

This evidence records an opt-in bridge from an explicitly supplied Python
declaration through the existing `umf_access.capture()` operation to the Rust
pre-Weft logical renderer. Python remains the authority for importing and
capturing declarations. The bridge uses the existing tagged DTO conventions and
the `umf-access-logical-render/0.1.0` Rust profile. It does not change
`compile_catalog()` or select Rust by default.

## Semantic and resource boundary

Capture-stage `CaptureError` outcomes are returned with `stage: capture` and
their original code/message; no render call follows. Each captured variant is
encoded while retaining the frozen tags for dataclasses, tuples, lists,
frozensets, enum values, type references, typing forms, bytes, decimals, and the
`MISSING` sentinel. Values without a representation in that frozen DTO grammar
(including mapping/dict values) return `CAPTURE_DTO_UNENCODABLE` at
`stage: encoding`. The original value is not stringified or dropped, and that
variant does not reach Rust. Rust render refusals remain the distinct
`stage: render` response returned by the Rust profile.

The bridge limits one declaration to 50,000 encoded values, nesting depth 64,
8 MiB of source strings, and 8 MiB of cumulative compact JSON DTO bytes. The
JSON byte accounting is applied to each complete encoded variant; it is
cumulative across variants. String character counts are checked against the
remaining byte allowance before UTF-8 encoding; JSON bytes are counted from
`JSONEncoder.iterencode()` chunks and each chunk is rejected against the
remaining allowance before encoding. Python capture's own 16-variant limit
still applies. The Rust operation independently charges admitted input and
rendered text to the core `Context`.

## Scoped observations

The live bridge replays the frozen explicitly-authored `direct`, `filtered`,
and `optional` declarations. Their full captured DTOs match the
`logical-render-positive-v1.json` predecessor values, and the resulting logical
request strings match the frozen Python `render_logical()` observations for
the same cohort. `unsupported_result` remains a Python capture-stage refusal.
An unencodable mapping and broader capture shapes are not claimed as rendered.

This evidence covers capture plus the existing narrow renderer profile only.
Python model/source correspondence, build-time bindings, joins, projections,
commands/actions, related keys, Weft compilation, backend SQL, publication,
installed release qualification, and default-route ownership remain open.

## Reproduction

Build a fresh ABI3 extension into a temporary target and wheel, then extract it
into a temporary overlay of the source `umf` package. The overlay keeps the
checkout's Python bridge files while loading the newly built native extension.

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
CARGO_TARGET_DIR=/private/tmp/umf-r8-capture-target \
/Users/erik/.local/bin/maturin build \
  --manifest-path bindings/core/python/Cargo.toml \
  --target-dir /private/tmp/umf-r8-capture-target \
  --out /private/tmp/umf-r8-capture-wheel \
  --interpreter python/.venv/bin/python
mkdir -p /private/tmp/umf-r8-capture-overlay
cp -R python/src/umf /private/tmp/umf-r8-capture-overlay/
unzip -p /private/tmp/umf-r8-capture-wheel/umf_core_python-0.1.0-cp311-abi3-macosx_11_0_arm64.whl _rust_core/_rust_core.abi3.so > /private/tmp/umf-r8-capture-overlay/umf/_rust_core.abi3.so
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin CARGO_TARGET_DIR=/private/tmp/umf-r8-capture-target cargo test -p umf-core access_logical_render --lib --offline
PYTHONPATH=python/umf_access/src:/private/tmp/umf-r8-capture-overlay python/.venv/bin/python -m pytest -p no:cacheprovider -q python/umf_access/tests/test_rust_catalog_logical_render.py
bun run check:access-boundaries
python/.venv/bin/ruff check --no-cache python/umf_access/src/umf_access/rust_catalog_render.py python/umf_access/tests/test_rust_catalog_logical_render.py
```

The fresh ABI3 extension build passed and produced the local wheel with SHA-256
`db80f9028a95363de911cd641aee9676542deead833b99a420cce910ab36ba9a`; its
extracted extension SHA-256 is
`a6edb5f76d1249c117d3619528e853ed35a8a2aa863bae8eb23105e6885c9d14`. The
focused Rust module passed four tests. The final Python renderer suite passed
against that fresh extension with fourteen tests and eleven packet subcases,
including capture, encoding, and render-stage separation. Both positive and
negative source-packet checks passed. Ruff passed, and the access-boundary
check reported 95 modules and zero violations. These are local Darwin arm64
observations and do not qualify a released wheel or a broader Python cohort.

## Source pins

| Source | SHA-256 |
| --- | --- |
| `python/umf_access/src/umf_access/rust_catalog_render.py` | `cf50ad708a6982eac7d8a0da144118bb7a903cce46d4231455a175c03de58fbe` |
| `python/umf_access/tests/test_rust_catalog_logical_render.py` | `2f10b0e78c27778731e8110e68d38c8bc7d28091b7445ed4bdd29f242599f443` |
| `python/umf_access/tests/captured_logical_render_predecessor.py` | `3f74f69986babab111a6a00ea5cc79060eb46662ef4aa7833cb227cef1aa8895` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-positive-v1.json` | `08ea0f4a70292be9b363c3d0c554708d212af3442673bf41be96c086bcc811e4` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/logical-render-v1.json` | `af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e` |
| `python/umf_access/tests/fixtures/rust-catalog-capture/declarations-v1.json` | `d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e` |
| `python/umf_access/src/umf_access/capture.py` | `492f68954ca66f3fbd15eb008f7e1d6fa690829d9c31e3ec3d85ecb09a7e67a6` |
| `python/umf_access/src/umf_access/dsl/render.py` | `8e57926de9cb62d499e549e5edf575d93220c5e0f460fb376a475e774d9c845b` |
| `crates/umf-core/src/access_logical_render.rs` | `261fbd0dd3e8452657ff6938254391b627430644d5badbaefae348a21f96f68e` |
