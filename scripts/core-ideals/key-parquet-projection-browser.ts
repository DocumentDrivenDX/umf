import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {parquetKeyProjectionCases} from './key-parquet-projection-cases';
import {projectKeysToParquet} from '../../src/core-ideals/key-parquet-projection';
const cases=parquetKeyProjectionCases().map(c=>({...c,result:projectKeysToParquet(c.source,c.authors,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(cases);if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Parquet authored Key projection</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let projected=0,blocked=0,recoveries=0,refusals=0;
  const refuse=(fn:()=>unknown)=>{try{fn();}catch{refusals++;return;}throw Error('Invalid recovery accepted');};
  for(const c of cases){const r=u.projectKeysToParquet(c.source,c.authors,c.request);if(JSON.stringify(r)!==JSON.stringify(c.result))throw Error('Host/browser parity mismatch: '+c.name);
   if(r.status==='blocked'){blocked++;if(r.target||r.nativeSql)throw Error('Blocked native output');continue;}projected++;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(u.recoverKeysParquetIdeal(saved,r.target))!==JSON.stringify(c.source))throw Error('Ideal recovery mismatch');recoveries++;}
   const fake=structuredClone(r);fake.residuals=[];refuse(()=>u.verifyKeysParquetProjection(fake,r.target));refuse(()=>u.recoverKeysParquetIdeal(r,{...r.target,id:'changed'}));
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {projected,blocked,recoveries,refusals};
 });
 assert.equal(checks.projected,21);assert.equal(checks.blocked,3);assert.equal(checks.recoveries,42);assert.equal(checks.refusals,42);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-parquet-projection-browser.ts','scripts/core-ideals/key-parquet-projection-cases.ts','src/core-ideals/key-parquet-projection.ts','spec/core/key-parquet-projection.schema.json','src/index.ts','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-parquet-projection-browser.json',JSON.stringify({scope:'Authored Parquet Key projection host/browser parity, retained ideal recovery and altered-receipt refusal; native execution is covered separately.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
