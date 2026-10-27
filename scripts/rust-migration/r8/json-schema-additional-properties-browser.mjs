// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(new URL('../../../', import.meta.url).pathname);
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const cargoTarget = '/private/tmp/umf-r8-json-schema-additional-properties-cargo';
const output = '/private/tmp/umf-r8-json-schema-additional-properties-browser';
const wasmOut = `${output}/wasm`;
const entryOut = `${output}/json-schema-additional-properties-browser-entry.js`;
const evidencePath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-additional-properties/browser.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(wasmOut, {recursive: true});
const run = async (command, args, env = {}) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return {stdout: stdout.trim(), stderr: stderr.trim()};
};

await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {
  CARGO_TARGET_DIR: cargoTarget,
  RUSTC: `${toolchain}/rustc`,
});
const bindgenVersion = await run(bindgen, ['--version']);
assert.equal(bindgenVersion.stdout, 'wasm-bindgen 0.2.100');
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${cargoTarget}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const built = await Bun.build({entrypoints: ['scripts/rust-migration/r8/json-schema-additional-properties-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!built.success) throw new Error(built.logs.map(item => item.message).join('\n'));

let browser;
const pageErrors = [];
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('about:blank');
  const glueSource = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
  const wasmBase64 = (await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)).toString('base64');
  const entrySource = await readFile(entryOut, 'utf8');
  await page.evaluate(async ({glueSource, wasmBase64, entrySource}) => {
    const bytes = Uint8Array.from(atob(wasmBase64), char => char.charCodeAt(0));
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const module = await import(glueUrl);
    await module.default(bytes);
    globalThis.additionalPropertiesWasmModule = module;
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    await import(entryUrl);
  }, {glueSource, wasmBase64, entrySource});
  await page.waitForFunction(() => Array.isArray(window.additionalPropertiesBrowserResult), undefined, {timeout: 30000});
  const cases = await page.evaluate(() => window.additionalPropertiesBrowserResult);
  assert.deepEqual(pageErrors, []);
  const same = value => JSON.stringify(value.rust) === JSON.stringify(value.typescript);
  assert(cases.slice(0, 4).every(item => same(item) && item.rust.valid && item.rust.complete && item.rust.diagnostics.length === 0));
  assert(cases[4].typescript.complete && !cases[4].rust.complete);
  assert(cases[4].rust.diagnostics.some(item => item.code === 'JSON_SCHEMA_VALIDATOR_LIMIT'));
  const record = {
    format: 'umf.r8-json-schema-additional-properties-browser/1', status: 'pass',
    sourceRevision: (await run('git', ['rev-parse', 'HEAD'])).stdout,
    sourceState: 'dirty working tree; source identities are pinned by the artifact hashes below',
    qualification: 'Same-browser comparison of direct TypeScript inspectJsonSchema and opt-in Rust/WASM inspectJsonSchema through the browser facade in real Chromium. Four recursive false/schema-valued additionalProperties cases match; a nested pattern keyword remains outside the existing Rust profile and is a negative control. This does not qualify Draft 2020-12 generally or change defaults.',
    runtime: {bun: Bun.version, rustc: (await run(`${toolchain}/rustc`, ['--version'])).stdout, wasmBindgen: bindgenVersion.stdout, chromium: browser.version()},
    cases,
    artifacts: {
      wasmSha256: sha(await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)),
      wasmGlueSha256: sha(await readFile(`${wasmOut}/umf_core_wasm.js`)),
      entrySha256: sha(await readFile(entryOut)),
      runnerSha256: sha(await readFile(new URL(import.meta.url))),
      hostFacadeSha256: sha(await readFile('bindings/core/wasm/index.js')),
      coreInspectorSha256: sha(await readFile('crates/umf-core/src/json_schema_inspect.rs')),
      coreTestSha256: sha(await readFile('crates/umf-core/tests/r5_json_schema_inspect.rs')),
      typescriptAdapterSha256: sha(await readFile('src/adapters/json-schema/index.ts')),
    },
  };
  await mkdir(dirname(evidencePath), {recursive: true});
  await writeFile(evidencePath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({evidencePath, chromium: browser.version(), cases: cases.length, status: 'pass'}, null, 2));
} finally {
  await browser?.close();
}
