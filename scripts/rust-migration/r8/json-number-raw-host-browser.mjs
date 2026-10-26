import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const pkg = resolve(process.env.UMF_JSON_NUMBER_WASM_PACKAGE ?? '/private/tmp/umf-r8-json-number-wasm/package');
const referencePath = resolve(process.env.UMF_JSON_NUMBER_REFERENCE ?? '/private/tmp/umf-r8-json-number-raw/reference.mjs');
const facadePath = resolve(process.env.UMF_JSON_NUMBER_WASM_FACADE ?? '/private/tmp/umf-r8-json-number-raw/facade.mjs');
const receiptPath = resolve(process.env.UMF_JSON_NUMBER_RAW_RECEIPT ?? 'docs/helix/04-build/evidence/rust-migration/r8-json-number-predecessor/raw-host-chromium.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
  'src/index-node-v4.ts', 'src/index-browser-v4.ts', 'src/index.ts',
  'src/model/internal/json-number.ts', 'src/model/errors.ts', 'src/model/serialization.ts',
  'Cargo.lock',
  'bindings/core/node/src/lib.rs', 'bindings/core/wasm/src/lib.rs',
  'bindings/core/wasm/src/json-number.js', 'crates/umf-core/src/json_number.rs',
  'crates/umf-core-wire/src/lib.rs', 'crates/umf-core-wire/src/json_number_binding.rs', 'scripts/rust-migration/r8/json-number-raw-host-cases.mjs',
  'scripts/rust-migration/r8/json-number-raw-host-cases.d.mts',
  'scripts/rust-migration/r8/json-number-raw-host-predecessor.ts',
  'scripts/rust-migration/r8/json-number-raw-host-node.mjs',
  'scripts/rust-migration/r8/json-number-raw-host-browser.mjs',
  'tests/rust-migration/json-number-raw-host.test.ts',
];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, digest(await readFile(resolve(root, path)))])));
const casesSource = await readFile(resolve(root, 'scripts/rust-migration/r8/json-number-raw-host-cases.mjs'), 'utf8');
const caseModulePath = resolve('/private/tmp/umf-r8-json-number-raw/cases.mjs');
await writeFile(caseModulePath, casesSource);
const html = `<!doctype html><meta charset="utf-8"><script type="module">
  import {assertExactJsonNumber} from '/reference.mjs';
  import {makeRawHostCases,captureOutcome} from '/cases.mjs';
  import {createJsonNumberEngine} from '/facade.mjs';
  import * as wasm from '/pkg/umf_core_wasm.js';
  await wasm.default();
  const reference=makeRawHostCases().map(item=>captureOutcome(assertExactJsonNumber,item));
  const engine=createJsonNumberEngine(wasm);
  const candidate=makeRawHostCases().map(item=>captureOutcome(engine.assertExactJsonNumber.bind(engine),item));
  const mismatches=reference.flatMap((expected,i)=>JSON.stringify(expected)===JSON.stringify(candidate[i])?[]:[{id:expected.id,expected,actual:candidate[i]}]);
  window.__receipt={reference,candidate,mismatches,nodeGlobals:{process:typeof process,Buffer:typeof Buffer,require:typeof require}};
</script>`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type':'text/html'}); response.end(html); return; }
  let file;
  if (pathname === '/reference.mjs') file = referencePath;
  else if (pathname === '/cases.mjs') file = caseModulePath;
  else if (pathname === '/facade.mjs') file = facadePath;
  else if (pathname.startsWith('/pkg/')) file = resolve(pkg, 'pkg', pathname.slice('/pkg/'.length));
  if (!file || (!file.startsWith(pkg + sep) && ![referencePath, caseModulePath, facadePath].includes(file))) { response.writeHead(404); response.end(); return; }
  try { const bytes=await readFile(file); response.writeHead(200, {'content-type':file.endsWith('.wasm')?'application/wasm':'text/javascript'}); response.end(bytes); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({headless:true, executablePath:process.env.UMF_CHROMIUM_PATH});
try {
  const page=await browser.newPage(); const pageErrors=[]; page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>Boolean(window.__receipt), null, {timeout:120_000});
  const actual=await page.evaluate(()=>window.__receipt);
  assert.equal(actual.reference.length,10);
  assert.equal(actual.candidate.length,10);
  assert.deepEqual(actual.mismatches.map(item=>item.id),actual.reference.map(item=>item.id));
  assert.deepEqual(actual.nodeGlobals,{process:'undefined',Buffer:'undefined',require:'undefined'});
  assert.deepEqual(pageErrors,[]);
  const receipt={format:'umf.r8.json-number-raw-host-comparison/1',runtime:{name:'Chromium',version:await browser.version()},status:'known-default-cutover-blocker',sourceHashes,
    artifacts:{referenceSha256:digest(await readFile(referencePath)),wasmGlueSha256:digest(await readFile(resolve(pkg,'pkg/umf_core_wasm.js'))),wasmSha256:digest(await readFile(resolve(pkg,'pkg/umf_core_wasm_bg.wasm'))),facadeSha256:digest(await readFile(facadePath))},
    caseCount:actual.reference.length,exactMatchCount:actual.reference.length-actual.mismatches.length,mismatchCount:actual.mismatches.length,mismatches:actual.mismatches,pageErrors,nodeGlobals:actual.nodeGlobals};
  await writeFile(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);
  console.log(JSON.stringify({status:receipt.status,runtime:receipt.runtime,caseCount:receipt.caseCount,mismatchCount:receipt.mismatchCount,mismatchedIds:receipt.mismatches.map(item=>item.id),receiptPath}));
} finally { await browser.close(); await new Promise(resolveClose=>server.close(resolveClose)); }
