// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {captureDeltaLog,type Document} from '../../src';
import {projectBindingToDelta} from '../../src/index-node-v4';
import {buildBindingBrowserRuntime} from './browser-runtime';

const base='fixtures/projections/ddd-postgresql-tables/';
const graph=await Bun.file(base+'case.json').json(),binding=await Bun.file(base+'delta-binding.json').json();
const source=await Bun.file(base+'delta-native.jsonl').text();
const native=captureDeltaLog(source,{id:'ddd-order-delta-source'});
const expected=projectBindingToDelta(graph.logical as Document,binding as Document,native,'strict');
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});
  if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
 if(path==='/case')return Response.json({logical:graph.logical,binding,native,expected});
 return new Response('<!doctype html><title>Shared graph Delta binding</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];let wasmRequested=false;
 page.on('request',request=>{if(request.url().includes('umf_core_wasm_bg.wasm'))wasmRequested=true;});
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',umf=await import(path),fixture=await(await fetch('/case')).json();
  const report=umf.projectBindingToDelta(fixture.logical,fixture.binding,fixture.native,'strict');
  if(JSON.stringify(report)!==JSON.stringify(fixture.expected))throw Error('Bun/Chromium Delta report mismatch');
  const lossy=structuredClone(fixture.binding);
  lossy.extensions['umf.binding'].indexes.push({name:'unsupported_gin',kind:'gin',on:[{field:{module:'sales',element:'Order',field:'tenant'}}],unique:false});
  const strict=umf.projectBindingToDelta(fixture.logical,lossy,fixture.native,'strict');
  const permissive=umf.projectBindingToDelta(fixture.logical,lossy,fixture.native,'report');
  if(strict.status!=='blocked'||strict.candidate||permissive.status!=='reported'||!permissive.residuals.some((row:any)=>row.path.endsWith('/indexes/1')))throw Error('Unsupported index loss was not explicit');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
  return {status:report.status,strictBlocked:true,reportResidualized:true,candidate:report.candidate};
 });
 if(external.length||!wasmRequested)throw Error('Browser did not use local WASM: '+JSON.stringify({external,wasmRequested}));
 await Bun.write(base+'delta-browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
 console.log({browser:browser.version(),status:result.status,strictBlocked:result.strictBlocked});
}finally{await browser?.close();server.stop(true);}
