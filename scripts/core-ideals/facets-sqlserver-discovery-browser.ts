import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {importSqlServerCatalog,getSqlServerColumnMetadata} from '../../src';
import {inspectSqlServerFacetType} from '../../src/adapters/sqlserver/facet-type';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-discovery-native.json').json();assert.equal(proof.observational,false);assert.equal(proof.serverVersion,'16.0.4295.3');
for(const [path,sha] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha);
const source=importSqlServerCatalog(proof.sourceText,{id:'sqlserver-facet-discovery'}),rows=getSqlServerColumnMetadata(source).map(c=>({native:c.nativeColumn,expected:inspectSqlServerFacetType(c.nativeColumn)}));
const build=await Bun.build({entrypoints:['src/adapters/sqlserver/facet-type.ts'],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));await Bun.write('dist/sqlserver-facet-type.js',build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/type.js')return new Response(Bun.file('dist/sqlserver-facet-type.js'),{headers:{'content-type':'text/javascript'}});if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>SQL Server native facet discovery</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const p='/type.js',q='/umf.js',m=await import(p),core=await import(q);let observed=0,unsupported=0,recoveries=0;
  for(const row of input.rows){const before=JSON.stringify(row.native),r=m.inspectSqlServerFacetType(row.native);if(JSON.stringify(r)!==JSON.stringify(row.expected)||JSON.stringify(row.native)!==before)throw Error('Native observation parity/mutation');if(r.state==='observed')observed++;else unsupported++;}
  for(const format of ['json','yaml']){const d=core.readDocument(core.writeDocument(input.source,format),format);if(core.exportSqlServerCatalog(d)!==core.exportSqlServerCatalog(input.source))throw Error('Catalog recovery');recoveries++;}
  const native=structuredClone(input.rows.find((r:any)=>r.native.members.type_name?.value==='decimal').native);native.members.precision={kind:'number',value:'5.00000000000000001'};if(m.inspectSqlServerFacetType(native).state!=='unsupported')throw Error('Unsafe integer');
  let calls=0,rejected=false;try{m.inspectSqlServerFacetType({get kind(){calls++;return 'object';}});}catch{rejected=true;}if(!rejected||calls)throw Error('Getter invoked');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:input.rows.length,observed,unsupported,catalogRecoveries:recoveries,unsafeRefusals:1,getterCalls:calls};
 },{source,rows} as any);
 assert.deepEqual(checks,{cases:37,observed:34,unsupported:3,catalogRecoveries:2,unsafeRefusals:1,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/adapters/sqlserver/facet-type.ts','scripts/core-ideals/facets-sqlserver-discovery-browser.ts','fixtures/validation/facets-sqlserver-discovery-native.json','dist/sqlserver-facet-type.js','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-sqlserver-discovery-browser.json',JSON.stringify({scope:'Internal pinned SQL Server native type observation and catalog-tree recovery in Chromium; no public core facet classifier/projector or binding acceptance',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
