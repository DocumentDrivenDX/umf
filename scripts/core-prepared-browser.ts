// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-080-AC3 @covers US-080-AC4
import {chromium} from 'playwright';
import {CURRENT_CORE_VERSION} from '../src/model/types';
import {probePreparedInspection} from '../tests/core/prepared-browser-probe';
import * as nodeRuntime from '../src/index-node-v4';
import {buildBindingBrowserRuntime} from './binding/browser-runtime';
const outputRoot=process.env.UMF_PREPARED_BROWSER_OUTPUT??'/private/tmp/sdk-prepared-browser';
await Bun.$`mkdir -p ${outputRoot}`.quiet();
const build=await Bun.build({entrypoints:['tests/core/prepared-browser-probe.ts'],target:'browser',format:'esm',minify:false});
if(!build.success)throw new AggregateError(build.logs,'browser bundle failed');
const artifact=build.outputs[0]!;await Bun.write(outputRoot+'/probe.js',artifact);
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/probe.js')return new Response(artifact,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
 return new Response('<!doctype html><title>Prepared core inspection</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const path='/probe.js',runtimePath='/umf.js';const m=await import(path),runtime=await import(runtimePath);return m.probePreparedInspection(runtime);});
 const expected=probePreparedInspection(nodeRuntime);await Bun.write(outputRoot+'/bun.json',expected);await Bun.write(outputRoot+'/chromium.json',actual);
 if(actual!==expected)throw Error('Chromium/Bun prepared inspection bytes differ');
 const receipt={status:'PASS',runtime:Bun.version,chromium:browser.version(),bytes:new TextEncoder().encode(actual).length,sha256:new Bun.CryptoHasher('sha256').update(actual).digest('hex'),bundleSha256:new Bun.CryptoHasher('sha256').update(await artifact.arrayBuffer()).digest('hex'),cases:['ordinary_selector_parity','unknown_key_and_facet_paths','caller_mutation_isolation','result_mutation_isolation','owned_recursive_freeze','unknown_content_retained'],coreVersions:[CURRENT_CORE_VERSION],temporalQualification:'HELD'};
 await Bun.write(outputRoot+'/verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser?.close();server.stop(true);}
