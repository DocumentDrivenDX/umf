// Replay the compact Dataset-values WASM package, extracted without repository source siblings.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const evidence = join(root, 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact');
const packageRoot = resolve(process.env.UMF_R5_WASM_PACKAGE ?? '');
if (!process.env.UMF_R5_WASM_PACKAGE) throw new Error('Set UMF_R5_WASM_PACKAGE to an extracted standalone WASM package');
if (!(await stat(join(packageRoot, 'pkg/umf_core_wasm_bg.wasm'))).isFile()) throw new Error('Extracted package has no built WASM');
const caseNames = ['commerce', 'supply-chain', 'archaeology', 'ecology', 'unknown-and-residual', 'absent-state', 'present-null', 'exact-decimal-token', 'duplicate-key', 'duplicate-locator', 'missing-links', 'parallel-links', 'structural-limit', 'work-limit'];
const load = async name => JSON.parse(await readFile(join(evidence, name), 'utf8'));
const resource = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const cases = {};
for (const name of caseNames) cases[name] = await load(`frozen-${name}.json`);
cases['forged-receipt'] = await load('frozen-forged-receipt.json');
cases['near-threshold-accepted'] = await load('frozen-near-threshold-accepted.json');
cases['near-threshold-first-refused'] = await load('frozen-near-threshold-first-refused.json');
const resources = {
  coreSchema: await resource('spec/core/schema.json'),
  referenceSchema: await resource('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await resource('spec/core/extension-package.schema.json'),
  constraints: await resource('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await resource('spec/metamodel/generated/domain-policy.json'),
};
const fixtureText = JSON.stringify({cases, resources});
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (pathname === '/fixtures.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(fixtureText); return; }
  const local = resolve(packageRoot, `.${decodeURIComponent(pathname.slice('/pkg'.length))}`);
  if (pathname.startsWith('/pkg/') && local.startsWith(`${packageRoot}${sep}`)) {
    try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; } catch { /* 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
      : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
      : JSON.stringify(value);
    const data = await fetch('/fixtures.json').then(response => response.json());
    const wasm = await import(new URL('/pkg/pkg/umf_core_wasm.js', location.href));
    const wrapper = await import(new URL('/pkg/index.js', location.href));
    if (typeof wasm.default === 'function') await wasm.default();
    const engine = await wrapper.initializeCoreModelWasm(data.resources, () => Promise.resolve(wasm), globalThis);
    const actual = {};
    for (const [name, frozen] of Object.entries(data.cases)) {
      try {
        let value;
        if (name === 'forged-receipt') value = engine.verifyCoreDatasetValuesCompact(frozen.receipt, frozen.source, frozen.input);
        else if (name.startsWith('near-threshold')) value = engine.validateCoreDatasetValuesCompact(frozen.source, frozen.input);
        else value = engine.validateCoreDatasetValuesCompact(frozen.source, frozen.input);
        actual[name] = {ok: true, value};
        const expected = name === 'forged-receipt' ? null : frozen.result;
        if (frozen.thrown || expected === null || canonical(value) !== canonical(expected)) throw Error(`${name}: expected refusal or complete output mismatch`);
        if (frozen.verify && canonical(engine.verifyCoreDatasetValuesCompact(value, frozen.source, frozen.input)) !== canonical(frozen.verify)) throw Error(`${name}: verify receipt mismatch`);
      } catch (error) {
        if (!frozen.thrown) throw error;
        actual[name] = {ok: false, error: {code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}};
        if (canonical(actual[name].error) !== canonical(frozen.thrown)) throw Error(`${name}: refusal mismatch ${canonical(actual[name].error)} != ${canonical(frozen.thrown)}`);
      }
    }
    const commerce = data.cases.commerce;
    const requireControl = (controls, code, label) => {
      try { wrapper.createCoreModelEngine(wasm, data.resources, {controls}).validateCoreDatasetValuesCompact(commerce.source, commerce.input); }
      catch (error) { if (error?.code === code) return; throw Error(`${label}: wrong control error ${error?.code}`); }
      throw Error(`${label}: control did not refuse`);
    };
    requireControl({maxWork: 0}, 'RESOURCE_LIMIT', 'zero-work');
    requireControl({isCancelled: () => true}, 'CANCELLED', 'cancel');
    requireControl({now: () => 2, deadlineMs: 1}, 'DEADLINE', 'deadline');
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals visible in Chromium');
    return {cases: Object.keys(actual).length, actual};
  });
  const {createHash} = await import('node:crypto');
  const wasmBytes = await readFile(join(packageRoot, 'pkg/umf_core_wasm_bg.wasm'));
  const wrapperBytes = await readFile(join(packageRoot, 'index.js'));
  const wasmSha256 = createHash('sha256').update(wasmBytes).digest('hex');
  const wrapperSha256 = createHash('sha256').update(wrapperBytes).digest('hex');
  const receipt = {format: 'umf.r5.dataset-values-compact.chromium/1', status: 'pass', chromium: browser.version(), target: 'standalone extracted @umf/core-rust-wasm package', packageRoot: process.env.UMF_R5_WASM_PACKAGE, wasmSha256, wrapperSha256, predecessorIndexSha256: 'f22dfc6bea1d30cdf194682465db510ead1c5d4050fdbc4c11127044c9551db7', currentSourceClosureSha256: '8352dd785230478bf0af6fc5e55ace1d49719da518aa0681bdec98be5e5248ad', cases: result.cases, controls: ['zero-work RESOURCE_LIMIT', 'cancel CANCELLED', 'deadline DEADLINE'], nodeGlobalsAbsent: true, comparison: 'JSON object-key order ignored; arrays and UTF-16 strings retained; exact frozen result/refusal values compared.'};
  const outPath = process.env.UMF_R5_WASM_BROWSER_RECEIPT;
  if (outPath) await (await import('node:fs/promises')).writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally { await browser?.close(); server.close(); }
