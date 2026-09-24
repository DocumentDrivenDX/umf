import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {relationshipCases} from './core-relationship-cases';
import {validateRelationshipCandidate} from '../src/validation/relationships';
const entry='.cache/core-relationship-browser-entry.ts';
await Bun.write(entry,"export {validateRelationshipCandidate} from '../src/validation/relationships';export {readJsonValue,writeJsonValue} from '../src/model/serialization';\n");
const built=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert.ok(built.success,JSON.stringify(built.logs));
const bundle=await built.outputs[0]!.text(),cases=relationshipCases().map(row=>({...row,expected:validateRelationshipCandidate(row.document)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html><html><body>Candidate UMF Relationship validation</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/candidate.js',u=await import(path),cases=await(await fetch('/cases')).json();let accepted=0,rejected=0,recoveries=0;
  for(const row of cases){
   const before=JSON.stringify(row.document),result=u.validateRelationshipCandidate(row.document);
   if(result.valid!==row.valid||JSON.stringify(result)!==JSON.stringify(row.expected))throw Error('Candidate mismatch: '+row.id);
   if(row.code&&!result.diagnostics.some((d:any)=>d.code===row.code))throw Error('Missing expected diagnosis: '+row.id);
   if(JSON.stringify(row.document)!==before)throw Error('Input mutated');
   if(result.valid)accepted++;else rejected++;
   for(const format of ['json','yaml']){
    const recovered=u.readJsonValue(u.writeJsonValue(row.document,format),format);
    if(JSON.stringify(recovered)!==before||JSON.stringify(u.validateRelationshipCandidate(recovered))!==JSON.stringify(result))throw Error('Recovery mismatch: '+row.id);
    recoveries++;
   }
  }
  let getterCalls=0;const hostile=structuredClone(cases[0].document);Object.defineProperty(hostile.modules[0],'relationships',{enumerable:true,get(){getterCalls++;return [];}});
  if(u.validateRelationshipCandidate(hostile).valid||getterCalls)throw Error('Accessor invoked');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals leaked');
  return {cases:cases.length,accepted,rejected,recoveries,getterCalls};
 });
 assert.deepEqual(externalRequests,[]);assert.equal(checks.cases,cases.length);assert.equal(checks.recoveries,cases.length*2);
 const paths=['scripts/core-relationship-browser.ts','scripts/core-relationship-cases.ts','scripts/core-relationship-schema.ts','src/validation/relationships.ts','src/validation/keys.ts','src/validation/document.ts','src/validation/schema.ts','src/validation/facets.ts','src/model/json.ts','src/model/types.ts','src/model/serialization.ts','spec/core/relationship-document.schema.json','tests/core/relationship-ideal.test.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-relationship-candidate-browser.json',JSON.stringify({scope:'Experimental 0.7.0 relationship structural and semantic validation with JSON/YAML metadata recovery; this check does not qualify public entry-point integration, native bindings or ideal admission',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
