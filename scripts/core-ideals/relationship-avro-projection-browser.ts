import {relationshipAvroProjectionCases} from './relationship-avro-projection-cases';
import {projectRelationshipToAvro} from '../../src/core-ideals/relationship-avro-projection';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const cases=relationshipAvroProjectionCases().map(c=>({...c,expectedReceipt:projectRelationshipToAvro(c.source,c.author,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Avro reference carrier</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const upath='/umf.js',u=await import(upath),cases=await(await fetch('/cases')).json();let idealRecoveries=0,nativeRecoveries=0,classificationRecoveries=0,blocked=0,refusals=0;
  for(const c of cases){const r=u.projectRelationshipToAvro(c.source,c.author,c.request);if(JSON.stringify(r)!==JSON.stringify(c.expectedReceipt))throw Error('Host/browser mismatch');
   if(r.status==='blocked'){if(r.target||r.nativeArchive)throw Error('Partial candidate');blocked++;continue;}
   const fresh=u.importAvroSchema(r.nativeArchive.schema,{id:'fresh'}),classified=u.classifyAvroRelationships(fresh,{nativeSource:r.nativeArchive,mode:'report',profile:'schema-structure'});
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);
    if(JSON.stringify(u.recoverRelationshipAvroIdeal(saved,classified.target))!==JSON.stringify(c.source))throw Error('Ideal changed');idealRecoveries++;
    if(JSON.stringify(u.recoverRelationshipAvroNative(saved,fresh))!==JSON.stringify(r.nativeArchive))throw Error('Native changed');nativeRecoveries++;
    if(JSON.stringify(u.recoverAvroRelationshipSource(classified,classified.target))!==JSON.stringify(r.nativeArchive))throw Error('Classification changed');classificationRecoveries++;
   }
   const fake=structuredClone(r);fake.residuals.pop();let rejected=false;try{u.verifyRelationshipAvroProjection(fake,r.target);}catch{rejected=true;}if(!rejected)throw Error('Forged receipt accepted');refusals++;
  }
  let getterReads=0,rejected=false;try{u.projectRelationshipToAvro(cases[0].source,cases[0].author,{...cases[0].request,get shape(){getterReads++;return 'one';}});}catch{rejected=true;}if(!rejected||getterReads)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {cases:cases.length,idealRecoveries,nativeRecoveries,classificationRecoveries,blocked,refusals,getterReads};
 });
 assert.deepEqual(checks,{cases:36,idealRecoveries:24,nativeRecoveries:24,classificationRecoveries:24,blocked:24,refusals:12,getterReads:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/relationship-avro-projection.ts','spec/core/relationship-avro-projection.schema.json','src/index.ts','scripts/core-ideals/relationship-avro-projection-cases.ts','scripts/core-ideals/relationship-avro-projection-browser.ts','tests/core-ideals/relationship-avro-projection.test.ts','fixtures/avro/relationship-projection-cases.json','src/core-ideals/relationship-avro-carrier.ts','src/core-ideals/relationship-avro.ts','scripts/core-ideals/relationship-avro-projection-schema.ts','fixtures/validation/relationship-avro-projection-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-avro-projection-browser.json',JSON.stringify({scope:'Authored target-key-record projection and composed retained recovery; broader compatibility and full binding acceptance remain unfinished',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
