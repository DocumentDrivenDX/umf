import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {importAvroSchema} from '../../src/adapters/avro';
import {classifyAvroRelationships,type AvroRelationshipRequest} from '../../src/core-ideals/relationship-avro';
const fixtures=(await Bun.file('fixtures/avro/relationship-discovery-cases.json').json()).cases;
const cases=fixtures.map((c:any)=>{const source=importAvroSchema(c.schemaText,{id:c.id}),request:AvroRelationshipRequest={mode:'report',profile:'schema-structure',nativeSource:{schema:c.schemaText,dependencies:[]}};return {source,request,expected:classifyAvroRelationships(source,request)};});
const bundleRequest:AvroRelationshipRequest={mode:'report',profile:'schema-structure',nativeSource:{schema:' "sales.Order" \n',dependencies:[{id:'orders',schema:fixtures[0].schemaText}]}},bundleSource=importAvroSchema(bundleRequest.nativeSource.schema,{id:'bundle-browser',dependencies:bundleRequest.nativeSource.dependencies});
bundleSource.vocabularies.future={version:'1.0.0'};bundleSource.extensions={future:{opaque:['retained', {lexical:'9007199254740993'}]}};
cases.push({source:bundleSource,request:bundleRequest,expected:classifyAvroRelationships(bundleSource,bundleRequest)});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Avro relationship classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let recoveries=0,refusals=0,strictBlocks=0;
  for(const c of cases){const r=u.classifyAvroRelationships(c.source,c.request);if(JSON.stringify(r)!==JSON.stringify(c.expected))throw Error('Host/browser mismatch');if(r.observations.some((o:any)=>o.authorIntent!=='unknown'||o.enforcement!=='not-expressible'))throw Error('Native identity invented');
   const blocked=u.classifyAvroRelationships(c.source,{...c.request,mode:'strict'});if(blocked.status!=='blocked'||blocked.target)throw Error('Lossless classification invented');strictBlocks++;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(u.recoverAvroRelationshipSource(saved,saved.target))!==JSON.stringify(c.request.nativeSource))throw Error('Native archive changed');recoveries++;}
   const fake=structuredClone(r);fake.observations[0].authorIntent='authored';let rejected=false;try{u.verifyAvroRelationshipClassification(fake,r.target);}catch{rejected=true;}if(!rejected)throw Error('Forged native identity accepted');refusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {cases:cases.length,recoveries,refusals,strictBlocks};
 });
 assert.deepEqual(checks,{cases:11,recoveries:22,refusals:11,strictBlocks:11});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/relationship-avro-browser.ts','scripts/core-ideals/relationship-avro-schema.ts','src/core-ideals/relationship-avro.ts','src/index.ts','tests/core-ideals/relationship-avro.test.ts','fixtures/avro/relationship-discovery-cases.json','fixtures/validation/relationship-avro-discovery-native.json','spec/core/avro-relationship-classification.schema.json','spec/extensions/avro-relationships/package.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-avro-browser.json',JSON.stringify({scope:'Avro relationship native observation, original archive recovery and refusal parity only; authored projection and binding acceptance remain unfinished; no ideal-admission claim.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
