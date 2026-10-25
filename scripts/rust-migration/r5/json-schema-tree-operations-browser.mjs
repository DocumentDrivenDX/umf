// Replay the complete frozen JSON Schema tree/edit predecessor in clean WASM.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const evidence = join(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations');
const packetPath = join(evidence, 'predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const packageRoot = resolve(process.env.UMF_R5_WASM_PACKAGE ?? '');
if (!process.env.UMF_R5_WASM_PACKAGE) throw new Error('Set UMF_R5_WASM_PACKAGE to a clean extracted WASM package');
const fixtureText = JSON.stringify(packet);
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (pathname === '/fixtures.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(fixtureText); return; }
  if (pathname.startsWith('/pkg/')) {
    const local = resolve(packageRoot, `.${decodeURIComponent(pathname.slice('/pkg'.length))}`);
    if (local.startsWith(`${packageRoot}${sep}`)) {
      try { const content = await readFile(local); response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(content); return; } catch { /* continue to the 404 */ }
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
  page.on('requestfailed', request => console.error(`Browser request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', response => { if (response.status() >= 400) console.error(`Browser response ${response.status()}: ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const replay = await page.evaluate(async () => {
    const packet = await fetch('/fixtures.json').then(response => response.json());
    const wrapper = await import(new URL('/pkg/index.js', location.href));
    const api = await wrapper.initializeJsonSchemaWasm(() => import(new URL('/pkg/pkg/umf_core_wasm.js', location.href)), globalThis);
    const baseUri = 'https://schemas.example.test/tree.json';
    const defaultSchema = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"amount":{"type":"number","minimum":0},"text":{"type":"string","minLength":1}},"$defs":{"nested":{"type":"string"}}}';
    const doc = (schema, id = 'urn:umf:r5:tree') => ({umf: '0.10.0', id, vocabularies: {'umf.json-schema': {version: '0.1.0'}}, modules: [{id: 'schema', namespace: baseUri, elements: [{id: 'schema', extensions: {'umf.json-schema': {dialect: 'https://json-schema.org/draft/2020-12/schema', baseUri, root: api.parseNativeJson(schema), resources: {}}}}]}]});
    const normalize = value => JSON.parse(JSON.stringify(value));
    const actualFor = test => {
      const input = test.input ?? {};
      if (test.id.startsWith('parse.')) {
        const text = input.text ?? (input.depth ? '['.repeat(input.depth) + '0' + ']'.repeat(input.depth) : input.utf16Units ? ' '.repeat(input.utf16Units) : '[' + Array(input.arrayItems).fill('null').join(',') + ']');
        try { return {status: 'returned', value: normalize(api.parseNativeJson(text))}; }
        catch (error) { return {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message}; }
      }
      const sourceText = input.schema ?? (test.id === 'edit.incomplete-schema-refused' ? '{"$schema":"https://example.test/custom","type":"object"}' : defaultSchema);
      const id = test.id.includes('array-pointer') ? 'urn:umf:r5:tree-array' : test.id.includes('escaped-pointer') ? 'urn:umf:r5:tree-escaped' : test.id.includes('lone-surrogate') ? 'urn:umf:r5:tree-surrogate' : test.id.includes('incomplete-schema') ? 'urn:umf:r5:tree-unknown' : 'urn:umf:r5:tree';
      const original = doc(sourceText, id);
      if (test.id === 'edit.invalid-source-before-target-lookup') original.id = '';
      const before = JSON.stringify(original);
      try {
        if (test.id === 'edit.escaped-pointer-and-astral-key-success') {
          const slash = api.editJsonSchemaNode(original, input.pointers[0], input.replacement);
          const astral = api.editJsonSchemaNode(original, input.pointers[1], '"integer"');
          return {status: 'returned', value: {slashEditedSource: api.exportJsonSchema(slash), astralEditedSource: api.exportJsonSchema(astral), sourceUnchanged: JSON.stringify(original) === before}};
        }
        const edited = api.editJsonSchemaNode(original, input.pointer, input.replacement);
        if (test.id === 'edit.success.changed-number-and-source-unchanged') return {status: 'returned', value: {edited: normalize(edited), editedSource: api.exportJsonSchema(edited), sourceUnchanged: JSON.stringify(original) === before}};
        if (test.id === 'edit.lone-surrogate-schema-refused-atomically') return {status: 'returned', value: {edited: normalize(edited), sourceUnchanged: JSON.stringify(original) === before}};
        return {status: 'returned', value: normalize(edited)};
      } catch (error) {
        const thrown = {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message};
        if (test.id === 'edit.lone-surrogate-schema-refused-atomically') return {status: 'returned', value: {refusal: {name: thrown.name, code: thrown.code, path: thrown.path, message: thrown.message}, sourceUnchanged: JSON.stringify(original) === before}};
        return thrown;
      }
    };
    const actual = Object.fromEntries(packet.cases.map(test => [test.id, actualFor(test)]));
    const mismatches = packet.cases.filter(test => JSON.stringify(test.outcome) !== JSON.stringify(actual[test.id])).map(test => ({id: test.id, expected: test.outcome, actual: actual[test.id]}));
    const prototypeCase = packet.cases.find(test => test.id === 'parse.valid.utf16-prototype-and-lone-surrogate');
    const actualPrototypeMembers = actual[prototypeCase.id]?.value?.members;
    const expectedPrototypeMembers = prototypeCase.outcome?.value?.members;
    const prototypeOwnPropertyRetained = Object.hasOwn(actualPrototypeMembers, '__proto__');
    const expectedPrototypeOwnPropertyPresent = Object.hasOwn(expectedPrototypeMembers, '__proto__');
    const prototypeCaseExactMatch = JSON.stringify(prototypeCase.outcome) === JSON.stringify(actual[prototypeCase.id]);
    return {cases: packet.cases.length, matched: packet.cases.length - mismatches.length, mismatches,
      actualJson: JSON.stringify(actual), prototypeOwnPropertyRetained, expectedPrototypeOwnPropertyPresent,
      prototypeCaseExactMatch, chromium: navigator.userAgent,
      browserGlobalsClean: typeof process === 'undefined' && typeof Buffer === 'undefined'};
  });
  assert.equal(replay.matched, packet.cases.length, JSON.stringify(replay.mismatches));
  assert.equal(replay.browserGlobalsClean, true);
  assert.equal(replay.expectedPrototypeOwnPropertyPresent, true, 'frozen packet must retain its own __proto__ expectation');
  assert.equal(replay.prototypeOwnPropertyRetained, true, 'WASM parseNativeJson must retain an own __proto__ data property');
  assert.equal(replay.prototypeCaseExactMatch, true, 'WASM prototype/lone-surrogate case must match exactly');
  const actual = JSON.parse(replay.actualJson);
  const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  const sourceHashes = Object.fromEntries(await Promise.all([
    'Cargo.lock', 'bindings/core/wasm/Cargo.toml', 'bindings/core/wasm/src/lib.rs', 'bindings/core/wasm/index.js',
    'bindings/core/wasm/src/json-schema.js', 'bindings/core/wasm/src/wire.js', 'crates/umf-core-wire/src/lib.rs',
    'crates/umf-core/src/serialization.rs', 'crates/umf-core/src/json_schema_adapter.rs', 'crates/umf-core/src/json_schema_inspect.rs',
  ].map(async path => [path, await hash(join(root, path))])));
  const receipt = {format: 'umf-r5-json-schema-tree-operations-chromium-replay/1', status: 'pass', chromium: browser.version(), packageRoot, packetSha256: createHash('sha256').update(packetBytes).digest('hex'), ...replay, actual, wasmJsSha256: await hash(join(packageRoot, 'pkg/umf_core_wasm.js')), wasmSha256: await hash(join(packageRoot, 'pkg/umf_core_wasm_bg.wasm')), wrapperSha256: await hash(join(packageRoot, 'index.js')), sourceHashes};
  delete receipt.actualJson;
  if (process.env.UMF_R5_WASM_BROWSER_RECEIPT) await writeFile(process.env.UMF_R5_WASM_BROWSER_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally { await browser?.close(); server.close(); }
