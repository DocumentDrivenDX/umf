import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetsAvroProjectionCases} from './facets-avro-projection-cases';
import {projectFacetsToAvro} from '../../src/core-ideals/facets-avro-projection';
const bundle='dist/umf.js';
const rows=facetsAvroProjectionCases().map(row=>({...row,expected:projectFacetsToAvro(row.author,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){return new URL(r.url).pathname==='/projection.js'?new Response(Bun.file(bundle),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro facet projection</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(rows:any)=>{
  const path='/projection.js',u=await import(path);let projected=0,blocked=0,idealRecoveries=0,nativeRecoveries=0,exactFacetRecoveries=0,explicitResiduals=0;
  for(const row of rows){
   const before=JSON.stringify(row.author),r=u.projectFacetsToAvro(row.author,row.request);
   if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.author)!==before)throw Error(row.id+': parity/isolation');
   if(r.status==='blocked'){blocked++;if(r.target!==undefined)throw Error('Partial blocked candidate');continue;}
   projected++;
   const imported=u.importAvroSchema(r.nativeSchema,{id:'avro-facet-composition'});
   const source=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(imported).target).target).target).target;
   const family=row.author.target.modules[0].elements[0].scalarType;
   source.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType:family,extensions:{}}]});
   const classified=u.classifyAvroFacets(source,{location:{path:'/fields/0/type'},nativeSource:r.nativeSchema,identity:{module:'logical',element:'value'},mode:'report',profile:row.request.profile,obligation:row.request.obligation});
   if(classified.status!=='classified')throw Error(row.id+': composition refused');
   const authored=row.author.operation==='declare-core-facets'?row.author.request:{};
   const same=Object.entries(authored).every(([key,value])=>JSON.stringify(classified.mapping.facets[key])===JSON.stringify(value));
   if(same)exactFacetRecoveries++;else{if(!r.residuals.length&&!classified.residuals.length)throw Error('Unreported facet difference');explicitResiduals++;}
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(classified,format),format),native=u.recoverAvroFacetSource(receipt,receipt.target);if(native.schema!==r.nativeSchema||native.dependencies.length)throw Error('Native recovery');nativeRecoveries++;}
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(r,format),format),ideal=u.recoverFacetsFromAvro(receipt,receipt.nativeSchema);if(JSON.stringify(ideal)!==JSON.stringify(row.author.target))throw Error(row.id+': ideal recovery');idealRecoveries++;}
  }
  const good=rows.find((r:any)=>r.expected.status==='projected'),receipt=structuredClone(good.expected);receipt.source.id='forged';let forgedRejected=false;
  try{u.recoverFacetsFromAvro(receipt,receipt.nativeSchema);}catch{forgedRejected=true;}if(!forgedRejected)throw Error('Forged receipt accepted');
  let getterCalls=0,rejected=false;try{u.projectFacetsToAvro({get operation(){getterCalls++;return 'declare-core-facets';}},good.request);}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');return {cases:rows.length,projected,blocked,idealRecoveries,nativeRecoveries,exactFacetRecoveries,explicitResiduals,forgedRejected,getterCalls};
 },rows as any);
 const composition=await Bun.file('fixtures/validation/facets-avro-composition.json').json();
 assert.deepEqual(checks,{cases:558,projected:388,blocked:170,idealRecoveries:776,nativeRecoveries:776,exactFacetRecoveries:composition.counts.exactFacetRecoveries,explicitResiduals:composition.counts.explicitResiduals,forgedRejected:true,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/index.ts','src/core-ideals/facets-avro.ts','spec/extensions/avro-facets/package.json','fixtures/validation/facets-avro-composition.json',bundle,'scripts/core-ideals/facets-avro-projection-browser.ts','scripts/core-ideals/facets-avro-projection-cases.ts','src/core-ideals/facets-avro-projection.ts','spec/core/facets-avro-projection.schema.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-avro-projection-browser.json',JSON.stringify({scope:'Public Avro facet projection and native classification composition; no binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
