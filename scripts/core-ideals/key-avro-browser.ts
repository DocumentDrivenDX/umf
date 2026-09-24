import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {importAvroSchema} from '../../src/adapters/avro';
import {classifyAvroKeys,type AvroKeyRequest} from '../../src/core-ideals/key-avro';
const fixtures=(await Bun.file('fixtures/avro/key-discovery-cases.json').json()).cases;
const cases=fixtures.map((c:any)=>{const source=importAvroSchema(c.schemaText,{id:c.id}),request:AvroKeyRequest={mode:'report',profile:'schema-declarations',nativeSource:{schema:c.schemaText,dependencies:[]}};return {source,request,expected:classifyAvroKeys(source,request)};});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Avro Key classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let recoveries=0,refusals=0,strictBlocks=0;
  for(const c of cases){const r=u.classifyAvroKeys(c.source,c.request);if(JSON.stringify(r)!==JSON.stringify(c.expected))throw Error('Host/browser mismatch');if(r.observations.some((o:any)=>o.authorIntent!=='unknown'||o.enforcement!=='not-expressible'))throw Error('Native identity invented');
   const blocked=u.classifyAvroKeys(c.source,{...c.request,mode:'strict'});if(blocked.status!=='blocked'||blocked.target)throw Error('Lossless classification invented');strictBlocks++;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(u.recoverAvroKeySource(saved,saved.target))!==JSON.stringify(c.request.nativeSource))throw Error('Native archive changed');recoveries++;}
   const fake=structuredClone(r);fake.observations[0].authorIntent='authored';let rejected=false;try{u.verifyAvroKeyClassification(fake,r.target);}catch{rejected=true;}if(!rejected)throw Error('Forged native identity accepted');refusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {cases:cases.length,recoveries,refusals,strictBlocks};
 });
 assert.deepEqual(checks,{cases:12,recoveries:24,refusals:12,strictBlocks:12});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-avro-browser.ts','scripts/core-ideals/key-avro-schema.ts','src/core-ideals/key-avro.ts','src/index.ts','tests/core-ideals/key-avro.test.ts','fixtures/avro/key-discovery-cases.json','fixtures/validation/key-avro-discovery-native.json','spec/core/avro-key-classification.schema.json','spec/extensions/avro-keys/package.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-avro-browser.json',JSON.stringify({scope:'Avro Key native observation, original archive recovery and refusal parity only; authored projection and full binding acceptance remain unfinished.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
