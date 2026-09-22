import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import * as u from '../../src';
import {avroFacetClassificationCases} from './facets-avro-cases';
const rows=avroFacetClassificationCases().map(row=>({...row,expected:u.classifyAvroFacets(row.document,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){return new URL(r.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro facet classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(rows:any)=>{
  const path='/umf.js',u=await import(path);let classified=0,blocked=0,nativeRecoveries=0;
  for(const row of rows){
   const before=JSON.stringify(row.document),r=u.classifyAvroFacets(row.document,row.request);
   if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.document)!==before)throw Error(row.id+': parity/isolation');
   if(r.status==='blocked'){blocked++;if(r.target!==undefined)throw Error('Partial blocked candidate');continue;}
   classified++;const original={schema:row.request.nativeSource,dependencies:row.request.dependencies??[]};
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(r,format),format),native=u.recoverAvroFacetSource(receipt,receipt.target);if(JSON.stringify(native)!==JSON.stringify(original))throw Error(row.id+': native recovery');nativeRecoveries++;}
  }
  const good=rows.find((r:any)=>r.expected.status==='classified'),receipt=structuredClone(good.expected);receipt.request.profile='unresolved';let forgedRejected=false;
  try{u.recoverAvroFacetSource(receipt,receipt.target);}catch{forgedRejected=true;}if(!forgedRejected)throw Error('Forged receipt accepted');
  let getterCalls=0,rejected=false;try{u.classifyAvroFacets({get umf(){getterCalls++;return '0.5.0';}},good.request);}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');return {cases:rows.length,classified,blocked,nativeRecoveries,forgedRejected,getterCalls};
 },rows as any);
 const classified=rows.filter(r=>r.expected.status==='classified').length;
 assert.deepEqual(checks,{cases:148,classified,blocked:148-classified,nativeRecoveries:classified*2,forgedRejected:true,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/facets-avro-classification-browser.ts','scripts/core-ideals/facets-avro-cases.ts','src/index.ts','src/core-ideals/facets-avro.ts','src/core-ideals/avro-facet-selection.ts','src/core-ideals/avro-cardinality-type.ts','src/adapters/avro/facet-type.ts','spec/core/avro-facet-classification.schema.json','spec/extensions/avro-facets/schema.json','spec/extensions/avro-facets/package.json','fixtures/avro/facet-selection-cases.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-avro-classification-browser.json',JSON.stringify({scope:'Experimental Avro core 0.5.0 facet classification and retained native-text recovery in Chromium; no authored projection or binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
