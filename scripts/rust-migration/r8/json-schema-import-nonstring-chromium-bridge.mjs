// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh WASM bridge plus direct current-TypeScript non-string matrix in Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(new URL('../../../', import.meta.url).pathname);
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const cargoTarget = '/private/tmp/umf-r8-json-schema-nonstring-bridge-cargo';
const output = '/private/tmp/umf-r8-json-schema-nonstring-bridge-browser';
const wasmOut = `${output}/wasm`;
const entryOut = `${output}/json-schema-import-nonstring-chromium-bridge-entry.js`;
const evidencePath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/import-host-nonstring-chromium-bridge.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = async (command, args, env = {}) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return stdout.trim();
};
const read = path => readFile(resolve(root, path));
await mkdir(wasmOut, {recursive: true});
await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {
  CARGO_TARGET_DIR: cargoTarget,
  RUSTC: `${toolchain}/rustc`,
});
const bindgenVersion = await run(bindgen, ['--version']);
assert.equal(bindgenVersion, 'wasm-bindgen 0.2.100');
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${cargoTarget}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const built = await Bun.build({entrypoints: ['scripts/rust-migration/r8/json-schema-import-nonstring-chromium-bridge-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!built.success) throw new Error(built.logs.map(item => item.message).join('\n'));

const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('about:blank');
  const glueSource = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
  const wasmBytes = await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`);
  const entrySource = await readFile(entryOut, 'utf8');
  const result = await page.evaluate(async ({glueSource, wasmBase64, entrySource}) => {
    const wasmBytes = Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0));
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const module = await import(glueUrl);
    await module.default(wasmBytes);
    globalThis.nonStringWasmModule = module;
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    await import(entryUrl);
    return globalThis.r8NonStringChromiumResult;
  }, {glueSource, wasmBase64: wasmBytes.toString('base64'), entrySource});

  assert.deepEqual(pageErrors, []);
  assert.equal(result.counts.total, 29);
  assert.equal(result.counts.eligible, 20);
  assert.equal(result.counts.eligibleEffectPass, 20);
  assert.equal(result.counts.eligibleExactOutcomePass, 20);
  assert.equal(result.counts.excluded, 9);
  assert.deepEqual(result.counts.eligibleDifferences, []);
  const record = {
    ...result,
    status: 'pass-with-explicit-profile-exclusions',
    qualification: 'Direct current TypeScript and the private staged WASM import bridge ran in one real Chromium page. Only cases admitted by nonstring-string-source-oracle-v1 are parity claims. Nine fail-closed cases are exclusions, not parity. The result does not change the default route.',
    runtime: {bun: Bun.version, cargo: await run(`${toolchain}/cargo`, ['--version']), rustc: await run(`${toolchain}/rustc`, ['--version']), wasmBindgen: bindgenVersion, chromium: browser.version()},
    browserErrors: pageErrors,
    artifacts: {
      wasmSha256: sha(wasmBytes),
      wasmGlueSha256: sha(Buffer.from(glueSource)),
      browserEntrySha256: sha(Buffer.from(entrySource)),
      runnerSha256: sha(await readFile(new URL(import.meta.url))),
      caseMatrixSha256: sha(await read('scripts/rust-migration/r8/json-schema-import-nonstring-boundary-cases.mjs')),
      directAdapterSha256: sha(await read('src/adapters/json-schema/index.ts')),
      directNativeJsonSha256: sha(await read('src/model/native-json.ts')),
      directSourceRunnerSha256: sha(await read('scripts/rust-migration/r8/json-schema-import-nonstring-boundary-runner.mjs')),
      bridgeEntrySha256: sha(await read('scripts/rust-migration/r8/json-schema-import-nonstring-chromium-bridge-entry.ts')),
      wasmFacadeSha256: sha(await read('bindings/core/wasm/index.js')),
      sharedBoundaryHelperSha256: sha(await read('bindings/core/shared/json-schema-import-source.js')),
    },
    limits: ['Private opt-in bridge only; public/default TypeScript import route unchanged.', 'The 4,000,000-character bound and non-allowlisted ToString results intentionally fail closed; excluded results do not assert predecessor parity.'],
  };
  await mkdir(resolve(evidencePath, '..'), {recursive: true});
  await writeFile(evidencePath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({evidencePath, counts: result.counts, chromium: browser.version(), pageErrors}, null, 2));
} finally {
  await browser?.close();
}
