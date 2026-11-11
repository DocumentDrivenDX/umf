// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {captureParquet,type Document} from '../../src/index-node-v4';
import {projectBindingToParquet} from '../../src/index-node-v4';
import {buildBindingBrowserRuntime} from './browser-runtime';

const fixture=await Bun.file('fixtures/binding/parquet/case.json').json();
const bytes=new Uint8Array(await Bun.file(fixture.native).arrayBuffer());
const archive=captureParquet(bytes,{id:'binding-parquet-native'});
const expected=projectBindingToParquet(fixture.logical as Document,fixture.binding as Document,'report',archive);
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});
  if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
  if(path==='/case')return Response.json({logical:fixture.logical,binding:fixture.binding,archive,expected});
  return new Response('<!doctype html><html>Binding Parquet</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];let wasmRequested=false;
  page.on('request',request=>{if(request.url().includes('umf_core_wasm_bg.wasm'))wasmRequested=true;});
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',u=await import(modulePath),f=await(await fetch('/case')).json();
    const report=u.projectBindingToParquet(f.logical,f.binding,'report',f.archive);
    if(JSON.stringify(report)!==JSON.stringify(f.expected))throw Error('Bun/Chromium report mismatch');
    const strict=u.projectBindingToParquet(f.logical,f.binding,'strict',f.archive);
    if(strict.status!=='blocked'||'candidate'in strict)throw Error('Strict policy emitted a candidate');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {residuals:report.residuals.length,status:report.status,strictStatus:strict.status};
  });
  if(external.length||!wasmRequested)throw Error('Browser did not use local WASM: '+JSON.stringify({external,wasmRequested}));
  await Bun.write('fixtures/binding/parquet/browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}
