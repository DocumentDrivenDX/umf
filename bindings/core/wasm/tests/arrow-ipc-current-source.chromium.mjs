// Replay frozen Arrow IPC predecessor outcomes through a fresh WASM module in real Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(process.argv[2] ?? '/private/tmp/umf-arrow-ipc-wasm-pkg');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-arrow-ipc-capture-predecessor-20261027/typescript-arrow-ipc-capture.json.gz');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(gunzipSync(packetBytes));
const wasmGlue = await readFile(resolve(packageRoot, 'umf_core_wasm.js'));
const wasmBinary = await readFile(resolve(packageRoot, 'umf_core_wasm_bg.wasm'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const boundary = process.env.UMF_ARROW_IPC_SKIP_BOUNDARY === '1';
const entry = `
import * as wasm from '/pkg/umf_core_wasm.js';
await wasm.default('/pkg/umf_core_wasm_bg.wasm');
const {createArrowIpcEngine, ARROW_IPC_PROFILE}=await import('/binding/index.js');
const packet=await fetch('/packet.json').then(r=>r.json());
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const summary=async bytes=>({byteLength:bytes.byteLength,sha256:await hash(bytes)});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const outcome=fn=>{try{return{kind:'return',value:fn()}}catch(error){return{kind:'throw',error:{name:error?.name,code:error?.code??null,path:error?.path??null,message:String(error?.message??error)}}}};
const mismatches=[];const boundarySkipped=[];let calls=0;let metered=0;
const mismatch=(name,operation,expected,actual)=>mismatches.push({name,operation,expected,actual});
const compare=(name,operation,expected,actual)=>{if(expected.kind!==actual.kind){mismatch(name,operation,expected,actual);return;}if(expected.kind==='throw'){for(const key of ['code','message','path'])if(actual.error[key]!==expected.error[key]){mismatch(name,operation,expected,actual);return;}}else if(JSON.stringify(canonical(actual.value))!==JSON.stringify(canonical(expected.value)))mismatch(name,operation,expected,actual);};
const createEngine=()=>createArrowIpcEngine(wasm,{controls:{meter(amount){metered+=amount;},now:()=>Date.now(),deadlineMs:Date.now()+120000}});const engine=createEngine();const invoke=(method,...args)=>createEngine()[method](...args);if(engine.profile!==ARROW_IPC_PROFILE||engine.capabilities.complete!==false)throw Error('profile/capability mismatch');
for(const item of packet.cases){if(${boundary}&&item.input.byteLength>=1000000){boundarySkipped.push(item.name);continue;}
let bytes;if(item.file)bytes=new Uint8Array(await fetch('/fixtures/arrow/ipc-inputs/'+item.file).then(r=>r.arrayBuffer()));else if(item.name==='empty')bytes=new Uint8Array();else if(item.name==='invalid')bytes=new Uint8Array([0,255,0]);else if(item.name==='truncated')bytes=new Uint8Array(await fetch('/fixtures/arrow/ipc-inputs/int64.stream.arrow').then(r=>r.arrayBuffer())).slice(0,20);else if(item.name==='trailing'){const src=new Uint8Array(await fetch('/fixtures/arrow/ipc-inputs/int64.stream.arrow').then(r=>r.arrayBuffer()));bytes=new Uint8Array(src.length+3);bytes.set(src);bytes.set([0,255,7],src.length);}else bytes=new Uint8Array(1000000);
const inputSummary=await summary(bytes);if(JSON.stringify(inputSummary)!==JSON.stringify(item.input))mismatch(item.name,'input',item.input,inputSummary);
const capture=outcome(()=>invoke('captureArrowIpc',bytes,{id:item.file??item.name}));calls++;if(capture.kind!=='return'){mismatch(item.name,'capture',item.document,capture);continue;}
const serialized=new TextEncoder().encode(JSON.stringify(capture.value));const docSummary={jsonSha256:await hash(serialized),jsonByteLength:serialized.length};if(JSON.stringify(docSummary)!==JSON.stringify(item.document))mismatch(item.name,'capture-document',item.document,docSummary);
const inspected=outcome(()=>invoke('inspectArrowIpcCapture',capture.value));calls++;compare(item.name,'inspect',{kind:'return',value:item.inspect},inspected);
const exported=outcome(()=>invoke('exportArrowIpcCapture',capture.value));calls++;if(exported.kind!=='return')mismatch(item.name,'export',item.export,exported);else{const outputSummary=await summary(exported.value);if(JSON.stringify(outputSummary)!==JSON.stringify(item.export))mismatch(item.name,'export',item.export,outputSummary);if(JSON.stringify(Array.from(exported.value))!==JSON.stringify(Array.from(bytes)))mismatch(item.name,'byte-equality',true,false);}
}
for(const item of packet.mutations){const inspected=outcome(()=>invoke('inspectArrowIpcCapture',item.document));calls++;compare(item.name,'inspect',item.inspect,inspected);const exported=outcome(()=>Array.from(invoke('exportArrowIpcCapture',item.document)));calls++;compare(item.name,'export',item.exported,exported);}
if(${boundary})boundarySkipped.push('oversize');else{const tooBig=outcome(()=>invoke('captureArrowIpc',new Uint8Array(1000001),{id:'oversize'}));calls++;compare('oversize','capture',packet.oversize,tooBig);}
const source=new Uint8Array([1,2,3]);const copied=invoke('captureArrowIpc',source,{id:'copy'});calls++;source.fill(0);const afterInputMutation=Array.from(invoke('exportArrowIpcCapture',copied));calls++;const first=invoke('exportArrowIpcCapture',copied);calls++;first.fill(0);const afterOutputMutation=Array.from(invoke('exportArrowIpcCapture',copied));calls++;if(JSON.stringify({afterInputMutation,afterOutputMutation})!==JSON.stringify(packet.copyControl))mismatch('copy-control','byte-copy',packet.copyControl,{afterInputMutation,afterOutputMutation});
if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals available in Chromium');
window.arrowIpcReplay={status:mismatches.length?'mismatch':'pass',profile:ARROW_IPC_PROFILE,cases:packet.cases.length-boundarySkipped.filter(x=>packet.cases.some(i=>i.name===x)).length,mutations:packet.mutations.length,calls,controlsMetered:metered>0,metered,boundarySkipped,mismatches};`;

const modules = new Map([['/entry.js', entry], ['/packet.json', JSON.stringify(packet)], ['/pkg/umf_core_wasm.js', wasmGlue], ['/pkg/umf_core_wasm_bg.wasm', wasmBinary]]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, {'content-type': 'text/html'}); return response.end('<!doctype html><meta charset="utf-8"><script type="module" src="/entry.js"></script>'); }
  if (modules.has(pathname)) { const data=modules.get(pathname); response.writeHead(200, {'content-type': pathname.endsWith('.wasm')?'application/wasm':pathname.endsWith('.json')?'application/json':'text/javascript'}); return response.end(data); }
  let file;
  if (pathname.startsWith('/binding/')) file = resolve(root, 'bindings/core/wasm', pathname.slice('/binding/'.length));
  else if (pathname.startsWith('/fixtures/')) file = resolve(root, pathname.slice(1));
  if (file && file.startsWith(root + '/')) { try { const data=await readFile(file); response.writeHead(200, {'content-type': file.endsWith('.js')?'text/javascript':'application/octet-stream'}); return response.end(data); } catch {} }
  response.writeHead(404); response.end('not found');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try {
  const page=await browser.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>window.arrowIpcReplay,undefined,{timeout:300000});
  const result=await page.evaluate(()=>window.arrowIpcReplay);assert.deepEqual(pageErrors,[]);
  const receipt={format:'umf-r8-arrow-ipc-capture-chromium-current-source/1',browser:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),perCallTimeoutMs:120000,...result,artifacts:{packetSha256:sha(packetBytes),wasmGlueSha256:sha(wasmGlue),wasmBinarySha256:sha(wasmBinary)}};
  console.log(JSON.stringify(receipt));
  if(result.mismatches.length)process.exitCode=1;
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
