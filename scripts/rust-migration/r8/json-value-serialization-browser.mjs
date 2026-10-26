import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(process.env.UMF_JSON_VALUE_WASM_PACKAGE ?? '/private/tmp/umf-json-value-wasm-package');
const facadePath = resolve(process.env.UMF_JSON_VALUE_WASM_FACADE ?? `${packageRoot}/facade.mjs`);
const packetBytes = await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-value-serialization/predecessor.json'));
const packet = JSON.parse(packetBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const html = `<!doctype html><meta charset="utf-8"><script type="module">
  import {createEngine} from '/facade.mjs';
  import * as wasm from '/pkg/umf_core_wasm.js';
  const packet = ${JSON.stringify(packet).replaceAll('<', '\\u003c')};
  await wasm.default();
  const engine = createEngine(wasm);
  const cases = [];
  const sourceFor = input => typeof input.source === 'string' ? input.source : typeof input.depth === 'number' ? '['.repeat(input.depth)+'0'+']'.repeat(input.depth) : '['+Array(input.arrayItems).fill('null').join(',')+']';
  for (const item of packet.cases.filter(({id}) => id.startsWith('read.'))) {
    try { cases.push({id:item.id,status:'returned',value:engine.readJsonValue(sourceFor(item.input),item.input.format??'yaml')}); }
    catch(error) { cases.push({id:item.id,status:'threw',name:error.name,code:error.code,path:error.path,message:error.message}); }
  }
  const writeCases=[];
  for (const item of packet.cases.filter(({id}) => id.startsWith('write.'))) {
    let value=item.input.value;
    if(item.id==='write.number-negative-zero')value=-0;
    if(item.id==='write.rejects-nonfinite')value=Number.POSITIVE_INFINITY;
    if(item.id==='write.rejects-cycle'){value={};value.self=value;}
    if(item.id==='write.limit.text')value='x'.repeat(item.input.textUnits);
    try{writeCases.push({id:item.id,status:'returned',value:engine.writeJsonValue(value,item.input.format??'yaml')});}
    catch(error){writeCases.push({id:item.id,status:'threw',name:error.name,code:error.code,path:error.path,message:error.message});}
  }
  let measuredWork=0; createEngine(wasm,undefined,{controls:{meter(amount){measuredWork+=amount;}}}).readJsonValue('name: example\\n');
  let hostControl; try { createEngine(wasm,undefined,{controls:{maxWork:0}}).readJsonValue('name: example\\n'); } catch(error) { hostControl={name:error.name,code:error.code,message:error.message}; }
  let formatFallback; try { formatFallback=engine.readJsonValue('{}','JSON'); } catch(error) { formatFallback={name:error.name,code:error.code,message:error.message}; }
  let genericAlias; try { engine.readValue('x: &a 1\\ny: *a\\n','yaml'); } catch(error) { genericAlias={name:error.name,code:error.code,message:error.message}; }
  let genericWrite; try { genericWrite=engine.writeValue({name:'example'},'yaml'); } catch(error) { genericWrite=error.message; }
  window.__serializationReceipt={cases,writeCases,measuredWork,hostControl,formatFallback,genericAlias,genericWrite,nodeGlobals:{process:typeof process,Buffer:typeof Buffer,require:typeof require}};
</script>`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type':'text/html'}); response.end(html); return; }
  let file;
  if (pathname === '/facade.mjs') file = facadePath;
  else if (pathname.startsWith('/pkg/')) file = resolve(packageRoot, pathname.slice('/pkg/'.length));
  if (!file || (!file.startsWith(packageRoot + sep) && file !== facadePath)) { response.writeHead(404); response.end(); return; }
  try { const bytes = await readFile(file); response.writeHead(200, {'content-type':file.endsWith('.wasm')?'application/wasm':'text/javascript'}); response.end(bytes); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH});
try {
  const page = await browser.newPage(); const pageErrors=[]; page.on('pageerror', error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  try { await page.waitForFunction(()=>Boolean(window.__serializationReceipt)); }
  catch(error) { throw new Error(`${error}; browser errors: ${pageErrors.join(' | ')}`); }
  const actual=await page.evaluate(()=>window.__serializationReceipt);
  const packetCases=packet.cases.filter(({id})=>id.startsWith('read.')); let matched=0; const mismatches=[];
  for(let index=0;index<packetCases.length;index++) {
    const expected=packetCases[index], got=actual.cases[index];
    if(got.id!==expected.id) {mismatches.push({id:expected.id,actual:got});continue;}
    if(expected.outcome.status==='returned') {
      try {assert.deepEqual(got,{id:expected.id,status:'returned',value:expected.outcome.value});matched++;}
      catch {mismatches.push({id:expected.id,actual:got,expected:expected.outcome});}
    } else {
      const result={id:expected.id,status:'threw',name:got.name,code:got.code,path:got.path,message:got.message};
      try {assert.deepEqual(result,{id:expected.id,...expected.outcome});matched++;}
      catch {mismatches.push({id:expected.id,actual:result,expected:expected.outcome});}
    }
  }
  const writePacketCases=packet.cases.filter(({id})=>id.startsWith('write.'));
  for(let index=0;index<writePacketCases.length;index++) {
    const expected=writePacketCases[index],got=actual.writeCases[index];
    if(got.id!==expected.id){mismatches.push({id:expected.id,actual:got});continue;}
    if(expected.outcome.status==='returned') {
      if(got.status!=='returned'||got.value!==expected.outcome.value)mismatches.push({id:expected.id,actual:got,expected:expected.outcome});else matched++;
    } else {
      const result={status:'threw',name:got.name,code:got.code,path:got.path,message:got.message};
      try {assert.deepEqual(result,expected.outcome);matched++;} catch {mismatches.push({id:expected.id,actual:result,expected:expected.outcome});}
    }
  }
  assert.deepEqual(mismatches,[]); assert.equal(matched,packet.cases.length);
  assert.ok(actual.measuredWork>0); assert.deepEqual(actual.hostControl,{name:'UmfCoreError',code:'RESOURCE_LIMIT',message:'Host work budget exceeded'});
  assert.deepEqual(actual.formatFallback,{}); assert.deepEqual(actual.genericAlias,{name:'UmfCoreError',code:'YAML_ALIAS',message:'YAML aliases are not allowed'});
  assert.equal(actual.genericWrite,'"name": "example"\n');
  assert.deepEqual(actual.nodeGlobals,{process:'undefined',Buffer:'undefined',require:'undefined'});
  console.log(JSON.stringify({browser:await browser.version(),matched,mismatches:mismatches.length,unexpectedMismatches:0,packetSha256:digest(packetBytes),wasmPath:resolve(packageRoot,'umf_core_wasm_bg.wasm'),wasmSha256:digest(await readFile(resolve(packageRoot,'umf_core_wasm_bg.wasm'))),facadeSha256:digest(await readFile(facadePath)),...actual,writeCases:actual.writeCases}));
} finally { await browser.close(); await new Promise(resolveClose=>server.close(resolveClose)); }
