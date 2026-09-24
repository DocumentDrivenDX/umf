import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import * as u from '../../src';
const selections:{id:string;family:u.ScalarType;index?:number}[]=[
 ...[8,16,32,64].flatMap(bits=>['int','uint'].map(prefix=>({id:`${prefix}${bits}-min-plain`,family:'integer' as const}))),
 {id:'int8-min-embedded',family:'integer'},{id:'float32-narrow-plain',family:'float'},
 {id:'fixed2-6162-plain',family:'binary'},{id:'decimal-3-2-59-plain',family:'decimal'},
 {id:'string-max1-1-embedded',family:'string'},
 {id:'../cardinality/array-duplicates-0',family:'integer',index:1},
 {id:'../cardinality/array-duplicates-0',family:'integer',index:3},
];
const rows:any[]=[],paths:string[]=[];
for(const s of selections){
 const path=`fixtures/parquet/facets/${s.id}.parquet`;paths.push(path);
 const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());
 const native=u.importParquetSchema(bytes,{id:`facets-${s.id}`});
 const source=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(native).target).target).target).target;
 source.modules.push({id:'logical',namespace:'',elements:[{id:'v',kind:'field',cardinality:'one',scalarType:s.family,extensions:{}}]});
 for(const profile of ['declared-schema','pyarrow-safe-array-input','unresolved'] as const)for(const mode of ['strict','report'] as const)for(const obligation of ['value-domain','exact-input'] as const){
  const request:u.ParquetFacetRequest={location:{index:s.index??1,scope:'present-non-null-leaf'},identity:{module:'logical',element:'v'},profile,mode,obligation};
  const expected=u.classifyParquetFacets(source,request);rows.push({source,request,expected,bytes:Array.from(bytes)});
 }
}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Parquet facet classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',r=>{if(!r.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(r.request().url());return r.abort();}return r.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const p='/umf.js',m=await import(p);let classified=0,blocked=0,nativeRecoveries=0,forgedRejected=false;
  for(const row of input){
   const r=m.classifyParquetFacets(row.source,row.request);
   if(JSON.stringify(r)!==JSON.stringify(row.expected))throw Error('Classification parity');
   if(r.status==='blocked'){if('target'in r)throw Error('Partial target');blocked++;continue;}
   classified++;
   for(const format of ['json','yaml']){
    const receipt=m.readJsonValue(m.writeJsonValue(r,format),format);
    if(JSON.stringify(Array.from(m.recoverParquetFacetSource(receipt,receipt.target)))!==JSON.stringify(row.bytes))throw Error('Native byte loss');nativeRecoveries++;
   }
   if(!forgedRejected){const forged=structuredClone(r);forged.mapping.facets={integerWidth:{bits:1,signed:false}};try{m.recoverParquetFacetSource(forged,forged.target);}catch{forgedRejected=true;}if(!forgedRejected)throw Error('Forged receipt');}
  }
  let getterCalls=0,rejected=false;try{m.classifyParquetFacets({get umf(){getterCalls++;return '0.5.0';}},input[0].request);}catch{rejected=true;}
  if(!rejected||getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Unsafe runtime');
  return {cases:input.length,classified,blocked,nativeRecoveries,forgedRejected,getterCalls};
 },rows);
 assert.equal(checks.cases,180);assert.equal(checks.nativeRecoveries,checks.classified*2);assert.ok(checks.classified>0&&checks.blocked>0);assert.deepEqual(externalRequests,[]);
 paths.push('dist/umf.js','src/core-ideals/facets-parquet.ts','src/adapters/parquet/facet-type.ts','src/core-ideals/parquet-cardinality-shape.ts','src/index.ts','scripts/core-ideals/facets-parquet-classification-browser.ts','spec/core/parquet-facet-classification.schema.json','spec/extensions/parquet-facets/schema.json','spec/extensions/parquet-facets/package.json');
 const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-parquet-classification-browser.json',JSON.stringify({scope:'Experimental public Parquet facet classification and retained byte recovery; author projection and full binding acceptance remain separate',browser:browser.version(),checks,selections,externalRequests,bindingAccepted:false,nativeEquivalence:false,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
