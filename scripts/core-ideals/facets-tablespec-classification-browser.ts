import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetTableSpecCases} from './facets-tablespec-cases';
const cases=facetTableSpecCases(),captured=await Bun.file('fixtures/validation/facets-tablespec-classification.json').json();assert.equal(cases.length,captured.rows.length);
const rows=cases.map((r,i)=>({...r,expected:captured.rows[i]}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>TableSpec facet classification</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,blocked=0,classified=0,tampered=0;const profiles=new Set();
  for(const row of rows){
   const before=JSON.stringify(row.source),r=u.classifyTableSpecFacets(row.source,row.request);
   if(JSON.stringify(row.source)!==before)throw Error('Source mutated');
   for(const key of ['status','outcome','mapping','residuals'])if(JSON.stringify(r[key])!==JSON.stringify(row.expected[key]))throw Error('Browser parity failed: '+row.name+' '+key);
   if(r.status==='blocked'){if(r.target!==undefined||!r.residuals.length)throw Error('Invalid block');blocked++;continue;}
   classified++;
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(r,format),format),native=u.recoverTableSpecFacetSource(receipt,receipt.target);if(native!==row.text)throw Error('Native text changed');recoveries++;}
   if(!profiles.has(row.request.profile)){
    profiles.add(row.request.profile);const fake=u.copyJson(r);fake.mapping.observations.push({concept:'native',idealPath:r.mapping.idealPath,nativePath:r.mapping.nativePath,interpretation:'inferred',outcome:'exact',basis:'forged'});
    let refused=false;try{u.verifyTableSpecFacetClassification(fake,r.target);}catch{refused=true;}if(!refused)throw Error('Forged semantics accepted');tampered++;
   }
  }
  let getters=0,refused=false;try{u.classifyTableSpecFacets(rows[0].source,{...rows[0].request,get column(){getters++;return 0;}});}catch{refused=true;}if(!refused||getters)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,classified,blocked,recoveries,tampered,getterCalls:getters};
 });
 assert.equal(checks.cases,1216);assert.equal(checks.tampered,6);assert.equal(checks.recoveries,checks.classified*2);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/facets-tablespec-classification-browser.ts','scripts/core-ideals/facets-tablespec-cases.ts','fixtures/validation/facets-tablespec-classification.json','fixtures/validation/facets-tablespec-classification-native.json','dist/umf.js','src/core-ideals/facets-tablespec.ts','src/model/facets.ts','spec/core/tablespec-facet-classification.schema.json','spec/extensions/tablespec-facets/package.json','spec/extensions/tablespec-facets/schema.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-tablespec-classification-browser.json',JSON.stringify({scope:'Experimental facet classification, retained native archive recovery and receipt verification only; authored down-projection and binding acceptance pending',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
