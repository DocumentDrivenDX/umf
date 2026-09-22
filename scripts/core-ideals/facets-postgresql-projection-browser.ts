import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetsPostgresqlProjectionCases} from './facets-postgresql-projection-cases';
const proofPath='fixtures/validation/facets-postgresql-projection-native.json',proof=await Bun.file(proofPath).json();
for(const [path,sha] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha);
const cases=facetsPostgresqlProjectionCases();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});if(p==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});return new Response('<!doctype html><title>Authored PostgreSQL facets</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const p='/umf.js',b='/runtime.js',u=await import(p),runtime=await import(b);let projected=0,blocked=0,recoveries=0;
  for(const [i,row] of input.cases.entries()){
   const r=await u.projectFacetsToPostgresql(row.author,row.request,runtime.backend),expected=input.projections[i];
   if(r.status!==expected.status||JSON.stringify(r.mapping.facets)!==JSON.stringify(expected.facets)||JSON.stringify(r.residuals)!==JSON.stringify(expected.residuals)||r.nativeSql!==expected.nativeSql)throw Error('Native projection parity');
   if(r.status==='blocked'){blocked++;if(r.target!==undefined)throw Error('Blocked target');continue;}projected++;
   if(row.request.mode==='strict'&&r.residuals.length)throw Error('Silent strict loss');
   if(u.getPostgresqlSource(r.target)!==r.nativeSql)throw Error('Native source changed');
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format),ideal=await u.recoverFacetsFromPostgresql(receipt,r.nativeSql,runtime.backend);if(JSON.stringify(ideal)!==JSON.stringify(r.source))throw Error('Ideal recovery failure');recoveries++;}
  }
  const base=input.cases.find((r:any)=>r.name==='smallint-8-true'&&r.request.encoding==='checked'&&r.request.mode==='strict'),source=u.copyJson(base.author.source);source.modules[0].elements[0].description='a\0b';
  const author=u.declareCoreFacets(source,base.author.identity,base.author.request),strict=await u.projectFacetsToPostgresql(author,base.request,runtime.backend),report=await u.projectFacetsToPostgresql(author,{...base.request,mode:'report'},runtime.backend);if(strict.status!=='blocked'||report.status!=='projected'||report.nativeSql.includes('COMMENT'))throw Error('Comment loss handling');
  if(JSON.stringify(await u.recoverFacetsFromPostgresql(report,report.nativeSql,runtime.backend))!==JSON.stringify(author.target))throw Error('Comment recovery');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:input.cases.length,projected,blocked,recoveries,commentRefusals:1,commentRecoveries:1};
 },{cases,projections:proof.projections} as any);
 assert.deepEqual(checks,{cases:232,projected:145,blocked:87,recoveries:290,commentRefusals:1,commentRecoveries:1});assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/facets-postgresql-projection.ts','src/index.ts','spec/core/facets-postgresql-projection.schema.json','scripts/core-ideals/facets-postgresql-projection-browser.ts','scripts/core-ideals/facets-postgresql-projection-cases.ts',proofPath,'dist/umf.js','dist/postgresql/runtime.js','dist/postgresql/libpg-query.wasm'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-projection-browser.json',JSON.stringify({scope:'Public authored PostgreSQL facet projection, native SQL parity and both ideal receipt serializations in Chromium/WASM; full binding compatibility acceptance remains separate',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
