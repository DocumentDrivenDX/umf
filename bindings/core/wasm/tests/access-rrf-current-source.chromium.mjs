// Replay frozen CONTRACT-074 RRF outputs through a fresh WASM module in Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {prepareRrfReplayCases} from '../../node/tests/access-rrf-replay.js';

const root = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(process.argv[2] ?? resolve(root, 'bindings/core/wasm/pkg'));
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-postgres-search-rrf-20261027/predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const cases = prepareRrfReplayCases(packet);
const wasmGlue = await readFile(resolve(packageRoot, 'umf_core_wasm.js'));
const wasmBinary = await readFile(resolve(packageRoot, 'umf_core_wasm_bg.wasm'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const modules = new Map([
  ['/fixtures.json', Buffer.from(JSON.stringify(cases))],
  ['/entry.js', Buffer.from(`
import * as wasm from '/pkg/umf_core_wasm.js';
await wasm.default('/pkg/umf_core_wasm_bg.wasm');
const [{createAccessRrfEngine},{compareRrfReplay}] = await Promise.all([
  import('/binding/index.js'), import('/tests/access-rrf-replay.js'),
]);
const cases = await fetch('/fixtures.json').then(response => response.json());
const engine = createAccessRrfEngine(wasm, {controls: {maxWork: 100000}});
window.rrfReplay = {profile: engine.profile, ...compareRrfReplay(engine, cases)};
`)],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); return response.end('<!doctype html><meta charset="utf-8"><script type="module" src="/entry.js"></script>'); }
  if (modules.has(pathname)) {
    const data = modules.get(pathname);
    response.writeHead(200, {'content-type': pathname.endsWith('.json') ? 'application/json' : 'text/javascript'});
    return response.end(data);
  }
  let file;
  if (pathname.startsWith('/pkg/')) file = resolve(packageRoot, pathname.slice('/pkg/'.length));
  else if (pathname.startsWith('/binding/')) file = resolve(root, 'bindings/core/wasm', pathname.slice('/binding/'.length));
  else if (pathname === '/tests/access-rrf-replay.js') file = resolve(root, 'bindings/core/node/tests/access-rrf-replay.js');
  if (file && (file.startsWith(root + '/') || file.startsWith(packageRoot + '/'))) {
    try {
      const data = await readFile(file);
      response.writeHead(200, {'content-type': file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.json') ? 'application/json' : 'text/javascript'});
      return response.end(data);
    } catch {}
  }
  response.writeHead(404); response.end('not found');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
const browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(() => window.rrfReplay, undefined, {timeout: 300_000});
  const result = await page.evaluate(() => window.rrfReplay);
  assert.deepEqual(pageErrors, []);
  const receipt = {
    format: 'umf-r8-access-rrf-chromium-current-source/1',
    host: 'chromium',
    browser: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    packetSha256: hash(packetBytes),
    wasmGlueSha256: hash(wasmGlue),
    wasmBinarySha256: hash(wasmBinary),
    ...result,
  };
  console.log(JSON.stringify(receipt));
  assert.equal(result.mismatches.length, 0);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
