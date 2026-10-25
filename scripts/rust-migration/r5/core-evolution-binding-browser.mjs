// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the current 0.10 evolution predecessor against a clean extracted WASM package.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(process.env.UMF_R5_REPO_ROOT ?? new URL('../../../', import.meta.url).pathname);
const pkgRoot = resolve(process.env.UMF_R5_WASM_PACKAGE ?? '');
assert.ok(process.env.UMF_R5_WASM_PACKAGE, 'UMF_R5_WASM_PACKAGE must be the extracted candidate package');
const paths = [
  'docs/helix/04-build/evidence/rust-migration/r5-core-evolution/frozen-typescript-0.10.json',
  'spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json',
  'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json',
];
const bytes = await Promise.all(paths.map(path => readFile(resolve(root, path))));
const input = JSON.stringify({frozen: JSON.parse(bytes[0]), resources: {
  coreSchema: JSON.parse(bytes[1]), referenceSchema: JSON.parse(bytes[2]), packageSchema: JSON.parse(bytes[3]),
  constraints: JSON.parse(bytes[4]), domainPolicy: JSON.parse(bytes[5]),
}});
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html>'); return; }
  if (pathname === '/inputs.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(input); return; }
  const local = resolve(pkgRoot, decodeURIComponent(pathname.replace(/^\/package\//, '')));
  if (pathname.startsWith('/package/') && local !== pkgRoot && local.startsWith(`${pkgRoot}${sep}`)) {
    try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; }
    catch { /* 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({headless: true, timeout: 30000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    const capture = fn => { try { return {ok: true, value: fn()}; } catch (error) { return {ok: false, error: {code: error.code ?? '', message: error.message ?? String(error), path: error.path ?? ''}}; } };
    const {frozen, resources} = await fetch('/inputs.json').then(response => response.json());
    const wrapper = await import(new URL('/package/index.js', location.href));
    const wasm = await import(new URL('/package/pkg/umf_core_wasm.js', location.href));
    const api = await wrapper.initializeCoreModelWasm(resources, () => Promise.resolve(wasm), globalThis);
    const cases = Object.keys(frozen.cases);
    for (const name of cases) {
      const c = frozen.cases[name];
      const actual = capture(() => api.inspectCoreEvolution(c.before, c.after, c.policy));
      if (canonical(actual) !== canonical(frozen.outcomes[name])) throw Error(`${name} frozen outcome mismatch`);
    }
    const accepted = frozen.cases.accepted_absent_string_addition;
    const receipt = api.inspectCoreEvolution(accepted.before, accepted.after, accepted.policy);
    if (canonical(capture(() => api.verifyCoreEvolution(receipt, accepted.before, accepted.after, accepted.policy))) !== canonical({ok: true, value: receipt})) throw Error('current receipt verification mismatch');
    const forged = structuredClone(receipt); forged.complete = !forged.complete;
    const forgedResult = capture(() => api.verifyCoreEvolution(forged, accepted.before, accepted.after, accepted.policy));
    if (forgedResult.ok || forgedResult.error.code !== 'CORE_EVOLUTION_RECEIPT') throw Error('forged receipt accepted');
    let zero = '', cancelled = '', deadline = '';
    try { wrapper.createCoreModelEngine(wasm, resources, {controls: {maxWork: 0}}).inspectCoreEvolution(accepted.before, accepted.after, accepted.policy); } catch (error) { zero = error.code; }
    try { wrapper.createCoreModelEngine(wasm, resources, {controls: {isCancelled: () => true}}).inspectCoreEvolution(accepted.before, accepted.after, accepted.policy); } catch (error) { cancelled = error.code; }
    try { wrapper.createCoreModelEngine(wasm, resources, {controls: {now: () => 2, deadlineMs: 1}}).inspectCoreEvolution(accepted.before, accepted.after, accepted.policy); } catch (error) { deadline = error.code; }
    if (zero !== 'RESOURCE_LIMIT' || cancelled !== 'CANCELLED' || deadline !== 'DEADLINE') throw Error('host resource controls differ');
    return {frozenInspectionCases: cases.length, currentReceiptVerified: true, forgedReceiptRefused: forgedResult.error.code, controls: {zeroWork: zero, cancellation: cancelled, deadline}};
  });
  const receipt = {
    status: 'passed', chromium: browser.version(), wasmArchiveSha256: process.env.UMF_R5_WASM_ARCHIVE_SHA256 ?? null,
    frozenSha256: createHash('sha256').update(bytes[0]).digest('hex'),
    resourceHashes: Object.fromEntries(await Promise.all(paths.slice(1).map(async (path, index) => [path, createHash('sha256').update(bytes[index + 1]).digest('hex')]))),
    harnessSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    packageAssets: Object.fromEntries(await Promise.all([
      'index.js', 'index.d.ts', 'package.json', 'src/core-evolution.js', 'src/shared-sources.json',
      'pkg/umf_core_wasm.js', 'pkg/umf_core_wasm_bg.wasm',
    ].map(async path => [path, createHash('sha256').update(await readFile(resolve(pkgRoot, path))).digest('hex')]))),
    ...result,
  };
  const out = process.env.UMF_R5_RECEIPT_PATH;
  if (out) await writeFile(resolve(out), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally { await browser.close(); server.close(); }
