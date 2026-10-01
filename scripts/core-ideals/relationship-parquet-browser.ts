import {relationshipParquetCases} from './relationship-parquet-cases';
import {projectRelationshipToParquet} from '../../src/core-ideals/relationship-parquet-projection';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const cases=relationshipParquetCases().map(c=>({...c,expectedReceipt:projectRelationshipToParquet(c.source,c.author,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Parquet reference carrier</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const upath='/umf.js',u=await import(upath),cases=await(await fetch('/cases')).json();let idealRecoveries=0,nativeRecoveries=0,classificationRecoveries=0,blocked=0,refusals=0,staleRefusals=0;
  for(const c of cases){const r=u.projectRelationshipToParquet(c.source,c.author,c.request);if(JSON.stringify(r)!==JSON.stringify(c.expectedReceipt))throw Error('Host/browser mismatch');
   if(r.status==='blocked'){if(r.target||r.nativeArchive)throw Error('Partial candidate');blocked++;continue;}
   const fresh=u.importParquetSchema(new Uint8Array(r.nativeArchive.hex.match(/../g).map((x:string)=>parseInt(x,16))),{id:'fresh'}),classified=u.classifyParquetRelationships(fresh,{mode:'report',profile:'file-schema'});
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);
    if(JSON.stringify(u.recoverRelationshipParquetIdeal(saved,classified.target))!==JSON.stringify(c.source))throw Error('Ideal changed');idealRecoveries++;
    if(JSON.stringify(u.recoverRelationshipParquetNative(saved,fresh))!==JSON.stringify(r.nativeArchive))throw Error('Native changed');nativeRecoveries++;
    if(JSON.stringify(Array.from(u.recoverParquetRelationshipSource(classified,classified.target)))!==JSON.stringify(Array.from(u.exportParquetCapture(fresh))))throw Error('Classification changed');classificationRecoveries++;
   }
   const fake=structuredClone(r);fake.residuals.pop();let rejected=false;try{u.verifyRelationshipParquetProjection(fake,r.target);}catch{rejected=true;}if(!rejected)throw Error('Forged receipt accepted');refusals++;
   rejected=false;const stale=structuredClone(fresh);stale.modules[0].elements[0].extensions['umf.parquet'].bytes+='00';try{u.verifyRelationshipParquetProjection(r,stale);}catch{rejected=true;}if(!rejected)throw Error('Stale target accepted');staleRefusals++;
  }
  let getterReads=0,rejected=false;try{u.projectRelationshipToParquet(cases[0].source,cases[0].author,{...cases[0].request,get shape(){getterReads++;return 'one';}});}catch{rejected=true;}if(!rejected||getterReads)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {cases:cases.length,idealRecoveries,nativeRecoveries,classificationRecoveries,blocked,refusals,staleRefusals,getterReads};
 });
 assert.deepEqual(checks,{cases:48,idealRecoveries:32,nativeRecoveries:32,classificationRecoveries:32,blocked:32,refusals:16,staleRefusals:16,getterReads:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/relationship-parquet-projection.ts','spec/core/relationship-parquet-projection.schema.json','src/index.ts','scripts/core-ideals/relationship-parquet-cases.ts','scripts/core-ideals/relationship-parquet-browser.ts','tests/core-ideals/relationship-parquet.test.ts','src/core-ideals/relationship-parquet-carrier.ts','src/core-ideals/relationship-parquet.ts','fixtures/validation/relationship-parquet-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-parquet-browser.json',JSON.stringify({scope:'Authored target-key-record projection and composed retained recovery; broader compatibility and full binding acceptance remain unfinished',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
