// SPDX-License-Identifier: MIT OR Apache-2.0
// Requires UMF_RAW_HOST_WASM_PACKAGE containing wasm-bindgen web output.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'../../../../');
const pkg=resolve(process.env.UMF_RAW_HOST_WASM_PACKAGE);
const wasmModule=pathToFileURL(resolve(pkg,'umf_json_value_host_admission_wasm_prototype.js')).href;
const wasmBytes=Buffer.from(await readFile(resolve(pkg,'umf_json_value_host_admission_wasm_prototype_bg.wasm'))).toString('base64');
const referenceModule=pathToFileURL(resolve(root,'dist/umf.js')).href;
const defaultModule=pathToFileURL(resolve(root,'dist/umf-browser.js')).href;
const html=`<!doctype html><meta charset="utf-8"><script type="module">
import * as wasm from ${JSON.stringify(wasmModule)};
import {readJsonValue as reference} from ${JSON.stringify(referenceModule)};
import {readJsonValue as defaultRoute} from ${JSON.stringify(defaultModule)};
const bytes=Uint8Array.from(atob(${JSON.stringify(wasmBytes)}),c=>c.charCodeAt(0));
await wasm.default(bytes);const sentinel=new Error('coercion sentinel');window.trace=[];
const overLimit=text=>text.length>100000,readLength=text=>text.length;
const throwingLength={};Object.defineProperty(throwingLength,'length',{get(){throw sentinel}});
const proxy=new Proxy({},{get(_target,key){trace.push('get:'+String(key));return key==='length'?1:undefined},getPrototypeOf(t){trace.push('getPrototypeOf');return Reflect.getPrototypeOf(t)},ownKeys(t){trace.push('ownKeys');return Reflect.ownKeys(t)}});
const cases=[['undefined-text',undefined],['null-text',null],['number-text',1],['boolean-text',true],['symbol-text',Symbol('text')],['plain-object-text',{}],['length-getter-throw-identity',throwingLength],['proxy-text-first-fault',proxy],['format-object-fallback','x: 1\\n',{}],['format-number-fallback','x: 1\\n',1],['format-symbol-fallback','x: 1\\n',Symbol('format')]];
function obs(fn){try{return {status:'returned',value:fn()}}catch(e){return {status:'threw',name:e?.name,code:e?.code,path:e?.path,message:e?.message,identity:e===sentinel}}}
let rustCalls=0;const instrumented=new Proxy(wasm,{get(target,key,receiver){if(key==='readJsonValueRawPrototype')return (...args)=>{rustCalls++;return target[key](...args)};return Reflect.get(target,key,receiver)}});
const rows=cases.map(([id,source,format])=>{trace=[];const expected=obs(()=>reference(source,format));const referenceTrace=[...trace];trace=[];const defaultActual=obs(()=>defaultRoute(source,format));const defaultTrace=[...trace];trace=[];const before=rustCalls;const actual=obs(()=>instrumented.readJsonValueRawPrototype(source,format,overLimit,readLength));const rustTrace=[...trace];const rustCallsForCase=rustCalls-before;return {id,expected,defaultActual,actual,referenceTrace,defaultTrace,rustTrace,rustCalls:rustCallsForCase,matches:JSON.stringify(expected)===JSON.stringify(defaultActual)&&JSON.stringify(expected)===JSON.stringify(actual)&&JSON.stringify(referenceTrace)===JSON.stringify(defaultTrace)&&JSON.stringify(referenceTrace)===JSON.stringify(rustTrace)&&rustCallsForCase===1}});
window.__probe={rows,rustCalls,browser:navigator.userAgent};</script>`;
const htmlPath='/private/tmp/umf-json-value-raw-host-probe.html';await writeFile(htmlPath,html);
const browser=await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH,args:['--allow-file-access-from-files']});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(pathToFileURL(htmlPath).href);await page.waitForFunction(()=>window.__probe);const result=await page.evaluate(()=>window.__probe);assert.deepEqual(errors,[]);console.log(JSON.stringify(result))}finally{await browser.close()}
