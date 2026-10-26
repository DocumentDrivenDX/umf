// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed default-route replay for the frozen Core Facets predecessor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const outDir=resolve(process.argv[3]??new URL('.',import.meta.url).pathname);
const expectedArchive=process.argv[4]??'591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711';
const expectedClosure=process.argv[5]??'65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d';
const cohort=process.argv[6]??'historical-pinned-archive-before-Core-Key-source-edits';
const receiptPrefix=cohort.startsWith('current')?'current':'historical';
if(!process.argv[2])throw new Error('Usage: bun replay-installed.mjs <umf-sdk.tgz> [receipt-directory] [archive-sha256] [closure-sha256] [historical|current]');
const packetDir=join(repo,'docs/helix/04-build/evidence/rust-migration/r5-core-facets');
const packets=Object.fromEntries(await Promise.all(['frozen-typescript.json','meaning-cases.json','regression-cases.json','exact-errors.json'].map(async file=>[file,JSON.parse(await readFile(join(packetDir,file),'utf8'))])));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const temp=join(tmpdir(),`umf-r8-facets-installed-${process.pid}-${Date.now()}`), packageRoot=join(temp,'node_modules/@umf/core');
const run=async(command,args,cwd=temp)=>{const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return {code:await child.exited,stdout:stdout.trim(),stderr:stderr.trim()};};
const probe=`
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';
const p=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'frozen-typescript.json'))},'utf8'));
const meaning=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'meaning-cases.json'))},'utf8'));
const regressions=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'regression-cases.json'))},'utf8'));
const errors=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'exact-errors.json'))},'utf8'));
const canon=${canonical.toString()};const cap=fn=>{try{return {ok:true,value:fn()}}catch(e){return {ok:false,error:{name:e.name,code:e.code??'',message:e.message??String(e),path:e.path??''}}}};
const operations={inspectCoreFacets:(r,s,i)=>r.inspectCoreFacets(s,i),declareCoreFacets:(r,s,i,q)=>r.declareCoreFacets(s,i,q),verifyCoreFacetDeclaration:(r,s,i)=>r.verifyCoreFacetDeclaration(s,i),historicalCoreFacetPatch:(r,s)=>r.historicalCoreFacetPatch(s)};
const invoke=(r,k,...args)=>cap(()=>operations[k](r,...args));
const expected={inspectCoreFacets:{known:p.inspection},declareCoreFacets:{base:p.receipt,unknown:p.unknownFacetDeclaration,lengthMerge:regressions.cases.lengthMerge.outcome},verifyCoreFacetDeclaration:{valid:p.receipt},historicalCoreFacetPatch:{...Object.fromEntries(regressions.cases.historical.map((x,i)=>[String(i),x.outcome]))}};
const cases={
 inspectCoreFacets:{known:[p.receipt.target,p.identity]},
 declareCoreFacets:{base:[p.source,p.identity,p.request],unknown:[p.unknownFacetDeclaration.source,p.unknownFacetDeclaration.identity,p.unknownFacetDeclaration.request],lengthMerge:[regressions.cases.lengthMerge.source,regressions.cases.lengthMerge.identity,regressions.cases.lengthMerge.request]},
 verifyCoreFacetDeclaration:{valid:[p.receipt,p.receipt.target]},
 historicalCoreFacetPatch:Object.fromEntries(regressions.cases.historical.map((x,i)=>[String(i),[x.input]]))};
const runRoute=r=>{const results={};for(const [op,variants] of Object.entries(cases)){results[op]={};for(const [name,args] of Object.entries(variants))results[op][name]=invoke(r,op,...args)}return results};
const installed=runRoute(root),ref=runRoute(reference);assert.equal(canon(installed),canon(ref),'installed default/reference parity');
for(const [op,variants] of Object.entries(expected))for(const [name,want] of Object.entries(variants)){let actual=installed[op][name];if(op==='historicalCoreFacetPatch'&&want?.error)actual={...actual,error:{...actual.error,name:want.error.name}};assert.equal(canon(actual),canon(want?.error?{ok:false,error:want.error}:{ok:true,value:want}),op+'/'+name+' frozen predecessor');}
const host={};
let getterCalls=0;const accessorIdentity={module:'m'};Object.defineProperty(accessorIdentity,'element',{enumerable:true,get(){getterCalls++;throw Error('getter')}});
host.accessorIdentity=invoke(root,'inspectCoreFacets',p.receipt.target,accessorIdentity);assert.equal(getterCalls,0);
const sourceAccessor=structuredClone(p.source);Object.defineProperty(sourceAccessor,'future',{enumerable:true,get(){getterCalls++;throw Error('getter')}});
host.sourceAccessor=invoke(root,'declareCoreFacets',sourceAccessor,p.identity,p.request);assert.equal(getterCalls,0);
let sourceReads=0;const invalidRequest={precision:3};const orderedSource=new Proxy(p.source,{getPrototypeOf(t){sourceReads++;return Reflect.getPrototypeOf(t)},ownKeys(t){sourceReads++;return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){sourceReads++;return Reflect.getOwnPropertyDescriptor(t,k)},get(t,k,r){sourceReads++;return Reflect.get(t,k,r)}});
host.requestBeforeSource=invoke(root,'declareCoreFacets',orderedSource,p.identity,invalidRequest);assert.equal(sourceReads,0);
const verifyReceipt={operation:'declare-core-facets',version:'3.0.0'};let currentReads=0;const currentProxy=new Proxy(p.source,{getPrototypeOf(t){currentReads++;return Reflect.getPrototypeOf(t)},ownKeys(t){currentReads++;return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){currentReads++;return Reflect.getOwnPropertyDescriptor(t,k)},get(t,k,r){currentReads++;return Reflect.get(t,k,r)}});
host.malformedReceiptBeforeCurrent=invoke(root,'verifyCoreFacetDeclaration',verifyReceipt,currentProxy);assert.equal(currentReads,0);
const exactErrors={};
exactErrors.invalidIdentity=invoke(root,'inspectCoreFacets',p.source,{});
const invalidSource=structuredClone(p.source);invalidSource.umf='0.9.0';exactErrors.invalidSource=invoke(root,'inspectCoreFacets',invalidSource,p.identity);
const recordRole=structuredClone(p.source);recordRole.modules[0].elements[0].kind='record';exactErrors.recordRoleSourceRefusal=invoke(root,'inspectCoreFacets',recordRole,p.identity);
const unknownUnitSource=structuredClone(p.source);unknownUnitSource.modules[0].elements[0].scalarType='string';unknownUnitSource.modules[0].elements[0].facets={length:{max:8,unit:'future-unit'}};
exactErrors.unknownUnit=invoke(root,'declareCoreFacets',unknownUnitSource,p.identity,{length:{max:4,unit:'unicode-scalar'}});
const conflictSource=structuredClone(p.source);conflictSource.modules[0].elements[0].scalarType='integer';exactErrors.targetConflict=invoke(root,'declareCoreFacets',conflictSource,p.identity,{length:{max:4,unit:'byte'}});
exactErrors.stale=invoke(root,'verifyCoreFacetDeclaration',p.receipt,p.source);
const forgedReceipt=structuredClone(p.receipt);forgedReceipt.request.integerWidth.bits=32;exactErrors.forged=invoke(root,'verifyCoreFacetDeclaration',forgedReceipt,p.receipt.target);
exactErrors.invalidRequest=invoke(root,'declareCoreFacets',p.source,p.identity,{precision:3});
exactErrors.malformedReceipt=invoke(root,'verifyCoreFacetDeclaration',verifyReceipt,p.source);
const invalidBoundSource=structuredClone(unknownUnitSource);invalidBoundSource.modules[0].elements[0].facets.length.max=-1;
exactErrors.unknownUnitWithInvalidBound=invoke(root,'declareCoreFacets',invalidBoundSource,p.identity,{length:{max:4,unit:'unicode-scalar'}});
for(const [name,result] of Object.entries(exactErrors)){const expectedError=errors.cases[name];assert.equal(result.ok,false,name+' refuses');assert.equal(result.error.name,'UmfError',name+' class');assert.deepEqual({code:result.error.code,message:result.error.message,path:result.error.path},expectedError,name+' exact error');}
host.exactErrors=exactErrors;
// Freeze host admission failures and reflection order independently for the
// installed route and its TypeScript reference predecessor. These cases stay
// at the JS boundary; they do not imply that Rust inspects arbitrary objects.
const makeAdmissionCases=()=>{
 const hidden=structuredClone(p.source);Object.defineProperty(hidden,'hidden',{value:true,enumerable:false});
 const symbol=structuredClone(p.source);symbol[Symbol('future')]=true;
 const cycle=structuredClone(p.source);cycle.extensions={};cycle.extensions.self=cycle;
 const nan=structuredClone(p.source);nan.extensions={future:NaN};
 const infinity=structuredClone(p.source);infinity.extensions={future:Infinity};
 const negativeZero=structuredClone(p.source);negativeZero.extensions={future:-0};
 return {hidden,symbol,cycle,nan,infinity,negativeZero};
};
const admissionFor=route=>Object.fromEntries(Object.entries(makeAdmissionCases()).map(([name,value])=>[name,invoke(route,'inspectCoreFacets',value,p.identity)]));
const traceFor=route=>{const events=[],target=structuredClone(p.source);const proxy=new Proxy(target,{
 getPrototypeOf(value){events.push('getPrototypeOf');return Reflect.getPrototypeOf(value)},
 ownKeys(value){events.push('ownKeys');return Reflect.ownKeys(value)},
 getOwnPropertyDescriptor(value,key){events.push('getOwnPropertyDescriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(value,key)},
 get(value,key,receiver){events.push('get:'+String(key));return Reflect.get(value,key,receiver)},
});return {outcome:invoke(route,'inspectCoreFacets',proxy,p.identity),events};};
const thrownProxyFor=route=>{const events=[],fieldReads=[],errorTarget=new Error('caller proxy trap failure'),sentinel=new Proxy(errorTarget,{get(target,key,receiver){fieldReads.push(String(key));return Reflect.get(target,key,receiver)}}),target=structuredClone(p.source);const proxy=new Proxy(target,{
 getPrototypeOf(value){events.push('getPrototypeOf');return Reflect.getPrototypeOf(value)},
 ownKeys(){events.push('ownKeys:throw');throw sentinel},
 getOwnPropertyDescriptor(value,key){events.push('getOwnPropertyDescriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(value,key)},
 get(value,key,receiver){events.push('get:'+String(key));return Reflect.get(value,key,receiver)},
});let caught;try{route.inspectCoreFacets(proxy,p.identity)}catch(error){caught=error}return {sameThrownIdentity:caught===sentinel,thrownErrorFieldReads:fieldReads,events,trapCount:events.length};};
host.admissionInstalled=admissionFor(root);host.admissionReference=admissionFor(reference);
host.proxyInstalled=traceFor(root);host.proxyReference=traceFor(reference);
host.proxyThrowInstalled=thrownProxyFor(root);host.proxyThrowReference=thrownProxyFor(reference);
assert.equal(canon(host.admissionInstalled),canon(host.admissionReference),'installed/reference admission envelope parity');
assert.equal(canon(host.proxyInstalled),canon(host.proxyReference),'installed/reference proxy observation parity');
assert.equal(host.proxyThrowInstalled.sameThrownIdentity,true,'installed route preserves object thrown by caller proxy trap');
assert.equal(host.proxyThrowReference.sameThrownIdentity,true,'reference route preserves object thrown by caller proxy trap');
assert.deepEqual(host.proxyThrowInstalled.events,host.proxyThrowReference.events,'installed/reference thrown-proxy trap order');
assert.equal(host.proxyThrowInstalled.trapCount,host.proxyThrowReference.trapCount,'installed/reference thrown-proxy trap count');
assert.deepEqual(host.proxyThrowInstalled.thrownErrorFieldReads,[],'installed route does not inspect caller-thrown error');
assert.deepEqual(host.proxyThrowReference.thrownErrorFieldReads,[],'reference route does not inspect caller-thrown error');
host.admissionCodes=Object.fromEntries(Object.entries(host.admissionInstalled).map(([name,result])=>[name,result.error?.code??'success']));
host.proxyTrapCount=host.proxyInstalled.events.length;
const unknown=invoke(root,'inspectCoreFacets',regressions.cases.loneSurrogateQualifier.source,regressions.cases.loneSurrogateQualifier.identity);host.unknownNestedQualifier=unknown;
const copySource=structuredClone(p.receipt.target);const copyResult=root.inspectCoreFacets(copySource,p.identity);copyResult.source.modules[0].elements[0].facets.integerWidth.bits=8;host.inspectionDetached=copySource.modules[0].elements[0].facets.integerWidth.bits===16;
const declarationSource=structuredClone(p.source);const declaration=root.declareCoreFacets(declarationSource,p.identity,p.request);declaration.target.modules[0].elements[0].facets.integerWidth.bits=8;host.declarationDetached=!Object.hasOwn(declarationSource.modules[0].elements[0],'facets')&&!Object.hasOwn(declaration.source.modules[0].elements[0],'facets');
assert.deepEqual([host.inspectionDetached,host.declarationDetached],[true,true]);assert.equal(host.accessorIdentity.error.code,'NON_JSON');assert.equal(host.sourceAccessor.error.code,'NON_JSON');assert.equal(host.requestBeforeSource.error.code,'CORE_FACET_REQUEST');assert.equal(host.malformedReceiptBeforeCurrent.error.code,'CORE_FACET_RECEIPT');
assert.equal(typeof root.inspectCoreFacets,'function');assert.equal(typeof root.historicalCoreFacetPatch,'function');
console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,results:installed,host,getterCalls,sourceReads,currentReads,controls:'The installed public operations expose no maxWork/cancellation parameter; cooperative RESOURCE_LIMIT control is covered only by the R5 opt-in binding evidence.'}));
`;
let browser,server;
try{
 await mkdir(packageRoot,{recursive:true});const extraction=await run('tar',['-xzf',archive,'--strip-components=1','-C',packageRoot]);assert.equal(extraction.code,0,extraction.stderr);
 const archiveBytes=await readFile(archive);assert.equal(sha(archiveBytes),expectedArchive,'pinned archive digest');
 const outer=JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8')),sdk=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 const manifestBytes=await readFile(join(packageRoot,'manifest.json'));
 assert.equal(outer.profile,'umf.sdk.distribution.rust-default/1');assert.equal(outer.sourceTransformStatus,'fixed-point');assert.equal(outer.sourceTransformCount,0);
 assert.equal(outer.sourceTreeSha256,expectedClosure);assert.equal(outer.capturedLiveSourceTreeSha256,expectedClosure);assert.equal(sdk.sourceClosure.sha256,expectedClosure);assert.equal(sdk.sourceClosure.capturedLiveSha256,expectedClosure);assert.equal(sdk.sourceClosure.transform.status,'fixed-point');assert.equal(sdk.sourceClosure.transform.generatedInputs.length,0);
 const requiredHelperInputs=['bindings/core/node/src/json-schema-import-source.js','bindings/core/wasm/src/json-schema-import-source.js'];
 for(const path of requiredHelperInputs)assert.equal(typeof sdk.sourceClosure.liveInputs[path],'string',`source closure includes packaged helper input ${path}`);
 const routeArtifacts=['package.json','dist/rust-default-manifest.json','dist/umf-node.js','dist/umf-browser.js','dist/umf.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm'];
 for(const path of routeArtifacts)assert.equal(typeof outer.sha256[path],'string',`archive contains packaged route artifact ${path}`);
 for(const [path,digest] of Object.entries(sdk.sourceClosure.liveInputs))assert.equal(sha(await readFile(join(repo,path))),digest,`captured live source input ${path}`);
 for(const [file,digest] of Object.entries(outer.sha256))assert.equal(sha(await readFile(join(packageRoot,file))),digest,`archive member ${file}`);
 const pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 await writeFile(join(temp,'facet-probe.mjs'),probe);const results={};for(const rt of ['node','bun']){process.stderr.write(`starting ${rt} replay\n`);const result=await run(rt,['facet-probe.mjs']);assert.equal(result.code,0,`${rt}: ${result.stderr}`);results[rt]=JSON.parse(result.stdout);process.stderr.write(`finished ${rt} replay\n`);}
 assert.equal(canonical(results.node.results),canonical(results.bun.results));assert.equal(canonical(results.node.host),canonical(results.bun.host));
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/probe.js"></script>`;
 const source=probe.replace("import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';", "const assert={equal(a,b,m){if(a!==b)throw Error(m)},deepEqual(a,b,m){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m)}};import * as root from '@umf/core';import * as reference from '@umf/core/reference';")
  .replace(`const p=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'frozen-typescript.json'))},'utf8'));`,"const p=await(await fetch('/p.json')).json();")
  .replace(`const meaning=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'meaning-cases.json'))},'utf8'));`,"const meaning=await(await fetch('/meaning.json')).json();")
  .replace(`const regressions=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'regression-cases.json'))},'utf8'));`,"const regressions=await(await fetch('/regressions.json')).json();")
  .replace(`const errors=JSON.parse(await readFile(${JSON.stringify(join(packetDir,'exact-errors.json'))},'utf8'));`,"const errors=await(await fetch('/errors.json')).json();")
  .replace("console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,results:installed,host,getterCalls,sourceReads,currentReads,controls:'The installed public operations expose no maxWork/cancellation parameter; cooperative RESOURCE_LIMIT control is covered only by the R5 opt-in binding evidence.'}));","if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals present');window.facetResult={results:installed,host,getterCalls,sourceReads,currentReads,nodeGlobalsAbsent:true};");
 server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/') {res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}if(path==='/probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(source);return;}const name={'/p.json':'frozen-typescript.json','/meaning.json':'meaning-cases.json','/regressions.json':'regression-cases.json','/errors.json':'exact-errors.json'}[path];if(name){res.writeHead(200,{'content-type':'application/json'});res.end(await readFile(join(packetDir,name)));return;}try{const relative=path.replace(/^\/node_modules\/@umf\/core\//,'');const bytes=await readFile(join(packageRoot,relative));res.writeHead(200,{'content-type':extname(path)==='.wasm'?'application/wasm':extname(path)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end('not found');}});
 process.stderr.write('starting Chromium replay\n');await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));browser=await chromium.launch({headless:true});const page=await browser.newPage();const pageErrors=[],consoleErrors=[],browserRequests=[];page.on('pageerror',e=>pageErrors.push(String(e)));page.on('request',r=>browserRequests.push(r.url()));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});const addr=server.address();await page.goto(`http://127.0.0.1:${addr.port}/`);try{await page.waitForFunction(()=>Boolean(window.facetResult),undefined,{timeout:120000});}catch(error){throw new Error(`${error.message}; pageErrors=${JSON.stringify(pageErrors)}; consoleErrors=${JSON.stringify(consoleErrors)}`)}const browserResult=await page.evaluate(()=>({result:window.facetResult,ua:navigator.userAgent}));assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);const externalRequests=browserRequests.filter(url=>!url.startsWith(`http://127.0.0.1:${addr.port}/`));assert.deepEqual(externalRequests,[],'Chromium made an external request');process.stderr.write('finished Chromium replay\n');
 const receipt={format:'umf.r8.core-facets-installed/1',status:'pass',cohort,archive:{path:archive,sha256:sha(archiveBytes),bytes:archiveBytes.byteLength,manifestSha256:sha(manifestBytes),closureSha256:sdk.sourceClosure.sha256,fileCount:sdk.sourceClosure.fileCount,verifiedMembers:Object.keys(outer.sha256).length,sourceTransformStatus:outer.sourceTransformStatus,sourceTransformCount:outer.sourceTransformCount,routeArtifactSha256:Object.fromEntries(routeArtifacts.map(path=>[path,outer.sha256[path]])),requiredHelperSourceInputs:requiredHelperInputs},sourceClosure:{expectedSha256:expectedClosure,sha256:sdk.sourceClosure.sha256,capturedLiveSha256:sdk.sourceClosure.capturedLiveSha256,fileCount:sdk.sourceClosure.fileCount,transform:sdk.sourceClosure.transform},packageRoutes:{node:pkg.exports['.'].node,browser:pkg.exports['.'].browser,reference:pkg.exports['./reference'].import},packetHashes:Object.fromEntries(await Promise.all(Object.keys(packets).map(async f=>[f,sha(await readFile(join(packetDir,f)))]))),harnessSha256:sha(await readFile(fileURLToPath(import.meta.url))),runtime:results,browser:{version:browser.version(),userAgent:browserResult.ua,...browserResult.result,requestCount:browserRequests.length,wasmNetworkRequest:browserRequests.some(url=>url.endsWith('.wasm')),externalRequests},qualification:receiptPrefix==='current'?'Source-current fixed-point private archive replay for four Core Facets operations and the recorded hosts only; does not qualify release or wider SDK.':'Historical private archive replay only; source state has moved since this fixed-point archive. Does not qualify release or wider SDK.'};
 await mkdir(outDir,{recursive:true});for(const [rt,value] of Object.entries({node:results.node,bun:results.bun,chromium:receipt.browser}))await writeFile(join(outDir,`${receiptPrefix}-${rt}-20261026.json`),JSON.stringify({...receipt,host:rt,observation:value},null,2)+'\n');
 console.log(JSON.stringify({status:'pass',cohort,archive:receipt.archive,sourceClosure:receipt.sourceClosure,caseCounts:{inspect:1,declare:3,verify:1,historical:packets['regression-cases.json'].cases.historical.length,exactErrors:10},hosts:['Node','Bun','Chromium'],browserVersion:browser.version(),receiptDir:outDir}));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
