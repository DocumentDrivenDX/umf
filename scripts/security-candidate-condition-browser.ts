// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const build=await Bun.build({entrypoints:['src/extensions/security/candidate-condition-host-browser.ts'],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/condition.js')return new Response(build.outputs[0],{headers:{'content-type':'text/javascript'}});
 if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm'),{headers:{'content-type':'application/wasm'}});
 return new Response('<!doctype html><title>Candidate condition</title>',{headers:{'content-type':'text/html'}});
}});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),url=`http://127.0.0.1:${server.port}`;
 await page.route('**/*',route=>route.request().url().startsWith(url+'/')?route.continue():route.abort());
 await page.goto(url);
 const result=await page.evaluate(async()=>{
  const path='/condition.js';
  const {evaluateCandidateCompactCondition,normalizeCandidateConditionSource,preflightCandidateCompactCondition}=await import(path);
  const term={kind:'witness-term',occurrence:0,term:{kind:'record-identity'}};
  const expression={op:'and',args:[
   {op:'exists',association:0,occurrence:0,alias:'a',where:{op:'eq',left:term,right:term}},
   {op:'not',arg:{op:'literal',value:false}},
  ]};
  const visited:number[]=[];let steps=0;
  const truth=evaluateCandidateCompactCondition(expression,4,(event:any)=>{
   if(event.kind==='step'){steps++;return true;}
   if(event.resourceIndex!==4)throw Error('Unexpected resource');
   if(event.kind==='rows'){if(event.association!==0)throw Error('Unexpected association');return 3;}
   const {rowIndex,occurrence,association}=event.bindings[0];
   if(event.kind!=='terms'||occurrence!==0||association!==0)throw Error('Unexpected lexical binding');
   visited.push(rowIndex);
   return {left:rowIndex===0?null:'\ud800',right:'\ud800'};
  });
  const source={op:'and',args:[{op:'literal',value:true},{op:'not',arg:{op:'literal',value:false}}]};
  const normalized=normalizeCandidateConditionSource(source,()=>{throw Error('Unexpected source callback');});
  const type={documentId:'demo',moduleId:'m',elementId:'Join'};
  const recordTerm={kind:'witness-term',occurrence:0,term:{kind:'record-identity',type}};
  const dependencies:string[]=[];
  const admitted=preflightCandidateCompactCondition(
   {op:'exists',association:0,occurrence:0,alias:'a',where:{op:'eq',left:recordTerm,right:recordTerm}},
   type,(event:any)=>{dependencies.push(event.kind);return true;},[{graph:false,type}],
  );
  return {truth,visited,steps,normalized,admitted,dependencies};
 });
 assert.deepEqual(result,{
  truth:'T',visited:[0,1],steps:8,admitted:true,
  normalized:{op:'and',args:[{op:'literal',value:true},{op:'not',arg:{op:'literal',value:false}}]},
  dependencies:['step','completeAssociation','step','step','completeType','step','completeType'],
 });
 console.log('Chromium passed Rust condition normalization, dependency planning, exact UTF-16 equality, and existential short circuit.');
}finally{await browser?.close();server.stop(true);}
