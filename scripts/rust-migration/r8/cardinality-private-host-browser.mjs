// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh private Cardinality WASM host-admission route probe in Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const target = '/private/tmp/umf-r8-cardinality-private-host-cargo';
const output = '/private/tmp/umf-r8-cardinality-private-host-browser';
const wasmOut = `${output}/wasm`;
const receiptPath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-cardinality-private-host-route/chromium.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const run = async (command, args, env = {}) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return stdout.trim();
};
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {
  CARGO_TARGET_DIR: target,
  RUSTC: `${toolchain}/rustc`,
});
assert.equal(await run(bindgen, ['--version']), 'wasm-bindgen 0.2.100');
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${target}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const build = await Bun.build({entrypoints: ['scripts/rust-migration/r8/cardinality-private-host-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!build.success) throw new Error(build.logs.map(item => item.message).join('\n'));

const packet = await json('docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json');
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([key, path]) => [key, await json(path)])));
const payload = {resources, packet};
const wasmGlue = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
const wasmBytes = await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`);
const entry = await readFile(`${output}/cardinality-private-host-browser-entry.js`, 'utf8');
const errors = [];
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('about:blank');
  const result = await page.evaluate(async ({wasmGlue, wasmBase64, entry, payload}) => {
    const bytes = Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0));
    const wasmUrl = URL.createObjectURL(new Blob([wasmGlue], {type: 'text/javascript'}));
    const module = await import(wasmUrl);
    await module.default(bytes);
    const entryUrl = URL.createObjectURL(new Blob([entry], {type: 'text/javascript'}));
    return (await import(entryUrl)).runCardinalityBrowserCases(module, payload);
  }, {wasmGlue, wasmBase64: wasmBytes.toString('base64'), entry, payload});
  assert.deepEqual(errors, []);
  assert.deepEqual(result.outcomes, {
    missing: packet.inspections.missing.value,
    known: packet.inspections.known.value,
    unknown: packet.inspections.unknown.value,
    inapplicable: packet.inspections.inapplicable.value,
    declaration: packet.declaration,
    surrogateItemDeclaration: packet.surrogateItemDeclaration.value,
    verified: packet.verified.value,
  });
  assert.equal(result.inspectOrder.indexOf('source') >= 0 && result.inspectOrder.indexOf('identity') > result.inspectOrder.indexOf('source'), true);
  assert.equal(result.requestBeforeSource.code, 'CORE_CARDINALITY_REQUEST');
  assert.equal(result.requestBeforeSource.events.includes('request'), true);
  assert.equal(result.requestBeforeSource.events.includes('source'), false);
  assert.equal(result.receiptBeforeCurrent.currentReads, 0);
  assert.equal(result.thrownIdentity, true);
  assert.equal(result.nodeGlobalsAbsent, true);
  assert.deepEqual(errors, []);
  const paths = [
    'crates/umf-core/src/cardinality.rs',
    'crates/umf-core/src/cardinality_host_json.rs',
    'crates/umf-core/src/full_modules.rs',
    'bindings/core/wasm/index.js',
    'bindings/core/wasm/index.d.ts',
    'bindings/core/wasm/src/host-json.js',
    'bindings/core/wasm/src/host_json.rs',
    'bindings/core/node/index.js',
    'bindings/core/node/index.d.ts',
    'bindings/core/node/src/host-json.js',
    'bindings/core/node/src/host_json.rs',
    'bindings/core/node/tests/cardinality-host-json.test.js',
    'scripts/rust-migration/r8/cardinality-private-host-browser-entry.ts',
    'scripts/rust-migration/r8/cardinality-private-host-browser.mjs',
    'docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json',
    'spec/core/schema.json',
    'spec/core/semantic-type-reference.schema.json',
    'spec/core/extension-package.schema.json',
    'spec/metamodel/generated/core-constraints.json',
    'spec/metamodel/generated/domain-policy.json',
  ];
  const artifacts = Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(resolve(root, path)))])));
  const record = {
    format: 'umf-r8.cardinality-private-host-route.chromium/1',
    status: 'pass-private-frozen-host-admission',
    scope: 'Private opt-in Core Cardinality Rust host-reflection route; public/default V4 selection unchanged; ordinary Context only.',
    runtime: {bun: Bun.version, rustc: await run(`${toolchain}/rustc`, ['--version']), wasmBindgen: await run(bindgen, ['--version']), chromium: browser.version(), browserUserAgent: await page.evaluate(() => navigator.userAgent)},
    operation: 'executeCoreCardinalityHostJson (private WASM export; no package-root selection)',
    cases: {frozenSemanticEnvelopeMatches: true, frozenCases: Object.keys(result.outcomes), inspectSourceBeforeIdentity: result.inspectOrder, requestBeforeSource: result.requestBeforeSource, receiptBeforeCurrent: result.receiptBeforeCurrent, thrownHostIdentityPreserved: result.thrownIdentity, nodeGlobalsAbsent: result.nodeGlobalsAbsent},
    browserErrors: errors,
    artifacts: {...artifacts,
      'fresh-wasm32-artifact': sha(await readFile(`${target}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`)),
      'fresh-wasm-bindgen-glue': sha(Buffer.from(wasmGlue)),
      'fresh-wasm-bindgen-binary': sha(wasmBytes),
      'bundled-browser-entry': sha(Buffer.from(entry)),
    },
    limits: ['Private route only; no default or installed package qualification.', 'No operation controls or resourceControls are accepted; evidence covers ordinary Context.', 'Frozen profile compares the semantic result values; error ordering, caller-thrown identity, and browser global absence are separately asserted.'],
  };
  await mkdir(resolve(receiptPath, '..'), {recursive: true});
  await writeFile(receiptPath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({receiptPath, chromium: record.runtime.chromium, cases: record.cases.frozenCases, receiptBeforeCurrent: record.cases.receiptBeforeCurrent, nodeGlobalsAbsent: record.cases.nodeGlobalsAbsent}, null, 2));
} finally {
  await browser?.close();
}
