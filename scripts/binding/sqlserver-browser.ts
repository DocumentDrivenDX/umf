import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {sqlServerPhysicalCases} from './sqlserver-cases';
import {projectBindingToSqlServer} from '../../src/projections/binding-sqlserver';
const nativeSource=await Bun.file('fixtures/binding/sqlserver/catalog.json').text(),cases=sqlServerPhysicalCases().map(c=>({...c,receipt:projectBindingToSqlServer(c.logical,c.binding,c.policy,'report',nativeSource)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json({cases,nativeSource});if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>SQL Server physical binding</title>',{headers:{'content-type':'text/html'}});}});let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{cases,nativeSource}=await(await fetch('/cases')).json();let recoveries=0,refusals=0,strictBlocks=0;
  const same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
  for(const c of cases){const r=u.projectBindingToSqlServer(c.logical,c.binding,c.policy,'report',nativeSource);if(!same(r,c.receipt))throw Error('Browser/host mismatch');if(r.status!=='reported'||!r.candidate.includes('[quantity] decimal(12,2) NOT NULL'))throw Error('Association attribute disappeared');
   if(u.projectBindingToSqlServer(c.logical,c.binding,c.policy,'strict',nativeSource).candidate!==undefined)throw Error('Strict emitted a candidate');strictBlocks++;
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(!same(u.recoverBindingSqlServerSources(saved,saved.candidate),{logical:c.logical,binding:c.binding,policy:c.policy}))throw Error('Authored source changed');const native=u.recoverBindingSqlServerNative(saved,saved.candidate);if(native.catalog!==nativeSource||native.sql!==r.candidate)throw Error('Native archive changed');recoveries++;}
   const bad=structuredClone(r);bad.residuals.pop();let refused=false;try{u.verifyBindingSqlServerProjection(bad,r.candidate);}catch{refused=true;}if(!refused)throw Error('Forged receipt');refusals++;refused=false;try{u.verifyBindingSqlServerProjection(r,r.candidate+'-- changed');}catch{refused=true;}if(!refused)throw Error('Altered SQL');refusals++;
  }
  let getterReads=0,refused=false;const c=cases[0];try{u.projectBindingToSqlServer(c.logical,c.binding,{...c.policy,get partitionFamilies(){getterReads++;return [];}},'report');}catch{refused=true;}if(!refused||getterReads)throw Error('Getter executed');if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,recoveries,refusals,strictBlocks,getterReads};
 });
 assert.deepEqual(checks,{cases:7,recoveries:14,refusals:14,strictBlocks:7,getterReads:0});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/binding/sqlserver-browser.ts','scripts/binding/sqlserver-cases.ts','src/projections/binding-sqlserver/index.ts','src/projections/binding-sqlserver/relationship-layout.ts','src/projections/binding-sqlserver/tables.ts','src/projections/binding-sqlserver/indexes.ts','spec/projections/sqlserver-physical-binding.schema.json','spec/projections/sqlserver-relationship-layout.schema.json','tests/binding/sqlserver.test.ts','fixtures/binding/sqlserver/catalog.json','fixtures/binding/sqlserver/oracle.json','dist/umf.js','src/index.ts'];const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/binding/sqlserver/browser.json',JSON.stringify({scope:'Full qualified physical SQL Server DDL, explicit unsupported choices and retained authored/native recovery; no native equivalence',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
