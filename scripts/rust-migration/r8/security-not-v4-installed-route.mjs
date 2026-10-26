// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay securityNot through the packed V4 package root in Node, Bun, Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const archive=resolve(process.argv[2]??'');
const output=process.argv[3]?resolve(process.argv[3]):null;
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/security-not-v4-installed-route.mjs <umf-sdk.tgz> [receipt.json]');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=join(tmpdir(),`umf-r8-security-not-installed-${process.pid}-${Date.now()}`);
const pkgRoot=join(temp,'node_modules/@umf/core');
const run=async(command,args,cwd=temp)=>{const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);const code=await child.exited;return{code,stdout:stdout.trim(),stderr:stderr.trim()};};
function caseNames(){return ['T','F','U','null','number','boolean','unknown-string','array','object','null-prototype','accessor','proxy-ownKeys','proxy-getPrototype','proxy-get'];}
function input(name,trace){switch(name){case'T':return'T';case'F':return'F';case'U':return'U';case'null':return null;case'number':return 1;case'boolean':return true;case'unknown-string':return'X';case'array':return[];case'object':return{};case'null-prototype':return Object.create(null);case'accessor':return Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter');return'T';}});case'proxy-ownKeys':return new Proxy({}, {ownKeys(){trace.push('ownKeys');throw new Error('ownKeys trap');}});case'proxy-getPrototype':return new Proxy({}, {getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('prototype trap');}});case'proxy-get':return new Proxy({}, {get(){trace.push('get');return'T';}});default:throw new Error(`unknown case: ${name}`);}}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace};}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace};}}
function compare(reference,root){const names=caseNames();assert.equal(typeof reference.securityNot,'function','reference package export missing');assert.equal(typeof root.securityNot,'function','installed V4 package root missing');const rows=Object.fromEntries(names.map(name=>{const a=[],b=[];const expected=outcome(reference.securityNot,input(name,a),a);const actual=outcome(root.securityNot,input(name,b),b);assert.deepEqual(actual,expected,`installed package securityNot mismatch: ${name}`);return[name,{reference:expected,root:actual}];}));return rows;}
const fail=(r,label)=>assert.equal(r.code,0,`${label} failed (${r.code})\n${r.stdout}\n${r.stderr}`);
await mkdir(pkgRoot,{recursive:true});
try{
 const extract=await run('tar',['-xzf',archive,'--strip-components=1','-C',pkgRoot]);fail(extract,'archive extraction');
 const pkg=JSON.parse(await readFile(join(pkgRoot,'package.json'),'utf8'));
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');
 assert.equal(pkg.exports['.'].import,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 const manifest=JSON.parse(await readFile(join(pkgRoot,'manifest.json'),'utf8'));
 for(const [name,digest] of Object.entries(manifest.sha256))assert.equal(sha(await readFile(join(pkgRoot,name))),digest,`archive digest ${name}`);
 const probe=`import assert from 'node:assert/strict';import * as root from '@umf/core';import * as reference from '@umf/core/reference';${caseNames.toString()};${input.toString()};${outcome.toString()};${compare.toString()};const cases=compare(reference,root);console.log(JSON.stringify({runtime:typeof Bun==='undefined'?process.version:'Bun '+Bun.version,cases:Object.keys(cases).length,root:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference')}));`;
 await writeFile(join(temp,'installed-probe.mjs'),probe);
 const node=await run('node',['installed-probe.mjs']);fail(node,'installed Node route');
 const bun=await run('bun',['installed-probe.mjs']);fail(bun,'installed Bun route');
 const browserProbe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';const assert={equal(actual,expected,message){if(actual!==expected)throw new Error(message??'browser assertion failed: values are not equal')},deepEqual(actual,expected,message){if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(message??'browser assertion failed: structures differ')}};${caseNames.toString()};${input.toString()};${outcome.toString()};${compare.toString()};window.securityProbe={cases:Object.keys(compare(reference,root)).length};`;
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/browser-probe.js"></script>`;
 const requests=[],badResponses=[],pageErrors=[],pageConsole=[],failedRequests=[],badHttpResponses=[];
 const server=createServer(async(req,res)=>{const path=new URL(req.url??'/','http://127.0.0.1').pathname;const rel=path==='/'?'index.html':path.slice(1);requests.push(rel);if(rel==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(rel==='browser-probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return}try{const bytes=await readFile(join(temp,rel));res.writeHead(200,{'content-type':extname(rel)==='.wasm'?'application/wasm':extname(rel)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{badResponses.push(rel);res.writeHead(404);res.end('not found')}});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');
 let browser;
 try{browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(String(error)));page.on('console',message=>{if(message.type()==='error')pageConsole.push(message.text())});page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText??null}));page.on('response',response=>{if(response.status()>=400)badHttpResponses.push({url:response.url(),status:response.status()})});await page.goto(`http://127.0.0.1:${address.port}/`);try{await page.waitForFunction(()=>Boolean(window.securityProbe),undefined,{timeout:60000})}catch(error){const diagnostics={format:'umf-r8-security-not-v4-installed-route-debug/1',error:String(error),pageErrors,pageConsole,failedRequests,badHttpResponses,serverRequests:requests,serverMisses:badResponses,browserVersion:browser.version()};const debugPath=join(tmpdir(),'umf-r8-security-not-v4-installed-debug.json');await writeFile(debugPath,JSON.stringify(diagnostics,null,2)+'\n');throw new Error(`Installed package browser probe timed out; diagnostics at ${debugPath}\n${JSON.stringify(diagnostics,null,2)}`)}const actual=await page.evaluate(()=>({probe:window.securityProbe,userAgent:navigator.userAgent,hasNodeGlobals:typeof process!=='undefined'||typeof Buffer!=='undefined'}));assert.deepEqual(pageErrors,[]);assert.equal(actual.probe.cases,14);assert.equal(actual.hasNodeGlobals,false);assert(requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'),'installed browser root did not load the archive WASM asset');
  const receipt={format:'umf-r8-security-not-v4-installed-route/1',status:'pass',archive:{path:archive,sha256:sha(await readFile(archive)),bytes:(await readFile(archive)).byteLength,manifestSha256:sha(await readFile(join(pkgRoot,'manifest.json')))},packageRoutes:{node:pkg.exports['.'].node,browser:pkg.exports['.'].browser,import:pkg.exports['.'].import,reference:pkg.exports['./reference'].import},node:{stdout:node.stdout},bun:{stdout:bun.stdout},chromium:{version:browser.version(),userAgent:actual.userAgent,cases:14,nodeGlobalsAbsent:true,wasmRequested:true},qualification:'Private installed archive root-only securityNot parity; TypeScript reference root remains unchanged. No publication or full security migration qualification.'};
  if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt,null,2));
 }finally{await browser?.close();await new Promise(done=>server.close(done));}
}finally{await rm(temp,{recursive:true,force:true});}
