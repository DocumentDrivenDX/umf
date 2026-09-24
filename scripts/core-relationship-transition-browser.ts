import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {relationshipTransitionCases} from './core-relationship-transition-cases';
import {relationshipCandidate} from './core-relationship-cases';
import {upgradeRelationshipEnvelope,rollbackRelationshipEnvelope} from '../src/model/relationship-transition';
const entry='.cache/core-relationship-transition-browser-entry.ts';
await Bun.write(entry,"export * from '../src/model/relationship-transition';export {readJsonValue,writeJsonValue} from '../src/model/serialization';\n");
const built=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert.ok(built.success,JSON.stringify(built.logs));
const bundle=await built.outputs[0]!.text();
const cases=relationshipTransitionCases().map(row=>{
 const expected=upgradeRelationshipEnvelope(row.source),current=structuredClone(expected.target);
 current.modules[0]!.relationships=relationshipCandidate().modules[0].relationships;
 current.extensions!.future={afterMigration:{opaque:true}};
 return {...row,expected,current,rollback:rollbackRelationshipEnvelope(expected,current)};
});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html><html><body>Relationship transition checks</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/candidate.js',u=await import(path),cases=await(await fetch('/cases')).json();let recoveries=0,refusals=0;
  const same=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser transition mismatch');};
  const refuses=(fn:()=>unknown)=>{let caught=false;try{fn();}catch{caught=true;}if(!caught)throw Error('Expected transition refusal');refusals++;};
  for(const row of cases){
   const before=JSON.stringify(row.source),r=u.upgradeRelationshipEnvelope(row.source);same(r,row.expected);if(JSON.stringify(row.source)!==before)throw Error('Source mutated');
   same(u.rollbackRelationshipEnvelope(r,row.current),row.rollback);
   for(const format of ['json','yaml']){
    const stored=u.readJsonValue(u.writeJsonValue(r,format),format);same(u.verifyRelationshipTransition(stored),r);
    const rollback=u.rollbackRelationshipEnvelope(stored,row.current),saved=u.readJsonValue(u.writeJsonValue(rollback,format),format);
    same(u.verifyRelationshipTransition(saved),row.rollback);same(saved.target,row.source);same(saved.source,row.current);recoveries++;
   }
   const forged=structuredClone(r);forged.target.id='forged';refuses(()=>u.verifyRelationshipTransition(forged));
   const altered=structuredClone(row.rollback);altered.target.id='altered';refuses(()=>u.verifyRelationshipTransition(altered));
   const wrong=structuredClone(row.current);wrong.id='wrong';refuses(()=>u.rollbackRelationshipEnvelope(r,wrong));
  }
  let getterCalls=0;const hostile=structuredClone(cases[0].source);Object.defineProperty(hostile.modules[0],'relationships',{enumerable:true,get(){getterCalls++;return [];}});
  refuses(()=>u.upgradeRelationshipEnvelope(hostile));if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host or accessor behavior leaked');
  return {cases:cases.length,recoveries,refusals,getterCalls};
 });
 assert.deepEqual(checks,{cases:7,recoveries:14,refusals:22,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-relationship-transition-browser.ts','scripts/core-relationship-transition-cases.ts','scripts/core-relationship-cases.ts','scripts/core-relationship-transition-schema.ts','src/model/relationship-transition.ts','src/validation/relationships.ts','src/validation/keys.ts','src/validation/document.ts','src/model/json.ts','src/model/serialization.ts','spec/core/relationship-document.schema.json','spec/core/relationship-transition.schema.json','tests/core/relationship-transition.test.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-relationship-transition-browser.json',JSON.stringify({scope:'Experimental 0.6.0 to 0.7.0 relationship upgrade, rollback and receipt verification only; public integration and native admission remain separate',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
