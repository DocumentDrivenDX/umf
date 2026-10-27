import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-security-protection-functions/predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const publicEntryBytes = await readFile(resolve(root, 'bindings/core/wasm/index.js'));
const wasmRoot = process.env.UMF_SECURITY_FUNCTIONS_WASM_PKG;
if (!wasmRoot) throw new Error('Set UMF_SECURITY_FUNCTIONS_WASM_PKG to fresh wasm-bindgen --target web output');
const wasmJs = await readFile(resolve(wasmRoot, 'umf_core_wasm.js'));
const wasmBin = await readFile(resolve(wasmRoot, 'umf_core_wasm_bg.wasm'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = `import * as wasm from '/umf_core_wasm.js';
import {createSecurityFunctionsEngine, SECURITY_FUNCTIONS_PROFILE} from '/wasm/index.js';
const packet=await (await fetch('/predecessor.json')).json();
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
await wasm.default('/umf_core_wasm_bg.wasm');
const engine=createSecurityFunctionsEngine(wasm);
let count=0;
for(const row of packet.cases){if(!row.sources||['function.parameter-refusal-before-result','function.itemType-field-refused'].includes(row.id))continue;const fn=row.op==='inspect'?engine.inspectProtectionFunction:engine.evaluateProtectionValue;const actual=fn(row.sources.policy,row.sources.catalog,row.sources.closure,row.sources.selection);if(actual.complete!==false||actual.authority!==false||canonical(actual)!==canonical(row.outcome.value))throw Error('Frozen predecessor mismatch: '+row.id);count++;}
if(count!==25)throw Error('Expected exactly 25 cases, got '+count);
for(const row of packet.cases.filter(row=>['function.parameter-refusal-before-result','function.itemType-field-refused'].includes(row.id))){const actual=engine.inspectProtectionFunction(row.sources.policy,row.sources.catalog,row.sources.closure,row.sources.selection);if(actual.status!=='refused'||actual.complete!==false||actual.authority!==false)throw Error('Excluded schema case must remain fail-closed: '+row.id);}
if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');
let missingAbiRefused=false,corruptAbiRefused=false;
try{createSecurityFunctionsEngine({});}catch(error){missingAbiRefused=error.message==='RUST_WASM_BINDING_MISSING';}
try{createSecurityFunctionsEngine({executeSecurityFunctionsWire:()=>'{"bad":true}'}).inspectProtectionFunction(null,null,null,null);}catch(error){corruptAbiRefused=error instanceof TypeError;}
if(!missingAbiRefused||!corruptAbiRefused)throw Error('ABI refusal control failed');
window.securityFunctionsReplay={status:'pass',profile:SECURITY_FUNCTIONS_PROFILE,caseCount:count,allCompleteFalse:true,allAuthorityFalse:true,exactFrozenPredecessor:true,excludedSchemaCasesRemainRefused:true,missingAbiRefused,corruptAbiRefused};`;
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
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.securityFunctionsReplay);
  assert.deepEqual(await page.evaluate(() => window.securityFunctionsReplay), {
    status: 'pass', profile: 'umf.security-functions/1', caseCount: 25,
    allCompleteFalse: true, allAuthorityFalse: true, exactFrozenPredecessor: true,
    excludedSchemaCasesRemainRefused: true, missingAbiRefused: true, corruptAbiRefused: true,
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({status:'pass',runtime:'Chromium',userAgent:await page.evaluate(()=>navigator.userAgent),profile:'umf.security-functions/1',caseCount:25,allCompleteFalse:true,allAuthorityFalse:true,exactFrozenPredecessor:true,excludedSchemaCasesRemainRefused:true,publicFactory:true,missingAbiRefused:true,corruptAbiRefused:true,accessorCasesExcluded:2,schemaDiagnosticCasesExcluded:2,artifacts:{predecessor:sha(packetBytes),publicWasmEntry:sha(publicEntryBytes),freshWasmGlue:sha(wasmJs),freshWasmBinary:sha(wasmBin)}}));
} finally { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
