// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {generatePythonClient} from '../src/access';

const bundlePath=process.env.UMF_ROOT_V4_BROWSER_BUNDLE;
const wasmPath=process.env.UMF_ROOT_V4_WASM;
if(!bundlePath||!wasmPath)throw new Error('Set UMF_ROOT_V4_BROWSER_BUNDLE and UMF_ROOT_V4_WASM to the built browser entry and paired WASM');
const bundle=Bun.file(bundlePath),wasm=Bun.file(wasmPath),text=await Bun.file('tests/unified/commerce.json').text();
const request={text,package:'shop',records:[{module:'commerce',element:'Order'}],actions:[{module:'commerce',action:'shipOrder'}]};
const expected=generatePythonClient(request as any);
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(incoming){
 const path=new URL(incoming.url).pathname;
 if(path.endsWith('/root.js'))return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path.endsWith('/umf_core_wasm_bg.wasm')){
  if(path.startsWith('/failure/'))return new Response(new Uint8Array([0,1,2]),{headers:{'content-type':'application/wasm'}});
  return new Response(wasm,{headers:{'content-type':'application/wasm'}});
 }
 if(path==='/commerce.json')return new Response(text,{headers:{'content-type':'application/json'}});
 if(path==='/expected.json')return Response.json(expected);
 return new Response('<!doctype html><title>V4 root browser test</title>');
}});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;
 page.on('request',incoming=>{if(!incoming.url().startsWith(server.url.origin))externalRequests++;});
 await page.goto(server.url.href);
 const result=await page.evaluate(async()=>{
  const api=await import(new URL('/root.js',location.href).href) as any;
  const expected=await(await fetch('/expected.json')).json();
  const generated=api.generatePythonClient({text:await(await fetch('/commerce.json')).text(),package:'shop',records:[{module:'commerce',element:'Order'}],actions:[{module:'commerce',action:'shipOrder'}]});
  const canonical=(value:any)=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
  if(generated&&typeof generated.then==='function')throw new Error('root V4 generator is asynchronous');
  if(canonical(generated)!==canonical(expected))throw new Error('root V4 output differs from TypeScript');
  let importFailure:any;
  try{await import(new URL('/failure/root.js',location.href).href);}catch(error){importFailure=error;}
  if(!importFailure)throw new Error('root V4 module import succeeded with corrupt WASM');
  return {syncFunction:typeof api.generatePythonClient==='function',exactFiles:generated.files.length,importFailure:String(importFailure),browser:navigator.userAgent};
 });
 if(externalRequests)throw new Error(`V4 root browser made ${externalRequests} external requests`);
 if(!result.syncFunction||result.exactFiles!==7)throw new Error('root V4 browser surface mismatch');
 console.log(JSON.stringify({...result,externalRequests}));
}finally{await browser?.close();server.stop(true);}
