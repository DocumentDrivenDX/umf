// SPDX-License-Identifier: MIT OR Apache-2.0
// US-907-AC8: the current Browser V4 Rust root in actual Chromium must satisfy the owner fixture.
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runBulkStateCorpus} from '../tests/actions-bulk-state-corpus';
import * as api from '../src';
const fxPath='docs/helix/03-test/fixtures/bulk-update/transitions.json',fxText=readFileSync(fxPath,'utf8'),fx=JSON.parse(fxText);
const expected=runBulkStateCorpus(api,fx);
const bundle=await Bun.build({entrypoints:['tests/actions-bulk-state-corpus.ts'],target:'browser',format:'esm'});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const corpus=await bundle.outputs[0]!.text();
const wasmGlue=resolve('bindings/core/wasm/pkg/umf_core_wasm.js');
const wasmBytes=resolve('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm');
const browserRoot=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',plugins:[{name:'fresh-v4-wasm',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>{
 if(args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js')return {path:wasmGlue};
 if(args.importer.endsWith('bindings/core/wasm/loader.js')&&args.path==='./pkg/umf_core_wasm.js')return {path:wasmGlue};
 return undefined;
});}}]});
if(!browserRoot.success)throw Error(browserRoot.logs.join('\n'));
const browserJs=await browserRoot.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf-browser.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
 if(path==='/corpus.js')return new Response(corpus,{headers:{'content-type':'text/javascript'}});
 if(path==='/fixture.json')return new Response(fxText,{headers:{'content-type':'application/json'}});
 return new Response('<!doctype html><html><body>US-907 public browser proof</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();const errors:string[]=[],external:string[]=[];let wasmRequested=false;
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.port}`))external.push(r.url());if(r.url().includes('umf_core_wasm_bg.wasm'))wasmRequested=true;});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const a='/umf-browser.js',c='/corpus.js';const api=await import(a),{runBulkStateCorpus}=await import(c);const fx=await (await fetch('/fixture.json')).json();return runBulkStateCorpus(api,fx);});
 const mismatched=expected.filter((e,i)=>JSON.stringify(e)!==JSON.stringify(actual[i])).map(e=>e.id);
 const nodeGlobals=await page.evaluate(()=>['process','Buffer','require','module'].filter(name=>name in globalThis));
 if(actual.length!==expected.length||mismatched.length||errors.length||external.length||!wasmRequested||nodeGlobals.length)throw Error('Browser/in-process mismatch: '+JSON.stringify({mismatched:mismatched.slice(0,10),errors,external,wasmRequested,nodeGlobals,counts:[expected.length,actual.length]}));
 console.log(JSON.stringify({browser:browser.version(),cases:actual.length,passed:true,nativeExecution:false}));
}finally{await browser?.close();server.stop(true);}
