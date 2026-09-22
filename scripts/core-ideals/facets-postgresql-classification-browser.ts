import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlFacetSource,postgresqlFacetRequest} from './facets-postgresql-cases';
const source=postgresqlFacetSource(),rows:{request:u.PostgresqlFacetRequest;expected:unknown}[]=[];
const summary=(r:u.PostgresqlFacetClassification)=>({status:r.status,outcome:r.outcome,facets:r.mapping.facets,reasons:r.residuals.map(r=>r.reason)});
for(const column of u.getPostgresqlColumnMetadata(source)){
 const base=postgresqlFacetRequest(source,column.relation.name,{column:column.path});
 for(const profile of ['stored-value','new-value','unresolved'] as const)for(const mode of ['strict','report'] as const){const request={...base,profile,mode},r=await u.classifyPostgresqlFacets(source,request,backend);rows.push({request,expected:summary(r)});}
 const request={...base,obligation:'exact-input' as const},r=await u.classifyPostgresqlFacets(source,request,backend);rows.push({request,expected:summary(r)});
}
console.log(JSON.stringify({hostCases:rows.length,columns:u.getPostgresqlColumnMetadata(source).length}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});if(p==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});return new Response('<!doctype html><title>PostgreSQL facet classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];page.on('console',message=>{if(message.type()==='log')console.log(message.text());});
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const p='/umf.js',n='/runtime.js',core=await import(p),runtime=await import(n);let classified=0,blocked=0,recoveries=0;
  const before=JSON.stringify(input.source);
  for(const [index,row] of input.rows.entries()){if(index%33===0)console.log(JSON.stringify({browserCase:index,total:input.rows.length}));const r=await core.classifyPostgresqlFacets(input.source,row.request,runtime.backend),observed={status:r.status,outcome:r.outcome,facets:r.mapping.facets,reasons:r.residuals.map((x:any)=>x.reason)};if(JSON.stringify(observed)!==JSON.stringify(row.expected))throw Error('Classification parity');if(r.status==='blocked'){blocked++;if(r.target!==undefined)throw Error('Blocked target');}else{classified++;if(row.request.mode==='strict'&&r.residuals.length)throw Error('Silent strict loss');const format=recoveries%2?'yaml':'json',receipt=core.readJsonValue(core.writeJsonValue(core.copyJson(r),format),format),native=await core.recoverPostgresqlFacetSource(receipt,receipt.target,runtime.backend);if(native.nativeSource!==row.request.nativeSource||native.supplement!==row.request.supplement)throw Error('Native recovery failed');recoveries++;}}
  if(JSON.stringify(input.source)!==before)throw Error('Source mutated');if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:input.rows.length,classified,blocked,recoveries};
 },{source,rows} as any);
 assert.equal(checks.cases,rows.length);assert.equal(checks.classified+checks.blocked,rows.length);assert.equal(checks.recoveries,checks.classified);assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/facets-postgresql.ts','src/adapters/postgresql/facet-catalog.ts','src/adapters/postgresql/facet-resolved-predicate.ts','src/adapters/postgresql/facet-node-tree.ts','src/adapters/postgresql/facet-typmod.ts','src/index.ts','spec/core/postgresql-facet-classification.schema.json','spec/extensions/postgresql-facets/package.json','spec/extensions/postgresql-facets/schema.json','scripts/core-ideals/facets-postgresql-cases.ts','scripts/core-ideals/facets-postgresql-classification-browser.ts','fixtures/validation/facets-postgresql-constraints-native.json','dist/umf.js','dist/postgresql/runtime.js','dist/postgresql/libpg-query.wasm'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-classification-browser.json',JSON.stringify({scope:'Experimental PostgreSQL 17.4 public facet classification and exact retained source recovery; no authored projection or full binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
