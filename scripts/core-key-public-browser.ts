import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {keyCandidate} from './core-key-cases';
const source=keyCandidate(),record={module:'m',element:'Order'},field={module:'m',element:'id'};
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/source')return Response.json(source);return new Response('<!doctype html><html><body>Current UMF Key operations</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),source=await(await fetch('/source')).json(),record={module:'m',element:'Order'},field={module:'m',element:'id'};
  const same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Unexpected metadata change');};
  const fails=(fn:()=>unknown)=>{try{fn();}catch{return;}throw Error('Expected refusal');};
  if(source.umf!=='0.10.0'||!u.validateDocument(source).valid)throw Error('Current source rejected');
  const inspection=u.inspectCoreKeys(source,record),lookup=u.lookupCoreKey(source,{...record,key:'pk'});if(lookup.key.id!=='pk')throw Error('Key lookup differs');
  let operationRecoveries=0,documentRecoveries=0,selectionRecoveries=0;
  for(const operation of [inspection,lookup])for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(operation,format),format);same(u.verifyCoreKeyOperation(saved,source),operation);operationRecoveries++;}
  const renamed=u.declareCoreKey(source,record,{id:'pk',name:'Renamed',fields:[field],primary:true});same(u.lookupCoreKey(renamed.target,{...record,key:'pk'}).key.name,'Renamed');same(u.verifyCoreKeyOperation(renamed,renamed.target),renamed);
  const qualified=structuredClone(source);(qualified.modules[0].elements[0].keys[0] as any).future={opaque:true};const preserved=u.declareCoreKey(qualified,record,{id:'pk',name:'Renamed',fields:[field],primary:true});same((preserved.target.modules[0].elements[0].keys[0] as any).future,{opaque:true});
  fails(()=>u.lookupCoreKey(source,{...record,key:'Renamed'}));fails(()=>u.verifyCoreKeyOperation(renamed,source));
  const tuple=u.encodeCoreKeyTuple(source,{...record,key:'pk'},[{integerToken:'42'}]);if(tuple.version!=='4.0.0'||u.readCoreKeyTupleBytes(tuple,source).length===0)throw Error('Current key tuple mismatch');
  const selection=u.selectCoreElements(source,{references:'none',identities:[record]});for(const format of ['json','yaml']){same(u.readJsonValue(u.writeJsonValue(selection,format),format),selection);selectionRecoveries++;}
  let getterCalls=0;const hostile=structuredClone(source);Object.defineProperty(hostile.modules[0].elements[0],'keys',{enumerable:true,get(){getterCalls++;return [];} });fails(()=>u.validateDocument(hostile));if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host behavior leaked');
  return {operationRecoveries,documentRecoveries,selectionRecoveries,getterCalls,currentCore:true,unknownQualifiersPreserved:true,stableIdConflictRefused:true,tupleVerified:true,forgedAndStaleRefused:true};
 });
 assert.deepEqual(externalRequests,[]);assert.equal(checks.operationRecoveries,4);assert.equal(checks.selectionRecoveries,2);
 const paths=['scripts/core-key-public-browser.ts','scripts/core-key-cases.ts','src/index.ts','src/model/keys.ts','src/model/key-tuple.ts','src/model/types.ts','src/validation/document.ts','spec/core/key-operation-v2.schema.json','spec/core/key-tuple-operation.schema.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-key-public-browser.json',JSON.stringify({scope:'Current 0.10.0 key lookup, declaration, tuple and selection behavior in browser; historical transitions are preserved in metamodel-authority history',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
