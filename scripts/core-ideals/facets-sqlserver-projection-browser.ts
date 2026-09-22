import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {projectFacetsToSqlServer} from '../../src';
import {facetsSqlServerProjectionCases} from './facets-sqlserver-projection-cases';
const cases=facetsSqlServerProjectionCases().map(c=>({...c,expected:projectFacetsToSqlServer(c.author,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server facet projection</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(cases:any[])=>{
  const path='/umf.js',m=await import(path);let projected=0,blocked=0,idealRecoveries=0;
  for(const c of cases){const r=m.projectFacetsToSqlServer(c.author,c.request);if(JSON.stringify(r)!==JSON.stringify(c.expected))throw Error('Browser parity');if(r.status==='blocked'){blocked++;if(r.target||r.nativeSql)throw Error('Blocked output');continue;}projected++;
   for(const format of ['json','yaml']){const receipt=m.readJsonValue(m.writeJsonValue(r,format),format);if(JSON.stringify(m.recoverFacetsFromSqlServer(receipt,receipt.nativeSql))!==JSON.stringify(c.author.target))throw Error('Ideal recovery');idealRecoveries++;}
  }
  const c=cases.find(c=>c.expected.status==='projected'),r=m.projectFacetsToSqlServer(c.author,c.request);let staleRejected=false;try{m.recoverFacetsFromSqlServer(r,r.nativeSql+' ');}catch{staleRejected=true;}if(!staleRejected)throw Error('Changed SQL accepted');
  let calls=0,rejected=false;try{m.projectFacetsToSqlServer({get operation(){calls++;return 'declare-core-facets';}},c.request);}catch{rejected=true;}if(!rejected||calls)throw Error('Getter invoked');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,projected,blocked,idealRecoveries,staleRejected,getterCalls:calls};
 },cases as any);
 assert.deepEqual(checks,{cases:238,projected:145,blocked:93,idealRecoveries:290,staleRejected:true,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/facets-sqlserver-projection.ts','src/core-ideals/sqlserver-syntax.ts','src/index.ts','spec/core/facets-sqlserver-projection.schema.json','spec/extensions/sqlserver-facets/package.json','scripts/core-ideals/facets-sqlserver-projection-cases.ts','scripts/core-ideals/facets-sqlserver-projection-browser.ts','tests/core-ideals/facets-sqlserver-projection.test.ts','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-sqlserver-projection-browser.json',JSON.stringify({scope:'Experimental authored SQL Server facet DDL projection and retained ideal recovery; browser parity does not substitute for native execution or full binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
