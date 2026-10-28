// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh opt-in access-temporal WASM parity in Bun and real Chromium.
import assert from 'node:assert/strict';
import {copyFile, cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(new URL('../../../..', import.meta.url).pathname);
const temp = `/private/tmp/umf-access-temporal-wasm-${process.pid}`;
const target = '/private/tmp/umf-access-temporal-wasm-cargo';
const wasmOut = `${temp}/wasm-bindgen`;
const binding = `${temp}/binding`;
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const run = async (program, args, env = {}) => {
  const child = Bun.spawn([program, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'inherit', stderr: 'inherit'});
  const code = await child.exited;
  assert.equal(code, 0, `${program} failed (${code})`);
};
let browser;
try {
  await mkdir(wasmOut, {recursive: true});
  await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {CARGO_TARGET_DIR: target, RUSTC: `${toolchain}/rustc`});
  await run(bindgen, ['--target', 'web', '--out-dir', wasmOut, '--out-name', 'umf_core_wasm', `${target}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`]);
  await cp('bindings/core/wasm', binding, {recursive: true});
  await mkdir(`${binding}/pkg`, {recursive: true});
  await copyFile(`${wasmOut}/umf_core_wasm.js`, `${binding}/pkg/umf_core_wasm.js`);
  await copyFile(`${wasmOut}/umf_core_wasm_bg.wasm`, `${binding}/pkg/umf_core_wasm_bg.wasm`);
  const packet = await readFile('docs/helix/04-build/evidence/rust-migration/r8-access-temporal/reference-packet.json', 'utf8');
  const frozen = JSON.parse(packet);
  const {createAccessTemporalEngine} = await import(pathToFileURL(`${binding}/index.js`).href);
  const wasmModule = await import(pathToFileURL(`${binding}/pkg/umf_core_wasm.js`).href);
  await wasmModule.default(pathToFileURL(`${binding}/pkg/umf_core_wasm_bg.wasm`).href);
  const bunEngine = createAccessTemporalEngine(wasmModule);
  const canonical = value => JSON.stringify(value);
  for (const candidate of frozen.cases) {
    let actual;
    try { actual = {status: 'ok', value: bunEngine.parseAccessTemporal(candidate.input.kind, candidate.input.token)}; }
    catch (error) { actual = {status: 'error', name: error.name, message: error.message}; }
    assert.equal(canonical(actual), canonical(candidate.outcome), `Bun WASM case ${candidate.id}`);
  }
  console.log(`Fresh WASM access-temporal replay passed in Bun ${Bun.version}: 48 tagged cases.`);
  await copyFile('scripts/rust-migration/r8/access-temporal/browser-entry.js', `${binding}/browser-entry.js`);
  await writeFile(`${binding}/index.html`, '<!doctype html><script type="module" src="./browser-entry.js"></script>');
  await writeFile(`${binding}/packet.json`, packet);
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.url()}: HTTP ${response.status()}`);
  });
  await page.route('http://umf.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    try {
      const body = await readFile(join(binding, pathname));
      const contentType = pathname.endsWith('.wasm') ? 'application/wasm' : pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.json') ? 'application/json' : 'text/html';
      await route.fulfill({status: 200, contentType, body});
    } catch { await route.fulfill({status: 404, body: ''}); }
  });
  await page.goto('http://umf.test/');
  try {
    await page.waitForFunction(() => Boolean(window.accessTemporalResult), undefined, {timeout: 30000});
  } catch (error) {
    throw new Error(`Browser replay did not complete: ${errors.join(' | ') || String(error)}`);
  }
  const result = await page.evaluate(() => window.accessTemporalResult);
  assert.deepEqual(result, {tagged: 48, traps: 0, getters: 0, nodeGlobalsAbsent: true});
  assert.deepEqual(errors, []);
  console.log(`Fresh WASM access-temporal replay passed in Chromium ${browser.version()}: 48 tagged cases and raw-host refusal precedence.`);
} finally {
  await browser?.close();
  await rm(temp, {recursive: true, force: true});
}
