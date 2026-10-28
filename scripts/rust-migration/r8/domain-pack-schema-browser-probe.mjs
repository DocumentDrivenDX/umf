// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounded opt-in browser probe for the Rust-owned CONTRACT-052 schema resource.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const wasmDir = process.argv[2];
if (!wasmDir) throw new Error('usage: node domain-pack-schema-browser-probe.mjs WASM_BINDGEN_DIR');
const repo = path.resolve(import.meta.dirname, '../../..');
const files = {
  '/schema.json': [path.join(repo, 'spec/extensions/domain-pack/schema.json'), 'application/json'],
  '/umf_core_wasm.js': [path.join(wasmDir, 'umf_core_wasm.js'), 'text/javascript'],
  '/umf_core_wasm_bg.wasm': [path.join(wasmDir, 'umf_core_wasm_bg.wasm'), 'application/wasm'],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digests = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, [file]]) => [name, hash(await readFile(file))])));
const server = createServer(async (request, response) => {
  const route = new URL(request.url, 'http://localhost').pathname;
  const entry = files[route];
  if (!entry) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {'content-type': entry[1]});
  response.end(await readFile(entry[0]));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/schema.json`);
  const result = await page.evaluate(async () => {
    const wasm = await import('/umf_core_wasm.js');
    await wasm.default('/umf_core_wasm_bg.wasm');
    const expectedText = await fetch('/schema.json').then(response => response.text());
    const expected = JSON.parse(expectedText);
    const rawSchema = wasm.domainPackSchemaJson('1.0.0');
    const rawBytesEqual = rawSchema === expectedText;
    const first = JSON.parse(rawSchema);
    const equal = JSON.stringify(first) === JSON.stringify(expected);
    first.properties.id.type = 'integer';
    const isolated = JSON.stringify(JSON.parse(wasm.domainPackSchemaJson('1.0.0'))) === JSON.stringify(expected);
    let refused = false;
    try { wasm.domainPackSchemaJson('2.0.0'); }
    catch (error) { refused = String(error).includes('DOMAIN_PACK_SCHEMA_VERSION'); }
    return {equal, isolated, refused, rawBytesEqual, nodeGlobalsAbsent: typeof process === 'undefined' && typeof require === 'undefined'};
  });
  assert.deepEqual(result, {equal: true, isolated: true, refused: true, rawBytesEqual: true, nodeGlobalsAbsent: true});
  console.log(JSON.stringify({status: 'pass', chromium: browser.version(), digests, result}));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
