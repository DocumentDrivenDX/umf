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
  frozenComparison: JSON.parse(await readFile(join(root, 'docs/helix/04-build/evidence/rust-migration/r7-schema-comparison/predecessor-cases.json'), 'utf8')),
});

const mime = (path: string) => path.endsWith('.wasm') ? 'application/wasm'
  : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
let missingWasmRequests = 0;
let invalidWasmRequests = 0;
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (path === '/inputs.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(inputs); return; }
  const variant = path.startsWith('/missing/package/') ? 'missing' : path.startsWith('/invalid/package/') ? 'invalid' : '';
  const packagePath = variant ? path.slice(`/${variant}`.length) : path;
  if (variant && packagePath.endsWith('/pkg/umf_core_wasm_bg.wasm')) {
    if (variant === 'missing') { missingWasmRequests++; response.writeHead(404); response.end('missing WASM asset'); return; }
    invalidWasmRequests++;
    response.writeHead(200, {'content-type': 'application/wasm', 'cache-control': 'no-store'});
    response.end(new Uint8Array([0, 1, 2]));
    return;
  }
  const local = resolve(pkgRoot, `.${decodeURIComponent(packagePath.slice('/package'.length))}`);
  if (packagePath.startsWith('/package/') && (local === pkgRoot || local.startsWith(`${pkgRoot}${sep}`))) {
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
  console.error('R7 browser: launch Chromium');
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  console.error('R7 browser: navigate');
  await page.goto(`http://127.0.0.1:${address.port}/`, {timeout: 15_000});
  console.error('R7 browser: execute matrix');
  const result = await Promise.race([page.evaluate(async () => {
    const wrapper = await import(new URL('/package/index.js', location.href).href);
    const wasm = await import(new URL('/package/pkg/umf_core_wasm.js', location.href).href);
    if (typeof wasm.default === 'function') await wasm.default();
    const {resources, bit128, field, frozenComparison} = await fetch('/inputs.json').then(response => response.json());
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
    const comparison = wrapper.createDocumentComparisonEngine(wasm, {snapshot: (value: any) => structuredClone(value)});
    for (const row of frozenComparison.cases) {
      const actual = comparison.compareDocuments(row.before, row.after);
      if (JSON.stringify(actual) !== JSON.stringify(row.expected)) throw Error(`Frozen comparison mismatch: ${row.id}`);
    }
    const diff = comparison.compareDocuments(JSON.parse('{"z":1,"a":"before"}'), JSON.parse('{"z":2,"a":"after"}'));
    if (JSON.stringify(diff) !== JSON.stringify([
      {path: '/z', status: 'changed', before: 1, after: 2},
      {path: '/a', status: 'changed', before: 'before', after: 'after'},
    ])) throw Error('WASM document-comparison mismatch');
    let comparisonCancellation = '';
    try { wrapper.createDocumentComparisonEngine(wasm, {snapshot: (value: any) => structuredClone(value), controls: {isCancelled: () => true}}).compareDocuments(null, true); }
    catch (error: any) { comparisonCancellation = error.code ?? ''; }
    if (comparisonCancellation !== 'CANCELLED') throw Error('WASM document-comparison cancellation mismatch');
    const nulJoinedOrder = comparison.compareDocuments(
      [{id: 'a', value: 'first'}, {id: 'a\u0000a', value: 'second'}],
      [{id: 'a\u0000a', value: 'second'}, {id: 'a', value: 'first'}],
    );
    if (JSON.stringify(nulJoinedOrder) !== '[]') throw Error('WASM predecessor NUL-join collision mismatch');
    let comparisonWork = 0;
    wrapper.createDocumentComparisonEngine(wasm, {
      snapshot: (value: any) => structuredClone(value), controls: {meter: (amount: number) => comparisonWork += amount},
    }).compareDocuments({x: 1}, {x: 2});
    const budgetedComparison = wrapper.createDocumentComparisonEngine(wasm, {
      snapshot: (value: any) => structuredClone(value), controls: {maxWork: comparisonWork},
    });
    budgetedComparison.compareDocuments({x: 1}, {x: 2});
    budgetedComparison.compareDocuments({x: 1}, {x: 2});
    let comparisonCancelledOnce = true;
    const recoveringComparison = wrapper.createDocumentComparisonEngine(wasm, {
      snapshot: (value: any) => structuredClone(value),
      controls: {maxWork: comparisonWork * 3, isCancelled: () => { if (comparisonCancelledOnce) { comparisonCancelledOnce = false; return true; } return false; }},
    });
    let recoveredAfterCancellation = false;
    try { recoveringComparison.compareDocuments({x: 1}, {x: 2}); }
    catch (error: any) { if (error.code !== 'CANCELLED') throw error; }
    recoveredAfterCancellation = recoveringComparison.compareDocuments({x: 1}, {x: 2}).length === 1;
    if (!recoveredAfterCancellation) throw Error('WASM comparison did not recover after cancellation refusal');
    let comparisonWorkRefusal = '';
    const comparisonBudget = {maxWork: comparisonWork};
    const budgetRecovery = wrapper.createDocumentComparisonEngine(wasm, {snapshot: (value: any) => structuredClone(value), controls: comparisonBudget});
    const largeBefore = Object.fromEntries(Array.from({length: 100}, (_, index) => [`k${index}`, index]));
    const largeAfter = Object.fromEntries(Array.from({length: 100}, (_, index) => [`k${index}`, index + 1]));
    try { budgetRecovery.compareDocuments(largeBefore, largeAfter); } catch (error: any) { comparisonWorkRefusal = error.code ?? ''; }
    const afterWorkRefusal = budgetRecovery.compareDocuments({x: 1}, {x: 2});
    if (comparisonWorkRefusal !== 'RESOURCE_LIMIT' || afterWorkRefusal.length !== 1) throw Error('WASM comparison work refusal/recovery mismatch');
    const depth = (levels: number) => { let value: any = 0; for (let index = 0; index < levels; index++) value = {x: value}; return value; };
    let comparisonDepthRefusal = '';
    try { comparison.compareDocuments(depth(300), depth(300)); } catch (error: any) { comparisonDepthRefusal = error.code ?? ''; }
    if (!['LIMIT', 'RESOURCE_LIMIT'].includes(comparisonDepthRefusal)) throw Error('WASM comparison depth refusal mismatch');
    let afterSnapshotReads = 0;
    const badBefore = Object.defineProperty({}, 'x', {enumerable: true, get() { throw Object.assign(new Error('before refused'), {code: 'NON_JSON', path: '/x'}); }});
    const badAfter = Object.defineProperty({}, 'x', {enumerable: true, get() { afterSnapshotReads++; return 1; }});
    let beforeRefusal = '';
    try { comparison.compareDocuments(badBefore, badAfter); } catch (error: any) { beforeRefusal = `${error.code}:${error.path}`; }
    if (beforeRefusal !== 'NON_JSON:/x' || afterSnapshotReads !== 0) throw Error('WASM before-first snapshot refusal mismatch');
    const loaderFailure = async (variant: string) => {
      const brokenGlue = await import(new URL(`/package/pkg/umf_core_wasm.js?fresh-${variant}`, location.href).href);
      let compareDocuments: undefined | ((before: unknown, after: unknown) => unknown);
      let refusal = false;
      try {
        await brokenGlue.default({module_or_path: new URL(`/${variant}/package/pkg/umf_core_wasm_bg.wasm`, location.href)});
        compareDocuments = wrapper.createDocumentComparisonEngine(brokenGlue, {snapshot: (value: any) => structuredClone(value)}).compareDocuments;
      } catch { refusal = true; }
      if (!refusal || compareDocuments !== undefined) throw Error(`${variant} package loader did not fail closed`);
      return {refused: true, comparisonUnavailable: true};
    };
    const missingLoader = await loaderFailure('missing');
    const invalidLoader = await loaderFailure('invalid');
    if (typeof process !== 'undefined' || typeof Buffer !== 'undefined') throw Error('Node globals leaked into Chromium');
    return {
      core: {copyJson: 'pass', jsonRoundTrip: 'pass'},
      bit128: {vectors: bit128.cases.length, accessorReads: getterReads, meteredWork: bitWork, cancellation: bitCancellation},
      fieldValue: {cases: field.cases.length, nativeTypeErrors: field.cases.filter((row: any) => row.thrown).length, meteredWork: fieldWork, cancellation: fieldCancellation},
      documentComparison: {
        records: diff.length, frozenCases: frozenComparison.cases.length, nulJoinedOrder: nulJoinedOrder.length, meteredWork: comparisonWork,
        repeatedBudgetCalls: 2, cancellation: comparisonCancellation, recoveredAfterCancellation,
        hostWorkRefusal: comparisonWorkRefusal, recoveredAfterWorkRefusal: true, depthRefusal: comparisonDepthRefusal,
        beforeFirstRefusal: beforeRefusal, refusalAfterReads: afterSnapshotReads,
        missingWasmAssetRefusal: missingLoader.refused, missingAssetComparisonUnavailable: missingLoader.comparisonUnavailable,
        invalidWasmRefusal: invalidLoader.refused, invalidAssetComparisonUnavailable: invalidLoader.comparisonUnavailable,
      },
      nodeGlobalsAbsent: true,
    };
  }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('R7 Chromium matrix timed out after 60 seconds')), 60_000))]);
  if (missingWasmRequests !== 1 || invalidWasmRequests !== 1) throw new Error(`Fresh package loaders requested missing=${missingWasmRequests} invalid=${invalidWasmRequests} WASM assets`);
  console.log(JSON.stringify({status: 'pass', packageRoot: pkgRoot, browser: browser.version(), ...result}));
} finally {
  await browser?.close();
  server.close();
}
