// Focused browser baseline for the current JSON-LD native-family WASM facade.
// Supply a freshly generated package directory as argv[2]; this script never builds WASM.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass the generated WASM package directory as the first argument');
const wasmGlue = await readFile(resolve(packageRoot, 'umf_core_wasm.js'));
const wasmBinary = await readFile(resolve(packageRoot, 'umf_core_wasm_bg.wasm'));
const entry = `
import * as wasm from '/pkg/umf_core_wasm.js';
await wasm.default('/pkg/umf_core_wasm_bg.wasm');
const {createNativeFamilyDispatcher}=await import('/binding/index.js');
const native=createNativeFamilyDispatcher(wasm);
const source='{"@context":{"name":"https://schema.org/name"},"@id":"https://example.test/person","name":"Ada"}';
const document=native.jsonld.import({id:'browser-jsonld',source,baseIRI:'https://example.test/'});
const frame={"@context":{"name":"https://schema.org/name"},name:{}};
const report=native.jsonld.frame({document,frame:JSON.stringify(frame),lossPolicy:'report'});
if(report.status!=='candidate'||report.complete!==false)throw Error('frame candidate/status mismatch');
const candidate=native.jsonld.export({document:report.candidate});
if(typeof candidate!=='string'||!candidate.includes('Ada'))throw Error('native frame export did not retain the selected value');
let refusal;
try{native.jsonld.frame({document,frame:JSON.stringify(frame),lossPolicy:'report',omitGraph:true});}
catch(error){refusal={code:error.code??null,message:String(error.message??error)};}
if(!refusal||refusal.code!=='JSONLD_OPTIONS')throw Error('unsupported omitGraph option was not refused');
if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals leaked into Chromium');
window.jsonldNative={status:'pass',operations:['import','frame','export'],refusal};`;
const modules = new Map([
  ['/entry.js', entry],
  ['/pkg/umf_core_wasm.js', wasmGlue],
  ['/pkg/umf_core_wasm_bg.wasm', wasmBinary],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.writeHead(200, {'content-type': 'text/html'});
    return response.end('<!doctype html><meta charset="utf-8"><script type="module" src="/entry.js"></script>');
  }
  if (modules.has(pathname)) {
    const body = modules.get(pathname);
    response.writeHead(200, {'content-type': pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'});
    return response.end(body);
  }
  if (pathname.startsWith('/binding/')) {
    const path = resolve(root, 'bindings/core/wasm', pathname.slice('/binding/'.length));
    if (path.startsWith(resolve(root, 'bindings/core/wasm') + '/')) {
      try {
        const body = await readFile(path);
        response.writeHead(200, {'content-type': 'text/javascript'});
        return response.end(body);
      } catch {}
    }
  }
  response.writeHead(404);
  response.end('not found');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  if (errors.length) throw Error(errors[0]);
  await Promise.race([
    page.waitForFunction(() => window.jsonldNative, undefined, {timeout: 120000}),
    new Promise((_, reject) => page.once('pageerror', reject)),
  ]);
  const result = await page.evaluate(() => window.jsonldNative);
  assert.deepEqual(errors, []);
  assert.deepEqual(result.operations, ['import', 'frame', 'export']);
  assert.equal(result.refusal.code, 'JSONLD_OPTIONS');
  console.log(JSON.stringify({format: 'umf-jsonld-wasm-chromium-current-source/1', browser: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), ...result}));
} finally {
  try { await browser?.close(); }
  finally { await new Promise(done => server.close(done)); }
}
