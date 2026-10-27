// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(new URL('../../../', import.meta.url).pathname);
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const cargoTarget = '/private/tmp/umf-r8-parse-native-json-host-cargo';
const output = '/private/tmp/umf-r8-parse-native-json-host-browser';
const wasmOut = `${output}/wasm`;
const entryOut = `${output}/parse-native-json-host-browser-entry.js`;
const evidencePath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-parse-native-json-host/browser.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(wasmOut, {recursive: true});
const run = async (command, args, env = {}) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return {stdout: stdout.trim(), stderr: stderr.trim()};
};
await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {CARGO_TARGET_DIR: cargoTarget, RUSTC: `${toolchain}/rustc`});
const bindgenVersion = await run(bindgen, ['--version']);
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${cargoTarget}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const built = await Bun.build({entrypoints: ['scripts/rust-migration/r8/parse-native-json-host-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!built.success) throw new Error(built.logs.map(item => item.message).join('\n'));
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('about:blank');
  const glue = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
  const wasm = (await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)).toString('base64');
  const entry = await readFile(entryOut, 'utf8');
  await page.evaluate(async ({glue, wasm, entry}) => {
    const bytes = Uint8Array.from(atob(wasm), char => char.charCodeAt(0));
    const moduleUrl = URL.createObjectURL(new Blob([glue], {type: 'text/javascript'}));
    const module = await import(moduleUrl); await module.default(bytes);
    globalThis.parseNativeJsonHostWasmModule = module;
    await import(URL.createObjectURL(new Blob([entry], {type: 'text/javascript'})));
  }, {glue, wasm, entry});
  await page.waitForFunction(() => Array.isArray(window.parseNativeJsonHostResult));
  const cases = await page.evaluate(() => window.parseNativeJsonHostResult);
  assert.deepEqual(errors, []);
  assert(cases.some(item => item.typescript.events.length && item.rustWasm.events.length === 0));
  const record = {
    format: 'umf.r8-json-schema-parse-native-json-host-browser/1', status: 'observed',
    sourceRevision: (await run('git', ['rev-parse', 'HEAD'])).stdout,
    sourceState: 'dirty working tree; source identities pinned by hashes below',
    runtime: {bun: Bun.version, rustc: (await run(`${toolchain}/rustc`, ['--version'])).stdout, wasmBindgen: bindgenVersion.stdout, chromium: browser.version()},
    qualification: 'Same-page direct TypeScript parseNativeJson versus the fresh opt-in Rust/WASM facade on the nine bounded wrong-type coercion/getter fixtures. Observational counterexamples only; no claim of supported wrong-type parity.',
    cases,
    artifacts: {
      wasmSha256: sha(await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)),
      glueSha256: sha(await readFile(`${wasmOut}/umf_core_wasm.js`)),
      entrySha256: sha(await readFile(entryOut)),
      runnerSha256: sha(await readFile(new URL(import.meta.url))),
      wasmFacadeSha256: sha(await readFile('bindings/core/wasm/index.js')),
      coreWireSha256: sha(await readFile('crates/umf-core-wire/src/lib.rs')),
      typescriptParserSha256: sha(await readFile('src/model/native-json.ts')),
    },
  };
  await mkdir(dirname(evidencePath), {recursive: true});
  await writeFile(evidencePath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({evidencePath, chromium: browser.version(), cases: cases.length}, null, 2));
} finally { await browser?.close(); }
