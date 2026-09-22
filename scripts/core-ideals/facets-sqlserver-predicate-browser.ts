import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectSqlServerFacetPredicate as inspect} from '../../src/adapters/sqlserver/facet-predicate';
import {predicateCases,unsupportedPredicates} from './facets-sqlserver-predicate-cases';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-discovery-native.json').json();
assert.equal(proof.observational,false);assert.equal(proof.serverVersion,'16.0.4295.3');
const native=JSON.parse(proof.sourceText).tables.flatMap((table:any)=>table.checks.map((check:any)=>({text:check.definition,column:'value'})));
const rows=[...predicateCases,...unsupportedPredicates.map(text=>({text,column:'value'})),...native].map(row=>({...row,expected:inspect(row.text,row.column)}));
const build=await Bun.build({entrypoints:['src/adapters/sqlserver/facet-predicate.ts'],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));
await Bun.write('dist/sqlserver-facet-predicate.js',build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/predicate.js'?new Response(Bun.file('dist/sqlserver-facet-predicate.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server CHECK syntax</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(rows:any[])=>{
  const path='/predicate.js',m=await import(path);let candidates=0,unsupported=0;
  for(const row of rows){const r=m.inspectSqlServerFacetPredicate(row.text,row.column);if(JSON.stringify(r)!==JSON.stringify(row.expected))throw Error('Browser parity');if(r.native!==row.text)throw Error('Native text changed');if(r.state==='candidate')candidates++;else unsupported++;}
  let calls=0,rejected=false;try{m.inspectSqlServerFacetPredicate({get definition(){calls++;return '[value]>=0';}},'value');}catch{rejected=true;}if(!rejected||calls)throw Error('Getter executed');
  for(const name of ['\ud800','\udc00'])if(m.inspectSqlServerFacetPredicate(`[${name}]>=0`,name).state!=='unsupported')throw Error('Invalid identifier');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,candidates,unsupported,getterCalls:calls,invalidIdentifiers:2};
 },rows);
 assert.equal(checks.candidates,predicateCases.length+10);assert.equal(checks.unsupported,unsupportedPredicates.length+1);assert.deepEqual(externalRequests,[]);
 const paths=['src/adapters/sqlserver/facet-predicate.ts','scripts/core-ideals/facets-sqlserver-predicate-cases.ts','scripts/core-ideals/facets-sqlserver-predicate-browser.ts','tests/core-ideals/facets-sqlserver-predicate.test.ts','fixtures/validation/facets-sqlserver-discovery-native.json','dist/sqlserver-facet-predicate.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-sqlserver-predicate-browser.json',JSON.stringify({scope:'Internal bounded CHECK syntax inspection; native definitions reused from SQL Server 2022 discovery. No native syntax acceptance, enforcement, public binding or ideal admission claim.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
