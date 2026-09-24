import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {avroKeyProjectionCases} from './key-avro-projection-cases';
import {projectKeysToAvro} from '../../src/core-ideals/key-avro-projection';
const cases=avroKeyProjectionCases().map(c=>({...c,result:projectKeysToAvro(c.source,c.authors,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Avro authored Key projection</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let projected=0,blocked=0,recoveries=0,refusals=0;
  const refuse=(fn:()=>unknown)=>{try{fn();}catch{refusals++;return;}throw Error('Invalid recovery accepted');};
  for(const c of cases){const r=u.projectKeysToAvro(c.source,c.authors,c.request);if(JSON.stringify(r)!==JSON.stringify(c.result))throw Error('Host/browser parity mismatch: '+c.name);
   if(r.status==='blocked'){blocked++;if(r.target||r.nativeSql)throw Error('Blocked native output');continue;}projected++;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(u.recoverKeysAvroIdeal(saved,r.target))!==JSON.stringify(c.source))throw Error('Ideal recovery mismatch');recoveries++;}
   const fake=structuredClone(r);fake.residuals=[];refuse(()=>u.verifyKeysAvroProjection(fake,r.target));refuse(()=>u.recoverKeysAvroIdeal(r,{...r.target,id:'changed'}));
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {projected,blocked,recoveries,refusals};
 });
 assert.equal(checks.projected,16);assert.equal(checks.blocked,4);assert.equal(checks.recoveries,32);assert.equal(checks.refusals,32);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-avro-projection-browser.ts','scripts/core-ideals/key-avro-projection-cases.ts','src/core-ideals/key-avro-projection.ts','spec/core/key-avro-projection.schema.json','src/index.ts','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-avro-projection-browser.json',JSON.stringify({scope:'Authored Avro Key projection host/browser parity, retained ideal recovery and altered-receipt refusal; native execution is covered separately.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
