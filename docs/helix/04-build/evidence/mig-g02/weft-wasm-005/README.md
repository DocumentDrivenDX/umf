# Weft G02 browser WASM parity evidence

`source-manifest.json` records the Weft source inputs, exact build commands, tool versions, and hashes. `g02-browser-cases.json.gz` contains the exact generated requests and native compiler expected-result snapshots; the 7.9 MB uncompressed JSON is stored compressed for review. The reproducible corpus generator and the real Chromium runner are included alongside the summary report.

The 14 parity cases cover field and literal leaves, concat, coalesce, addition, subtraction, multiplication, conditional `eq` and `in`, tiny decimal `1e-1000`, fractional-to-integer and self-reference refusals, and the decoded string literal byte boundary at 1 MiB / 1 MiB + 1. All 14 matched between native Weft PostgreSQL compilation and actual wasm-bindgen WASM in Chromium 153.0.8010.12.

The report's `wasmSha256` is for `/private/tmp/umf-g02-weft-wasm-target/web/weft_wasm_bg.wasm`, the wasm-bindgen browser-ready module (`b2493de749910e4618c0c17f65c0a8149a70e3ea6c29cd788cd544ec00c22c67`). The raw Rust compiler output at `/private/tmp/umf-g02-weft-wasm-target/wasm32-unknown-unknown/debug/weft_wasm.wasm` has SHA-256 `52e49f5c90b96dc22b6ed6c7f383f788888a03ee488436a2f228db10ea780620`. The transformed JavaScript glue is `weft_wasm.js` with SHA-256 `c3c3b25d6a7f996bdc82e2dfb6defc3f9250e1977f24c9454bdd209164a63be2`.

This proves compiler-result parity for this bounded corpus. It does not qualify database execution, PostgreSQL transaction behavior, locking, or native execution authority.
