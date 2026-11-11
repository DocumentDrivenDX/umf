// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {importIcebergTable,type Document} from '../../src/index-node-v4';
import {projectBindingToIceberg} from '../../src/index-node-v4';
import {buildBindingBrowserRuntime} from './browser-runtime';

const fixture=await Bun.file('fixtures/binding/iceberg/case.json').json();
const native=importIcebergTable(await Bun.file(fixture.native).text(),{id:'iceberg-native'});
const expected=projectBindingToIceberg(fixture.logical as Document,fixture.binding as Document,native,'report');
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});
  if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
  if(path==='/case')return Response.json({logical:fixture.logical,binding:fixture.binding,native,expected});
  return new Response('<!doctype html><html>Binding Iceberg</html>',{headers:{'content-type':'text/html'}});
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
    const report=u.projectBindingToIceberg(f.logical,f.binding,f.native,'report');
    if(JSON.stringify(report)!==JSON.stringify(f.expected))throw Error('Bun/Chromium report mismatch');
    if(u.projectBindingToIceberg(f.logical,f.binding,f.native,'strict').status!=='blocked')throw Error('Strict accepted sort-order approximation');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {status:report.status,residuals:report.residuals.length,strictBlocked:true};
  });
  if(external.length||!wasmRequested)throw Error('Browser did not use local WASM: '+JSON.stringify({external,wasmRequested}));
  await Bun.write('fixtures/binding/iceberg/browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}
