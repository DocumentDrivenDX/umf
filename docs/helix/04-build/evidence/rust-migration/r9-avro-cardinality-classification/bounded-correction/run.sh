#!/bin/bash
set -euo pipefail
cd /private/tmp/umf-avro-cardinality
TASK_OUT=/private/tmp/umf-avro-final-family-gate
EVIDENCE=docs/helix/04-build/evidence/rust-migration/r9-avro-cardinality-classification
export PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-wasm-bindgen-0.2.100/bin:$PATH
export CARGO_NET_OFFLINE=true CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 RUST_TEST_THREADS=1 RAYON_NUM_THREADS=1
stage() { local task_stage=$1; shift; printf '%s\n' "$task_stage" > "$TASK_OUT/current-stage.txt"; "$@" > "$TASK_OUT/$task_stage.log" 2>&1; }
python3 - <<'PY'
from pathlib import Path
import hashlib,json
names=['Cargo.lock','crates/umf-core/src/avro_cardinality.rs','crates/umf-core-wire/src/avro_cardinality_binding.rs','bindings/core/node/src/lib.rs','bindings/core/python/src/lib.rs','bindings/core/wasm/src/lib.rs']
pins={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in names}
Path('/private/tmp/umf-avro-final-family-gate/source-pins.json').write_text(json.dumps(pins,indent=2)+'\n')
PY
stage unit env CARGO_TARGET_DIR=/private/tmp/umf-avro-cardinality-target cargo test --locked --offline -p umf-core --lib avro_cardinality::tests
stage native-build env CARGO_TARGET_DIR=/private/tmp/umf-avro-cardinality-hatch-target MACOSX_DEPLOYMENT_TARGET=11.0 CARGO_PROFILE_RELEASE_STRIP=none RUSTFLAGS='-C debuginfo=2 -C strip=none' PYO3_PYTHON=/private/tmp/umf-r8-python-env/bin/python cargo build --locked --offline --release --target aarch64-apple-darwin -p umf-cli -p umf-core-node -p umf-core-python
export UMF_AVRO_CARDINALITY_CLI=/private/tmp/umf-avro-cardinality-hatch-target/aarch64-apple-darwin/release/umf
export UMF_AVRO_CARDINALITY_CLI_SHA256
UMF_AVRO_CARDINALITY_CLI_SHA256=$(shasum -a 256 "$UMF_AVRO_CARDINALITY_CLI" | cut -d' ' -f1)
export UMF_AVRO_CARDINALITY_PROBE_OUT="$TASK_OUT/repaired-probe.json"
stage affected-cases bun "$EVIDENCE/bounded-review-probe.ts"
stage frozen-80 bun "$EVIDENCE/compare-parallel.ts"
stage extra-50 bun "$EVIDENCE/compare-extra.ts"
python3 - <<'PY'
from pathlib import Path
import json,shutil
out=Path('/private/tmp/umf-avro-final-family-gate')
for name,count,key in [('frozen-80',80,'selected'),('extra-50',50,'cases')]:
 d=json.loads((out/(name+'.log')).read_text());assert d[key]==count and len(d['results'])==count and all(r.get('match') is True for r in d['results']), name
node=out/'node';node.mkdir()
for name in ['index.js','package.json']:shutil.copyfile(Path('bindings/core/node')/name,node/name)
shutil.copytree('bindings/core/node/src',node/'src');(node/'node_modules').symlink_to(Path('node_modules').resolve(),target_is_directory=True)
build=Path('/private/tmp/umf-avro-cardinality-hatch-target/aarch64-apple-darwin/release')
shutil.copyfile(build/'libumf_core_node.dylib',node/'umf_core_node.node')
python=out/'python';python.mkdir()
shutil.copytree('python/src/umf',python/'umf',ignore=shutil.ignore_patterns('_rust_core*.so','__pycache__'))
shutil.copyfile(build/'lib_rust_core.dylib',python/'umf/_rust_core.abi3.so')
PY
export UMF_AVRO_CARDINALITY_NODE_ENTRY="$TASK_OUT/node/index.js"
stage node node "$EVIDENCE/test-binding.mjs"
stage bun bun "$EVIDENCE/test-binding.mjs"
export PYTHONPATH="$TASK_OUT/python" PYTHONSAFEPATH=1 PYTHONDONTWRITEBYTECODE=1
stage python /private/tmp/umf-r8-python-env/bin/python -P "$EVIDENCE/test-python.py"
stage wasm-build env CARGO_TARGET_DIR=/private/tmp/umf-avro-cardinality-target cargo build --locked --offline --release --target wasm32-unknown-unknown -p umf-core-wasm
export UMF_AVRO_CARDINALITY_WASM_PACKAGE="$TASK_OUT/wasm"
stage wasm-bindgen wasm-bindgen --target web --out-dir "$UMF_AVRO_CARDINALITY_WASM_PACKAGE" --out-name umf_core_wasm /private/tmp/umf-avro-cardinality-target/wasm32-unknown-unknown/release/umf_core_wasm.wasm
stage chromium bun "$EVIDENCE/test-browser.ts"
python3 - <<'PY'
from pathlib import Path
import hashlib,json
out=Path('/private/tmp/umf-avro-final-family-gate');pins=json.loads((out/'source-pins.json').read_text())
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==sha for p,sha in pins.items())
artifacts=[Path('/private/tmp/umf-avro-cardinality-hatch-target/aarch64-apple-darwin/release/umf'),out/'node/umf_core_node.node',out/'python/umf/_rust_core.abi3.so',out/'wasm/umf_core_wasm_bg.wasm']
receipt={'scope':'source-built Avro Cardinality opt-in family only; no default, installed distribution or release qualification','status':'passed','sourcePins':pins,'artifacts':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in artifacts},'logs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*.log')}}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');(out/'current-stage.txt').write_text('complete\n')
PY
