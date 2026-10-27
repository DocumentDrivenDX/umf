// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'../../..');
const packageRoot=resolve(process.env.UMF_JSON_VALUE_WASM_PACKAGE??'/private/tmp/umf-json-value-wasm-package');
const facadePath=resolve(process.env.UMF_JSON_VALUE_WASM_FACADE??`${packageRoot}/facade.mjs`);
const cases=[
  ['undefined-text'],['null-text',null],['number-text',1],['boolean-text',true],['symbol-text','symbol'],
  ['plain-object-text',{}],['length-getter-throw-identity','length-getter'],['proxy-text-first-fault','proxy'],
  ['format-object-fallback','x: 1\n',{}],['format-number-fallback','x: 1\n',1],['format-symbol-fallback','x: 1\n','symbol'],
];
const html=`<!doctype html><meta charset="utf-8"><script type="module">
import {readJsonValue as defaultRoute} from '/dist/umf-browser.js';
import {readJsonValue as reference} from '/dist/umf.js';
import * as wasm from '/pkg/umf_core_wasm.js';
import {createEngine} from '/facade.mjs';
const cases=${JSON.stringify(cases)}; const wasmBytes=await fetch('/pkg/umf_core_wasm_bg.wasm').then(r=>r.arrayBuffer()); await wasm.default(wasmBytes); let rustCalls=0;
const instrumented=new Proxy(wasm,{get(target,key,receiver){if(key==='readTypescriptJsonValueWire')return (...args)=>{rustCalls++;return target[key](...args)};return Reflect.get(target,key,receiver)}});
const engine=createEngine(instrumented); const sentinel=new Error('coercion sentinel');
function value(token){if(token==='undefined-text')return undefined;if(token==='symbol')return Symbol('text');if(token==='length-getter'){const o={};Object.defineProperty(o,'length',{get(){throw sentinel}});return o}if(token==='proxy')return new Proxy({},{get(_t,k){window.trace.push('get:'+String(k));return k==='length'?1:undefined},getPrototypeOf(t){window.trace.push('getPrototypeOf');return Reflect.getPrototypeOf(t)},ownKeys(t){window.trace.push('ownKeys');return Reflect.ownKeys(t)}});return token}
function obs(fn){try{return {status:'returned',value:fn()}}catch(e){return {status:'threw',name:e?.name,code:e?.code,path:e?.path,message:e?.message,identity:e===sentinel}}}
const rows=cases.map(([id,source,format])=>{window.trace=[];const actualSource=value(id==='undefined-text'?id:source);const actualFormat=format==='symbol'?Symbol('format'):format;const before=rustCalls;const expected=obs(()=>reference(actualSource,actualFormat));const referenceTrace=[...window.trace];window.trace=[];const defaultActual=obs(()=>defaultRoute(actualSource,actualFormat));const defaultTrace=[...window.trace];window.trace=[];const rust=obs(()=>engine.readJsonValue(actualSource,actualFormat));const rustTrace=[...window.trace];return {id,expected,defaultActual,rust,referenceTrace,defaultTrace,rustTrace,rustCalls:rustCalls-before}});
window.__probe={browser:navigator.userAgent,rows,rustCalls,nodeGlobals:{process:typeof process,Buffer:typeof Buffer,require:typeof require}};
</script>`;
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname;if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}let file;if(path==='/facade.mjs')file=facadePath;else if(path.startsWith('/pkg/'))file=resolve(packageRoot,path.slice(5));else if(path==='/dist/umf-browser.js')file=resolve(root,'dist/umf-browser.js');else if(path==='/dist/umf.js')file=resolve(root,'dist/umf.js');if(!file||(!file.startsWith(packageRoot+sep)&&file!==facadePath&&file!==resolve(root,'dist/umf-browser.js')&&file!==resolve(root,'dist/umf.js'))){res.writeHead(404);res.end();return}try{const b=await readFile(file);res.writeHead(200,{'content-type':file.endsWith('.wasm')?'application/wasm':'text/javascript'});res.end(b)}catch{res.writeHead(404);res.end()}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const browser=await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH});
try{const page=await browser.newPage();const pageErrors=[];const failed=[];page.on('pageerror',e=>pageErrors.push(String(e)));page.on('requestfailed',r=>failed.push(`${r.url()}: ${r.failure()?.errorText}`));await page.goto(`http://127.0.0.1:${server.address().port}`);try{await page.waitForFunction(()=>Boolean(window.__probe),null,{timeout:20000})}catch(error){throw new Error(`${error}; pageErrors=${pageErrors.join(' | ')}; failed=${failed.join(' | ')}`)}const result=await page.evaluate(()=>window.__probe);assert.deepEqual(pageErrors,[]);console.log(JSON.stringify(result))}finally{await browser.close();await new Promise(ok=>server.close(ok))}
