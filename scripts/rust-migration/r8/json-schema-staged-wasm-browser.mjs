// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh WASM build and focused private staged-import boundary checks in Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(new URL('../../../', import.meta.url).pathname);
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const cargoTarget = '/private/tmp/umf-r8-json-schema-staged-cargo';
const output = '/private/tmp/umf-r8-json-schema-staged-browser';
const wasmOut = `${output}/wasm`;
const entryOut = `${output}/json-schema-staged-wasm-browser-entry.js`;
const evidencePath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/staged-import-browser.json');
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
const built = await Bun.build({entrypoints: ['scripts/rust-migration/r8/json-schema-staged-wasm-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!built.success) throw new Error(built.logs.map(item => item.message).join('\n'));

const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('about:blank');
  const glueSource = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
  const wasmBase64 = (await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)).toString('base64');
  const entrySource = await readFile(entryOut, 'utf8');
  await page.evaluate(async ({glueSource, wasmBase64, entrySource}) => {
    const wasm = Uint8Array.from(atob(wasmBase64), char => char.charCodeAt(0));
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const module = await import(glueUrl);
    await module.default(wasm);
    globalThis.stagedWasmModule = module;
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    await import(entryUrl);
  }, {glueSource, wasmBase64, entrySource});
  await page.waitForFunction(() => Array.isArray(window.stagedImportResult), undefined, {timeout: 30000});
  const cases = await page.evaluate(() => window.stagedImportResult);
  await page.waitForFunction(() => Array.isArray(window.stagedImportMatrixResult), undefined, {timeout: 30000});
  const matrixCases = await page.evaluate(() => window.stagedImportMatrixResult);
  const get = id => cases.find(item => item.id === id);
  assert.deepEqual(get('success-preserves-three-uri-reads-and-resource-getter-order').stages, ['begin', 'resource', 'payloadBaseUri', 'root', 'id', 'namespace', 'finish']);
  assert.deepEqual(get('success-preserves-three-uri-reads-and-resource-getter-order').events, ['baseUri#1', 'resources', 'resource:get', 'baseUri#2', 'id', 'baseUri#3']);
  assert.equal(get('success-preserves-three-uri-reads-and-resource-getter-order').outcome.baseUri, 'https://example.test/read-2');
  assert.equal(get('success-preserves-three-uri-reads-and-resource-getter-order').outcome.namespace, 'https://example.test/read-3');
  assert.deepEqual(get('base-uri-getter-throw-stops-before-wasm-dispatch').stages, []);
  assert.equal(get('base-uri-getter-throw-stops-before-wasm-dispatch').outcome.sameObject, true);
  assert.deepEqual(get('resources-getter-throw-stops-before-root-stage').stages, ['begin']);
  assert.equal(get('resources-getter-throw-stops-before-root-stage').outcome.sameObject, true);
  assert.deepEqual(get('resource-ownKeys-proxy-throw-stops-before-resource-root-stages').stages, ['begin']);
  assert.equal(get('resource-ownKeys-proxy-throw-stops-before-resource-root-stages').outcome.sameObject, true);
  assert.deepEqual(get('resource-parse-refusal-precedes-payload-and-root-stages').stages, ['begin', 'resource']);
  assert.deepEqual(get('root-parse-refusal-precedes-id-and-third-uri-read').stages, ['begin', 'payloadBaseUri', 'root']);
  assert.equal(get('root-parse-refusal-precedes-id-and-third-uri-read').outcome.code, 'JSON_SCHEMA_SYNTAX');
  assert.deepEqual(pageErrors, []);
  const record = {
    format: 'umf.r8-json-schema-staged-import-browser/1', status: 'pass',
    qualification: 'Focused private staged-import JS host-order and Rust stage endpoint checks in freshly built WASM and real Chromium. String inputs only. This is not a parity matrix against direct TypeScript or Node and does not justify changing the default route.',
    profile: 'umf-r8-json-schema-staged-wasm-private/0.1.0',
    tools: {bun: Bun.version, cargo: (await run(`${toolchain}/cargo`, ['--version'])).stdout, rustc: (await run(`${toolchain}/rustc`, ['--version'])).stdout, wasmBindgen: bindgenVersion.stdout, chromium: browser.version()},
    controls: {orderedGetterStages: true, threeBaseUriReadsRemainDistinct: true, baseGetterThrowsBeforeDispatch: true, resourceGetterAndProxyThrowsPreserveIdentity: true, resourceParseStopsLaterStages: true, rootParseStopsIdAndThirdUriRead: true, wasmExecutedInChromium: true, pageErrors: pageErrors.length},
    cases,
    stringInputStageMatrix: matrixCases,
    artifacts: {
      wasmSha256: sha(await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)),
      wasmGlueSha256: sha(await readFile(`${wasmOut}/umf_core_wasm.js`)),
      browserEntrySha256: sha(await readFile(entryOut)),
      runnerSha256: sha(await readFile(new URL(import.meta.url))),
      hostFacadeSha256: sha(await readFile('bindings/core/wasm/index.js')),
      sessionBindingSha256: sha(await readFile('bindings/core/wasm/src/json_schema_import_session.rs')),
      wasmFacadeEntrySha256: sha(await readFile('scripts/rust-migration/r8/json-schema-staged-wasm-browser-entry.ts')),
    },
  };
  assert(Object.values(record.controls).every(value => value === true || value === 0));
  await mkdir(dirname(evidencePath), {recursive: true});
  await writeFile(evidencePath, JSON.stringify(record, null, 2) + '\n');
  const matrixPath = resolve('docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/import-host-parity-matrix-wasm.json');
  await writeFile(matrixPath, JSON.stringify({profile: 'wasm-chromium', runtime: {chromium: browser.version(), bun: Bun.version}, artifacts: record.artifacts, cases: matrixCases}, null, 2) + '\n');
  console.log(JSON.stringify({evidencePath, matrixPath, cases: cases.length, matrixCases: matrixCases.length, chromium: browser.version(), controls: record.controls}, null, 2));
} finally {
  await browser?.close();
}
