import {chromium} from 'playwright';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlRelationshipCases} from './relationship-postgresql-cases';
import {classifyPostgresqlRelationships,importPostgresqlCatalogCapture,projectRelationshipsToPostgresql} from '../../src';
const rows:any[]=[];for(const c of postgresqlRelationshipCases())rows.push({...c,expected:await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend)});
const catalogs:any[]=[];for(const id of [...rows.filter(c=>c.expected.status==='projected').map(c=>c.id),'native-counterexamples']){const nativeSource=await Bun.file(`fixtures/postgresql/relationships/${id}.catalog.json`).text(),source=importPostgresqlCatalogCapture(nativeSource,{id:'catalog-'+id}),request={profile:'captured-catalog' as const,mode:'report' as const,nativeSource};catalogs.push({id,source,request,expected:await classifyPostgresqlRelationships(source,request,backend)});}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
 if(path==='/cases')return Response.json({rows,catalogs});return new Response('<!doctype html><html>PostgreSQL relationship binding</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',runtime='/postgresql-runtime.js',u=await import(path),{backend}=await import(runtime),{rows,catalogs}=await(await fetch('/cases')).json();let projected=0,blocked=0,idealRecoveries=0,nativeRecoveries=0,observations=0;
  const equal=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Bun/Chromium or recovery mismatch');};
  for(const c of rows){const r=await u.projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);equal(r,c.expected);const strict=await u.projectRelationshipsToPostgresql(c.source,c.binding,c.authors,{...c.request,mode:'strict'},backend);if(strict.status!=='blocked'||strict.target)throw Error('Strict projected');if(r.status==='blocked'){blocked++;continue;}projected++;
   const fresh=await u.importPostgresqlSql(r.nativeSql,backend,{id:'fresh-browser'});for(const format of ['json','yaml']){const current=u.readDocument(u.writeDocument(fresh,format),format);equal(await u.recoverRelationshipPostgresqlIdeal(r,current,backend),c.source);idealRecoveries++;if(await u.recoverRelationshipPostgresqlNative(r,current,backend)!==r.nativeSql)throw Error('Native SQL loss');nativeRecoveries++;}
   const cl=await u.classifyPostgresqlRelationships(fresh,{profile:'raw-ddl',mode:'report',nativeSource:r.nativeSql},backend);if(cl.target.modules.some((m:any)=>'relationships'in m))throw Error('Inferred authored relationship');if(await u.recoverPostgresqlRelationshipSource(cl,cl.target,backend)!==r.nativeSql)throw Error('Classification lost DDL');nativeRecoveries++;
  }
  for(const c of catalogs){const r=await u.classifyPostgresqlRelationships(c.source,c.request,backend);equal(r,c.expected);observations+=r.observations.length;for(const format of ['json','yaml']){const current=u.readDocument(u.writeDocument(r.target,format),format);if(await u.recoverPostgresqlRelationshipSource(r,current,backend)!==c.request.nativeSource)throw Error('Catalog text/unknown loss');nativeRecoveries++;}const strict=await u.classifyPostgresqlRelationships(c.source,{...c.request,mode:'strict'},backend);if(strict.status!=='blocked'||strict.target)throw Error('Strict classification inferred authorship');}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host global');return {cases:rows.length,projected,blocked,strictProjectionBlocks:rows.length,catalogs:catalogs.length,observations,idealRecoveries,nativeRecoveries};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/relationship-postgresql-browser.json',JSON.stringify({scope:'PostgreSQL17.4 qualified FK/junction new-table binding and observed DDL/catalog classification; no native equivalence or full DDD generator claim',browser:browser.version(),result,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}
