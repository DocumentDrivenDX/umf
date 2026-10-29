#!/usr/bin/env bash
# SPDX-License-Identifier: MIT OR Apache-2.0
# Build and qualify a private Linux x86_64 SDK snapshot without writing to the checkout.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)
BUILD_IMAGE=${UMF_R8_LINUX_BUILD_IMAGE:-umf-local-sdk-linux-amd64-build-essential:attempt003}
NPM_IMAGE=${UMF_R8_NPM_SOURCE_IMAGE:-umf-r8-sdk-linux-x64:latest}
BROWSER_IMAGE=${UMF_R8_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.63.0-noble}

if [[ -n "${UMF_R8_LINUX_QUALIFICATION_OUT:-}" ]]; then
  OUT=$(cd "$(dirname "$UMF_R8_LINUX_QUALIFICATION_OUT")" && pwd -P)/$(basename "$UMF_R8_LINUX_QUALIFICATION_OUT")
  case "$OUT" in
    /private/tmp/*) ;;
    *) echo "UMF_R8_LINUX_QUALIFICATION_OUT must be under /private/tmp" >&2; exit 2 ;;
  esac
  mkdir -p "$OUT"
else
  OUT=$(mktemp -d /private/tmp/umf-core-facets-linux.XXXXXX)
fi

mkdir -p "$OUT/toolchain"
npm_container=''
browser_container=''
cleanup() {
  [[ -z "$npm_container" ]] || docker rm -f "$npm_container" >/dev/null 2>&1 || true
  [[ -z "$browser_container" ]] || docker rm -f "$browser_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker image inspect "$BUILD_IMAGE" >/dev/null
docker image inspect "$NPM_IMAGE" >/dev/null
docker image inspect "$BROWSER_IMAGE" >/dev/null
HOST_ARCH=$(uname -m)
BUILD_IMAGE_LOCAL=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$BUILD_IMAGE")
NPM_IMAGE_LOCAL=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$NPM_IMAGE")
BROWSER_IMAGE_LOCAL=$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$BROWSER_IMAGE")

# The cached build image has Bun/Rust but no npm. Copy only npm's JS package
# from the matching Node 26 image; the build image supplies Node itself.
npm_container=$(docker create --platform linux/amd64 --entrypoint /bin/true "$NPM_IMAGE")
NPM_IMAGE_AMD64=$(docker inspect --format '{{.Image}}' "$npm_container")
docker cp "$npm_container:/usr/local/lib/node_modules/npm" "$OUT/toolchain/npm-lib"
docker rm "$npm_container" >/dev/null
npm_container=''
cat > "$OUT/toolchain/npm" <<'NPM'
#!/bin/sh
exec /usr/local/bin/node /usr/local/lib/node_modules/npm/bin/npm-cli.js "$@"
NPM
chmod 755 "$OUT/toolchain/npm"

# Reuse the exact Playwright 1.63 Chromium payload as an amd64 read-only mount.
browser_container=$(docker create --platform linux/amd64 --entrypoint /bin/true "$BROWSER_IMAGE")
BROWSER_IMAGE_AMD64=$(docker inspect --format '{{.Image}}' "$browser_container")
docker cp "$browser_container:/ms-playwright" "$OUT/playwright"
docker rm "$browser_container" >/dev/null
browser_container=''
build_container=$(docker create --platform linux/amd64 --entrypoint /bin/true "$BUILD_IMAGE")
BUILD_IMAGE_AMD64=$(docker inspect --format '{{.Image}}' "$build_container")
docker rm "$build_container" >/dev/null
{
  printf 'host_arch=%s\nrequested_container_platform=linux/amd64\nemulation_required=%s\n' "$HOST_ARCH" "$([[ "$HOST_ARCH" == x86_64 ]] && echo no || echo yes)"
  printf 'build_image=%s\nbuild_image_local=%s\nbuild_image_selected_linux_amd64_id=%s\n' "$BUILD_IMAGE" "$BUILD_IMAGE_LOCAL" "$BUILD_IMAGE_AMD64"
  printf 'npm_image=%s\nnpm_image_local=%s\nnpm_image_selected_linux_amd64_id=%s\n' "$NPM_IMAGE" "$NPM_IMAGE_LOCAL" "$NPM_IMAGE_AMD64"
  printf 'playwright_image=%s\nplaywright_image_local=%s\nplaywright_image_selected_linux_amd64_id=%s\n' "$BROWSER_IMAGE" "$BROWSER_IMAGE_LOCAL" "$BROWSER_IMAGE_AMD64"
} > "$OUT/docker-image-cohort.txt"

echo "Local Linux SDK qualification output: $OUT"
echo "Building from a read-only source mount with Bun 1.4.3, Node 26.12.1, Rust 1.90.0, wasm-bindgen 0.2.100, and Playwright Chromium 1.63.0."

# Stage once on the host, then unpack into the container's own filesystem.
# Per-file reads and writes across Docker Desktop mounts made a source copy
# take many minutes; the reviewed inputs and final hashes stay identical.
COPYFILE_DISABLE=1 tar -C "$ROOT" \
  --exclude=./.git --exclude=./.tmp --exclude=./target --exclude=./dist --exclude=./.cache \
  --exclude=node_modules --exclude=.venv --exclude=__pycache__ \
  -cf "$OUT/source-snapshot.tar" .

docker run --rm --interactive --platform linux/amd64 \
  --volume "$ROOT:/source:ro" \
  --volume "$OUT/source-snapshot.tar:/source-snapshot.tar:ro" \
  --volume "$OUT:/out" \
  --volume "$OUT/toolchain/npm-lib:/usr/local/lib/node_modules/npm:ro" \
  --volume "$OUT/toolchain/npm:/usr/local/bin/npm:ro" \
  --volume "$OUT/playwright:/ms-playwright:ro" \
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  --env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  "$BUILD_IMAGE" \
  bash -s <<'CONTAINER'
set -euo pipefail
[[ "$(dpkg --print-architecture)" == amd64 ]]
[[ "$(node --version)" == v26.12.1 ]]
[[ "$(bun --version)" == 1.4.3 ]]
[[ "$(rustc --version)" == 'rustc 1.90.0 '* ]]
[[ "$(wasm-bindgen --version)" == 'wasm-bindgen 0.2.100' ]]
[[ "$(npm --version)" == 11.20.0 ]]
rustup target list --installed | grep -qx wasm32-unknown-unknown

mkdir -p /out/cache/cargo /out/cache/npm
export CARGO_HOME=/out/cache/cargo
export NPM_CONFIG_CACHE=/out/cache/npm
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

BUILD=$(mktemp -d /tmp/umf-core-facets-workspace.XXXXXX)
echo "Private build copy: $BUILD"
tar -C "$BUILD" -xf /source-snapshot.tar
cd "$BUILD"

echo 'Network-enabled Bun dependency bootstrap in the private copy.'
bun install --frozen-lockfile
echo 'Fetching locked Rust dependencies into the isolated Cargo cache.'
cargo fetch --locked
echo 'Installing Chromium system libraries in the disposable Linux container.'
bunx playwright install-deps chromium
CHROME=$(find /ms-playwright -path '*/chrome-linux64/chrome' -type f -print -quit)
[[ -n "$CHROME" ]]
{
  printf 'container_uname=%s\n' "$(uname -a)"
  printf 'container_architecture=%s\n' "$(dpkg --print-architecture)"
  printf 'requested_platform=linux/amd64; this may be emulated on a non-x86_64 host\n'
  printf 'node=%s\nbun=%s\nrustc=%s\nwasm_bindgen=%s\nnpm=%s\n' "$(node --version)" "$(bun --version)" "$(rustc --version)" "$(wasm-bindgen --version)" "$(npm --version)"
  printf 'playwright_chromium_executable=%s\n' "$CHROME"
  "$CHROME" --version
} > /out/runtime-platform-qualification.txt

export UMF_RUST_DEFAULT_BUILD_ONLY=1
bun scripts/metamodel/build.ts --check
bun scripts/actions-plan-identity.ts --check
bun scripts/package-sdk-rust-default.ts

cargo build --release --locked --manifest-path bindings/core/wasm/Cargo.toml --target wasm32-unknown-unknown
mkdir -p bindings/core/wasm/pkg
wasm-bindgen --target web --out-dir bindings/core/wasm/pkg --out-name umf_core_wasm target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
bun run typecheck

node --input-type=module - <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('dist/rust-default-manifest.json', 'utf8'));
const closure = manifest.sourceClosure;
if (!closure || !/^[0-9a-f]{64}$/.test(closure.sha256) || closure.sha256 !== closure.capturedLiveSha256 || closure.transform?.status !== 'fixed-point' || closure.transform.generatedInputs.length !== 0) {
  throw new Error('Linux SDK build is not a fixed-point source snapshot');
}
if (manifest.platform?.os !== 'linux' || manifest.platform?.arch !== 'x86_64' || manifest.platform?.nodeArch !== 'x64') {
  throw new Error('Linux SDK build reported the wrong platform cohort');
}
fs.writeFileSync('/out/core-facets-inputs.json', JSON.stringify({sourceClosureSha256: closure.sha256}));
console.log(JSON.stringify({sourceClosureSha256: closure.sha256, fileCount: closure.fileCount}));
NODE

bun scripts/package-sdk.ts
python3 scripts/test-sdk-package.py
ARCHIVE=.cache/sdk-distribution/umf-sdk.tgz
SOURCE_CLOSURE_SHA=$(node -p 'JSON.parse(require("node:fs").readFileSync("/out/core-facets-inputs.json", "utf8")).sourceClosureSha256')

echo 'Network-enabled npm cache bootstrap into a temporary isolated consumer; this step is online.'
BOOTSTRAP=$(mktemp -d /tmp/umf-core-facets-npm-bootstrap.XXXXXX)
trap 'rm -rf "$BOOTSTRAP"' EXIT
npm install --ignore-scripts --no-audit --no-fund --prefix "$BOOTSTRAP" "$BUILD/$ARCHIVE"

echo 'Running the Core Facets installed dependency gate; its consumer install is --offline.'
bun scripts/rust-migration/r8/core-facets-dependency-installed.mjs \
  "$BUILD/$ARCHIVE" "$SOURCE_CLOSURE_SHA" /out/core-facets-dependency-installed
cp "$BUILD/$ARCHIVE" /out/umf-sdk-linux-x86_64.tgz
cp "$BUILD/dist/rust-default-manifest.json" /out/rust-default-manifest.json
chmod -R a+rX /out
CONTAINER

test -s "$OUT/umf-sdk-linux-x86_64.tgz"
test -s "$OUT/core-facets-dependency-installed/cohort.json"
echo "Qualification finished. Archive: $OUT/umf-sdk-linux-x86_64.tgz"
echo "Cohort receipt: $OUT/core-facets-dependency-installed/cohort.json"
