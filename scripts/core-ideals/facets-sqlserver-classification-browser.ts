import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import * as u from '../../src';
import {sqlserverFacetCase as sample,sqlserverFacetExamples} from './facets-sqlserver-cases';
const rows=sqlserverFacetExamples.map(e=>sample(e.table,e.column));
for(const table of ['signed8','decimal_checked','bytes_bound','binary2','length_len','untrusted','disabled','replica_value','alias_value'])rows.push(sample(table,'value',{mode:'strict'}));
rows.push(sample('untrusted','value',{mode:'strict',profile:'ordinary-checked-write'}));
rows.push(sample('floats','single_value',{mode:'strict',obligation:'exact-input'}));
const cases=rows.map(row=>({...row,expected:u.classifySqlServerFacets(row.document,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server facet classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(cases:any[])=>{
  const path='/umf.js',m=await import(path);let classified=0,blocked=0,nativeRecoveries=0;const registry=new m.Registry().register(m.sqlserverFacetsPackage);
  for(const row of cases){const before=JSON.stringify(row.document),r=m.classifySqlServerFacets(row.document,row.request);if(JSON.stringify(r)!==JSON.stringify(row.expected))throw Error('Browser parity');if(JSON.stringify(row.document)!==before)throw Error('Source mutated');
   if(r.status==='blocked'){blocked++;if(r.target)throw Error('Blocked target');continue;}classified++;
   if(!m.validateDocument(r.target,registry).valid)throw Error('Binding schema');
   for(const format of ['json','yaml']){const receipt=m.readJsonValue(m.writeJsonValue(r,format),format);if(m.recoverSqlServerFacetSource(receipt,receipt.target)!==row.request.nativeSource)throw Error('Native recovery');nativeRecoveries++;}
  }
  const row=cases[0],receipt=m.classifySqlServerFacets(row.document,row.request);let forgedRejected=false;receipt.outcome='invented';try{m.recoverSqlServerFacetSource(receipt,receipt.target);}catch{forgedRejected=true;}if(!forgedRejected)throw Error('Forged receipt accepted');
  let calls=0,rejected=false;try{m.classifySqlServerFacets({get umf(){calls++;return '0.5.0';}},row.request);}catch{rejected=true;}if(!rejected||calls)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,classified,blocked,nativeRecoveries,forgedRejected,getterCalls:calls};
 },cases as any);
 assert.equal(checks.cases,48);assert.equal(checks.classified,41);assert.equal(checks.blocked,7);assert.equal(checks.nativeRecoveries,82);assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/facets-sqlserver.ts','src/index.ts','spec/core/sqlserver-facet-classification.schema.json','spec/extensions/sqlserver-facets/schema.json','spec/extensions/sqlserver-facets/package.json','scripts/core-ideals/facets-sqlserver-cases.ts','scripts/core-ideals/facets-sqlserver-classification-browser.ts','tests/core-ideals/facets-sqlserver.test.ts','fixtures/validation/facets-sqlserver-discovery-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-sqlserver-classification-browser.json',JSON.stringify({scope:'Experimental public SQL Server 2022 facet classification and original native source recovery. No authored projection or full binding acceptance claim.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
