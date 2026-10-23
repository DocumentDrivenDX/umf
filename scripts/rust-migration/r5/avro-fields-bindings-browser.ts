// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium replay for the opt-in R5 Avro field metadata WASM binding.
import {mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root = process.cwd();
const host = '/private/tmp/umf-r5-avro-fields-browser';
const pkg = join(host, 'wasm/pkg');
const pkgSource = process.env.UMF_WASM_PKG_DIR ?? '/private/tmp/umf-r5-avro-fields-wasm-pkg';
await mkdir(pkg, {recursive: true});
const stagedFiles: [string, string][] = [
  ['bindings/core/wasm/index.js', join(host, 'wasm/index.js')],
  ['bindings/core/wasm/src/core-model.js', join(host, 'wasm/src/core-model.js')],
  ['bindings/core/node/src/wire.js', join(host, 'wasm/src/wire.js')],
  ['bindings/core/node/src/bit128.js', join(host, 'wasm/src/bit128.js')],
  ['bindings/core/node/src/javascript-numeric.js', join(host, 'wasm/src/javascript-numeric.js')],
];
for (const [source, target] of stagedFiles) {
  await mkdir(join(target, '..'), {recursive: true});
  await Bun.write(target, await readFile(join(root, source)));
}
await Bun.write(join(host, 'wasm/package.json'), '{"type":"module"}');
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm', 'umf_core_wasm.d.ts']) await Bun.write(join(pkg, file), await readFile(join(pkgSource, file)));
const packet = JSON.parse(await readFile(join(root, 'docs/helix/04-build/evidence/rust-migration/r5-avro-fields/predecessor.json'), 'utf8'));
await Bun.write(join(host, 'packet.json'), JSON.stringify(packet));
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  try { const bytes = await readFile(join(host, path)); response.writeHead(200, {'content-type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.json') ? 'application/json' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}); response.end(bytes); }
  catch { response.writeHead(404); response.end('missing'); }
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
    const packet = await fetch('/packet.json').then(response => response.json());
    const {initializeAvroFieldsWasm, AVRO_FIELDS_PROFILE} = await import(new URL('/wasm/index.js', location.href).href);
    const canonical = (value: any): string => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    const engine = await initializeAvroFieldsWasm();
    let total = 0;
    for (const row of packet.cases) {
      const actual = engine.deriveAvroFields(row.payload.root, row.payload.dependencies ?? []);
      if (canonical(actual) !== canonical(row.fields)) throw Error(`predecessor mismatch: ${row.label}`);
      total += actual.length;
    }
    if (total !== 294 || AVRO_FIELDS_PROFILE !== 'umf-r5-avro-fields/0.1.0') throw Error('profile or field count mismatch');
    const limited = await (async () => { try { (await import(new URL('/wasm/index.js', location.href).href)).createAvroFieldsEngine(await import(new URL('/wasm/pkg/umf_core_wasm.js', location.href).href), {controls: {maxWork: 0}}).deriveAvroFields(packet.cases[0].payload.root); return ''; } catch (error: any) { return error.code; } })();
    const cancelled = await (async () => { try { const module = await import(new URL('/wasm/pkg/umf_core_wasm.js', location.href).href); (await import(new URL('/wasm/index.js', location.href).href)).createAvroFieldsEngine(module, {controls: {isCancelled: () => true}}).deriveAvroFields(packet.cases[0].payload.root); return ''; } catch (error: any) { return error.code; } })();
    if (limited !== 'RESOURCE_LIMIT' || cancelled !== 'CANCELLED') throw Error('cooperative control mismatch');
    const unknown = packet.cases.find((row: any) => row.label === 'adversarial-unknown-annotation-default-and-unusual-key');
    if (unknown && canonical(engine.deriveAvroFields(unknown.payload.root)) !== canonical(unknown.fields)) throw Error('unknown content mismatch');
    return {profile: AVRO_FIELDS_PROFILE, cases: packet.cases.length, fields: total, unknownAndOrdering: true, controls: {limited, cancelled}};
  });
  await Bun.write('/private/tmp/umf-r5-avro-fields-chromium-result.json', JSON.stringify({status: 'pass', chromium: browser.version(), ...result}, null, 2) + '\n');
  console.log(JSON.stringify({status: 'pass', chromium: browser.version(), ...result}));
} finally { await browser?.close(); server.close(); }
