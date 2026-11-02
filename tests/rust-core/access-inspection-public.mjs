// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Node addon or Chromium/WASM replay of the same TS inspection vectors.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {replayAccessInspection,inspectAccessControls} from './access-inspection-replay.js';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json',tablesPackage:'spec/extensions/tables/package.json',actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json'};
const resources=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([name,path])=>[name,JSON.parse(await readFile(resolve(root,path),'utf8'))])));
const bytes=await readFile(resolve(root,'tests/rust-core/fixtures/access-inspection/cases.json'));
const {cases}=JSON.parse(bytes);
const hash=data=>createHash('sha256').update(data).digest('hex');
if(process.argv[2]!=='browser') {
 const {createCodegenEngine,createRetainedCodegenEngine}=await import('../../bindings/core/node/index.js');
 const reports=[];
 for(const create of [createCodegenEngine,createRetainedCodegenEngine]) {
  const engine=create(resources);
  try{reports.push({engine:create.name,...replayAccessInspection(engine,cases),...inspectAccessControls(create,resources,cases[0].request)});}finally{engine.dispose?.();}
 }
 console.log(JSON.stringify({runtime:process.versions,packetSha256:hash(bytes),reports}));
} else {
 const {chromium}=await import('playwright');
 const packageRoot=resolve(process.argv[3]??resolve(root,'bindings/core/wasm/pkg'));
 const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
  if(pathname==='/'){response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>Access inspection parity</title>');return;}
  const base=pathname.startsWith('/wasm-pkg/')?packageRoot:root;
  const file=resolve(base,pathname.startsWith('/wasm-pkg/')?pathname.slice(10):pathname.slice(1));
  if(!file.startsWith(base+sep)){response.writeHead(403);response.end();return;}
  try{const data=await readFile(file);response.writeHead(200,{'content-type':file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript'});response.end(data);}catch{response.writeHead(404);response.end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();const errors=[],external=[];
  const origin=`http://127.0.0.1:${server.address().port}`;
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>{if(!request.url().startsWith(origin+'/'))external.push(request.url());});
  await page.goto(origin+'/');
  const reports=await page.evaluate(async({resources,cases})=>{
   const wasm=await import('/wasm-pkg/umf_core_wasm.js');await wasm.default();
   const {createCodegenEngine,createRetainedCodegenEngine}=await import('/bindings/core/wasm/index.js');
   const {replayAccessInspection,inspectAccessControls}=await import('/tests/rust-core/access-inspection-replay.js');
   const reports=[];
   for(const create of [createCodegenEngine,createRetainedCodegenEngine]) {
    const factory=(r,o)=>create(wasm,r,o),engine=factory(resources);
    try{reports.push({engine:create.name,...replayAccessInspection(engine,cases),...inspectAccessControls(factory,resources,cases[0].request)});}finally{engine.dispose?.();}
   }
   return {reports,nodeGlobals:{process:typeof process,Buffer:typeof Buffer,require:typeof require}};
  },{resources,cases});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.deepEqual(reports.nodeGlobals,{process:'undefined',Buffer:'undefined',require:'undefined'});
  console.log(JSON.stringify({runtime:'Chromium '+browser.version(),packetSha256:hash(bytes),wasmSha256:hash(await readFile(resolve(packageRoot,'umf_core_wasm_bg.wasm'))),externalRequests:external.length,...reports}));
 } finally {await browser?.close();await new Promise(done=>server.close(done));}
}
