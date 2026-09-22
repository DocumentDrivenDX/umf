import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/cardinality-sqlserver-profile-native.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><html><body>SQL Server logical Cardinality</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(nativeSource:string)=>{
  const path='/umf.js',u=await import(path);
  const source=u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(u.importSqlServerCatalog(nativeSource,{id:'browser-logical'})).target).target).target;
  const native=u.exportSqlServerCatalog(source);let classified=0,blocked=0,recoveries=0,forgedRefusals=0;
  for(const column of u.getSqlServerColumnMetadata(source))for(const profile of ['native-scalar','json-array','json-object','unresolved'])for(const mode of ['strict','report']){
   const c=u.getSqlServerConstraintMetadata(source).tables.find((t:any)=>t.table.name===column.table.name).checks[0];
   const request={column:column.path,nativeSource,identity:{module:'logical',element:'value'},constraint:profile==='native-scalar'?null:c?.members?.name?.value??null,profile,mode};
   const r=u.classifySqlServerCardinality(source,request),exact=profile==='native-scalar'||profile==='json-array'&&column.table.name==='array_value';
   if(r.status!==(mode==='strict'&&!exact?'blocked':'classified'))throw Error('Policy mismatch');
   if(r.status==='blocked'){if(r.target)throw Error('Partial candidate');blocked++;continue;}
   if(u.exportSqlServerCatalog(r.target)!==native)throw Error('Physical capture changed');classified++;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(u.recoverSqlServerCardinalitySource(saved,saved.target)!==nativeSource)throw Error('Native text recovery');recoveries++;}
   const forged=structuredClone(r);forged.mapping.idealPath='/forged';let refused=false;try{u.recoverSqlServerCardinalitySource(forged,r.target);}catch{refused=true;}if(!refused)throw Error('Forged receipt');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {classified,blocked,recoveries,forgedRefusals};
 },fixture.nativeSource);
 assert.equal(external.length,0);
 const paths=['scripts/core-ideals/cardinality-sqlserver-classification-browser.ts','src/core-ideals/cardinality-sqlserver.ts','src/index.ts','spec/core/sqlserver-cardinality-classification.schema.json','spec/extensions/sqlserver-cardinality/package.json','fixtures/validation/cardinality-sqlserver-profile-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-sqlserver-classification-browser.json',JSON.stringify({scope:'Explicit representation classification and retained physical/native recovery in Chromium; no down-projection or binding acceptance',browser:browser.version(),checks,externalRequests:external,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
