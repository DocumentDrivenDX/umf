import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../../');
const evidence = join(root, 'docs/helix/04-build/evidence/rust-migration/r8-native-yaml');
const packetBytes = await readFile(join(evidence, 'predecessor.json'));
const packet = JSON.parse(packetBytes);
const packageRoot = resolve(process.env.UMF_R8_NATIVE_YAML_WASM_PACKAGE ?? '');
if (!process.env.UMF_R8_NATIVE_YAML_WASM_PACKAGE) throw new Error('UMF_R8_NATIVE_YAML_WASM_PACKAGE is required');
const fixtureText = JSON.stringify(packet);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (pathname === '/fixtures.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(fixtureText); return; }
  if (pathname.startsWith('/pkg/')) {
    const local = resolve(packageRoot, `.${decodeURIComponent(pathname.slice('/pkg'.length))}`);
    if (local.startsWith(`${packageRoot}${sep}`)) {
      try {
        const content = await readFile(local);
        const type = local.endsWith('.wasm') ? 'application/wasm' : local.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
        response.writeHead(200, {'content-type': type, 'cache-control': 'no-store'}); response.end(content); return;
      } catch { /* send the bounded 404 below */ }
    }
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
  const replay = await page.evaluate(async () => {
    const packet = await fetch('/fixtures.json').then(response => response.json());
    const wrapper = await import(new URL('/pkg/index.js', location.href));
    const api = await wrapper.initializeJsonSchemaWasm(() => import(new URL('/pkg/pkg/umf_core_wasm.js', location.href)), globalThis);
    let cases = 0, returned = 0, threw = 0;
    const messageMismatches = [];
    for (const test of packet.cases) {
      if (test.options) continue;
      cases++;
      if (test.outcome === 'return') {
        const actual = api.parseNativeYaml(test.source);
        if (JSON.stringify(actual) !== JSON.stringify(test.tree)) throw new Error(`tree mismatch: ${test.id}`);
        returned++;
      } else {
        let error;
        try { api.parseNativeYaml(test.source); } catch (caught) { error = caught; }
        if (!error) throw new Error(`expected predecessor error: ${test.id}`);
        if (error.code !== test.code) throw new Error(`error code mismatch: ${test.id}: ${error.code} != ${test.code}`);
        if (error.message !== test.message) messageMismatches.push({id: test.id, expected: test.message, actual: error.message});
        threw++;
      }
    }
    const rawSurrogateSource = `value: "${String.fromCharCode(0xd800)}"`;
    const surrogate = api.parseNativeYaml(rawSurrogateSource).members.value.value;
    return {cases, returned, threw, exactMessageMismatches: messageMismatches.length, messageMismatches, loneSurrogateUtf16Unit: surrogate.length === 1 && surrogate.charCodeAt(0) === 0xd800, chromium: navigator.userAgent, browserGlobalsClean: typeof process === 'undefined' && typeof Buffer === 'undefined'};
  });
  assert.equal(replay.cases, 24);
  assert.equal(replay.returned, 12);
  assert.equal(replay.threw, 12);
  assert.equal(replay.loneSurrogateUtf16Unit, true);
  assert.equal(replay.browserGlobalsClean, true);
  const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  const receipt = {profile: 'umf-r8-native-yaml-wasm-chromium/0.1.0', status: 'pass', browserVersion: browser.version(), packageRoot, packetSha256: createHash('sha256').update(packetBytes).digest('hex'), ...replay, wasmJsSha256: await hash(join(packageRoot, 'pkg/umf_core_wasm.js')), wasmSha256: await hash(join(packageRoot, 'pkg/umf_core_wasm_bg.wasm'))};
  if (process.env.UMF_R8_NATIVE_YAML_WASM_RECEIPT) await writeFile(process.env.UMF_R8_NATIVE_YAML_WASM_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally { await browser?.close(); server.close(); }
