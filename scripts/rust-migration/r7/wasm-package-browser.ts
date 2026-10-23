// Exercise the npm tarball itself in Chromium. The server exposes only the
// extracted package tree plus frozen inputs; it does not stage source siblings.
import {readFile, readdir, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dir, '../../..');
const packageRoot = process.env.UMF_R7_WASM_PACKAGE;
if (!packageRoot) throw new Error('Set UMF_R7_WASM_PACKAGE to the extracted package directory');
const pkgRoot = resolve(packageRoot);
if (!(await stat(join(pkgRoot, 'pkg/umf_core_wasm_bg.wasm'))).isFile()) throw new Error('Extracted package is missing its built WASM');

const resources = Object.fromEntries(await Promise.all(([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
] as const).map(async ([key, path]) => [key, JSON.parse(await readFile(join(root, path), 'utf8'))] as const)));
const inputs = JSON.stringify({
  resources,
  bit128: JSON.parse(await readFile(join(root, 'fixtures/validation/uuid/bit128-oracle.json'), 'utf8')),
  field: JSON.parse(await readFile(join(root, 'docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json'), 'utf8')),
});

const mime = (path: string) => path.endsWith('.wasm') ? 'application/wasm'
  : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (path === '/inputs.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(inputs); return; }
  const local = resolve(pkgRoot, `.${decodeURIComponent(path.slice('/package'.length))}`);
  if (path.startsWith('/package/') && (local === pkgRoot || local.startsWith(`${pkgRoot}${sep}`))) {
    try {
      const bytes = await readFile(local);
      response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'});
      response.end(bytes);
      return;
    } catch { /* use 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const wrapper = await import(new URL('/package/index.js', location.href).href);
    const wasm = await import(new URL('/package/pkg/umf_core_wasm.js', location.href).href);
    if (typeof wasm.default === 'function') await wasm.default();
    const {resources, bit128, field} = await fetch('/inputs.json').then(response => response.json());
    const base = wrapper.createEngine(wasm);
    const sample = Object.assign(Object.create(null), {z: 1, a: [true, null, 'x']});
    const copied = base.copyJson(sample);
    const canonical = (value: any): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
      : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
      : JSON.stringify(value);
    if (Object.getPrototypeOf(copied) !== null || canonical(copied) !== canonical({z: 1, a: [true, null, 'x']})) throw Error('Core copyJson mismatch');
    const serialized = base.writeJsonValue(base.readJsonValue('{"core":true,"n":3}'));
    if (canonical(JSON.parse(serialized)) !== canonical({core: true, n: 3})) throw Error('Core JSON round trip mismatch');

    const codec = wrapper.createBit128Engine(wasm);
    for (const row of bit128.cases) {
      const value = codec.parseBits128(row.hex.toUpperCase());
      if (value.hex !== row.hex || codec.parseUuid(row.uuid).canonicalText !== row.uuid) throw Error('Bit128 parse mismatch');
      if (codec.uuidFromBits128(value).canonicalText !== row.uuid || codec.uuidToBits128(codec.uuidFromBits128(value)).hex !== row.hex) throw Error('Bit128 UUID mismatch');
      if (codec.bits128ToInteger(value, false).integerToken !== row.integer || codec.bits128ToInteger(value, true).integerToken !== row.signedInteger) throw Error('Bit128 integer mismatch');
      if (codec.bits128ToWords(value, false).high !== row.unsigned.high || codec.bits128ToWords(value, false).low !== row.unsigned.low) throw Error('Bit128 words mismatch');
      const bytes = codec.bits128ToBytes(value);
      if (bytes.byteLength !== 16 || codec.bits128FromBytes(bytes).hex !== row.hex) throw Error('Bit128 bytes mismatch');
      if (codec.bits128FromInteger({integerToken: row.integer}, false).hex !== row.hex || codec.bits128FromWords(row.signed, true).hex !== row.hex) throw Error('Bit128 inverse mismatch');
    }
    let getterReads = 0;
    const hostile = {profile: 'umf-128/1', get hex() { getterReads++; return '0'.repeat(32); }};
    try { codec.bits128ToBytes(hostile); throw Error('Bit128 accessor accepted'); } catch (error: any) { if (getterReads !== 0 || error.message === 'Bit128 accessor accepted') throw error; }
    let bitWork = 0;
    const metered = wrapper.createBit128Engine(wasm, {controls: {meter: (amount: number) => bitWork += amount}});
    metered.parseBits128(bit128.cases[0].hex);
    let bitCancellation = '';
    try { wrapper.createBit128Engine(wasm, {controls: {isCancelled: () => true}}).parseBits128(bit128.cases[0].hex); }
    catch (error: any) { bitCancellation = error.code ?? ''; }
    if (bitCancellation !== 'CANCELLED') throw Error('Bit128 cancellation mismatch');

    const engine = await wrapper.initializeCoreModelWasm(resources, () => Promise.resolve(wasm), globalThis);
    const capture = (run: () => unknown) => { try { return {result: run()}; } catch (error: any) { return {thrown: {name: error.name, message: error.message}, error}; } };
    for (const row of field.cases) {
      const captured: any = capture(() => engine.validateCoreFieldValue(row.source ?? field.source, row.identity, row.value));
      if (row.thrown && !(captured.error instanceof TypeError)) throw Error(`${row.id} was not a native TypeError`);
      const actual = captured.result === undefined ? {thrown: captured.thrown} : {result: captured.result};
      const expected = row.result ? {result: row.result} : {thrown: row.thrown};
      if (canonical(actual) !== canonical(expected)) throw Error(`${row.id} mismatch`);
    }
    let fieldWork = 0;
    wrapper.createCoreModelEngine(wasm, resources, {controls: {meter: (amount: number) => fieldWork += amount}})
      .validateCoreFieldValue(field.cases[0].source ?? field.source, field.cases[0].identity, field.cases[0].value);
    let fieldCancellation = '';
    try {
      wrapper.createCoreModelEngine(wasm, resources, {controls: {isCancelled: () => true}})
        .validateCoreFieldValue(field.cases[0].source ?? field.source, field.cases[0].identity, field.cases[0].value);
    } catch (error: any) { fieldCancellation = error.code ?? ''; }
    if (fieldCancellation !== 'CANCELLED') throw Error('Field-value cancellation mismatch');
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals leaked into Chromium');
    return {
      core: {copyJson: 'pass', jsonRoundTrip: 'pass'},
      bit128: {vectors: bit128.cases.length, accessorReads: getterReads, meteredWork: bitWork, cancellation: bitCancellation},
      fieldValue: {cases: field.cases.length, nativeTypeErrors: field.cases.filter((row: any) => row.thrown).length, meteredWork: fieldWork, cancellation: fieldCancellation},
      nodeGlobalsAbsent: true,
    };
  });
  console.log(JSON.stringify({status: 'pass', packageRoot: pkgRoot, browser: browser.version(), ...result}));
} finally {
  await browser?.close();
  server.close();
}
