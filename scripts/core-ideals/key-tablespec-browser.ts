import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {classifyTableSpecKeys} from '../../src/core-ideals/key-tablespec';
import {importTableSpec} from '../../src/adapters/tablespec';
import discovery from '../../fixtures/validation/key-tablespec-discovery-native.json';
const rows=discovery.cases.map(row=>{const text=JSON.stringify(row.source),source=importTableSpec(text,{id:'native',format:'json'});return {text,source,expected:classifyTableSpecKeys(source,{mode:'report',profile:'declared-metadata'})};});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>TableSpec Key classification</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,strictBlocks=0,forgedRefusals=0,staleRefusals=0;
  const same=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser parity mismatch');};
  const fails=(fn:()=>unknown)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw Error('Expected refusal');};
  for(const row of rows){
   const before=JSON.stringify(row.source),r=u.classifyTableSpecKeys(row.source,{mode:'report',profile:'declared-metadata'});same(r,row.expected);if(before!==JSON.stringify(row.source))throw Error('Source mutated');same(r.target.modules,row.source.modules);
   if(!u.validateDocument(r.target,new u.Registry().register(u.tableSpecKeysPackage)).valid)throw Error('Invalid extension payload');
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);same(u.recoverTableSpecKeySource(saved,saved.target),row.text);recoveries++;}
   const strict=u.classifyTableSpecKeys(row.source,{mode:'strict',profile:'declared-metadata'});if(r.residuals.length){if(strict.status!=='blocked'||strict.target!==undefined)throw Error('Silent strict loss');strictBlocks++;}else if(strict.status!=='classified')throw Error('Unexpected strict block');
   const fake=u.copyJson(r);fake.observations[0].basis='forged';fails(()=>u.verifyTableSpecKeyClassification(fake,r.target));forgedRefusals++;
   const stale=u.copyJson(r.target);stale.id='stale';fails(()=>u.verifyTableSpecKeyClassification(r,stale));staleRefusals++;
  }
  let getterCalls=0;fails(()=>u.classifyTableSpecKeys(rows[0].source,{profile:'declared-metadata',get mode(){getterCalls++;return 'report';}}));if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host behavior leaked');
  return {cases:rows.length,recoveries,strictBlocks,forgedRefusals,staleRefusals,getterCalls};
 });
 assert.equal(checks.cases,16);assert.equal(checks.recoveries,32);assert.equal(checks.forgedRefusals,16);assert.equal(checks.staleRefusals,16);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-tablespec-browser.ts','scripts/core-ideals/key-tablespec-schema.ts','src/core-ideals/key-tablespec.ts','src/index.ts','tests/core-ideals/key-tablespec.test.ts','spec/core/tablespec-key-classification.schema.json','spec/extensions/tablespec-keys/schema.json','spec/extensions/tablespec-keys/package.json','fixtures/validation/key-tablespec-discovery-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-tablespec-classification-browser.json',JSON.stringify({scope:'Native Key declaration classification and retained source recovery only; authored projection, whole binding acceptance and ideal admission remain pending',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
