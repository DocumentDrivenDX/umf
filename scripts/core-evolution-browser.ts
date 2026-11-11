// SPDX-License-Identifier: MIT OR Apache-2.0
/** Tool-only real Chromium check of the public Browser V4 Rust route. */
import {chromium} from 'playwright';
import {inspectCoreEvolution,verifyCoreEvolution} from '../src/index-node-v4';
import {buildBindingBrowserRuntime} from './binding/browser-runtime';
import original from '../spec/domain-packs/commerce/ontology.json';
const output=process.argv[2];if(!output)throw Error('Fresh output directory required');
await Bun.$`mkdir ${output}`;
const added=structuredClone(original)as any,m=added.modules.find((m:any)=>m.id==='domain');
m.elements.push({id:'products.evolution_note',name:'evolution_note',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
m.elements.find((e:any)=>e.id==='products').members.push({module:'domain',element:'products.evolution_note'});
const breaking=structuredClone(added);breaking.modules[0].elements.find((e:any)=>e.id==='order_lines.quantity').scalarType='string';
const required=structuredClone(added);required.modules[0].elements.at(-1).nullability='required';
const annotated=structuredClone(added);annotated.modules[0].elements.at(-1).description='Retained known annotation';
const repeated=structuredClone(added);repeated.modules[0].elements.at(-1).name='repeat';repeated.modules[0].elements.push({...repeated.modules[0].elements.at(-1),id:'products.second_note'});repeated.modules[0].elements.find((e:any)=>e.id==='products').members.push({module:'domain',element:'products.second_note'});
const inputs=[original,added,breaking,required,annotated,repeated],policy={profile:'core-0.8-absent-string-additions/0.1'}as const;
const expected=inputs.map(after=>inspectCoreEvolution(original as any,after as any,policy));
for(let i=0;i<inputs.length;i++)verifyCoreEvolution(expected[i]!,original as any,inputs[i]as any,policy);
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
 const path=new URL(req.url).pathname;
 if(path==='/umf.js')return new Response(browserJs,{headers:{'Content-Type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'Content-Type':'application/wasm'}});
 if(path==='/cases')return Response.json({original,inputs,policy,expected});
 return new Response('<!doctype html><title>Core Evolution</title>',{headers:{'Content-Type':'text/html'}});
}});
let browser;try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{original,inputs,policy,expected}=await(await fetch('/cases')).json();
  const actual=inputs.map((after:any)=>u.inspectCoreEvolution(original,after,policy));
  for(let i=0;i<actual.length;i++){if(JSON.stringify(actual[i])!==JSON.stringify(expected[i]))throw Error('Public Browser V4 receipt differs from Node V4');if(JSON.stringify(u.verifyCoreEvolution(actual[i],original,inputs[i],policy))!==JSON.stringify(actual[i]))throw Error('Receipt verification differs');}
  const controls=[];for(const run of [()=>u.inspectCoreEvolution(original,original,{profile:'x'.repeat(8000000)}),()=>u.verifyCoreEvolution({...actual[0],opaque:'x'.repeat(8000000)},original,inputs[0],policy)]){try{run();throw Error('Resource limit admitted');}catch(e:any){if(e.code!=='LIMIT')throw e;controls.push(e.code);}}
  if('Bun'in globalThis||'process'in globalThis||'Buffer'in globalThis)throw Error('Host global leaked into Browser V4');
  return {cases:actual.length,controls,classifications:actual.map((r:any)=>r.classification),completeReceiptParity:true};
 });
 if(external.length)throw Error('External browser request');
 await Bun.write(output+'/receipts.json',JSON.stringify(expected)+'\n');
 await Bun.write(output+'/report.json',JSON.stringify({...checks,browser:browser.version(),externalRequests:external,libraryNativeClaims:false})+'\n');
}finally{await browser?.close();server.stop(true);}
