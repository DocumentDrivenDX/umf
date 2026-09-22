import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {importParquetSchema,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,classifyParquetCardinality} from '../../src';
const proof='fixtures/validation/cardinality-parquet-profile-native.json',native=await Bun.file(proof).json();
const cases:any[]=[];
for(const row of native.cases){
 const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer());
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 const source=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importParquetSchema(bytes,{id:row.id})).target).target).target;
 for(const profile of ['present-value-schema','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const request={index:1,identity:{module:'logical',element:'value'},profile,mode};
  const receipt=classifyParquetCardinality(source,request);
  cases.push({id:row.id,source,request,receipt,bytes:Array.from(bytes)});
 }
}
const build=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm'});
assert.ok(build.success,JSON.stringify(build.logs));const bundle=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html><html><body>Parquet Cardinality classification</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();
  let classified=0,blocked=0,recoveries=0,forgedRefusals=0;
  for(const c of cases){
   const r=u.classifyParquetCardinality(c.source,c.request);
   if(JSON.stringify(r)!==JSON.stringify(c.receipt))throw Error('Bun receipt parity: '+c.id);
   if(!r.target){blocked++;continue;}classified++;
   for(const format of ['json','yaml']){
    const saved=u.readJsonValue(u.writeJsonValue(r,format),format),bytes=u.recoverParquetCardinalityBytes(saved,saved.target);
    if(bytes.length!==c.bytes.length||bytes.some((b:number,i:number)=>b!==c.bytes[i]))throw Error('Native bytes changed');recoveries++;
   }
   const forged=structuredClone(r);forged.mapping.nodes[0].nativeNullable='forged';
   let refused=false;try{u.recoverParquetCardinalityBytes(forged,r.target);}catch{refused=true;}
   if(!refused)throw Error('Forged receipt accepted');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {cases:cases.length,classified,blocked,recoveries,forgedRefusals};
 });
 assert.equal(external.length,0);assert.equal(checks.cases,120);assert.equal(checks.recoveries,checks.classified*2);assert.equal(checks.forgedRefusals,checks.classified);
 const paths=[proof,'src/index.ts','src/core-ideals/cardinality-parquet.ts','src/core-ideals/parquet-cardinality-shape.ts','spec/core/parquet-cardinality-classification.schema.json','spec/extensions/parquet-cardinality/schema.json','spec/extensions/parquet-cardinality/package.json','scripts/core-ideals/cardinality-parquet-classification-browser.ts','tests/core-ideals/cardinality-parquet.test.ts',...native.cases.map((r:any)=>r.path)];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-parquet-classification-browser.json',JSON.stringify({scope:'Parquet 0.4.0 logical Cardinality classification and retained native recovery; projection and acceptance remain unfinished',browser:browser.version(),checks,externalRequests:external,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256,limits:['MAP classification in report mode retains uniqueness/key-carrier residuals; native enforcement is not inferred.','Record members are native observations; no core record definition is fabricated.','Native values are checked by the separate PyArrow profile, not by these browser archive checks.']},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
