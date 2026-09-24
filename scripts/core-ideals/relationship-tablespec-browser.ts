import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {classifyTableSpecRelationships} from '../../src/core-ideals/relationship-tablespec';
import {importTableSpec,importTableSpecBundle} from '../../src/adapters/tablespec';
import {relationshipCandidate} from '../core-relationship-cases';
import discovery from '../../fixtures/validation/relationship-tablespec-discovery-native.json';
const request={mode:'report',profile:'declared-metadata'} as const;
const rows:{native:string|Record<string,string>;source:any;expected:any}[]=discovery.cases.map(row=>{const native=JSON.stringify(row.source),source=importTableSpec(native,{id:row.case,format:'json'});return {native,source,expected:classifyTableSpecRelationships(source,request)};});
const files={'table.yaml':'version: "1.0"\ntable_name: orders\nrelationships: {future: {n: 9007199254740993, decimal: 1.2300}}\n','columns/id.yaml':'column: {name: id, data_type: INTEGER}\n','notes.txt':'untouched\n'};
const split=importTableSpecBundle(files,{id:'split'});rows.push({native:files,source:split,expected:classifyTableSpecRelationships(split,request)});
const authored=structuredClone(rows[3]!.source);authored.umf='0.7.0';authored.modules.push(...relationshipCandidate().modules);rows.push({native:rows[3]!.native,source:authored,expected:classifyTableSpecRelationships(authored,request)});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>TableSpec relationship classification</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,strictBlocks=0,forgedRefusals=0,staleRefusals=0,getterCalls=0;
  const same=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser parity mismatch');};
  const fails=(fn:()=>unknown)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw Error('Expected refusal');};
  for(const row of rows){
   const r=u.classifyTableSpecRelationships(row.source,{mode:'report',profile:'declared-metadata'});same(r,row.expected);same(r.target.modules,row.source.modules);
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);same(u.recoverTableSpecRelationshipSource(saved,saved.target),row.native);recoveries++;}
   const strict=u.classifyTableSpecRelationships(row.source,{mode:'strict',profile:'declared-metadata'});if(r.residuals.length){if(strict.status!=='blocked'||strict.target!==undefined)throw Error('Strict leaked candidate');strictBlocks++;}else if(strict.status!=='classified')throw Error('Exact classification blocked');
   const fake=u.copyJson(r);fake.outcome=fake.outcome==='exact'?'unknown':'exact';fails(()=>u.verifyTableSpecRelationshipClassification(fake,r.target));forgedRefusals++;
   const stale=u.copyJson(r.target);stale.id+='changed';fails(()=>u.verifyTableSpecRelationshipClassification(r,stale));staleRefusals++;
  }
  fails(()=>u.classifyTableSpecRelationships(rows[0].source,{profile:'declared-metadata',get mode(){getterCalls++;return 'report';}}));
  if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host behavior leaked');
  return {cases:rows.length,recoveries,strictBlocks,forgedRefusals,staleRefusals,getterCalls};
 });
 assert.equal(checks.cases,22);assert.equal(checks.recoveries,44);assert.equal(checks.strictBlocks,19);assert.equal(checks.forgedRefusals,22);assert.equal(checks.staleRefusals,22);assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/relationship-tablespec.ts','src/index.ts','scripts/core-ideals/relationship-tablespec-schema.ts','scripts/core-ideals/relationship-tablespec-browser.ts','tests/core-ideals/relationship-tablespec.test.ts','spec/core/tablespec-relationship-classification.schema.json','spec/extensions/tablespec-relationships/package.json','spec/extensions/tablespec-relationships/schema.json','fixtures/validation/relationship-tablespec-discovery-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-tablespec-classification-browser.json',JSON.stringify({scope:'Native metadata classification and retained archive recovery only; authored projection, binding acceptance and ideal admission remain unclaimed',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
