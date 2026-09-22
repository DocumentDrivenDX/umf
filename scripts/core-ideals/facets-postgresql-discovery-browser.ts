import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {parseNativeJson} from '../../src/model/native-json';
import {inspectPostgresqlFacetType} from '../../src/adapters/postgresql/facet-typmod';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
const proofPath='fixtures/validation/facets-postgresql-discovery-native.json',proof=await Bun.file(proofPath).json();
for(const [path,expected] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),expected,`Stale native proof: ${path}`);
const source=importPostgresqlCatalogCapture(proof.sourceText,{id:'facet-browser'}),snapshot=JSON.parse(proof.sourceText).snapshot;
const rows=snapshot.relations.filter((r:any)=>r.schema==='facet').map((r:any)=>{const native=parseNativeJson(JSON.stringify(r.columns[0].nativeType));return {name:r.name,native,expected:inspectPostgresqlFacetType(native)};});
const built=await Bun.build({entrypoints:['src/adapters/postgresql/facet-typmod.ts'],target:'browser',format:'esm'});assert.ok(built.success,JSON.stringify(built.logs));await Bun.write('dist/postgresql-facet-type.js',built.outputs[0]!);
const payload={rows,source,expectedCapture:exportPostgresqlCatalogCapture(source).json,expectedColumns:getPostgresqlColumnMetadata(source).length};
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js'||path==='/postgresql-facet-type.js')return new Response(Bun.file('dist'+path),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(payload);return new Response('<!doctype html><title>PostgreSQL facet discovery</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const corePath='/umf.js',decoderPath='/postgresql-facet-type.js',u=await import(corePath),d=await import(decoderPath),data=await(await fetch('/cases')).json();let observed=0,unsupported=0,recoveries=0;
  for(const row of data.rows){const before=JSON.stringify(row.native),r=d.inspectPostgresqlFacetType(row.native);if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.native)!==before)throw Error('Native decoder parity/mutation');if(r.state==='observed')observed++;else unsupported++;}
  if(u.getPostgresqlColumnMetadata(data.source).length!==data.expectedColumns)throw Error('Missing columns');
  for(const row of u.getPostgresqlColumnMetadata(data.source))if(row.element.facets!==undefined)throw Error('Native facts became core assertions');
  for(const format of ['json','yaml']){const doc=u.readJsonValue(u.writeJsonValue(data.source,format),format);if(u.exportPostgresqlCatalogCapture(doc).json!==data.expectedCapture)throw Error('Native catalog changed');recoveries++;}
  const raw=data.rows.find((r:any)=>r.name==='decimal_pair').native;
  const unsafe=u.copyJson(raw);unsafe.members.modifier={kind:'number',value:'327686.0000000000000000001'};if(d.inspectPostgresqlFacetType(unsafe).state!=='unsupported')throw Error('Unsafe modifier rounded');
  let getterCalls=0,refused=false;try{d.inspectPostgresqlFacetType({get kind(){getterCalls++;return 'object';},members:{}});}catch{refused=true;}if(!refused||getterCalls)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:data.rows.length,observed,unsupported,catalogRecoveries:recoveries,unsafeRefusals:1,getterCalls};
 });
 assert.deepEqual(checks,{cases:28,observed:26,unsupported:2,catalogRecoveries:2,unsafeRefusals:1,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/facets-postgresql-discovery-browser.ts','src/adapters/postgresql/facet-typmod.ts',proofPath,'dist/umf.js','dist/postgresql-facet-type.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-discovery-browser.json',JSON.stringify({scope:'Internal native type decoding and existing catalog-tree serialization in Chromium; no public facet classifier, projection or binding qualification',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
