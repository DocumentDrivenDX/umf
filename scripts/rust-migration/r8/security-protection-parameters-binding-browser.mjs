import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packetBytes = await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-security-protection-parameters/predecessor.json'));
const wasmRoot = process.env.UMF_SECURITY_PROTECTION_PARAMETERS_WASM_PKG;
if (!wasmRoot) throw new Error('Set UMF_SECURITY_PROTECTION_PARAMETERS_WASM_PKG to fresh wasm-bindgen --target web output');
const wasmJs = await readFile(resolve(wasmRoot, 'umf_core_wasm.js'));
const wasmBin = await readFile(resolve(wasmRoot, 'umf_core_wasm_bg.wasm'));
const publicEntry = await readFile(resolve(root, 'bindings/core/wasm/index.js'));
const publicFactory = await readFile(resolve(root, 'bindings/core/wasm/src/security-protection-parameters.js'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = `import * as wasm from '/umf_core_wasm.js';
import {createSecurityProtectionParametersEngine, SECURITY_PROTECTION_PARAMETERS_PROFILE} from '/wasm/index.js';
await wasm.default('/umf_core_wasm_bg.wasm');
const packet=await (await fetch('/predecessor.json')).json();
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const excluded=new Set(['parameters.noncanonical-integer-token','parameters.pre-spent-budget-first-literal-fault','parameters.policy-accessor-not-invoked']);
const rows=packet.cases.filter(row=>row.sources&&!excluded.has(row.id));if(rows.length!==8)throw Error('Expected eight tagged-compatible cases');
const engine=createSecurityProtectionParametersEngine(wasm);
for(const row of rows){const actual=engine.validateProtectionParameters(row.sources.policy,row.sources.catalog,row.sources.closure);if(actual.complete!==false||actual.authority!==false||canonical(actual)!==canonical(row.outcome.value))throw Error('Frozen predecessor mismatch: '+row.id);}
let getterCalls=0;const policy=Object.defineProperty({},'rules',{enumerable:true,get(){getterCalls++;return [];}});let accessorCode;try{engine.validateProtectionParameters(policy,{},{});}catch(error){accessorCode=error.code;}if(accessorCode!=='ACCESSOR_PROPERTY'||getterCalls!==0)throw Error('Accessor control failed');
let missingAbiRefused=false,corruptAbiRefused=false;try{createSecurityProtectionParametersEngine({});}catch(error){missingAbiRefused=error.message==='RUST_WASM_BINDING_MISSING';}try{createSecurityProtectionParametersEngine({executeSecurityProtectionParametersWire:()=>'{"bad":true}'}).validateProtectionParameters(null,null,null);}catch(error){corruptAbiRefused=error instanceof TypeError;}if(!missingAbiRefused||!corruptAbiRefused)throw Error('ABI refusal control failed');
if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');
window.securityProtectionParametersReplay={status:'pass',profile:SECURITY_PROTECTION_PARAMETERS_PROFILE,caseCount:rows.length,exactFrozenPredecessor:true,allCompleteFalse:true,allAuthorityFalse:true,accessorRefusedNoGetter:true,missingAbiRefused,corruptAbiRefused};`;
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
  if (pathname === '/umf_core_wasm_bg.wasm') { res.writeHead(200, {'content-type': 'application/wasm'}); return res.end(wasmBin); }
  if (pathname === '/predecessor.json') return text(packetBytes, 'application/json');
  res.writeHead(404); res.end();
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.securityProtectionParametersReplay, {timeout: 30000}).catch(() => {
    throw new Error(`Browser replay did not finish: ${errors.join(' | ') || 'no page error was reported'}`);
  });
  const result = await page.evaluate(() => window.securityProtectionParametersReplay);
  assert.deepEqual(result, {status:'pass',profile:'umf.security-parameters/1',caseCount:8,exactFrozenPredecessor:true,allCompleteFalse:true,allAuthorityFalse:true,accessorRefusedNoGetter:true,missingAbiRefused:true,corruptAbiRefused:true});
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({status:'pass',runtime:'Chromium',userAgent:await page.evaluate(()=>navigator.userAgent),...result,artifacts:{predecessor:sha(packetBytes),publicEntry:sha(publicEntry),publicFactory:sha(publicFactory),freshWasmGlue:sha(wasmJs),freshWasmBinary:sha(wasmBin)}}));
} finally { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
