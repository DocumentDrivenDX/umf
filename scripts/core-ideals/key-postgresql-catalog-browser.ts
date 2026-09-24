import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectPostgresqlKeyCatalog} from '../../src/adapters/postgresql/key-catalog';
const proof=await Bun.file('fixtures/validation/key-postgresql-discovery-native.json').json(),query=await Bun.file('native/postgresql/keys/query.sql').text();
const text=' \n'+JSON.stringify({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query,indexes:proof.indexes},null,2)+'\n',expected=inspectPostgresqlKeyCatalog(text);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/source')return Response.json({text,expected});return new Response('<!doctype html><html><body>PostgreSQL Key observations</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{text,expected}=await(await fetch('/source')).json();
  const r=u.inspectPostgresqlKeyCatalog(text);if(JSON.stringify(r)!==JSON.stringify(expected)||r.nativeSource!==text)throw Error('Native view parity mismatch');
  let recoveries=0;for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(saved.nativeSource!==text||JSON.stringify(u.inspectPostgresqlKeyCatalog(saved.nativeSource))!==JSON.stringify(r))throw Error('Retained source changed');recoveries++;}
  let refused=0;for(const change of [(v:any)=>v.serverVersion=180000,(v:any)=>v.indexes[0].components[0].position=2,(v:any)=>v.indexes[0].keyCount=9007199254740992,(v:any)=>v.indexes.push(v.indexes[0])]){const v=JSON.parse(text);change(v);let caught=false;try{u.inspectPostgresqlKeyCatalog(JSON.stringify(v));}catch{caught=true;}if(!caught)throw Error('Unsafe observations accepted');refused++;}
  const unknown=text.replace('"profile"','"future":{"n":9007199254740993,"zero":-0,"decimal":1.2300},"profile"'),retained=u.inspectPostgresqlKeyCatalog(unknown);if(retained.nativeSource!==unknown||retained.root.members.future.members.n.value!=='9007199254740993')throw Error('Unknown number rounded');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {indexes:r.indexes.length,recoveries,refused,unknownTokensPreserved:true,provenance:r.provenance};
 });
 assert.equal(checks.indexes,17);assert.equal(checks.recoveries,2);assert.equal(checks.refused,4);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-postgresql-catalog-browser.ts','scripts/core-ideals/key-postgresql-catalog-schema.ts','src/adapters/postgresql/key-catalog.ts','src/index.ts','spec/extensions/postgresql-catalog/key-observations-v1.schema.json','fixtures/validation/key-postgresql-discovery-native.json','native/postgresql/keys/query.sql','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-postgresql-catalog-browser.json',JSON.stringify({scope:'Pinned native Key observation inspection and retained source only; classification, authored projection and binding acceptance remain unfinished',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
