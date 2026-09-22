import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/facets-postgresql-constraints-native.json').json();
for(const [path,sha] of Object.entries(fixture.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha);
const build=await Bun.build({entrypoints:['src/adapters/postgresql/facet-catalog.ts'],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));await Bun.write('dist/postgresql-facet-catalog.js',build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});if(['/umf.js','/postgresql-facet-catalog.js','/postgresql/runtime.js','/postgresql/libpg-query.wasm'].includes(p))return new Response(Bun.file('dist'+p),{headers:{'content-type':p.endsWith('.wasm')?'application/wasm':'text/javascript'}});return new Response('<!doctype html><title>Facet catalog correspondence</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const corePath='/umf.js',catalogPath='/postgresql-facet-catalog.js',runtimePath='/postgresql/runtime.js',core=await import(corePath),api=await import(catalogPath),runtime=await import(runtimePath);
  const source=core.importPostgresqlCatalogCapture(input.sourceText,{id:'facet-browser'}),text=JSON.stringify(input.capture),run=(doc:any,native=text)=>api.correlatePostgresqlFacetCatalog(doc,native,'little-endian-datum64',runtime.backend);
  const paired=await run(source);if(paired.matches.length!==12||paired.matches.filter((m:any)=>m.inspection.state==='verified-expression').length!==8||paired.sameSnapshotVerified||paired.authenticated)throw Error('Correspondence mismatch');
  let recoveries=0,refusals=0;
  for(const format of ['json','yaml']){const restored=core.readJsonValue(core.writeJsonValue(source,format),format),r=await run(restored);if(JSON.stringify(r)!==JSON.stringify(paired))throw Error('Envelope recovery failed');recoveries++;}
  const future=text.slice(0,-1)+',"unknown":900719925474099312345678901234567890}',retained=await run(source,future);if(retained.nativeSupplement!==future||retained.root.members.unknown.value!=='900719925474099312345678901234567890')throw Error('Unknown content lost');
  for(const mutate of [(c:any)=>c.constraints.pop(),(c:any)=>c.constraints[0].columns[0].modifier=5,(c:any)=>c.constraints[0].nodeTree=c.constraints[0].nodeTree.replace('[ 2 0 0 0','[ 3 0 0 0'),(c:any)=>c.constraints[0].expression=c.constraints[0].expression.replace('<= 2','<= 3')]){const changed=structuredClone(input.capture);mutate(changed);let rejected=false;try{await run(source,JSON.stringify(changed));}catch{rejected=true;}if(!rejected)throw Error('Mismatch accepted');refusals++;}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {constraints:12,verified:8,unsupported:4,recoveries,refusals,unknownExactToken:true};
 },fixture);
 assert.deepEqual(checks,{constraints:12,verified:8,unsupported:4,recoveries:2,refusals:4,unknownExactToken:true});assert.deepEqual(externalRequests,[]);
 const paths=['src/adapters/postgresql/facet-catalog.ts','spec/extensions/postgresql-catalog/facet-constraints-v1.schema.json','src/adapters/postgresql/facet-resolved-predicate.ts','src/adapters/postgresql/facet-node-tree.ts','src/adapters/postgresql/facet-predicate.ts','scripts/core-ideals/facets-postgresql-catalog-browser.ts','fixtures/validation/facets-postgresql-constraints-native.json','dist/umf.js','dist/postgresql-facet-catalog.js','dist/postgresql/runtime.js','dist/postgresql/libpg-query.wasm'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-catalog-browser.json',JSON.stringify({scope:'Internal catalog correspondence with actual browser WASM SQL parsing, native source retention and mismatch refusal; no public facet classification or authenticated provenance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
