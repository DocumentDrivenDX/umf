// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser companion for the installed host-shape comparison.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile, rm, mkdir} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const archive=resolve(process.argv[2]??'');
const expectedArchiveSha=process.argv[3];
const expectedClosureSha=process.argv[4];
if(!archive||!expectedArchiveSha||!expectedClosureSha)throw new Error('Usage: bun host-shapes-current-source-browser.mjs <umf-sdk.tgz> <archive-sha256> <source-closure-sha256>');
const repo=resolve('');
const frozenPath=join(repo,'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=join(tmpdir(),`umf-r8-inspector-browser-host-shapes-${process.pid}-${Date.now()}`);
const packageRoot=join(temp,'node_modules/@umf/core');
const operations={scalarType:'inspectCoreScalarType',recordMembers:'inspectCoreRecordMembers',referenceLinks:'inspectCoreReferenceLinks'};
const shapes={
 accessor_source:{code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/probe'},
 accessor_identity:{code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/module'},
 hidden_source:{code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/probe'},
 symbol_source:{code:'NON_JSON',message:'Symbol keys are not JSON-compatible',path:''},
};
const forgedError={name:'AdmissionError',code:'ACCESSOR_PROPERTY',path:'/source/probe',message:'caller-controlled proxy failure'};
const probe=`
import * as root from '@umf/core';
import * as reference from '@umf/core/reference';
const frozen=await(await fetch('/frozen.json')).json();
const operations=${JSON.stringify(operations)},shapes=${JSON.stringify(shapes)},forgedError=${JSON.stringify(forgedError)};
const rows={};
for(const [packetName,operation] of Object.entries(operations)){
 const packet=frozen.packets[packetName].packet;
 const base=packet.cases.known_uuid??packet.cases.known;
 rows[packetName]={};
 for(const [shape,expected] of Object.entries(shapes)){
  const observations={};
  for(const [route,api] of [['default',root],['reference',reference]]){
   const events=[],source=structuredClone(base.source),identity=structuredClone(base.identity);
   if(shape==='accessor_source')Object.defineProperty(source,'probe',{enumerable:true,configurable:true,get(){events.push('source.get:probe');return 1}});
   else if(shape==='accessor_identity')Object.defineProperty(identity,'module',{enumerable:true,configurable:true,get(){events.push('identity.get:module');return base.identity.module}});
   else if(shape==='hidden_source')Object.defineProperty(source,'probe',{enumerable:false,configurable:true,value:1});
   else source[Symbol('probe')]=1;
   let observed;
   try{api[operation](source,identity);observed={ok:true};}
   catch(error){observed={ok:false,error:{name:error.name,code:error.code??null,message:error.message??String(error),path:error.path??''}};}
   const wanted={ok:false,error:{name:'UmfError',...expected},events:[]};
   const actual={...observed,events};
   if(JSON.stringify(actual)!==JSON.stringify(wanted))throw new Error(operation+' '+shape+' '+route+': '+JSON.stringify(actual));
   observations[route]=actual;
  }
  rows[packetName][shape]=observations;
 }
  const forged={};
  for(const [route,api] of [['default',root],['reference',reference]]){
   const events=[],source=new Proxy(structuredClone(base.source),{getPrototypeOf(){events.push('source.getPrototypeOf');throw Object.assign(new Error(forgedError.message),{name:forgedError.name,code:forgedError.code,path:forgedError.path})}});
   let observed;
   try{api[operation](source,structuredClone(base.identity));observed={ok:true};}
   catch(error){observed={ok:false,error:{name:error.name,code:error.code??null,message:error.message??String(error),path:error.path??''}};}
   if(JSON.stringify(events)!==JSON.stringify(['source.getPrototypeOf']))throw new Error(operation+' '+route+' forged proxy was observed more than once: '+JSON.stringify(events));
   rows[packetName].forged_proxy_source??={};
   rows[packetName].forged_proxy_source[route]={...observed,events};
  }
  rows[packetName].forged_proxy_source.parity=JSON.stringify(rows[packetName].forged_proxy_source.default)===JSON.stringify(rows[packetName].forged_proxy_source.reference);
}
if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals present in browser host-shape probe');
window.hostShapeProbe={rows,operations:Object.fromEntries(Object.entries(operations).map(([key])=>[key,Object.keys(shapes).length]))};
`;
let server,browser;
try{
 const archiveBytes=await readFile(archive);
 assert.equal(sha(archiveBytes),expectedArchiveSha,'pinned archive hash');
 await mkdir(packageRoot,{recursive:true});
 const tar=Bun.spawn(['tar','-xzf',archive,'--strip-components=1','-C',packageRoot],{stdout:'pipe',stderr:'pipe'});
 const [out,err]=await Promise.all([new Response(tar.stdout).text(),new Response(tar.stderr).text()]);
 assert.equal(await tar.exited,0,`archive extraction failed\n${out}\n${err}`);
 const manifest=JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8'));
 const sdk=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 assert.equal(manifest.sourceTreeSha256,expectedClosureSha,'pinned current source closure');
 assert.equal(manifest.capturedLiveSourceTreeSha256,expectedClosureSha,'captured live source closure');
 assert.equal(sdk.sourceClosure.sha256,expectedClosureSha,'SDK source closure');
 for(const [path,digest] of Object.entries(manifest.sha256))assert.equal(sha(await readFile(join(packageRoot,path))),digest,`archive member ${path}`);
 const frozenBytes=await readFile(frozenPath);
 const imports={'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'};
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports})}</script><script type="module" src="/host-shape-probe.js"></script>`;
 const requests=[];
 server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/', 'http://127.0.0.1').pathname.slice(1)||'index.html';requests.push(path);
  if(path==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}
  if(path==='host-shape-probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(probe);return}
  if(path==='frozen.json'){res.writeHead(200,{'content-type':'application/json'});res.end(frozenBytes);return}
  try{const bytes=await readFile(join(temp,path));res.writeHead(200,{'content-type':extname(path)==='.wasm'?'application/wasm':extname(path)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}
  catch{res.writeHead(404);res.end('not found')}
 });
 await new Promise(ready=>server.listen(0,'127.0.0.1',ready));
 const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.goto(`http://127.0.0.1:${address.port}/`);
 await page.waitForFunction(()=>Boolean(window.hostShapeProbe),undefined,{timeout:60000});
 const result=await page.evaluate(()=>({version:navigator.userAgent,...window.hostShapeProbe}));
 assert.deepEqual(pageErrors,[]);
 assert(requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'),'browser package WASM loaded');
 console.log(JSON.stringify({format:'umf.r8.core-inspectors-browser-host-shapes/1',status:'observed',archive:{path:archive,sha256:sha(archiveBytes),sourceClosureSha256:expectedClosureSha,verifiedMemberCount:Object.keys(manifest.sha256).length},harnessSha256:sha(await readFile(new URL(import.meta.url))),predecessorSha256:sha(frozenBytes),runtime:{browserVersion:browser.version(),...result},qualification:'Four exact descriptor/symbol refusal envelopes and one adversarial forged-error proxy observation per inspector across browser default/reference routes for this archive. This does not establish other host shapes, inspector retirement, or release.'},null,2));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
