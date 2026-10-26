// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh private Selection WASM route execution in real Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {directTypescriptWarningSelection} from './selection-private-host-direct.mjs';

const root = resolve(import.meta.dirname, '../../..');
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const target = '/private/tmp/umf-r8-selection-private-host-cargo';
const output = '/private/tmp/umf-r8-selection-private-host-browser';
const wasmOut = `${output}/wasm`;
const entryOut = `${output}/selection-private-host-browser-entry.js`;
const receiptPath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-selection-private-host-route/chromium.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));
const run = async (command, args, env = {}) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return stdout.trim();
};

await mkdir(wasmOut, {recursive: true});
await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {
  CARGO_TARGET_DIR: target,
  RUSTC: `${toolchain}/rustc`,
});
const bindgenVersion = await run(bindgen, ['--version']);
assert.equal(bindgenVersion, 'wasm-bindgen 0.2.100');
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${target}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const bundle = await Bun.build({entrypoints: ['scripts/rust-migration/r8/selection-private-host-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!bundle.success) throw new Error(bundle.logs.map(item => item.message).join('\n'));

const source = await json('scripts/rust-migration/r5/selection/input.json');
const frozen = await json('scripts/rust-migration/r5/selection/frozen-typescript.json');
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([key, path]) => [key, await json(path)])));
const directWarningResult = await directTypescriptWarningSelection();
const payload = {resources, source: source.source, queries: source.queries, frozen: frozen.cases,
  directWarningSourceValidation: directWarningResult.sourceValidation};
const artifacts = {};
for (const path of [
  'crates/umf-core/src/selection.rs',
  'crates/umf-core/src/selection_host_json.rs',
  'crates/umf-core/src/selection_diagnostics.rs',
  'bindings/core/wasm/src/host_json.rs',
  'bindings/core/wasm/src/host-json.js',
  'bindings/core/node/src/host-json.js',
  'scripts/rust-migration/r8/selection-private-host-browser-entry.ts',
  'scripts/rust-migration/r8/selection-private-host-browser.mjs',
  'scripts/rust-migration/r8/selection-private-host-direct.mjs',
  'scripts/rust-migration/r8/selection-private-host-direct-child.mjs',
  'scripts/rust-migration/r8/selection-private-host-node.mjs',
  'bindings/core/node/tests/selection-host-json.test.js',
  'scripts/rust-migration/r5/selection/input.json',
  'scripts/rust-migration/r5/selection/frozen-typescript.json',
  'spec/core/schema.json',
  'spec/core/semantic-type-reference.schema.json',
  'spec/core/extension-package.schema.json',
  'spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json',
]) artifacts[path] = sha(await read(path));

const browserErrors = [];
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => browserErrors.push(String(error)));
  await page.goto('about:blank');
  const glueSource = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
  const wasmBytes = await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`);
  const entrySource = await readFile(entryOut, 'utf8');
  const result = await page.evaluate(async ({glueSource, wasmBase64, entrySource, payload}) => {
    const wasm = Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0));
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const wasmModule = await import(glueUrl);
    await wasmModule.default(wasm);
    globalThis.selectionWasmModule = wasmModule;
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    const entry = await import(entryUrl);
    return entry.runSelectionBrowserCases(payload);
  }, {glueSource, wasmBase64: wasmBytes.toString('base64'), entrySource, payload});
  assert.deepEqual(browserErrors, []);
  for (const [name, outcome] of Object.entries(result.outcomes)) {
    assert.equal(outcome.equal, true, `frozen JSON mismatch: ${name}`);
    assert.equal(outcome.prototype, 'null', `non-null result prototype: ${name}`);
  }
  assert.equal(result.allPrototypes.every(item => item.prototype === 'null' || item.prototype === 'array'), true, 'nested result object prototype mismatch');
  assert.equal(result.protoKeyPreserved, true, '__proto__ data key was lost or affected the prototype');
  assert.equal(result.successfulWarnings.crossHostDirectSourceBaselineEqual, true);
  assert.equal(result.successfulWarnings.nullPrototype, true);
  assert.deepEqual(result.successfulWarnings.sourceValidation, {
    valid: true,
    complete: false,
    diagnostics: [
      {code: 'EXTENSION_STRUCTURE', path: '/extensions/future/first', message: 'first warning', severity: 'warning'},
      {code: 'EXTENSION_STRUCTURE', path: '/extensions/future/second', message: 'second warning', severity: 'warning'},
      {code: 'EXTENSION_STRUCTURE', path: '/modules/0/elements/0/extensions/future/first', message: 'first warning', severity: 'warning'},
      {code: 'EXTENSION_STRUCTURE', path: '/modules/0/elements/0/extensions/future/second', message: 'second warning', severity: 'warning'},
      {code: 'UNKNOWN_CORE_FIELD', path: '/modules/0/elements/0/references/0/future', message: 'Field retained without interpretation', severity: 'warning'},
      {code: 'UNKNOWN_SCALAR_TYPE', path: '/modules/1/elements/0/scalarType', message: 'Scalar family retained without interpretation', severity: 'warning'},
    ],
  });
  assert.deepEqual(result.registryThrow, {calls: 1, thrownIdentity: true});
  const record = {
    profile: 'umf.r8.selection-private-host-route.chromium/1',
    status: 'pass-private-frozen-values-direct-warning-source-and-null-prototypes',
    runtime: {bun: Bun.version, cargo: await run(`${toolchain}/cargo`, ['--version']), rustc: await run(`${toolchain}/rustc`, ['--version']), wasmBindgen: bindgenVersion, chromium: browser.version(), browserUserAgent: await page.evaluate(() => navigator.userAgent)},
    operation: 'executeCoreElementSelectionHostJson (private WASM export; no package-root selection)',
    cases: Object.fromEntries(Object.entries(result.outcomes).map(([name, outcome]) => [name, {equal: outcome.equal, prototype: outcome.prototype}])),
    nestedPrototypes: {allNullObjectAndArrayPrototypes: true, checkedObjects: result.allPrototypes.length},
    ownProtoData: {preserved: result.protoKeyPreserved, prototypePollution: false},
    registryThrow: result.registryThrow,
    successfulWarnings: {...result.successfulWarnings, directBaselineHost: 'Bun 1.4.3 direct TypeScript source'},
    resourceMeterControl: {host: 'Bun 1.4.3 Node addon', messageUnits: 4000001, outcome: 'LIMIT'},
    shapeFinding: 'Selection result projection recreates TypeScript copyJson null-prototype objects; own __proto__ remains data and cannot mutate the prototype.',
    browserErrors,
    artifacts: {...artifacts,
      'fresh-wasm32-artifact': sha(wasmBytes),
      'fresh-wasm-bindgen-glue': sha(Buffer.from(glueSource)),
      'bundled-browser-entry': sha(Buffer.from(entrySource)),
    },
    limits: ['Private route only; no public/default selection.', 'Seven frozen query cases, one own-__proto__ projection case, one Registry.get thrown-identity case, and one successful warning packet using a synthetic warning structure policy compared to direct TypeScript sourceValidation.', 'Resource-limit control is Node addon evidence, not a Chromium case. No semantic callbacks or installed package qualification.'],
  };
  await mkdir(resolve(receiptPath, '..'), {recursive: true});
  await writeFile(receiptPath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({receiptPath, chromium: record.runtime.chromium, cases: Object.keys(result.outcomes).length, registryThrow: result.registryThrow, prototypes: [...new Set(Object.values(record.cases).map(item => item.prototype))]}, null, 2));
} finally {
  await browser?.close();
}
