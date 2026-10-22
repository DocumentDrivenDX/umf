# R1 binding and packaging evidence

This record qualifies the R1 Rust binding spike on one host. It does not claim a general UMF port, full TypeScript parity, or removal of the production V8/MiniRacer path. The machine-readable run record, including per-file SHA-256 values and artifact hashes, is in [`measurements.json`](measurements.json).

## Executed cohort

The final cohort was built from the source hashes recorded in `measurements.json` and passed `sh scripts/rust-spike/package-conformance.sh`. The harness built the release CLI, CPython wheel, Node N-API addon and npm tarball, and `wasm32-unknown-unknown` browser package. Each npm package is built from a fresh stage with an explicit file allowlist; the archive check requires exactly `index.js`, `index.d.ts`, `package.json`, and the native `.node` addon, and rejects nested tarballs. It installed the wheel into a fresh Python 3.11 virtual environment from a prepared wheelhouse with `pip --no-index --no-deps`; it packed and installed the addon into a clean npm consumer prefix with `npm install --offline`. Python was invoked by its absolute virtual-environment interpreter with no Node or Bun on its child `PATH`. CLI child processes used an empty `PATH` and the absolute executable.

The qualified host was Darwin arm64 with Rust/Cargo 1.90.0, CPython 3.11.17, maturin 1.9.6, Node 26.12.0 (N-API 10, module ABI 147), Bun 1.4.3 (N-API 10), wasm-bindgen 0.2.100, and Chromium 153.0.8010.12. The installed Python wheel targets CPython 3.11 macOS arm64. This is a host qualification, not a cross-platform claim.

## Behavior exercised

Current UMF TypeScript code computes each expected model validity projection and generated Key block at test time; there is no stored golden output playback. The operation matrix covers UTF-16 source round trips, schema-gated structural checks against the embedded core schema, and one dynamically generated required-scalar Key class. Structural results preserve the supplied model including unknown extension content, compare only the `valid` projection where applicable, and explicitly return `complete:false`. The generated class block, including `@dataclass(frozen=True)`, is compared byte-for-byte for the baseline and a changed-name/type model.

The vectors include exact integer-token spelling, negative zero, decimal spelling, astral characters, duplicate object keys, and raw unpaired UTF-16 units `[0xD800, 0x0041, 0xDC00]`. Every frontend proves raw source transport round-trip; the semantic operation refuses that unpaired source as `INVALID_SOURCE`. Each native callback frontend (Python, Node, Bun, and browser WASM) also receives and returns the exact same raw unpaired UTF-16 units; the separate validation callback uses valid model source so schema traversal is exercised. Callback reentry, callback exception behavior, capacity, expired deadlines, and cooperative mid-work cancellation are exercised. CLI explicitly refuses a request that requires a host callback. Cancellation is cooperative polling at bounded work steps, not hard interruption of an active parser or async task.

Generator controls cover a supported model variation, malformed/missing schema controls, invalid field names, reserved Record names, unknown selected Record extension refusal, and conservative refusals where Rust normalization would erase leading/trailing or repeated separators. The current TypeScript generator accepts some of those conservatively refused names; those cases are recorded as intentional bounded-subset differences, not parity. The current TypeScript generator accepts a selected Record carrying an unknown extension, while R1 refuses it rather than dropping its extension meaning from the emitted class block.

The actual installed Python wheel, installed Node addon under Node and Bun, native CLI, and WASM in real Chromium all passed the vector cohort. Chromium proved that missing `crypto.getRandomValues` is refused before invoking the WASM loader, observed zero requests outside the local fixture server, and produced the same validation result and generated output in three independent browser contexts.

## Measurements and limits

`measurements.json` includes artifact sizes and SHA-256 digests, source hashes (including both embedded schemas and `.cargo/config.toml`), exact tool versions, cold-start samples, sample throughput, process RSS, CLI resource output, and the transitive Cargo dependency tree. These are host-local measurements for `source-roundtrip`; they include process/runtime startup or JSON encoding/decoding as stated in the record and are not isolated FFI or engine benchmarks. Chromium memory was not measured.

The WASM validator path currently follows `jsonschema 0.29.1 → ahash 0.8.12 → getrandom 0.3.4 → wasm-bindgen` to seed randomized hash maps. The browser build enables the wasm JavaScript entropy backend and requires secure browser Crypto. The wrapper and Rust entrypoints explicitly report `CAPABILITY_REQUIRED`; a host-free WASM claim therefore remains open.

R1 covers three bounded operations only. Structural validation is not full UMF document or value semantic validation; generation emits one Key-class block, not a complete client package. Only Darwin arm64 with the versions above was executed. Other Python versions/platforms, Node ABIs, browsers, asynchronous hard cancellation, broad UMF parity, and production V8 removal remain unqualified.

## Replay

Use Rust/Cargo 1.90.0 with the `wasm32-unknown-unknown` target installed, CPython 3.11, maturin 1.9.6, wasm-bindgen CLI 0.2.100, and the repository's Bun/Node/npm/Playwright dependencies. The Rust crates, Python build inputs, Rust standard library target, wasm-bindgen CLI, and Chromium executable must be available locally or provisioned before running; the Python wheel and npm consumer install steps themselves run offline. Set the `UMF_R1_*` overrides to executable paths when those tools are not on `PATH`; set `UMF_CHROMIUM_PATH` only when using a specific cached browser executable. For the captured setup, the equivalent command is:

```sh
export RUSTUP_TOOLCHAIN=1.90.0
export UMF_R1_CARGO=/path/to/rust-1.90.0/bin/cargo
export UMF_R1_RUSTC=/path/to/rust-1.90.0/bin/rustc
export UMF_R1_PYTHON=/path/to/python3.11
export UMF_R1_MATURIN=/path/to/maturin-1.9.6
export UMF_R1_BUN=/path/to/bun
export UMF_R1_NODE=/path/to/node
export UMF_R1_NPM=/path/to/npm
export UMF_R1_WASM_BINDGEN="$PWD/target/rust-spike/tools/bin/wasm-bindgen"
export PATH="$(dirname "$UMF_R1_CARGO"):$PATH"
sh scripts/rust-spike/package-conformance.sh
```

The local `wasm-bindgen` executable must report `wasm-bindgen 0.2.100`. On a fresh checkout, install that CLI version into `target/rust-spike/tools` and add the Rust wasm target before replay; the full runner then rebuilds, repackages, runs the installed frontend checks, and refreshes `target/rust-spike/measurements.json`.
