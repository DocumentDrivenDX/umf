// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, relative, dirname} from 'node:path';
import {platform, arch} from 'node:os';

const root = resolve(import.meta.dir, '../..');
const out = resolve(process.argv[2] ?? 'target/rust-spike');
const run = (command: string, args: string[]) => {
  const result = Bun.spawnSync([command, ...args], {stdout:'pipe',stderr:'pipe'});
  if (result.exitCode !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
};
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const describe = async (label: string, path: string) => {
  const bytes = await readFile(path);
  return {label,path:relative(root,path),bytes:bytes.byteLength,sha256:digest(bytes)};
};
const runJson = async (name: string) => JSON.parse(await readFile(resolve(out,name),'utf8'));
const cargo = process.env.UMF_R1_CARGO ?? run('sh',['-lc','command -v cargo']);
const python = process.env.UMF_R1_PYTHON ?? run('sh',['-lc','command -v python3.11']);
const wasmBindgen = process.env.UMF_R1_WASM_BINDGEN ?? 'wasm-bindgen';
const wheel = (await readdir(resolve(out,'python/wheelhouse'))).find(name => name.endsWith('.whl'));
if (!wheel) throw new Error('Installed Python wheel artifact is missing');
const artifacts = [
  ['native-cli',resolve(root,'target/release/umf-rust-spike')],
  ['python-wheel',resolve(out,'python/wheelhouse',wheel)],
  ['node-native-addon',resolve(out,'node/stage/umf_rust_spike_node.node')],
  ['node-package-tarball',resolve(out,'node/stage/umf-rust-spike-node-0.1.0.tgz')],
  ['browser-wasm',resolve(out,'wasm/pkg/umf_rust_spike_wasm_bg.wasm')],
  ['browser-js-glue',resolve(out,'wasm/pkg/umf_rust_spike_wasm.js')],
];
const sourceFiles = [
  'Cargo.toml','Cargo.lock','rust-toolchain.toml','.cargo/config.toml','crates/rust-spike-core/Cargo.toml','crates/rust-spike-core/src/lib.rs',
  'crates/rust-spike-cli/Cargo.toml','crates/rust-spike-cli/src/main.rs',
  'bindings/rust-spike/python/Cargo.toml','bindings/rust-spike/python/build.rs','bindings/rust-spike/python/pyproject.toml','bindings/rust-spike/python/src/lib.rs',
  'bindings/rust-spike/node/Cargo.toml','bindings/rust-spike/node/build.rs','bindings/rust-spike/node/src/lib.rs','bindings/rust-spike/node/index.js','bindings/rust-spike/node/package.json','bindings/rust-spike/node/index.d.ts',
  'bindings/rust-spike/wasm/Cargo.toml','bindings/rust-spike/wasm/src/lib.rs','bindings/rust-spike/wasm/index.js','spec/core/schema.json','spec/core/semantic-type-reference.schema.json',
  'tests/rust-spike/vectors.ts','tests/rust-spike/emit-vectors.ts','tests/rust-spike/browser-shell.html',
  'scripts/rust-spike/package-conformance.sh','scripts/rust-spike/cli-conformance.ts','scripts/rust-spike/js-binding-conformance.cjs',
  'scripts/rust-spike/browser-conformance.ts','scripts/rust-spike/capture-evidence.ts','python/rust-spike/run_conformance.py',
];
const pythonDetails = JSON.parse(await readFile(resolve(out,'python-conformance.json'),'utf8'));
const nodeDetails = JSON.parse(await readFile(resolve(out,'node-conformance.json'),'utf8'));
const bunDetails = JSON.parse(await readFile(resolve(out,'bun-conformance.json'),'utf8'));
const browserDetails = await runJson('browser-conformance.json');
const result = {
  evidence: 'UMF R1 shared Rust binding spike; current-host qualification only',
  capturedAt: new Date().toISOString(),
  platform: {os:platform(),arch:arch(),uname:run('uname',['-a'])},
  toolchain: {
    rustc:run(process.env.UMF_R1_RUSTC ?? resolve(dirname(cargo),'rustc'),['--version']),
    cargo:run(cargo,['--version']),
    python:run(python,['--version']),
    maturin:run(process.env.UMF_R1_MATURIN ?? 'maturin',['--version']),
    node:run('node',['--version']),bun:run('bun',['--version']),
    chromium:browserDetails.chromium,
    pythonAbi:wheel,
    nodeApiAbi:nodeDetails.napi,
    nodeModuleAbi:nodeDetails.nodeModuleAbi,
    bunNapiAbi:bunDetails.napi,
    wasmBindgen:run(wasmBindgen,['--version']),
    cargoDependencies:run(cargo,['tree','--locked','--prefix','none','-p','umf-rust-spike-core','-p','umf-rust-spike','-p','umf-rust-spike-python','-p','umf-rust-spike-node','-p','umf-rust-spike-wasm']),
    pythonBindingVersion:pythonDetails.binding ? pythonDetails.binding : null,
    nodeBindingVersion:nodeDetails.runtimeVersion,bunBindingVersion:bunDetails.runtimeVersion,
    wasmEngineVersion:browserDetails.engine,
  },
  scope: {coreVersion:'0.10.0',operations:['source-roundtrip','validate-record','generate-keyed-record'],completeClaim:false,
    platformsQualified:[`${platform()}-${arch()}`],pythonVersions:['3.11'],nodeBindingRuntimes:['Node', 'Bun'],browser:'Chromium'},
  artifacts: await Promise.all(artifacts.map(async ([label,path]) => ({...(await describe(label,path)),installedPath:path.replace(root,'<worktree>')}))),
  source: await Promise.all(sourceFiles.map(file => describe(file,resolve(root,file)))),
  measurements: {
    cli: await runJson('cli-conformance.json'),python:pythonDetails.measurement,node:nodeDetails.measurement,bun:bunDetails.measurement,
    browser:browserDetails.measurement,
    cliResource: await readFile(resolve(out,'cli-resource.txt'),'utf8'),
    limits:'Host-local sample workload only. Binding numbers include JSON encoding/decoding and engine work; cold-start numbers include fresh host runtime and one call. CLI process RSS includes process/startup; Chromium process memory and cross-platform variance are not measured. No performance target or platform generalization follows.',
  },
  install: {python:'fresh Python 3.11 venv; installed the locally built wheel from a prepared wheelhouse with pip --no-index --no-deps',node:'npm pack + npm install --offline from local tarball into a clean consumer prefix',runtime:'Python conformance invoked by absolute venv interpreter with PATH=/usr/bin:/bin; no Node/Bun on child PATH. CLI conformance invoked by absolute executable with empty PATH.'},
  conformance: {cli:await runJson('cli-conformance.json'),python:pythonDetails,node:nodeDetails,bun:bunDetails,browser:browserDetails},
  limitations:['Only this host platform and pinned runtime versions are qualified.','Core operation matrix is three R1 operations, not all UMF operations.','No production V8 or MiniRacer removal is established.','Browser memory, async cancellation and cross-platform wheels/addons remain open.','The WASM schema-validator dependency chain currently enables getrandom wasm_js for randomized hash-map seeding; this requires browser crypto capability and keeps a host-free WASM claim open.'],
};
await writeFile(resolve(out,'measurements.json'),JSON.stringify(result,null,2)+'\n');
console.log(resolve(out,'measurements.json'));
