import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(process.env.UMF_RELATIONSHIP_SELECTION_WASM_PACKAGE ?? '/private/tmp/umf-r8-relationship-selection-wasm/package');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-core-relationship-selection/frozen-typescript.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([name, path]) => [name, JSON.parse(await readFile(resolve(root, path), 'utf8'))])));
const inputs = JSON.stringify({packet, resources});
const html = `<!doctype html><meta charset="utf-8"><script type="module">
  import {createCoreModelEngine} from '/package/index.js';
  import * as wasm from '/package/pkg/umf_core_wasm.js';
  await wasm.default();
  const {packet,resources} = await fetch('/inputs.json').then(r=>r.json());
  const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']'
    : value && typeof value==='object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
    : JSON.stringify(value);
  const engine = createCoreModelEngine(wasm, resources);
  let mismatches = 0;
  for (const [id,testCase] of Object.entries(packet.cases)) {
    const expected = packet.outcomes[id];
    try {
      const actual = engine.selectCoreRelationships(testCase.source,testCase.query);
      if (!expected.ok || canonical(actual)!==canonical(expected.value)) throw Error(id+': value mismatch');
    } catch (error) {
      if (expected.ok || canonical({code:error.code,message:error.message,path:error.path??''})!==canonical(expected.error)) {
        throw Error(id+': error mismatch '+error);
      }
    }
  }
  let cancelled = false;
  const controlled = createCoreModelEngine(wasm, resources, {controls:{isCancelled(){return cancelled;}}});
  cancelled=true;
  let cancellationCode;
  try { controlled.selectCoreRelationships(packet.cases.all_paths_and_navigation.source,{}); }
  catch (error) { cancellationCode=error.code; }
  cancelled=false;
  const cancellationReset = controlled.selectCoreRelationships(packet.cases.no_relationships.source,{}).selection.length===0;
  window.__relationshipSelectionReceipt = {cases:Object.keys(packet.cases).length,mismatches,cancellationCode,cancellationReset,
    nodeGlobals:{process:typeof process,Buffer:typeof Buffer,require:typeof require}};
</script>`;
const server = createServer(async (request,response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname==='/') { response.writeHead(200,{'content-type':'text/html'}); response.end(html); return; }
  if (pathname==='/inputs.json') { response.writeHead(200,{'content-type':'application/json'}); response.end(inputs); return; }
  if (!pathname.startsWith('/package/')) { response.writeHead(404); response.end(); return; }
  const file = resolve(packageRoot, pathname.slice('/package/'.length));
  if (!file.startsWith(packageRoot+sep)) { response.writeHead(404); response.end(); return; }
  try {
    const bytes = await readFile(file);
    response.writeHead(200,{'content-type':file.endsWith('.wasm')?'application/wasm':'text/javascript'});
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const browser = await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH});
try {
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>Boolean(window.__relationshipSelectionReceipt),undefined,{timeout:120_000});
  const actual = await page.evaluate(()=>window.__relationshipSelectionReceipt);
  assert.equal(actual.cases,Object.keys(packet.cases).length);
  assert.equal(actual.mismatches,0);
  assert.equal(actual.cancellationCode,'CANCELLED');
  assert.equal(actual.cancellationReset,true);
  assert.deepEqual(actual.nodeGlobals,{process:'undefined',Buffer:'undefined',require:'undefined'});
  console.log(JSON.stringify({browser:await browser.version(),profile:packet.profile,cases:actual.cases,mismatches:0,
    packetSha256:createHash('sha256').update(packetBytes).digest('hex'),pageErrors:errors,...actual}));
} finally {
  await browser.close();
  await new Promise(resolveClose=>server.close(resolveClose));
}
