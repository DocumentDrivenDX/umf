import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {projectRelationshipToTableSpec} from '../../src/core-ideals/relationship-tablespec-projection';
import {relationshipTableSpecProjectionCases} from './relationship-tablespec-projection-cases';
const rows=relationshipTableSpecProjectionCases().map(c=>({...c,result:projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>TableSpec authored relationship projection</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let projected=0,blocked=0,idealRecoveries=0,nativeSourcePairRecoveries=0,classifiedNativeRecoveries=0,refusals=0,getterCalls=0;
  const same=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser parity mismatch');};
  const fails=(fn:()=>unknown)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw Error('Expected refusal');};
  const archive=(d:any)=>d.extensions['umf.tablespec'].splitFiles?u.exportTableSpecBundle(d):u.exportTableSpec(d);
  for(const c of rows){
   const r=u.projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request);same(r,c.result);
   if(r.status==='blocked'){if(r.target!==undefined||r.mappings.length)throw Error('Partial blocked target');blocked++;continue;}projected++;
   const native=archive(r.target),current=typeof native==='string'?u.importTableSpec(native,{id:'fresh',format:'json'}):u.importTableSpecBundle(native,{id:'fresh'});
   for(const format of ['json','yaml']){
    const saved=u.readJsonValue(u.writeJsonValue(r,format),format);same(u.recoverRelationshipTableSpecIdeal(saved,current),c.source);idealRecoveries++;
    same(u.recoverRelationshipTableSpecNativeSources(saved,current),{source:archive(c.nativeSource),target:archive(c.nativeTarget)});nativeSourcePairRecoveries++;
    const observed=u.classifyTableSpecRelationships(current,{mode:'report',profile:'declared-metadata'}),restored=u.readJsonValue(u.writeJsonValue(observed,format),format);same(u.recoverTableSpecRelationshipSource(restored,restored.target),native);classifiedNativeRecoveries++;
    if(observed.target.modules.some((m:any)=>m.relationships))throw Error('Native import invented authored intent');
   }
   const fake=u.copyJson(r);fake.mappings[0].targetKey='forged';fails(()=>u.verifyRelationshipTableSpecProjection(fake,current));refusals++;
   const stale=u.copyJson(current);stale.modules[0].elements[0].name='changed';fails(()=>u.verifyRelationshipTableSpecProjection(r,stale));refusals++;
  }
  const c=rows[0];fails(()=>u.projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,{...c.request,get mode(){getterCalls++;return 'report';}}));
  if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host behavior leaked');
  return {cases:rows.length,projected,blocked,idealRecoveries,nativeSourcePairRecoveries,classifiedNativeRecoveries,refusals,getterCalls};
 });
 assert.deepEqual(checks,{cases:172,projected:65,blocked:107,idealRecoveries:130,nativeSourcePairRecoveries:130,classifiedNativeRecoveries:130,refusals:130,getterCalls:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/relationship-tablespec-projection.ts','src/core-ideals/relationship-tablespec.ts','src/index.ts','scripts/core-ideals/relationship-tablespec-projection-cases.ts','scripts/core-ideals/relationship-tablespec-projection-schema.ts','scripts/core-ideals/relationship-tablespec-projection-browser.ts','tests/core-ideals/relationship-tablespec-projection.test.ts','spec/core/relationship-tablespec-projection.schema.json','fixtures/validation/relationship-tablespec-projection-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-tablespec-projection-browser.json',JSON.stringify({scope:'Authored outgoing-metadata projection, fresh import/classification and retained logical/native recoveries; no execution enforcement, full binding acceptance or ideal admission',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
