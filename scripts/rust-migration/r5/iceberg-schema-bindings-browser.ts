// SPDX-License-Identifier: MIT OR Apache-2.0
// Qualify the opt-in standalone Iceberg schema WASM binding in Chromium.
import {mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root = process.cwd();
const host = '/private/tmp/umf-r5-iceberg-browser';
const pkg = join(host, 'wasm/pkg');
await mkdir(join(host, 'wasm/src'), {recursive: true});
await mkdir(pkg, {recursive: true});
const stagedFiles: [string, string][] = [
  ['bindings/core/wasm/index.js', join(host, 'wasm/index.js')],
  ['bindings/core/wasm/src/core-model.js', join(host, 'wasm/src/core-model.js')],
  ['bindings/core/node/src/wire.js', join(host, 'wasm/src/wire.js')],
  ['bindings/core/node/src/bit128.js', join(host, 'wasm/src/bit128.js')],
  ['bindings/core/node/src/javascript-numeric.js', join(host, 'wasm/src/javascript-numeric.js')],
];
for (const [source, target] of stagedFiles) await Bun.write(target, await readFile(join(root, source)));
await Bun.write(join(host, 'wasm/package.json'), '{"type":"module"}');
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm', 'umf_core_wasm.d.ts']) {
  await Bun.write(join(pkg, file), await readFile(join('/private/tmp/umf-r5-iceberg-pkg', file)));
}

const baseline = await Bun.file('docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json').json() as {
  authoredCases: {id: string; path: string; operations: any}[];
};
const fixtures: Record<string, string> = Object.fromEntries(await Promise.all(baseline.authoredCases.map(async (row) => [
  row.path,
  await readFile(join(root, row.path), 'utf8'),
])));
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (path === '/baseline.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(JSON.stringify(baseline)); return; }
  if (path === '/fixtures.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(JSON.stringify(fixtures)); return; }
  try {
    const bytes = await readFile(join(host, path));
    response.writeHead(200, {'content-type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'});
    response.end(bytes);
  } catch (error) { console.error(`404 ${path}: ${String(error)}`); response.writeHead(404); response.end('missing'); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const baseline = await fetch('/baseline.json').then(response => response.json());
    const fixtures = await fetch('/fixtures.json').then(response => response.json());
    const {initializeIcebergSchemaWasm, ICEBERG_SCHEMA_PROFILE} = await import(new URL('/wasm/index.js', location.href).href);
    const engine = await initializeIcebergSchemaWasm();
    const canonical = (value: unknown): string => value === null || typeof value !== 'object'
      ? JSON.stringify(value)
      : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
        : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
    let successes = 0;
    let refusals = 0;
    const expectRefusal = (operation: () => unknown, expected: {code: string; message: string}) => {
      try { operation(); } catch (error: unknown) {
        const failure = error as {code?: string; message?: string};
        if (failure.code === expected.code && failure.message === expected.message) return;
        throw Error(`unexpected refusal ${failure.code}: ${failure.message}`);
      }
      throw Error(`expected ${expected.code}: ${expected.message}`);
    };
    for (const row of baseline.authoredCases) {
      const imported: {status: 'ok'; value: any} | {status: 'error'; code?: string | undefined; message?: string | undefined} = (() => {
        try { return {status: 'ok', value: engine.importSchema(fixtures[row.path], row.id)}; }
        catch (error: unknown) {
          const failure = error as {code?: string; message?: string};
          return {status: 'error', code: failure.code, message: failure.message};
        }
      })();
      if (row.operations.import.status === 'error') {
        if (imported.status !== 'error' || imported.code !== row.operations.import.error.code || imported.message !== row.operations.import.error.message) throw Error(`import refusal mismatch ${row.id}`);
        refusals++;
        continue;
      }
      if (imported.status !== 'ok' || imported.value.id !== row.id) throw Error(`import mismatch ${row.id}`);
      const document = imported.value;
      if (canonical(engine.inspect(document)) !== canonical(row.operations.inspect)) throw Error(`inspection mismatch ${row.id}`);
      if (engine.exportSchema(document) !== row.operations.export.nativeJson) throw Error(`export mismatch ${row.id}`);
      const get = row.operations.get;
      if (canonical(engine.getNode(document, get.path)) !== canonical(get.value)) throw Error(`getNode mismatch ${row.id}`);
      expectRefusal(() => engine.getNode(document, '/missing'), row.operations.getMissing.error);
      const edit = row.operations.proposeEdit;
      const proposed = engine.proposeNodeEdit(document, edit.path, edit.replacement);
      if (canonical(proposed.validation) !== canonical(edit.validation)) throw Error(`edit validation mismatch ${row.id}`);
      if (engine.exportSchema(proposed.document) !== edit.export || engine.exportSchema(document) !== edit.sourceAfter) throw Error(`edit isolation mismatch ${row.id}`);
      successes++;
    }
    const source = '{"type":"struct","schema-id":0,"fields":[{"id":1,"name":"\\ud800","type":"string","required":true}]}';
    const utf16 = engine.importSchema(source, 'browser-utf16');
    const loneSurrogate = engine.getNode(utf16, '/fields/0/name').value;
    if (loneSurrogate.length !== 1 || loneSurrogate.charCodeAt(0) !== 0xd800 || !engine.exportSchema(utf16).includes('\\ud800')) throw Error('UTF-16 preservation failed');
    const validation = engine.inspect(utf16);
    if (validation.complete !== false || validation.diagnostics.map((item: {code: string}) => item.code).join(',') !== 'ICEBERG_CONTEXT_UNVERIFIED') throw Error('ordered diagnostics mismatch');
    let meter = 0;
    const metered = await initializeIcebergSchemaWasm(undefined, globalThis, {controls: {meter: (amount: number) => { meter += amount; }}});
    metered.inspect(utf16);
    if (meter <= 0) throw Error('host meter was not charged');
    let resourceCode = '';
    try { (await initializeIcebergSchemaWasm(undefined, globalThis, {controls: {maxWork: 0}})).inspect(utf16); }
    catch (error: unknown) { resourceCode = (error as {code?: string}).code ?? ''; }
    if (resourceCode !== 'RESOURCE_LIMIT') throw Error(`resource refusal was ${resourceCode}`);
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals leaked into browser');
    return {profile: ICEBERG_SCHEMA_PROFILE, authoredSuccesses: successes, authoredRefusals: refusals, utf16: 'pass', meteredWork: meter, resourceCode};
  });
  console.log(JSON.stringify({status: 'pass', browser: 'Chromium', browserVersion: browser.version(), ...result}));
} finally {
  await browser?.close();
  server.close();
}
