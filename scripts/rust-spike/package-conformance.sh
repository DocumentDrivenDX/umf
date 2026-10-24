#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
OUT="$ROOT/target/rust-spike"
CARGO=${UMF_R1_CARGO:-$(command -v cargo 2>/dev/null || true)}
PY311=${UMF_R1_PYTHON:-$(command -v python3.11 2>/dev/null || true)}
MATURIN=${UMF_R1_MATURIN:-$(command -v maturin 2>/dev/null || true)}
BUN=${UMF_R1_BUN:-$(command -v bun 2>/dev/null || true)}
NODE=${UMF_R1_NODE:-$(command -v node 2>/dev/null || true)}
NPM=${UMF_R1_NPM:-$(command -v npm 2>/dev/null || true)}
WASM_BINDGEN=${UMF_R1_WASM_BINDGEN:-$(command -v wasm-bindgen 2>/dev/null || true)}

if [ -z "$CARGO" ] && [ -x /opt/homebrew/opt/rustup/bin/cargo ]; then CARGO=/opt/homebrew/opt/rustup/bin/cargo; fi
if [ -z "$PY311" ]; then echo 'Python 3.11 is required; set UMF_R1_PYTHON.' >&2; exit 2; fi
if [ -z "$MATURIN" ]; then echo 'maturin is required; set UMF_R1_MATURIN.' >&2; exit 2; fi
if [ -z "$CARGO" ]; then echo 'Rust cargo is required; set UMF_R1_CARGO.' >&2; exit 2; fi
if [ -z "$BUN" ]; then echo 'Bun is required to derive current TypeScript outcomes; set UMF_R1_BUN.' >&2; exit 2; fi
if [ -z "$NODE" ]; then echo 'Node is required for the installed native addon check; set UMF_R1_NODE.' >&2; exit 2; fi
if [ -z "$NPM" ]; then echo 'npm is required to pack and install the native addon; set UMF_R1_NPM.' >&2; exit 2; fi
if [ -z "$WASM_BINDGEN" ]; then echo 'wasm-bindgen CLI 0.2.100 is required; set UMF_R1_WASM_BINDGEN.' >&2; exit 2; fi

export PATH="$(dirname -- "$CARGO"):$PATH"
export RUSTUP_TOOLCHAIN=1.90.0
mkdir -p "$OUT/python/wheelhouse" "$OUT/node/stage" "$OUT/wasm/pkg"

case "$(uname -s)" in
  Darwin) NATIVE_LIB="$ROOT/target/release/libumf_rust_spike_node.dylib" ;;
  Linux) NATIVE_LIB="$ROOT/target/release/libumf_rust_spike_node.so" ;;
  *) echo "R1 packaging evidence currently qualifies macOS arm64 only; found $(uname -s)." >&2; exit 2 ;;
esac

"$CARGO" build --locked --release -p umf-rust-spike
"$CARGO" build --locked --release -p umf-rust-spike-node
rm -rf "$OUT/python/venv" "$OUT/node/consumer"
"$PY311" -m venv "$OUT/python/venv"
"$MATURIN" build --locked --release \
  --manifest-path "$ROOT/bindings/rust-spike/python/Cargo.toml" \
  --interpreter "$PY311" --out "$OUT/python/wheelhouse"
"$OUT/python/venv/bin/python" -m pip install --no-index --no-deps \
  --find-links "$OUT/python/wheelhouse" umf-rust-spike==0.1.0

"$BUN" "$ROOT/tests/rust-spike/emit-vectors.ts" "$OUT/vectors.json" "$OUT/cli-requests.jsonl"
"$BUN" "$ROOT/scripts/rust-spike/cli-conformance.ts" "$ROOT/target/release/umf-rust-spike" > "$OUT/cli-conformance.json"
case "$(uname -s)" in
  Darwin) /usr/bin/time -l "$ROOT/target/release/umf-rust-spike" < "$OUT/cli-requests.jsonl" > /dev/null 2> "$OUT/cli-resource.txt" ;;
  Linux) /usr/bin/time -v "$ROOT/target/release/umf-rust-spike" < "$OUT/cli-requests.jsonl" > /dev/null 2> "$OUT/cli-resource.txt" ;;
esac

env PATH=/usr/bin:/bin PYTHONDONTWRITEBYTECODE=1 \
  "$OUT/python/venv/bin/python" "$ROOT/python/rust-spike/run_conformance.py" "$OUT/vectors.json" > "$OUT/python-conformance.json"

rm -rf "$OUT/node/stage" "$OUT/node/consumer"
mkdir -p "$OUT/node/stage"
cp "$ROOT/bindings/rust-spike/node/index.js" "$OUT/node/stage/index.js"
cp "$ROOT/bindings/rust-spike/node/index.d.ts" "$OUT/node/stage/index.d.ts"
cp "$ROOT/bindings/rust-spike/node/package.json" "$OUT/node/stage/package.json"
cp "$NATIVE_LIB" "$OUT/node/stage/umf_rust_spike_node.node"
(cd "$OUT/node/stage" && "$NPM" pack --json --silent > "$OUT/node/pack.json")
NODE_TGZ=$("$NODE" -e 'const fs=require("node:fs");const path=require("node:path");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(p.length!==1||typeof p[0].filename!=="string")process.exit(2);process.stdout.write(path.join(process.argv[2],p[0].filename))' "$OUT/node/pack.json" "$OUT/node/stage")
tar -tzf "$NODE_TGZ" > "$OUT/node/archive-files.txt"
if grep -E '(^|/)[^/]+\.tgz$' "$OUT/node/archive-files.txt" >/dev/null; then
  echo 'npm package unexpectedly contains a nested tarball.' >&2
  exit 2
fi
for entry in package/index.js package/index.d.ts package/package.json package/umf_rust_spike_node.node; do
  if ! grep -Fx "$entry" "$OUT/node/archive-files.txt" >/dev/null; then
    echo "npm package is missing expected entry: $entry" >&2
    exit 2
  fi
done
ARCHIVE_ENTRY_COUNT=$(wc -l < "$OUT/node/archive-files.txt" | tr -d ' ')
if [ "$ARCHIVE_ENTRY_COUNT" -ne 4 ]; then
  echo "npm package contains unintended entries (expected 4, found $ARCHIVE_ENTRY_COUNT)." >&2
  cat "$OUT/node/archive-files.txt" >&2
  exit 2
fi
"$NPM" install --offline --ignore-scripts --no-audit --no-fund --prefix "$OUT/node/consumer" "$NODE_TGZ" >/dev/null
"$NODE" "$ROOT/scripts/rust-spike/js-binding-conformance.cjs" \
  "$OUT/node/consumer/node_modules/umf-rust-spike-node" "$OUT/vectors.json" > "$OUT/node-conformance.json"
"$BUN" "$ROOT/scripts/rust-spike/js-binding-conformance.cjs" \
  "$OUT/node/consumer/node_modules/umf-rust-spike-node" "$OUT/vectors.json" > "$OUT/bun-conformance.json"

"$CARGO" build --locked --release --target wasm32-unknown-unknown -p umf-rust-spike-wasm
WASM_BINDGEN_VERSION=$("$WASM_BINDGEN" --version)
if [ "$WASM_BINDGEN_VERSION" != 'wasm-bindgen 0.2.100' ]; then
  echo "Expected wasm-bindgen CLI 0.2.100, found: $WASM_BINDGEN_VERSION" >&2
  exit 2
fi
"$WASM_BINDGEN" --target web --out-dir "$OUT/wasm/pkg" --out-name umf_rust_spike_wasm \
  "$ROOT/target/wasm32-unknown-unknown/release/umf_rust_spike_wasm.wasm"
"$BUN" "$ROOT/scripts/rust-spike/browser-conformance.ts" "$OUT/wasm/pkg" "$OUT/vectors.json" > "$OUT/browser-conformance.json"
"$BUN" "$ROOT/scripts/rust-spike/capture-evidence.ts" "$OUT"
