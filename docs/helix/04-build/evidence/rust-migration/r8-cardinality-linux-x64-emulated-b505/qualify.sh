#!/bin/sh
set -eu
mkdir -p /tmp/umf-source /out
# Copy one coherent read-only source snapshot into container-local storage.
tar -C /src --exclude=.git --exclude=node_modules --exclude=dist --exclude=.cache --exclude=target --exclude=__pycache__ --exclude=.venv -cf - . | tar -C /tmp/umf-source -xf -
cd /tmp/umf-source
export CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 UMF_RUST_DEFAULT_BUILD_ONLY=1
bun install --frozen-lockfile
cargo fetch --locked
bun scripts/package-sdk-rust-default.ts
cargo build --release --locked --manifest-path bindings/core/wasm/Cargo.toml --target wasm32-unknown-unknown
mkdir -p bindings/core/wasm/pkg
wasm-bindgen --target web --out-dir bindings/core/wasm/pkg --out-name umf_core_wasm target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun run typecheck
node -e 'const m=require("./dist/rust-default-manifest.json"); if(m.sourceClosure.transform.status!=="fixed-point"||m.sourceClosure.transform.generatedInputs.length!==0) throw new Error("SDK source snapshot is not a fixed point"); if(m.releaseStatus!=="private-r7-default-route-qualification-not-publishable") throw new Error("SDK artifact is not private/nonpublishable")'
bun scripts/package-sdk.ts
python3 scripts/test-sdk-package.py
bunx playwright install --with-deps chromium
closure=$(node -p 'require("./dist/rust-default-manifest.json").sourceClosure.sha256')
bun scripts/rust-migration/r8/core-cardinality-installed.mjs .cache/sdk-distribution/umf-sdk.tgz "$closure" /out/core-cardinality-installed-receipt.json
cp .cache/sdk-distribution/umf-sdk.tgz /out/umf-sdk-linux-x64.tgz
cp .cache/sdk-distribution/manifest.json /out/sdk-manifest.json
uname -a > /out/platform.txt
node --version >> /out/platform.txt
bun --version >> /out/platform.txt
rustc --version >> /out/platform.txt
cargo --version >> /out/platform.txt
wasm-bindgen --version >> /out/platform.txt
sha256sum /out/umf-sdk-linux-x64.tgz /out/sdk-manifest.json /out/core-cardinality-installed-receipt.json > /out/SHA256SUMS
