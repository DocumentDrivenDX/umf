import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {keyTransitionCases} from './core-key-transition-cases';
const entry='.cache/core-key-transition-browser-entry.ts';
await Bun.write(entry,"export {upgradeKeyEnvelope,rollbackKeyEnvelope} from '../src/model/key-transition';export {encodeCoreKeyTuple} from '../src/model/key-tuple';export {readJsonValue,writeJsonValue} from '../src/model/serialization';\n");
const built=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert.ok(built.success,JSON.stringify(built.logs));
const bundle=await built.outputs[0]!.text(),cases=keyTransitionCases();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html><html><body>Candidate UMF Key migration</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/candidate.js',u=await import(path),cases=await(await fetch('/cases')).json();let archivedMembers=0,upgradeRecoveries=0,rollbackRecoveries=0;
  const same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Recovery mismatch');};
  const fails=(fn:()=>unknown)=>{try{fn();}catch{return;}throw Error('Expected refusal');};
  for(const row of cases){
   const before=JSON.stringify(row.source),receipt=u.upgradeKeyEnvelope(row.source);
   if(receipt.residuals.length!==9)throw Error('Missing archive');for(const r of receipt.residuals)same(r.value,row.value);archivedMembers+=receipt.residuals.length;
   for(const e of receipt.target.modules[0].elements)for(const k of ['key','keys','members'])if(Object.hasOwn(e,k))throw Error('Legacy assertion adopted');
   same(receipt.target.extensions,row.source.extensions);same(receipt.target.keys,row.source.keys);same(receipt.target.modules[0].members,row.source.modules[0].members);same(receipt.target.modules[0].elements[0].references,row.source.modules[0].elements[0].references);
   for(const format of ['json','yaml']){
    const saved=u.readJsonValue(u.writeJsonValue(receipt,format),format);same(saved,receipt);upgradeRecoveries++;
    const rollback=u.rollbackKeyEnvelope(saved,saved.target),restored=u.readJsonValue(u.writeJsonValue(rollback,format),format);same(restored.target,row.source);same(restored.source,receipt.target);rollbackRecoveries++;
   }
   if(JSON.stringify(row.source)!==before)throw Error('Input mutated');
  }
  const receipt=u.upgradeKeyEnvelope(cases[0].source),current=structuredClone(receipt.target),r=current.modules[0].elements[0];
  r.members=[{module:'m',element:'id'}];r.keys=[{id:'new-key',name:'Authored',fields:[{module:'m',element:'id'}]}];current.extensions.future={newMeaning:true};
  if(u.encodeCoreKeyTuple(current,{module:'m',element:'record',key:'new-key'},[{integerToken:'42'}]).bytesHex!=='554d464b310102023432')throw Error('Migrated tuple mismatch');
  const rollback=u.rollbackKeyEnvelope(receipt,current);same(rollback.target,cases[0].source);same(rollback.source,current);
  for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(rollback,format),format);same(saved.source,current);same(saved.target,cases[0].source);}
  for(const edit of [(r:any)=>r.residuals.pop(),(r:any)=>r.residuals.reverse(),(r:any)=>r.residuals[0].value=true,(r:any)=>r.target.modules[0].elements[0].name='changed',(r:any)=>r.source.modules[0].elements[0].key=true]){const forged=structuredClone(receipt);edit(forged);fails(()=>u.rollbackKeyEnvelope(forged,current));}
  for(const umf of ['0.1.0','0.2.0','0.3.0','0.4.0','0.6.0'])fails(()=>u.upgradeKeyEnvelope({...cases[0].source,umf}));
  fails(()=>u.rollbackKeyEnvelope(receipt,{...current,id:'other'}));
  let getterCalls=0;const hostile=structuredClone(cases[0].source);Object.defineProperty(hostile.modules[0].elements[0],'keys',{enumerable:true,get(){getterCalls++;return [];}});fails(()=>u.upgradeKeyEnvelope(hostile));
  if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host behavior leaked');
  return {collisionCases:cases.length,archivedMembers,upgradeRecoveries,rollbackRecoveries,laterAssertionRecoveries:2,forgedRefusals:5,wrongVersionRefusals:5,wrongIdentityRefused:true,getterCalls};
 });
 assert.deepEqual(externalRequests,[]);assert.equal(checks.collisionCases,10);assert.equal(checks.archivedMembers,90);assert.equal(checks.upgradeRecoveries,20);assert.equal(checks.rollbackRecoveries,20);
 const paths=['scripts/core-key-transition-browser.ts','scripts/core-key-transition-cases.ts','scripts/core-key-transition-schema.ts','src/model/key-transition.ts','src/model/key-tuple.ts','src/validation/keys.ts','src/validation/document.ts','src/validation/schema.ts','src/validation/facets.ts','src/model/json.ts','src/model/types.ts','src/model/serialization.ts','spec/core/facet-document.schema.json','spec/core/key-document.schema.json','spec/core/key-transition.schema.json','spec/core/key-tuple-operation.schema.json','tests/core/key-transition.test.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-key-transition-browser.json',JSON.stringify({scope:'Internal explicit candidate Key 0.5.0-to-0.6.0 migration/rollback; no public profile activation, native binding or author-provenance claim',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
