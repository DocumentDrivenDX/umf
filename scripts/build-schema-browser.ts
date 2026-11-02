// SPDX-License-Identifier: MIT OR Apache-2.0
// Reproducible, source-bound producer for the schema-browser's required WASM
// comparison runtime. It never installs a toolchain or downloads a target.
import {mkdir, rm, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dir, '..');
const generated = join(root, 'target/schema-browser-rust-wasm');
const cargoTarget = join(generated, 'cargo');
const bindgenOutput = join(generated, 'wasm-bindgen');

function run(command: string[], options: {cwd?: string; env?: Record<string, string | undefined>} = {}) {
  let result;
  try { result = Bun.spawnSync(command, {cwd: options.cwd ?? root, env: {...process.env, ...options.env}, stdout: 'pipe', stderr: 'pipe'}); }
  catch (error) { throw new Error(`Required build tool could not start: ${command[0]} (${String(error)})`); }
  if (result.exitCode !== 0) throw new Error(`${command.join(' ')} failed (${result.exitCode})\n${result.stdout.toString()}\n${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

const toolchain = '1.90.0';
const rustcVersion = run(['rustup', 'run', toolchain, 'rustc', '--version']);
if (!/^rustc 1\.90\.0(?:\s|$)/.test(rustcVersion)) throw new Error(`Schema-browser build requires Rust ${toolchain}; received ${rustcVersion}`);
const installedTargets = run(['rustup', 'target', 'list', '--installed', '--toolchain', toolchain]).split(/\s+/);
if (!installedTargets.includes('wasm32-unknown-unknown')) throw new Error(`Schema-browser build requires the preinstalled ${toolchain} wasm32-unknown-unknown target; no target was installed`);

let found: string;
try { found = run(['/bin/sh', '-c', 'command -v wasm-bindgen']); }
catch { throw new Error('Schema-browser build requires the preinstalled wasm-bindgen 0.2.100 CLI on PATH; no install or download was attempted'); }
const wasmBindgen = found.split('\n').at(-1)!;
const bindgenVersion = run([wasmBindgen, '--version']);
if (bindgenVersion !== 'wasm-bindgen 0.2.100') throw new Error(`Schema-browser build requires wasm-bindgen 0.2.100 on PATH; received ${bindgenVersion}`);

await rm(generated, {recursive: true, force: true});
await mkdir(bindgenOutput, {recursive: true});
const buildEnv = {CARGO_TARGET_DIR: cargoTarget, CARGO_INCREMENTAL: '0', CARGO_BUILD_JOBS: '2'};
run(['rustup', 'run', toolchain, 'cargo', 'build', '--offline', '--manifest-path', join(root, 'Cargo.toml'), '--package', 'umf-core-wasm', '--release', '--target', 'wasm32-unknown-unknown'], {env: buildEnv});
const wasmInput = join(cargoTarget, 'wasm32-unknown-unknown/release/umf_core_wasm.wasm');
if (!(await stat(wasmInput)).isFile()) throw new Error(`WASM compiler output is missing: ${wasmInput}`);
run([wasmBindgen, wasmInput, '--target', 'web', '--out-dir', bindgenOutput, '--out-name', 'umf_core_wasm']);
for (const filename of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm']) if (!(await stat(join(bindgenOutput, filename))).isFile()) throw new Error(`wasm-bindgen output is missing: ${join(bindgenOutput, filename)}`);

const bundle = Bun.spawnSync([process.execPath, join(root, 'docs/helix/05-deploy/schema-browser/build.ts'), ...process.argv.slice(2)], {
  cwd: root,
  env: {...process.env, UMF_SCHEMA_BROWSER_WASM_OUTPUT: bindgenOutput},
  stdout: 'inherit',
  stderr: 'inherit',
});
if (bundle.exitCode !== 0) throw new Error(`Schema-browser bundling failed (${bundle.exitCode})`);
