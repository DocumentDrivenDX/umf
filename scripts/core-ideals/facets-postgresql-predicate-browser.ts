import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {backend} from '../../native/postgresql/runtime';
import {inspectPostgresqlFacetPredicate} from '../../src/adapters/postgresql/facet-predicate';
const cases=[
 "value >= '-999.99'::numeric AND value <= 999.99 AND value = pg_catalog.trunc(value, 2)",
 'value <= 9223372036854775807','value <= 999999999999999999999999999999.999999999999999999',
 'char_length(value) <= 0','octet_length(value) <= 2','value = trunc(value, 0)',
 'value >= 0 OR value <= 127','value >= 0 AND other <= 127','custom.char_length(value) <= 2',
 'char_length(value) FILTER (WHERE true) <= 2','value <= 127 FROM anything','value <= 127; SELECT 1',
];
const rows=await Promise.all(cases.map(async(sql,index)=>{const ast=await backend.parse('SELECT '+sql),expected=inspectPostgresqlFacetPredicate(ast,'value');assert.equal(expected.state,index<6?'candidate':'unsupported');return {sql,ast,expected};}));
const built=await Bun.build({entrypoints:['src/adapters/postgresql/facet-predicate.ts'],target:'browser',format:'esm'});
assert.ok(built.success,JSON.stringify(built.logs));await Bun.write('dist/postgresql-facet-predicate.js',built.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/inspector.js')return new Response(Bun.file('dist/postgresql-facet-predicate.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><title>Predicate syntax checks</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/inspector.js',module=await import(path),rows=await(await fetch('/cases')).json();let candidate=0,unsupported=0;
  for(const row of rows){const before=JSON.stringify(row.ast),r=module.inspectPostgresqlFacetPredicate(row.ast,'value');if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.ast)!==before)throw Error('Parity or mutation failure');if(r.state==='candidate')candidate++;else unsupported++;}
  let getterCalls=0,refused=false;try{module.inspectPostgresqlFacetPredicate({get version(){getterCalls++;return 170004}},'value');}catch{refused=true;}
  if(!refused||getterCalls)throw Error('Accessor executed');if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,candidate,unsupported,getterCalls};
 });
 assert.deepEqual(checks,{cases:12,candidate:6,unsupported:6,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/adapters/postgresql/facet-predicate.ts','scripts/core-ideals/facets-postgresql-predicate-browser.ts','tests/core-ideals/facets-postgresql-predicate.test.ts','dist/postgresql-facet-predicate.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-predicate-browser.json',JSON.stringify({scope:'Internal syntax inspection of host-parsed pinned PostgreSQL ASTs in Chromium; no browser SQL parsing, resolved enforcement or core facet classification',parser:backend.identity,browser:browser.version(),checks,externalRequests,rows,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
