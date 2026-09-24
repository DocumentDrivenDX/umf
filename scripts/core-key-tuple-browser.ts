import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {tupleCases,tupleDocument,tupleIdentity} from './core-key-tuple-cases';
const entry='.cache/core-key-tuple-browser-entry.ts';
await Bun.write(entry,"export {encodeCoreKeyTuple,verifyCoreKeyTuple,readCoreKeyTupleBytes} from '../src/model/key-tuple';export {readJsonValue,writeJsonValue} from '../src/model/serialization';\n");
const built=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert.ok(built.success,JSON.stringify(built.logs));
const bundle=await built.outputs[0]!.text(),cases=tupleCases();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json({cases,identity:tupleIdentity,many:tupleDocument(Array.from({length:128},(_,i)=>({id:'f'+i,scalarType:'boolean'}))),single:tupleDocument([{id:'s',scalarType:'string'}])});
 return new Response('<!doctype html><html><body>Candidate UMF Key tuple encoding</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/candidate.js',u=await import(path),f=await(await fetch('/cases')).json();let encoded=0,refused=0,recoveries=0;
  const fails=(fn:()=>unknown)=>{try{fn();}catch{return;}throw Error('Expected refusal');};
  for(const row of f.cases){
   const before=JSON.stringify({document:row.document,values:row.values});
   if(row.error){fails(()=>u.encodeCoreKeyTuple(row.document,f.identity,row.values));refused++;}
   else{
    const receipt=u.encodeCoreKeyTuple(row.document,f.identity,row.values);
    if(receipt.bytesHex!==row.hex)throw Error('Golden frame mismatch: '+row.id);
    const hex=Array.from(u.readCoreKeyTupleBytes(receipt,row.document) as Uint8Array,v=>v.toString(16).padStart(2,'0')).join('');
    if(hex!==row.hex)throw Error('Verified bytes mismatch');
    for(const format of ['json','yaml']){
     const recovered=u.readJsonValue(u.writeJsonValue(receipt,format),format);
     if(JSON.stringify(u.verifyCoreKeyTuple(recovered,row.document))!==JSON.stringify(receipt))throw Error('Receipt recovery changed');recoveries++;
    }
    encoded++;
   }
   if(JSON.stringify({document:row.document,values:row.values})!==before)throw Error('Input mutated');
  }
  const row=f.cases[0],receipt=u.encodeCoreKeyTuple(row.document,f.identity,row.values);
  fails(()=>u.readCoreKeyTupleBytes({...receipt,bytesHex:receipt.bytesHex+'00'},row.document));
  fails(()=>u.readCoreKeyTupleBytes({...receipt,bytesHex:receipt.bytesHex.replace('554d464b3101','554d464b318100')},row.document));
  const current=structuredClone(row.document);current.id='changed';fails(()=>u.verifyCoreKeyTuple(receipt,current));
  let getterCalls=0;fails(()=>u.encodeCoreKeyTuple(f.single,f.identity,[{get string(){getterCalls++;return 'x';}}]));if(getterCalls)throw Error('Getter invoked');
  if(!u.encodeCoreKeyTuple(f.many,f.identity,Array.from({length:128},()=>({boolean:false}))).bytesHex.startsWith('554d464b318001'))throw Error('Nonminimal count');
  if(!u.encodeCoreKeyTuple(f.single,f.identity,[{string:'x'.repeat(128)}]).bytesHex.startsWith('554d464b3101048001'))throw Error('Nonminimal length');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals leaked');
  return {cases:f.cases.length,encoded,refused,recoveries,forgedFramesRefused:2,staleContextRefused:true,framingChecks:2,getterCalls};
 });
 assert.deepEqual(externalRequests,[]);assert.equal(checks.cases,cases.length);assert.equal(checks.recoveries,checks.encoded*2);
 const paths=['scripts/core-key-tuple-browser.ts','scripts/core-key-tuple-cases.ts','scripts/core-key-tuple-schema.ts','src/model/key-tuple.ts','src/validation/keys.ts','src/validation/document.ts','src/validation/schema.ts','src/validation/facets.ts','src/model/json.ts','src/model/types.ts','src/model/serialization.ts','spec/core/key-document.schema.json','spec/core/key-tuple-operation.schema.json','tests/core/key-tuple.test.ts','fixtures/key/tuple-encoding-v1.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-key-tuple-browser.json',JSON.stringify({scope:'Exact experimental Key tuple encoding and receipt verification through a focused browser bundle; no native binding or author-provenance claim',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
