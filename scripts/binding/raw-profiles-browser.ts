// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {inspectRawTableBinding,readBindingDocument,writeBindingDocument} from '../../src/index-node-v4';
import type {Document} from '../../src/model/types';
import {buildBindingBrowserRuntime} from './browser-runtime';
const logical=await Bun.file('fixtures/binding/raw-profiles/logical.json').json() as Document;
const cases:{id:string;binding:Document;logical:Document;target:{platform:string;majorVersion:string};module:string}[]=[];
for(const system of ['lakebase','unity-catalog','spark-delta']){
 const binding=await Bun.file(`fixtures/binding/raw-profiles/${system}.json`).json() as Document;
 const p=binding.extensions!['umf.binding'] as any,target={platform:system,majorVersion:p.target.version};
 cases.push({id:system,binding,logical,target,module:'sales'});
 cases.push({id:system+'-version-mismatch',binding,logical,target:{...target,majorVersion:p.target.version+'.1'},module:'sales'});
 const unknown=structuredClone(binding);(unknown.extensions!['umf.binding'] as any).future={retained:['opaque']};
 cases.push({id:system+'-unknown',binding:unknown,logical,target,module:'sales'});
 const missing=structuredClone(logical);delete (missing.modules[0]!.elements[1] as any).members;
 cases.push({id:system+'-missing-members',binding,logical:missing,target,module:'sales'});
}
const outputs=cases.map(c=>inspectRawTableBinding(c.binding,c.logical,c.target,c.module));
assert.deepEqual(outputs.map(r=>r.valid),cases.map(c=>!c.id.includes('-version-mismatch')&&!c.id.includes('-unknown')&&!c.id.includes('-missing-members')));
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
 const path=new URL(req.url).pathname;
 if(path==='/browser-root.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html>Declarative binding qualification',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const observed=await page.evaluate(async()=>{
  const root='/browser-root.js',binding=await import(root),cases=await(await fetch('/cases')).json();
  const results=cases.map((c:any)=>binding.inspectRawTableBinding(c.binding,c.logical,c.target,c.module));
  for(const c of cases.filter((c:any)=>!c.id.includes('-missing-members')))for(const format of ['json','yaml']){
   const recovered=binding.readBindingDocument(binding.writeBindingDocument(c.binding,c.logical,format),c.logical,format);
   if(JSON.stringify(recovered)!==JSON.stringify(c.binding))throw Error('Recovery mismatch');
  }
  if('Bun'in globalThis||'process'in globalThis||'Buffer'in globalThis)throw Error('Host globals leaked');
  return results;
 });
 assert.deepEqual(observed,outputs);assert.deepEqual(external,[]);
 for(const c of cases.filter(c=>!c.id.includes('-missing-members')))for(const format of ['json','yaml'] as const)assert.equal(JSON.stringify(readBindingDocument(writeBindingDocument(c.binding,c.logical,format),c.logical,format)),JSON.stringify(c.binding));
 console.log(JSON.stringify({chromium:browser.version(),cases:cases.length,passed:true}));
}finally{await browser?.close();server.stop(true);}
