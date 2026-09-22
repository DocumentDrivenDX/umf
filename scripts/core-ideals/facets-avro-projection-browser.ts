import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetsAvroProjectionCases} from './facets-avro-projection-cases';
import {projectFacetsToAvro} from '../../src/core-ideals/facets-avro-projection';
const entry='scripts/core-ideals/facets-avro-projection-browser-entry.ts',bundle='dist/avro-facet-projection.js';
const built=await Bun.build({entrypoints:[entry],target:'browser',format:'esm',minify:false});assert.ok(built.success,JSON.stringify(built.logs));await Bun.write(bundle,built.outputs[0]!);
const rows=facetsAvroProjectionCases().map(row=>({...row,expected:projectFacetsToAvro(row.author,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){return new URL(r.url).pathname==='/projection.js'?new Response(Bun.file(bundle),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro facet projection</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(rows:any)=>{
  const path='/projection.js',u=await import(path);let projected=0,blocked=0,idealRecoveries=0;
  for(const row of rows){
   const before=JSON.stringify(row.author),r=u.projectFacetsToAvro(row.author,row.request);
   if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.author)!==before)throw Error(row.id+': parity/isolation');
   if(r.status==='blocked'){blocked++;if(r.target!==undefined)throw Error('Partial blocked candidate');continue;}
   projected++;
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(r,format),format),ideal=u.recoverFacetsFromAvro(receipt,receipt.nativeSchema);if(JSON.stringify(ideal)!==JSON.stringify(row.author.target))throw Error(row.id+': ideal recovery');idealRecoveries++;}
  }
  const good=rows.find((r:any)=>r.expected.status==='projected'),receipt=structuredClone(good.expected);receipt.source.id='forged';let forgedRejected=false;
  try{u.recoverFacetsFromAvro(receipt,receipt.nativeSchema);}catch{forgedRejected=true;}if(!forgedRejected)throw Error('Forged receipt accepted');
  let getterCalls=0,rejected=false;try{u.projectFacetsToAvro({get operation(){getterCalls++;return 'declare-core-facets';}},good.request);}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');return {cases:rows.length,projected,blocked,idealRecoveries,forgedRejected,getterCalls};
 },rows as any);
 assert.deepEqual(checks,{cases:558,projected:388,blocked:170,idealRecoveries:776,forgedRejected:true,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=[entry,bundle,'scripts/core-ideals/facets-avro-projection-browser.ts','scripts/core-ideals/facets-avro-projection-cases.ts','src/core-ideals/facets-avro-projection.ts','spec/core/facets-avro-projection.schema.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-avro-projection-browser.json',JSON.stringify({scope:'Internal Avro facet projection browser bundle; no public export or binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
