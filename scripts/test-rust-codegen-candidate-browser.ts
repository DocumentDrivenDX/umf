// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';

const corpus=JSON.parse(await Bun.file('tests/rust-core/fixtures/r3/baseline/operations.json').text());
const candidate=Bun.file('dist/umf-rust-codegen-candidate-v2-browser.js');
const wasm=Bun.file('dist/umf_core_wasm_bg.wasm');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(candidate,{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(wasm,{headers:{'content-type':'application/wasm'}});
 if(path==='/corpus.json')return Response.json(corpus);
 if(path==='/')return new Response('<!doctype html><script type="importmap">{"imports":{"@umf/core/rust-codegen-candidate/v2":"/candidate.js"}}</script><body>V2 candidate qualification</body>',{headers:{'content-type':'text/html'}});
 return new Response('not found',{status:404});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let externalRequests=0;
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests++;return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const api=await import('@umf/core/rust-codegen-candidate/v2');
  const {createPythonClientRustCandidateV2}=api;
  const generator=await createPythonClientRustCandidateV2();
  const corpus=await(await fetch('/corpus.json')).json();
  const cases=corpus.cases.filter((item:any)=>item.operation==='generatePythonClient');
  const canonical=(value:any):string=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
  for(const item of cases){
   let actual:any;
   try{actual={ok:true,result:generator(item.request)};}
   catch(error){const value=error as Error&{code?:string;path?:string};actual={ok:false,error:{code:value.code,message:value.message,path:value.path}};}
   if(canonical(actual)!==canonical(item.expected))throw new Error(`R3 browser parity mismatch: ${item.id}`);
  }
  let cancelled=false;
  const controlled=await createPythonClientRustCandidateV2({controls:{isCancelled:()=>cancelled}});
  cancelled=true;let controlCode='';
  try{controlled({text:'{}',package:'shop'});}catch(error){controlCode=(error as {code?:string}).code??'';}
  if(controlCode!=='CANCELLED')throw new Error(`Browser cooperative control mismatch: ${controlCode}`);
  cancelled=false;
  const recoveryCase=cases.find((item:any)=>item.expected.ok===true);
  if(!recoveryCase)throw new Error('R3 corpus has no successful recovery case');
  const recovered=canonical({ok:true,result:controlled(recoveryCase.request)})===canonical(recoveryCase.expected);
  if(!recovered)throw new Error('Browser generator did not recover after cancellation');
  return {cases:cases.length,controlCode,recovered,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 });
 if(result.cases!==31||result.controlCode!=='CANCELLED'||!result.recovered||!result.nodeGlobalsAbsent||externalRequests!==0)throw new Error('Browser candidate qualification failed');
 console.log(JSON.stringify({...result,browser:browser.version(),externalRequests}));
}finally{await browser?.close();server.stop(true);}
