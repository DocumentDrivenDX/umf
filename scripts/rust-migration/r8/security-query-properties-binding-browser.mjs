import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packetBytes = await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-security-protection-query-properties/predecessor.json'));
const packet = JSON.parse(packetBytes);
const publicEntry = await readFile(resolve(root, 'bindings/core/wasm/index.js'));
const wasmRoot = process.env.UMF_SECURITY_QUERY_PROPERTIES_WASM_PKG;
if (!wasmRoot) throw new Error('Set UMF_SECURITY_QUERY_PROPERTIES_WASM_PKG to fresh wasm-bindgen --target web output');
const wasmJs = await readFile(resolve(wasmRoot, 'umf_core_wasm.js'));
const wasmBin = await readFile(resolve(wasmRoot, 'umf_core_wasm_bg.wasm'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = [
  "import * as wasm from '/umf_core_wasm.js';",
  "import {createSecurityQueryPropertiesEngine, SECURITY_QUERY_PROPERTIES_PROFILE} from '/wasm/index.js';",
  "const packet=await (await fetch('/predecessor.json')).json();",
  "const exclusions=new Set(['query.range-identity-canonical-numeric','query.range-identity-distinct-field','query.range-unknown-field-refused']);",
  "const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);",
  "await wasm.default('/umf_core_wasm_bg.wasm');",
  "const engine=createSecurityQueryPropertiesEngine(wasm);let replayed=0,excluded=0;",
  "for(const row of packet.cases.flatMap(c=>c.operations.map(operation=>({id:c.id,...operation})))){const {sources,input,outcome}=row;const actual=engine.inspectProtectionQueryProperties(sources.policy,sources.catalog,sources.closure,input);if(actual.complete!==false||actual.authority!==false)throw Error('Authority flags changed: '+row.id);if(exclusions.has(row.id)){if(actual.status!=='refused'||!actual.diagnostics.some(d=>d.code==='PROTECTION_QUERY_UNIMPLEMENTED'))throw Error('Range exclusion not refused: '+row.id);excluded++;}else{if(canonical(actual)!==canonical(outcome.value))throw Error('Frozen predecessor mismatch: '+row.id);replayed++;}}",
  "if(replayed!==19||excluded!==3)throw Error('Expected 19 exact replays and 3 range exclusions, got '+replayed+'/'+excluded);",
  "let getterCalls=0;const base=packet.cases[0].operations[0];const accessorUse={...base.input};Object.defineProperty(accessorUse,'future',{enumerable:true,get(){getterCalls++;return true;}});let accessorRefused=false;try{engine.inspectProtectionQueryProperties(base.sources.policy,base.sources.catalog,base.sources.closure,accessorUse);}catch(error){accessorRefused=error.code==='ACCESSOR_PROPERTY';}if(!accessorRefused||getterCalls!==0)throw Error('Accessor refusal control failed');",
  "let missingAbiRefused=false,corruptAbiRefused=false;try{createSecurityQueryPropertiesEngine({});}catch(error){missingAbiRefused=error.message==='RUST_WASM_BINDING_MISSING';}try{createSecurityQueryPropertiesEngine({executeSecurityQueryPropertiesWire:()=>'{\"bad\":true}'}).inspectProtectionQueryProperties(null,null,null,null);}catch(error){corruptAbiRefused=error instanceof TypeError;}if(!missingAbiRefused||!corruptAbiRefused)throw Error('ABI refusal control failed');",
  "const target={...base.input};let ownKeysCalls=0;const proxy=new Proxy(target,{ownKeys(value){ownKeysCalls++;return Reflect.ownKeys(value);}});engine.inspectProtectionQueryProperties(base.sources.policy,base.sources.catalog,base.sources.closure,proxy);",
  "if(ownKeysCalls!==2)throw Error('Expected two Proxy ownKeys calls at the JS facade boundary, got '+ownKeysCalls);",
  "if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');",
  "window.securityQueryPropertiesReplay={status:'pass',profile:SECURITY_QUERY_PROPERTIES_PROFILE,replayed,excluded,allCompleteFalse:true,allAuthorityFalse:true,exactFrozenPredecessor:true,accessorRefused,getterCalls,missingAbiRefused,corruptAbiRefused,proxyOwnKeysCalls:ownKeysCalls};",
].join('\n');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const text = (body, type) => { res.writeHead(200, {'content-type': type}); res.end(body); };
  if (pathname === '/') return text('<!doctype html><script type="module" src="/entry.js"></script>', 'text/html');
  if (pathname === '/entry.js') return text(entry, 'text/javascript');
  if (pathname.startsWith('/wasm/')) {
    const file = resolve(root, 'bindings/core/wasm', pathname.slice('/wasm/'.length));
    if (!file.startsWith(resolve(root, 'bindings/core/wasm') + '/')) { res.writeHead(403); return res.end(); }
    try { return text(await readFile(file), file.endsWith('.js') ? 'text/javascript' : 'application/json'); } catch { res.writeHead(404); return res.end(); }
  }
  if (pathname === '/umf_core_wasm.js') return text(wasmJs, 'text/javascript');
  if (pathname === '/umf_core_wasm_bg.wasm') return text(wasmBin, 'application/wasm');
  if (pathname === '/predecessor.json') return text(packetBytes, 'application/json');
  res.writeHead(404); res.end();
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.waitForFunction(() => window.securityQueryPropertiesReplay);
  const observed = await page.evaluate(() => window.securityQueryPropertiesReplay);
  assert.equal(observed.status, 'pass');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({status:'pass',runtime:'Chromium',userAgent:await page.evaluate(()=>navigator.userAgent),...observed,rawHostObservationScope:'Proxy ownKeys is observed only at the JS wire encoder boundary; predecessor proxy/accessor observations are not parity claims for tagged JSON.',artifacts:{predecessorSha256:sha(packetBytes),publicWasmEntrySha256:sha(publicEntry),freshWasmGlueSha256:sha(wasmJs),freshWasmBinarySha256:sha(wasmBin)}}));
} finally { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
