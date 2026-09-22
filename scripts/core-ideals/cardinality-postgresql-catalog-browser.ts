import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/cardinality-postgresql-catalog-native.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><html><body>PostgreSQL type relationships</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const {supplement,captureSource}=input;
  const path='/umf.js',u=await import(path),text=JSON.stringify(supplement);let resolved=0,refused=0;
  function require(value:unknown){if(!value)throw Error('Browser assertion failed');}
  for(const column of supplement.columns){const r=u.resolvePostgresqlCardinalityType(text,column);require(r.nativeSource===text);require(r.qualifiedVersion);resolved++;}
  const resolve=(relation:string,name='value')=>u.resolvePostgresqlCardinalityType(text,{schema:'cardinality',relation,name});
  require(resolve('declared').standardArray);require(!resolve('vectorish').standardArray);
  require(resolve('domains','vector').domains.length===1);require(resolve('domains','items').element.kind==='d');
  const exact=text.slice(0,-1)+',"future":900719925474099312345678901234567890}';
  const retained=u.inspectPostgresqlCardinalityCatalog(exact);require(retained.nativeSource===exact);require(retained.root.members.future.value==='900719925474099312345678901234567890');
  for(const mutation of [
   (v:any)=>v.types.push(v.types[0]),
   (v:any)=>v.columns.push(v.columns[0]),
   (v:any)=>v.types.splice(v.types.findIndex((t:any)=>t.identity.name==='int4'),1),
   (v:any)=>{const t=v.types.find((t:any)=>t.identity.name==='vector');t.base=t.identity;},
  ]){const v=structuredClone(supplement);mutation(v);let caught=false;try{u.inspectPostgresqlCardinalityCatalog(JSON.stringify(v));}catch{caught=true;}require(caught);refused++;}
  const capture=u.importPostgresqlCatalogCapture(captureSource,{id:'browser-pair'});
  const pair=u.correlatePostgresqlCardinalityCatalog(capture,text);require(pair.matches.length===26);require(pair.sameSnapshotVerified===false);
  const changed=structuredClone(supplement);changed.columns[0].declaredDimensions=8;
  let mismatch=false;try{u.correlatePostgresqlCardinalityCatalog(capture,JSON.stringify(changed));}catch{mismatch=true;}require(mismatch);refused++;
  const model=u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(capture).target).target).target;
  for(const e of model.modules.find((m:any)=>m.id==='postgresql.columns').elements)e.kind='field';
  let classified=0,recovered=0,strictScalars=0;
  for(const c of u.getPostgresqlColumnMetadata(model)){
   const receipt=u.classifyPostgresqlCardinality(model,{column:c.path,nativeSource:captureSource,supplement:text,mode:'report',profile:'stored-value'});
   require(receipt.status==='classified');require(c.relation.name==='scalars'?receipt.residuals.length===0:receipt.residuals.length>0);classified++;
   if(c.relation.name==='scalars'){const strict=u.classifyPostgresqlCardinality(model,{column:c.path,nativeSource:captureSource,supplement:text,mode:'strict',profile:'stored-value'});require(strict.status==='classified');require(strict.mapping.cardinality==='one');strictScalars++;}
   const archive=u.recoverPostgresqlCardinalitySource(receipt,receipt.target);require(archive.nativeSource===captureSource);require(archive.supplement===text);recovered++;
  }
  require(!('Bun'in globalThis));require(!('process'in globalThis));return {resolved,refused,classified,recovered,strictScalars,exactUnknownToken:true};
 },{supplement:fixture.supplement,captureSource:fixture.captureSource});
 assert.equal(external.length,0);
 const paths=['src/adapters/postgresql/cardinality-catalog.ts','src/core-ideals/cardinality-postgresql.ts','spec/core/postgresql-cardinality-classification.schema.json','spec/extensions/postgresql-cardinality/package.json','src/index.ts','spec/extensions/postgresql-catalog/cardinality-v1.schema.json','scripts/core-ideals/cardinality-postgresql-catalog-browser.ts','fixtures/validation/cardinality-postgresql-catalog-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-postgresql-catalog-browser.json',JSON.stringify({scope:'Browser supplement validation and native type relationship resolution; qualified report classification and native recovery; no down-projection or authenticated capture correspondence claim',browser:browser.version(),checks,externalRequests:external,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
