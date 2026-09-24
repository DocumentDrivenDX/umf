import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {captureParquet} from '../../src/adapters/parquet';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';
import {classifyParquetKeys} from '../../src/core-ideals/key-parquet';
const proof=await Bun.file('fixtures/validation/key-parquet-discovery-native.json').json(),cases:{source:ReturnType<typeof captureParquet>;bytes:number[];expected:ReturnType<typeof classifyParquetKeys>}[]=[];
for(const row of proof.cases){const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer()),source=row.expectedSchema==='blocked'?captureParquet(bytes,{id:row.id}):importParquetSchema(bytes,{id:row.id});source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:['retained','9007199254740993']}};cases.push({source,bytes:Array.from(bytes),expected:classifyParquetKeys(source,{mode:'report',profile:'file-schema'})});}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Parquet Key observations</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let classified=0,blocked=0,recoveries=0,blockedSourceRecoveries=0,refusals=0,strictBlocks=0;
  for(const c of cases){const r=u.classifyParquetKeys(c.source,{mode:'report',profile:'file-schema'});if(JSON.stringify(r)!==JSON.stringify(c.expected))throw Error('Host/browser mismatch');
   if(u.classifyParquetKeys(c.source,{mode:'strict',profile:'file-schema'}).status!=='blocked')throw Error('Lossless key inference');strictBlocks++;
   if(r.status==='blocked'){blocked++;for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(Array.from(u.exportParquetCapture(saved.source)))!==JSON.stringify(c.bytes))throw Error('Blocked archive lost');blockedSourceRecoveries++;}continue;}
   classified++;if(r.observations.some((o:any)=>o.authorIntent!=='unknown'||o.enforcement!=='not-expressible'))throw Error('Native identity inferred');
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(Array.from(u.recoverParquetKeySource(saved,saved.target)))!==JSON.stringify(c.bytes))throw Error('Native bytes changed');recoveries++;}
   const fake=structuredClone(r);fake.observations[0].authorIntent='authored';let refused=false;try{u.verifyParquetKeyClassification(fake,r.target);}catch{refused=true;}if(!refused)throw Error('Forged key accepted');refusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {classified,blocked,recoveries,blockedSourceRecoveries,refusals,strictBlocks};
 });
 assert.deepEqual(checks,{classified:7,blocked:1,recoveries:14,blockedSourceRecoveries:2,refusals:7,strictBlocks:8});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-parquet-browser.ts','scripts/core-ideals/key-parquet-schema.ts','src/core-ideals/key-parquet.ts','src/index.ts','tests/core-ideals/key-parquet.test.ts','fixtures/validation/key-parquet-discovery-native.json','spec/core/parquet-key-classification.schema.json','spec/extensions/parquet-keys/package.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-parquet-browser.json',JSON.stringify({scope:'Parquet Key native observation, exact file recovery and refusals only; authored projection and binding acceptance have separate evidence; no ideal-admission claim.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
