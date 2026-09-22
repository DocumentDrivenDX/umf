import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetsTableSpecProjectionCases} from './facets-tablespec-projection-cases';
import {projectFacetsToTableSpec} from '../../src';
const rows=facetsTableSpecProjectionCases().map(row=>({...row,expected:projectFacetsToTableSpec(row.author,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(rows);return new Response('<!doctype html><title>TableSpec facet suites</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,blocked=0,classified=0,tampered=0;
  for(const row of rows){
   const r=u.projectFacetsToTableSpec(row.author,row.request);if(JSON.stringify(r)!==JSON.stringify(row.expected))throw Error('Browser parity failed');
   if(r.status==='blocked'){blocked++;continue;}classified++;
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(u.recoverFacetsFromTableSpec(receipt,u.exportTableSpec(receipt.target)))!==JSON.stringify(row.author.target))throw Error('Ideal source changed');recoveries++;}
   const fake=u.copyJson(r);fake.source.id='forged';let refused=false;try{u.recoverFacetsFromTableSpec(fake,u.exportTableSpec(r.target));}catch{refused=true;}if(!refused)throw Error('Profile forgery accepted');tampered++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,classified,blocked,recoveries,tampered};
 });
 assert.deepEqual(checks,{cases:540,classified:331,blocked:209,recoveries:662,tampered:331});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/facets-tablespec-projection-browser.ts','fixtures/validation/facets-tablespec-projection-native.json','dist/umf.js','src/core-ideals/facets-tablespec.ts','src/core-ideals/facets-tablespec-projection.ts','scripts/core-ideals/facets-tablespec-projection-cases.ts','spec/core/facets-tablespec-projection.schema.json','spec/core/tablespec-facet-classification.schema.json','spec/extensions/tablespec-facets/package.json','spec/extensions/tablespec-facets/schema.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-tablespec-projection-browser.json',JSON.stringify({scope:'Authored facet projection and ideal recovery; complete binding qualification pending',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
