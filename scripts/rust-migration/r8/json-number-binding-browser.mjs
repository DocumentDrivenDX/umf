import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const pkg = resolve(process.env.UMF_JSON_NUMBER_WASM_PACKAGE ?? '/private/tmp/umf-r8-json-number-wasm/package');
const facadePath = resolve(process.env.UMF_JSON_NUMBER_WASM_FACADE ?? '/private/tmp/umf-r8-json-number-wasm/facade.mjs');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-number-predecessor/typescript-predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const html = `<!doctype html><meta charset="utf-8"><script type="module">
  import {createJsonNumberEngine, JSON_NUMBER_PROFILE} from '/facade.mjs';
  import * as wasm from '/pkg/umf_core_wasm.js';
  const packet = ${JSON.stringify(packet).replaceAll('<', '\\u003c')};
  await wasm.default();
  const engine = createJsonNumberEngine(wasm);
  const cases = [];
  for (const item of packet.cases) {
    try {
      const value = engine.assertExactJsonNumber(item.token);
      cases.push({id:item.id, status:'accepted', value:value === undefined ? 'undefined' : value});
    } catch (error) {
      cases.push({id:item.id, status:'refused', error:{name:error.name, code:error.code ?? null, message:error.message}});
    }
  }
  let coercions = 0;
  let nonString;
  try { engine.assertExactJsonNumber({toString(){coercions++;return '1';}}); }
  catch (error) { nonString = {name:error.name, message:error.message}; }
  let surrogate;
  try { engine.assertExactJsonNumber('\\ud800'); }
  catch (error) { surrogate = {name:error.name, code:error.code, message:error.message}; }
  let measuredWork = 0;
  createJsonNumberEngine(wasm, {controls:{meter(amount){measuredWork += amount;}}}).assertExactJsonNumber('42');
  const budget = Math.floor(measuredWork * 1.5);
  const sticky = createJsonNumberEngine(wasm, {controls:{maxWork:budget}});
  sticky.assertExactJsonNumber('42'); sticky.assertExactJsonNumber('42');
  let cancelled = true;
  const cancellation = createJsonNumberEngine(wasm, {controls:{isCancelled(){return cancelled;}}});
  let cancellationCode;
  try { cancellation.assertExactJsonNumber('42'); } catch (error) { cancellationCode = error.code; }
  cancelled = false; cancellation.assertExactJsonNumber('42');
  let wrongProfile;
  try { createJsonNumberEngine({jsonNumberProfileVersion(){return 'wrong';}, executeJsonNumberWire(){return '';}}); }
  catch (error) { wrongProfile = error.message; }
  window.__jsonNumberReceipt = {profile:JSON_NUMBER_PROFILE,cases,nonString,coercions,surrogate,measuredWork,budget,cancellationCode,
    cancellationReset:true,wrongProfile,nodeGlobals:{process:typeof process,Buffer:typeof Buffer,require:typeof require}};
</script>`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type':'text/html'}); response.end(html); return; }
  let file;
  if (pathname === '/facade.mjs') file = facadePath;
  else if (pathname.startsWith('/pkg/')) file = resolve(pkg, 'pkg', pathname.slice('/pkg/'.length));
  if (!file || (!file.startsWith(pkg + sep) && file !== facadePath)) { response.writeHead(404); response.end(); return; }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, {'content-type': file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'});
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});

await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({headless:true, executablePath:process.env.UMF_CHROMIUM_PATH});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => { pageErrors.push(String(error)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  try { await page.waitForFunction(() => Boolean(window.__jsonNumberReceipt)); }
  catch (error) { throw new Error(`${error}; browser errors: ${pageErrors.join(' | ')}`); }
  const actual = await page.evaluate(() => window.__jsonNumberReceipt);
  assert.equal(actual.profile, 'umf-json-number/0.1');
  assert.equal(actual.cases.length, packet.cases.length);
  for (let i = 0; i < packet.cases.length; i++) {
    const expected = packet.cases[i];
    const got = actual.cases[i];
    assert.equal(got.id, expected.id);
    if (expected.outcome === 'accepted') assert.deepEqual(got, {id:expected.id,status:'accepted',value:'undefined'}, expected.id);
    else assert.deepEqual(got, {id:expected.id,status:'refused',error:expected.error}, expected.id);
  }
  assert.deepEqual(actual.nonString, {name:'TypeError',message:'token must be a string'});
  assert.equal(actual.coercions, 0);
  assert.deepEqual(actual.surrogate, {name:'UmfError',code:'NUMBER',message:'Noninteroperable JSON number'});
  assert.ok(actual.measuredWork > 0);
  assert.equal(actual.cancellationCode, 'CANCELLED');
  assert.equal(actual.cancellationReset, true);
  assert.equal(actual.wrongProfile, 'RUST_WASM_BINDING_PROFILE_MISMATCH');
  assert.deepEqual(actual.nodeGlobals, {process:'undefined',Buffer:'undefined',require:'undefined'});
  console.log(JSON.stringify({browser:await browser.version(),profile:actual.profile,cases:actual.cases.length,mismatches:0,
    packetSha256:digest(packetBytes),wasmPath:resolve(pkg,'pkg/umf_core_wasm_bg.wasm'),...actual,nodeGlobals:actual.nodeGlobals}));
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
