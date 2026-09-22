import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {avroAvailabilitySource} from './nullability-avro-cases';
import {upgradeCardinalityEnvelope} from '../../src/model/cardinality-transition';
import {classifyAvroCardinality,type AvroCardinalityRequest,type AvroCardinalityClassification} from '../../src/core-ideals/cardinality-avro';
const fixture='fixtures/avro/cardinality-cases.json',cases:{source:AvroCardinalityClassification['source'];request:AvroCardinalityRequest;expected:AvroCardinalityClassification}[]=[];
for(const row of (await Bun.file(fixture).json()).cases){
 const initial=avroAvailabilitySource(row.schema,[],'cardinality.Example'),source=upgradeCardinalityEnvelope(initial.source).target;
 for(const profile of ['present-non-null-schema','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const request={column:initial.column,nativeSource:row.schema,identity:{module:'logical',element:'value'},profile,mode};
  cases.push({source,request,expected:classifyAvroCardinality(source,request)});
 }
}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(cases);return new Response('<!doctype html><html><body>Avro Cardinality classification</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let classified=0,blocked=0,recoveries=0,forgedRefusals=0;
  const canonical=(v:any):string=>v!==null&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  for(const c of cases){
   const r=u.classifyAvroCardinality(c.source,c.request);if(canonical(r)!==canonical(c.expected))throw Error('Receipt parity');
   if(!r.target){blocked++;continue;}classified++;
   const native=u.exportAvroBundle(c.source),target=u.exportAvroBundle(r.target);if(native.schema!==target.schema)throw Error('Native source changed');
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);const back=u.recoverAvroCardinalityBundle(saved,saved.target);if(back.schema!==c.request.nativeSource||back.dependencies.length)throw Error('Native recovery');recoveries++;}
   const forged=structuredClone(r);forged.mapping.nodes[0].location.path='/forged';let refused=false;try{u.recoverAvroCardinalityBundle(forged,r.target);}catch{refused=true;}if(!refused)throw Error('Forged receipt');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,classified,blocked,recoveries,forgedRefusals};
 });assert.equal(external.length,0);
 const paths=[fixture,'scripts/core-ideals/cardinality-avro-classification-browser.ts','scripts/core-ideals/cardinality-avro-schema.ts','src/core-ideals/cardinality-avro.ts','src/core-ideals/avro-cardinality-type.ts','src/adapters/avro/metadata.ts','src/index.ts','spec/core/avro-cardinality-classification.schema.json','spec/extensions/avro-cardinality/schema.json','spec/extensions/avro-cardinality/package.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-avro-classification-browser.json',JSON.stringify({scope:'Declared present non-null schema shape and native-source receipt recovery; authored projection and binding acceptance remain unfinished',browser:browser.version(),checks,externalRequests:external,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
