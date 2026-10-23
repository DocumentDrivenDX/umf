import {readFile, copyFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';

const root = '/private/tmp/umf-r5-numeric';
const pkg = join(root, 'wasm/pkg');
const [rows, vectors, wasmIndex, wire, numericWrapper] = await Promise.all([
  readFile(process.env.UMF_R5_NUMERIC_ORACLE ?? join(root, 'oracle.json'), 'utf8'),
  readFile(join(process.cwd(), 'scripts/rust-migration/r5/javascript-numeric-vectors.json'), 'utf8'),
  readFile(join(process.cwd(), 'bindings/core/wasm/index.js'), 'utf8'),
  readFile(join(process.cwd(), 'bindings/core/node/src/wire.js'), 'utf8'),
  readFile(join(process.cwd(), 'bindings/core/node/src/javascript-numeric.js'), 'utf8'),
]);
const resourcePaths: [string, string][] = [
  ['coreSchema', 'spec/core/schema.json'], ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'], ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'], ['document', 'tests/lifecycle/fixtures/legacy-note.json'],
];
const resources = Object.fromEntries(await Promise.all(resourcePaths.map(async ([key, path]) => [key, await Bun.file(path).json()])));
await mkdir(join(root, 'wasm'), {recursive:true});
await mkdir(join(root, 'node/src'), {recursive:true});
await Promise.all([
  Bun.write(join(root, 'wasm/index.js'), wasmIndex),
  Bun.write(join(root, 'node/src/wire.js'), wire),
  Bun.write(join(root, 'node/src/javascript-numeric.js'), numericWrapper),
  Bun.write(join(root, 'wasm/package.json'), '{"type":"module"}'),
  Bun.write(join(root, 'oracle.json'), rows),
  Bun.write(join(root, 'vectors.json'), vectors),
  Bun.write(join(root, 'resources.json'), JSON.stringify(resources)),
]);
const server = Bun.serve({hostname:'127.0.0.1', port:43175, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/') return new Response('<!doctype html><meta charset="utf-8"><title>R5 JavaScript numeric WASM parity</title>');
  if (path === '/oracle.json') return new Response(rows, {headers:{'content-type':'application/json'}});
  if (path === '/vectors.json') return new Response(vectors, {headers:{'content-type':'application/json'}});
  if (path === '/resources.json') return new Response(JSON.stringify(resources), {headers:{'content-type':'application/json'}});
  const file = path.startsWith('/node/') ? join(root, path) : join(root, 'wasm', path);
  try { return new Response(await Bun.file(file).arrayBuffer(), {headers:{'content-type':path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':'application/octet-stream'}}); }
  catch { return new Response('not found', {status:404}); }
}});
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath:process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result = await page.evaluate(async () => {
    const [{createJavascriptNumericEngine}, rows, resources] = await Promise.all([
      import(new URL('/index.js', location.href).href),
      fetch('/oracle.json').then((response) => response.json()),
      fetch('/resources.json').then((response) => response.json()),
    ]);
    const wasm = await import(new URL('/pkg/umf_core_wasm.js', location.href).href);
    await wasm.default();
    const engine = createJavascriptNumericEngine(wasm);
    const contextEngine = createJavascriptNumericEngine(wasm, {
      coreSchema:resources.coreSchema, referenceSchema:resources.referenceSchema, packageSchema:resources.packageSchema,
      constraints:resources.constraints, domainPolicy:resources.domainPolicy,
    });
    const actual = (row: any): unknown => {
      switch (row.op) {
        case 'exactDecimal': return engine.exactDecimal(row.token);
        case 'integerFromBigInt': return engine.integerFromBigInt(BigInt(row.token));
        case 'integerToBigInt': return engine.integerToBigInt({integerToken:row.token}).toString();
        case 'admitJavascriptNumber': {
          const bytes = Uint8Array.from(row.bits.match(/../g), (part: string) => Number.parseInt(part,16));
          return engine.admitJavascriptNumber(new DataView(bytes.buffer).getFloat64(0,false), row.scalarType);
        }
        case 'numericToNumberLossless': return engine.numericToNumberLossless(row.integer ? {integerToken:row.token} : {decimalToken:row.token});
        default: throw Error(`Unexpected numeric vector operation ${row.op}`);
      }
    };
    let checked = 0;
    for (const row of rows) {
      let outcome: any;
      try { outcome = {ok:true, value:actual(row)}; }
      catch { outcome = {ok:false, value:null}; }
      if (outcome.ok !== row.oracle.ok || (outcome.ok && JSON.stringify(outcome.value) !== JSON.stringify(row.oracle.value))) throw Error(`WASM differs from Python oracle at ${row.op}:${row.token ?? row.bits}`);
      checked++;
    }
    if (engine.integerToBigInt({integerToken:'12300e-2'}) !== 123n) throw Error('integerToBigInt parity failed');
    const context = {document:resources.document, field:{module:'note_lifecycle', element:'notes__note_id'}};
    if (contextEngine.integerFromBigInt(1n, context).integerToken !== '1') throw Error('WASM current Field context admission failed');
    let getterCalls = 0;
    const refusedContexts = [
      {...context, future:1n}, {...context, future:()=>1}, {...context, future:{get value(){getterCalls++; return 1;}}},
    ];
    for (const badContext of refusedContexts) {
      try { contextEngine.integerFromBigInt(1n, badContext); throw Error('WASM accepted a non-JSON context'); }
      catch (error) { if ((error as {code?:string}).code !== 'NON_JSON') throw error; }
    }
    if (getterCalls !== 0) throw Error('WASM context admission invoked nested getter');
    const limited = createJavascriptNumericEngine(wasm, undefined, {controls:{maxWork:32}});
    try { limited.integerFromBigInt(10n ** 100_000n); throw Error('WASM bigint bypassed work budget'); }
    catch (error) { if ((error as {code?:string}).code !== 'RESOURCE_LIMIT') throw error; }
    const formatLimited = createJavascriptNumericEngine(wasm, undefined, {controls:{maxWork:20_000_000}});
    try { formatLimited.integerToBigInt({integerToken:'1e99999'}); throw Error('WASM expanded BigInt formatting bypassed work budget'); }
    catch (error) { if ((error as {code?:string}).code !== 'RESOURCE_LIMIT') throw error; }
    const errors = [];
    for (const value of [Infinity, NaN, -0]) {
      try { engine.admitJavascriptNumber(value, 'decimal'); throw Error('invalid binary64 accepted'); }
      catch (error) { if ((error as {code?:string}).code !== 'JAVASCRIPT_NUMERIC') throw error; errors.push((error as Error).name); }
    }
    return {checked, errors, contextChecks:refusedContexts.length+1, resourceBudget:true, expandedFormattingBudget:true, nodeGlobalsAbsent:!('process' in globalThis) && !('Buffer' in globalThis)};
  });
  if (result.checked !== 27 || !result.nodeGlobalsAbsent) throw Error(`Chromium WASM numeric baseline failed: ${JSON.stringify(result)}`);
  console.log(JSON.stringify({status:'pass', chromium:browser.version(), profile:'umf.javascript-numeric/1.0.0', ...result}));
} finally { await browser?.close(); server.stop(true); }
