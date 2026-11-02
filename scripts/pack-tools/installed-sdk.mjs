// SPDX-License-Identifier: MIT OR Apache-2.0
// Run the same source-bound request stream through the exact installed SDK in
// Node, Bun, or Chromium. Output is NDJSON suitable for compare_results.py.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const [mode,sdkArg,expectedVersion,requestsArg,outputArg]=process.argv.slice(2);
assert(['node','bun','browser'].includes(mode), 'usage: node|bun|browser installed-sdk.mjs SDK_ROOT EXPECTED_VERSION REQUESTS.ndjson OUTPUT.ndjson');
assert(sdkArg&&expectedVersion&&requestsArg&&outputArg, 'usage: node|bun|browser installed-sdk.mjs SDK_ROOT EXPECTED_VERSION REQUESTS.ndjson OUTPUT.ndjson');
const sdk=resolve(sdkArg),dist=resolve(sdk,'dist'),requestsPath=resolve(requestsArg),outputPath=resolve(outputArg);
const metadata=JSON.parse(await readFile(resolve(sdk,'package.json'),'utf8'));
assert.equal(metadata.version,expectedVersion,'Installed SDK artifact version mismatch');
assert.equal(metadata.exports?.['.']?.node,'./dist/umf-node.js','Installed package has the wrong Node export');
assert.equal(metadata.exports?.['.']?.browser,'./dist/umf-browser.js','Installed package has the wrong browser export');
const requestText=await readFile(requestsPath,'utf8');
const requests=requestText.split(/\r?\n/).filter(Boolean).map((line,index)=>{
 const request=JSON.parse(line);
 assert.equal(request.profile,'umf.pack-tools/1',`Request ${index+1} has wrong profile`);
 assert.equal(typeof request.pack?.text,'string',`Request ${index+1} lacks exact pack source text`);
 assert(Array.isArray(request.sources),`Request ${index+1} lacks declared source closure`);
 return request;
});
assert.equal(requests.length,28,`Expected 28 exact catalog requests; found ${requests.length}`);
function verifyResult(result,request,index){
 assert.equal(result?.profile,'umf.pack-tools-result/1',`Result ${index+1} has wrong profile`);
 assert.equal(result.pack?.id,request.pack.id,`Result ${index+1} pack ID differs`);
 assert.equal(result.pack?.version,request.pack.version,`Result ${index+1} pack version differs`);
 assert.match(result.sourceDigest,/^[a-f0-9]{64}$/,`Result ${index+1} lacks source digest`);
 assert(Array.isArray(result.files)&&Array.isArray(result.coverage)&&Array.isArray(result.diagnostics),`Result ${index+1} is incomplete`);
}
let results=[];
if(mode!=='browser'){
 const entry=createRequire(resolve(sdk,'package.json')).resolve('@umf/core');
 assert.equal(entry,resolve(dist,'umf-node.js'),'Installed package did not resolve to its Node public entry');
 const api=await import(pathToFileURL(entry).href);
 assert.equal(typeof api.generatePackTools,'function','Installed Node SDK does not export generatePackTools');
 results=requests.map((request,index)=>{
  const result=api.generatePackTools(request);verifyResult(result,request,index);return result;
 });
}else{
 await Promise.all(['umf-browser.js','umf_core_wasm_bg.wasm'].map(name=>stat(resolve(dist,name))));
 const require=createRequire(resolve(process.cwd(),'package.json'));
 const {chromium}=require('playwright');
 const external=[];const errors=[];
 const entrySource=`import * as api from '/sdk/umf-browser.js';\ntry {\n const response=await fetch('/requests.ndjson'); if(!response.ok) throw Error('request stream unavailable');\n const requests=(await response.text()).split(/\\r?\\n/).filter(Boolean).map(JSON.parse);\n const results=requests.map(request=>api.generatePackTools(request));\n window.__packTools={status:'passed',results};\n} catch(error) { window.__packTools={status:'failed',error:String(error)}; }`;
 const csp="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'";
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/','http://127.0.0.1').pathname;
  res.setHeader('Content-Security-Policy',csp);
  if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Pack Tools SDK consumer</title><script type="module" src="/entry.js"></script>');return;}
  if(path==='/entry.js'){res.setHeader('content-type','text/javascript');res.end(entrySource);return;}
  if(path==='/requests.ndjson'){res.setHeader('content-type','application/x-ndjson');res.end(requestText);return;}
  if(path.startsWith('/sdk/')){
   const file=resolve(dist,decodeURIComponent(path.slice('/sdk/'.length)));
   if(file===dist||!file.startsWith(dist+sep)){res.writeHead(404).end();return;}
   try{const bytes=await readFile(file);res.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript');res.end(bytes);return;}catch{}
  }
  res.writeHead(404).end();
 });
 await new Promise(done=>server.listen({host:'127.0.0.1',port:0},done));
 let browser;
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(String(error)));
  const origin=`http://127.0.0.1:${address.port}`;
  await page.route('**/*',route=>{if(!route.request().url().startsWith(origin)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin,{timeout:120000});
  await page.waitForFunction(()=>window.__packTools?.status==='passed'||window.__packTools?.status==='failed',undefined,{timeout:120000});
  const report=await page.evaluate(()=>window.__packTools);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.equal(report.status,'passed',report.error);
  results=report.results;
  assert.equal(results.length,28,'Browser SDK did not return all catalog results');
  for(let index=0;index<results.length;index++)verifyResult(results[index],requests[index],index);
 }finally{await browser?.close();await new Promise(done=>server.close(()=>done()));}
}
await mkdir(dirname(outputPath),{recursive:true});
await writeFile(outputPath,results.map(result=>JSON.stringify(result)).join('\n')+'\n');
console.log(JSON.stringify({status:'passed',runtime:mode,version:metadata.version,packs:results.length,requestSha256:(await import('node:crypto')).createHash('sha256').update(requestText).digest('hex'),resultPath:outputPath}));
