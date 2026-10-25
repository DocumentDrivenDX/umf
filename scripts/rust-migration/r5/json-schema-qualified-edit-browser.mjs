// Replay the narrow JSON Schema edit profile in a clean extracted WASM package.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const packetPath = join(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/qualified-edit-subset.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const packageRoot = resolve(process.env.UMF_R5_WASM_PACKAGE ?? '');
if (!process.env.UMF_R5_WASM_PACKAGE) throw new Error('Set UMF_R5_WASM_PACKAGE to a clean extracted WASM package');
const indexPath = join(packageRoot, 'index.js');
const wasmJsPath = join(packageRoot, 'pkg/umf_core_wasm.js');
const wasmPath = join(packageRoot, 'pkg/umf_core_wasm_bg.wasm');
for (const path of [indexPath, wasmJsPath, wasmPath]) await readFile(path);

const fixtureText = JSON.stringify(packet);
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (pathname === '/fixtures.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(fixtureText); return; }
  if (pathname.startsWith('/pkg/')) {
    const local = resolve(packageRoot, `.${decodeURIComponent(pathname.slice('/pkg'.length))}`);
    if (local.startsWith(`${packageRoot}${sep}`)) {
      try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; } catch { /* handled below */ }
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
  const result = await page.evaluate(async () => {
    const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
      : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
      : JSON.stringify(value);
    const packet = await fetch('/fixtures.json').then(response => response.json());
    const wrapper = await import(new URL('/pkg/index.js', location.href));
    const engine = await wrapper.initializeJsonSchemaWasm(() => import(new URL('/pkg/pkg/umf_core_wasm.js', location.href)), globalThis);
    const baseUri = 'https://schemas.example.test/qualified-edit.json';
    const outcomes = [];
    for (const test of packet.cases) {
      const source = {umf: '0.10.0', id: `urn:umf:r5:qualified:${test.id}`, vocabularies: {'umf.json-schema': {version: '0.1.0'}}, modules: [{id: 'schema', namespace: baseUri, elements: [{id: 'schema', extensions: {'umf.json-schema': {dialect: 'https://json-schema.org/draft/2020-12/schema', baseUri, root: engine.parseNativeJson(test.schema), resources: {}}}}]}]};
      const before = JSON.stringify(source);
      if (test.expectedSource) {
        const beforeInspection = engine.inspectJsonSchema(source);
        if (beforeInspection.valid !== true || beforeInspection.complete !== true) throw Error(`${test.id}: source inspection was not complete`);
        const edited = engine.editJsonSchemaNode(source, test.pointer, test.replacement);
        if (JSON.stringify(source) !== before) throw Error(`${test.id}: source mutated`);
        if (engine.exportJsonSchema(edited) !== test.expectedSource) throw Error(`${test.id}: edited source mismatch`);
        const afterInspection = engine.inspectJsonSchema(edited);
        if (afterInspection.valid !== true || afterInspection.complete !== true) throw Error(`${test.id}: edited inspection was not complete`);
        outcomes.push({id: test.id, matched: true, sourceUnchanged: true, editedSource: engine.exportJsonSchema(edited), completeBefore: true, completeAfter: true});
      } else {
        let actual;
        try { engine.editJsonSchemaNode(source, test.pointer, test.replacement); actual = {status: 'returned'}; }
        catch (error) { actual = {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message}; }
        const expected = {status: 'threw', ...test.expectedError};
        if (canonical(actual) !== canonical(expected)) throw Error(`${test.id}: refusal mismatch ${canonical(actual)} != ${canonical(expected)}`);
        if (JSON.stringify(source) !== before) throw Error(`${test.id}: source mutated`);
        outcomes.push({id: test.id, matched: true, refusal: actual, sourceUnchanged: true});
      }
    }
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals visible in Chromium');
    return {caseCount: outcomes.length, matched: outcomes.filter(item => item.matched).length, outcomes, chromium: navigator.userAgent};
  });
  const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  const sourceHashes = Object.fromEntries(await Promise.all([
    'Cargo.lock', 'bindings/core/wasm/Cargo.toml', 'bindings/core/wasm/src/lib.rs',
    'bindings/core/wasm/index.js', 'bindings/core/wasm/src/json-schema.js',
    'bindings/core/wasm/src/wire.js', 'crates/umf-core-wire/src/lib.rs',
    'crates/umf-core/src/serialization.rs', 'crates/umf-core/src/json_schema_adapter.rs',
    'crates/umf-core/src/json_schema_inspect.rs', 'crates/umf-core/src/dataset_values.rs',
  ].map(async path => [path, await hash(join(root, path))])));
  const receipt = {format: 'umf-r5-json-schema-qualified-edit-chromium/1', status: 'pass', chromium: browser.version(), target: 'clean extracted standalone WASM package', packageRoot, packetSha256: createHash('sha256').update(packetBytes).digest('hex'), build: {command: 'PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/private/tmp/umf-sdk-v4-wasm-bindgen/bin:/opt/homebrew/bin:/usr/bin:/bin CARGO_TARGET_DIR=/private/tmp/umf-r5-json-schema-tree-wasm-target CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 cargo build --locked --offline --release --target wasm32-unknown-unknown --manifest-path bindings/core/wasm/Cargo.toml; wasm-bindgen --version 0.2.100 --target web --out-dir pkg --out-name umf_core_wasm target/wasm32-unknown-unknown/release/umf_core_wasm.wasm', isolatedTarget: '/private/tmp/umf-r5-json-schema-tree-wasm-target', sourceHashes}, wasmJsSha256: await hash(wasmJsPath), wasmSha256: await hash(wasmPath), wrapperSha256: await hash(indexPath), ...result};
  if (process.env.UMF_R5_WASM_BROWSER_RECEIPT) await writeFile(process.env.UMF_R5_WASM_BROWSER_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally { await browser?.close(); server.close(); }
