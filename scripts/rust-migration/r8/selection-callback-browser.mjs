// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh private Selection WASM callback route replay in real Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = process.env.UMF_WASM_BINDGEN ?? '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const target = '/private/tmp/umf-r8-selection-callback-wasm-target';
const output = '/private/tmp/umf-r8-selection-callback-browser';
const wasmOut = `${output}/wasm`;
const receiptPath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-selection-callback-trace/chromium.json');
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
const bundle = await Bun.build({entrypoints: ['scripts/rust-migration/r8/selection-callback-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!bundle.success) throw new Error(bundle.logs.map(item => item.message).join('\n'));

const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([key, path]) => [key, await json(path)])));
const wasmBytes = await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`);
const glueBytes = await readFile(`${wasmOut}/umf_core_wasm.js`);
const entryBytes = await readFile(`${output}/selection-callback-browser-entry.js`);
const browserErrors = [];
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => browserErrors.push(String(error)));
  await page.goto('about:blank');
  const result = await page.evaluate(async ({glueSource, wasmBase64, entrySource, resources}) => {
    const wasm = Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0));
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const module = await import(glueUrl);
    await module.default(wasm);
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    const entry = await import(entryUrl);
    return entry.runSelectionCallbackBrowser(module, {resources});
  }, {glueSource: glueBytes.toString('utf8'), wasmBase64: wasmBytes.toString('base64'), entrySource: entryBytes.toString('utf8'), resources});
  assert.deepEqual(browserErrors, []);
  assert.equal(result.caseCount, 30);
  assert.equal(result.opaqueReturnIdentity, true, 'WASM opaque return carrier must preserve object identity');
  assert.equal(result.opaqueThrowIdentity, true, 'WASM opaque return carrier must preserve thrown identity');
  assert.equal(result.summary.exactOutcomeMatches, result.caseCount, JSON.stringify(result.summary.mismatches));
  assert.equal(result.summary.exactHostTraceMatches, result.caseCount, JSON.stringify(result.summary.mismatches));
  const sourcePaths = [
    'src/validation/constraint-kernel.ts', 'src/model/selection.ts', 'src/model/json.ts',
    'crates/umf-core/src/constraints.rs', 'crates/umf-core/src/engine.rs',
    'crates/umf-core/src/host_json.rs', 'crates/umf-core/src/registry.rs',
    'crates/umf-core/src/selection_diagnostics.rs', 'crates/umf-core/src/selection_host_json.rs',
    'bindings/core/node/src/host-json.js', 'bindings/core/node/src/host_json.rs',
    'src/access/rust-selection-default.ts',
    'bindings/core/wasm/src/host-json.js', 'bindings/core/wasm/src/host_json.rs',
    'bindings/core/node/tests/selection-host-json.test.js',
    'scripts/rust-migration/r8/selection-callback-suite.mjs',
    'scripts/rust-migration/r8/selection-callback-node.mjs',
    'scripts/rust-migration/r8/selection-callback-browser-entry.ts',
    'scripts/rust-migration/r8/selection-callback-browser.mjs',
    'dist/umf.js', 'dist/umf-node.js',
    'scripts/rust-migration/r5/selection/input.json',
    'scripts/rust-migration/r5/selection/frozen-typescript.json',
    'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
    'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
    'spec/metamodel/generated/domain-policy.json',
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha(await read(path))])));
  const record = {
    profile: 'umf.r8.selection-semantic-callback.private.chromium/1',
    status: 'pass-private-same-browser-direct-typescript-30-case-outcomes-and-host-traces',
    runtime: {bun: Bun.version, cargo: await run(`${toolchain}/cargo`, ['--version']), rustc: await run(`${toolchain}/rustc`, ['--version']), wasmBindgen: bindgenVersion, chromium: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent)},
    operation: 'executeCoreElementSelectionHostJson (private WASM export; package-root selection unchanged)',
    reference: 'dist/umf.js TypeScript Selection implementation, imported in the same Chromium page and run against the same registry setup',
    caseCount: result.caseCount,
    summary: result.summary,
    artifacts: {sourceHashes, wasmSha256: sha(wasmBytes), wasmGlueSha256: sha(glueBytes), browserEntryBundleSha256: sha(entryBytes)},
    browserErrors,
    limits: [
      'Private opt-in Selection host route only; no default/root route or release qualification.',
      'Covers bounded callback invocation, order, receiver/context prototypes, iterable callback diagnostics, emit field order, malformed/null/undefined/primitive results, thrown conversion, severity short-circuit and source-validation materialization.',
      'Spread coverage includes undefined return, non-callable Symbol.iterator, a throwing Symbol.iterator getter, primitive iterator returns, non-callable iterator.next values, primitive iterator-step results, and next/done/value abrupt completions for the recorded cases; other native spread failures, kindRuntime and default routing remain unqualified.',
      'Resource-limit precedence is unqualified: native-error materialization adds charged work after the original iterator reads and may differ at resource boundaries.',
      'Pins the browser/reference bundles and live source files listed in artifacts; this is not a whole SDK archive/source-closure qualification.',
    ],
  };
  await mkdir(resolve(receiptPath, '..'), {recursive: true});
  await writeFile(receiptPath, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({status: record.status, receiptPath, chromium: record.runtime.chromium, caseCount: result.caseCount, sourceCount: sourcePaths.length, wasmSha256: record.artifacts.wasmSha256}, null, 2));
} finally {
  await browser?.close();
}
