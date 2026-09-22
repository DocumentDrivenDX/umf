import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectResolvedFacetPredicate} from '../../src/adapters/postgresql/facet-resolved-predicate';
const constraints=await Bun.file('fixtures/validation/facets-postgresql-constraints-native.json').json(),datums=await Bun.file('fixtures/validation/facets-postgresql-resolved-native.json').json();
for(const proof of [constraints,datums])for(const [path,sha] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha);
const profile={serverVersion:170004,encoding:'UTF8',datumFormat:'little-endian-datum64'};
const rows=constraints.capture.constraints.map((native:unknown)=>({native,expected:inspectResolvedFacetPredicate(native,profile)}));
for(const [source,target] of [[':boolop and',':boolop or'],[':varattno 1',':varattno 2'],[':funcid 1709',':funcid 999999'],[':constvalue 10',':future 1 :constvalue 10']]){
 const native=structuredClone(constraints.capture.constraints.find((c:any)=>c.relation==='decimal_exact'));native.nodeTree=native.nodeTree.replace(source,target);const expected=inspectResolvedFacetPredicate(native,profile);assert.equal(expected.state,'unsupported');rows.push({native,expected});
}
for(const name of ['facet-resolved-predicate','facet-node-tree']){const build=await Bun.build({entrypoints:[`src/adapters/postgresql/${name}.ts`],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));await Bun.write(`dist/${name}.js`,build.outputs[0]!);}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(['/facet-resolved-predicate.js','/facet-node-tree.js'].includes(path))return new Response(Bun.file('dist'+path),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json({rows,profile,datums:datums.rows});return new Response('<!doctype html><title>Resolved predicate checks</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const p='/facet-resolved-predicate.js',n='/facet-node-tree.js',m=await import(p),d=await import(n),data=await(await fetch('/cases')).json();let verified=0,unsupported=0,decoded=0,refused=0;
  for(const row of data.rows){const before=JSON.stringify(row.native),r=m.inspectResolvedFacetPredicate(row.native,data.profile);if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.native)!==before)throw Error('Resolution parity/mutation');if(r.state==='verified-expression')verified++;else unsupported++;}
  for(const row of data.datums){const tree=d.readFacetNodeTree(row.nodeTree),value=d.decodeFacetConstant(tree.fields.args[1])??null;if(value!==row.actual)throw Error('Datum mismatch');if(value===null)refused++;else decoded++;}
  let calls=0,rejected=false;try{m.inspectResolvedFacetPredicate({get nodeTree(){calls++;return ''}},data.profile);}catch{rejected=true;}if(!rejected||calls)throw Error('Getter invoked');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {predicates:data.rows.length,verified,unsupported,datums:data.datums.length,decoded,refused,getterCalls:calls};
 });
 assert.deepEqual(checks,{predicates:16,verified:8,unsupported:8,datums:13,decoded:10,refused:3,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/adapters/postgresql/facet-resolved-predicate.ts','src/adapters/postgresql/facet-node-tree.ts','scripts/core-ideals/facets-postgresql-resolved-browser.ts','fixtures/validation/facets-postgresql-constraints-native.json','fixtures/validation/facets-postgresql-resolved-native.json','dist/facet-resolved-predicate.js','dist/facet-node-tree.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-resolved-browser.json',JSON.stringify({scope:'Internal pinned analyzed-expression verification and exact Datum decoding; no public core classification or capture-correspondence claim',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
