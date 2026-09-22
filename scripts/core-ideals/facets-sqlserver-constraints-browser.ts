import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
import {inspectSqlServerFacetConstraints as inspect} from '../../src/adapters/sqlserver/facet-constraints';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-discovery-native.json').json();
assert.equal(proof.observational,false);assert.equal(proof.serverVersion,'16.0.4295.3');
for(const [path,sha] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha);
const native=JSON.parse(proof.sourceText),document=importSqlServerCatalog(proof.sourceText,{id:'facet-constraint-browser'});
const rows=native.tables.flatMap((t:any,i:number)=>t.columns.map((_:any,j:number)=>{const path=`/tables/${i}/columns/${j}`;return {path,expected:inspect(document,path)};}));
const build=await Bun.build({entrypoints:['src/adapters/sqlserver/facet-constraints.ts'],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));await Bun.write('dist/sqlserver-facet-constraints.js',build.outputs[0]!);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/constraints.js'?new Response(Bun.file('dist/sqlserver-facet-constraints.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server CHECK interpretation</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const path='/constraints.js',m=await import(path),before=JSON.stringify(input.document);let interpreted=0,residual=0,writeOnly=0;
  for(const row of input.rows){const r=m.inspectSqlServerFacetConstraints(input.document,row.path);if(JSON.stringify(r)!==JSON.stringify(row.expected))throw Error('Browser parity');for(const o of r.observations){if(o.state==='interpreted')interpreted++;else residual++;if(o.scope==='ordinary-checked-write-non-null')writeOnly++;}}
  if(JSON.stringify(input.document)!==before)throw Error('Source changed');
  const doc=structuredClone(input.document);doc.extensions['umf.sqlserver'].root.members.serverVersion.value='17.0';
  for(const row of input.rows){const r=m.inspectSqlServerFacetConstraints(doc,row.path);if(r.type.state!=='unsupported'||r.observations.some((o:any)=>o.state!=='residual'))throw Error('Unsupported version interpreted');}
  let calls=0,rejected=false;try{m.inspectSqlServerFacetConstraints({get umf(){calls++;return '0.1.0';}},input.rows[0].path);}catch{rejected=true;}if(!rejected||calls)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {columns:input.rows.length,interpreted,residual,writeOnly,getterCalls:calls,sourceUnchanged:true,versionRefusal:true};
 },{document,rows} as any);
 assert.deepEqual(checks,{columns:37,interpreted:6,residual:5,writeOnly:2,getterCalls:0,sourceUnchanged:true,versionRefusal:true});assert.deepEqual(externalRequests,[]);
 const paths=['src/adapters/sqlserver/facet-constraints.ts','src/adapters/sqlserver/facet-predicate.ts','src/adapters/sqlserver/facet-type.ts','src/adapters/sqlserver/index.ts','scripts/core-ideals/facets-sqlserver-constraints-browser.ts','tests/core-ideals/facets-sqlserver-constraints.test.ts','fixtures/validation/facets-sqlserver-discovery-native.json','dist/sqlserver-facet-constraints.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-sqlserver-constraints-browser.json',JSON.stringify({scope:'Internal pinned catalog CHECK interpretation, with non-null stored/ordinary-checked-write scopes. No public binding, input exactness, source authenticity or complete constraint inventory claim.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
