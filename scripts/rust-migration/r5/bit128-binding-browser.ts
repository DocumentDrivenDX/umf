// SPDX-License-Identifier: MIT OR Apache-2.0
// Qualify the opt-in bit128 WASM adapter in real Chromium.
import {mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root = process.cwd();
const host = '/private/tmp/umf-r5-bit128-browser';
const pkg = join(host, 'wasm/pkg');
await mkdir(join(host, 'wasm/src'), {recursive: true});
await mkdir(join(host, 'node/src'), {recursive: true});
await mkdir(pkg, {recursive: true});
const stagedFiles: [string, string][] = [
  ['bindings/core/wasm/index.js', join(host, 'wasm/index.js')],
  ['bindings/core/wasm/src/core-model.js', join(host, 'wasm/src/core-model.js')],
  ['bindings/core/node/src/wire.js', join(host, 'node/src/wire.js')],
  ['bindings/core/node/src/bit128.js', join(host, 'node/src/bit128.js')],
  ['bindings/core/node/src/javascript-numeric.js', join(host, 'node/src/javascript-numeric.js')],
];
for (const [source, target] of stagedFiles) await Bun.write(target, await readFile(join(root, source)));
await Bun.write(join(host, 'wasm/package.json'), '{"type":"module"}');
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm', 'umf_core_wasm.d.ts']) {
  await Bun.write(join(pkg, file), await readFile(join('/private/tmp/umf-r5-bit128-wasm/pkg', file)));
}
const fixture = await Bun.file('fixtures/validation/uuid/bit128-oracle.json').json();
const vectors = JSON.stringify(fixture);
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (path === '/vectors.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(vectors); return; }
  try {
    const bytes = await readFile(join(host, path));
    response.writeHead(200, {'content-type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'});
    response.end(bytes);
  } catch (error) { console.error(`404 ${path}: ${String(error)}`); response.writeHead(404); response.end('missing'); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const {initializeBit128Wasm} = await import(new URL('/wasm/index.js', location.href).href);
    const vectors = await fetch('/vectors.json').then(response => response.json());
    const wasm = await import(new URL('/wasm/pkg/umf_core_wasm.js', location.href).href);
    const codec = await initializeBit128Wasm(() => Promise.resolve(wasm), globalThis);
    for (const row of vectors.cases) {
      const value = codec.parseBits128(row.hex.toUpperCase());
      if (value.hex !== row.hex || codec.parseUuid(row.uuid).canonicalText !== row.uuid) throw Error('parse mismatch');
      if (codec.uuidFromBits128(value).canonicalText !== row.uuid || codec.uuidToBits128(codec.uuidFromBits128(value)).hex !== row.hex) throw Error('UUID mismatch');
      if (codec.bits128ToInteger(value, false).integerToken !== row.integer || codec.bits128ToInteger(value, true).integerToken !== row.signedInteger) throw Error('integer mismatch');
      if (codec.bits128ToWords(value, false).high !== row.unsigned.high || codec.bits128ToWords(value, false).low !== row.unsigned.low) throw Error('word mismatch');
      const bytes = codec.bits128ToBytes(value);
      if (bytes.byteLength !== 16 || codec.bits128FromBytes(bytes).hex !== row.hex) throw Error('byte mismatch');
      if (codec.bits128FromInteger({integerToken: row.integer}, false).hex !== row.hex || codec.bits128FromWords(row.signed, true).hex !== row.hex) throw Error('inverse mismatch');
    }
    let reads = 0;
    const hostile = {profile: 'umf-128/1', get hex() { reads++; return '0'.repeat(32); }};
    let rejected = false;
    try { codec.bits128ToBytes(hostile as any); } catch { rejected = true; }
    if (!rejected || reads !== 0) throw Error('accessor was invoked or admitted');
    const expectFailure = (operation: () => unknown, code: string, message: string) => {
      try { operation(); } catch (error: any) {
        if (error.code === code && error.message === message) return;
        throw Error(`unexpected refusal ${error.code}: ${error.message}`);
      }
      throw Error(`expected ${code}: ${message}`);
    };
    expectFailure(() => codec.bits128ToBytes({profile: 'umf-128/1', hex: 1n} as any), 'BIT128_VALUE', 'Noncanonical bit snapshot');
    expectFailure(() => codec.bits128ToBytes({profile: 'other', hex: 1n} as any), 'BIT128_VALUE', 'Unknown bit profile');
    const oversized = 'x'.repeat(100_000);
    const zeroHex = '0'.repeat(32);
    const zeroUuid = '00000000-0000-0000-0000-000000000000';
    expectFailure(() => codec.bits128ToBytes({profile: 'umf-128/1', hex: oversized} as any), 'BIT128_VALUE', 'Noncanonical bit snapshot');
    expectFailure(() => codec.bits128ToBytes({profile: 'other', hex: oversized} as any), 'BIT128_VALUE', 'Unknown bit profile');
    expectFailure(() => codec.bits128ToBytes({profile: oversized, hex: zeroHex} as any), 'BIT128_VALUE', 'Unknown bit profile');
    expectFailure(() => codec.uuidToBits128({profile: 'umf-128/1', hex: zeroHex, canonicalText: zeroUuid, originalText: oversized} as any), 'BIT128_VALUE', 'Invalid original UUID text in snapshot');
    expectFailure(() => codec.uuidToBits128({profile: oversized, hex: zeroHex, canonicalText: zeroUuid, originalText: zeroUuid} as any), 'BIT128_VALUE', 'Inconsistent UUID snapshot');
    expectFailure(() => codec.uuidToBits128({profile: 'umf-128/1', hex: oversized, canonicalText: zeroUuid, originalText: zeroUuid} as any), 'BIT128_VALUE', 'Inconsistent UUID snapshot');
    expectFailure(() => codec.uuidToBits128({profile: 'umf-128/1', hex: zeroHex, canonicalText: oversized, originalText: zeroUuid} as any), 'BIT128_VALUE', 'Inconsistent UUID snapshot');
    const profileAccessorExtra = {get profile() { reads++; return 'umf-128/1'; }, hex: '0'.repeat(32), extra: true};
    expectFailure(() => codec.bits128ToBytes(profileAccessorExtra as any), 'BIT128_VALUE', 'Invalid bit value snapshot');
    const uuidAccessorExtra = {profile: 'umf-128/1', hex: '0'.repeat(32), canonicalText: '00000000-0000-0000-0000-000000000000', get originalText() { reads++; return '00000000-0000-0000-0000-000000000000'; }, extra: true};
    expectFailure(() => codec.uuidToBits128(uuidAccessorExtra as any), 'BIT128_VALUE', 'Invalid UUID snapshot');
    for (const token of [undefined, 1n, Symbol('x'), () => '1']) {
      expectFailure(() => codec.bits128FromInteger({integerToken: token} as any, false), 'BIT128_TYPE', 'Expected integer token text');
    }
    const integerAccessorExtra = {get integerToken() { reads++; return '1'; }, extra: true};
    expectFailure(() => codec.bits128FromInteger(integerAccessorExtra as any, false), 'BIT128_TYPE', 'Expected one integerToken');
    if (reads !== 0) throw Error('snapshot accessors were invoked');
    const carrier = new (class extends Uint8Array {})(new Uint8Array(16));
    Object.defineProperty(carrier, Symbol('ignored carrier metadata'), {get() { reads++; }});
    if (codec.bits128FromBytes(carrier).hex !== '0'.repeat(32) || reads !== 0) throw Error('typed array view metadata changed carrier admission');
    let budgetCode = '';
    try {
      const denied = await initializeBit128Wasm(() => Promise.resolve(wasm), globalThis, {controls: {maxWork: 0}});
      denied.parseBits128('0'.repeat(32));
    } catch (error: any) { budgetCode = error.code; }
    if (budgetCode !== 'RESOURCE_LIMIT') throw Error(`resource refusal was ${budgetCode}`);
    let work = 0;
    const limited = await initializeBit128Wasm(() => Promise.resolve(wasm), globalThis, {controls: {meter: (n: number) => { work += n; }}});
    limited.parseBits128('0'.repeat(32));
    if (work !== 1507) throw Error(`host meter charged ${work}`);
    const repeatBudget = await initializeBit128Wasm(() => Promise.resolve(wasm), globalThis, {controls: {maxWork: 1507}});
    repeatBudget.parseBits128('0'.repeat(32));
    repeatBudget.parseBits128('0'.repeat(32));
    return {cases: vectors.cases.length, accessorReads: reads, budgetCode, meteredWork: work, repeatBudget: 'pass'};
  });
  console.log(JSON.stringify({status: 'pass', browser: 'Chromium', browserVersion: browser.version(), ...result}));
} finally {
  await browser?.close();
  server.close();
}
