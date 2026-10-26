// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-current installed-package replay for verifyCoreKeyOperation.
// Requires an explicit expected closure hash so a historical archive cannot qualify.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const expectedClosure=process.argv[3]??'';
const output=process.argv[4]?resolve(process.argv[4]):null;
if(!process.argv[2]||!expectedClosure)throw new Error('Usage: bun scripts/rust-migration/r8/core-key-verification-current-installed.mjs <new-umf-sdk.tgz> <expected-source-closure-sha256> [receipt.json]');
const frozenPath=join(repo,'docs/helix/04-build/evidence/rust-migration/r8-core-keys-default-boundary/refreshed-predecessor-20261025.json');
const frozenBytes=await readFile(frozenPath),frozen=JSON.parse(frozenBytes);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const temp=join(tmpdir(),'umf-r8-core-key-verification-installed-'+process.pid+'-'+Date.now());
const packageRoot=join(temp,'node_modules/@umf/core');
const run=async(command,args,cwd=temp)=>{const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return {code:await child.exited,stdout:stdout.trim(),stderr:stderr.trim()};};
const assertPass=(result,label)=>assert.equal(result.code,0,`${label} failed (${result.code})\n${result.stdout}\n${result.stderr}`);
const probeFactory=(frozenPath)=>`
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import * as root from '@umf/core';import * as reference from '@umf/core/reference';
const packet=JSON.parse(await readFile(${JSON.stringify(frozenPath)},'utf8'));
const canonical=${canonical.toString()};
const outcome=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{name:error?.name??typeof error,code:typeof error?.code==='string'?error.code:'',message:typeof error?.message==='string'?error.message:String(error),path:typeof error?.path==='string'?error.path:''}}}};
const hostRun=route=>{
 const receipt=structuredClone(packet.fixtures.receipt);const current=structuredClone(receipt.target);
 const actual={success:outcome(()=>route.verifyCoreKeyOperation(receipt,current))};
 const malformed={};let currentReads=0;const guardedCurrent=new Proxy({}, {ownKeys(){currentReads++;throw new Error('current touched')}});
 actual.malformedReceiptBeforeCurrent=outcome(()=>route.verifyCoreKeyOperation({version:'bad'},guardedCurrent));malformed.getterCalls=currentReads;
 currentReads=0;actual.primitiveReceiptBeforeCurrent=outcome(()=>route.verifyCoreKeyOperation(7,guardedCurrent));malformed.primitiveGetterCalls=currentReads;
 currentReads=0;actual.nullReceiptBeforeCurrent=outcome(()=>route.verifyCoreKeyOperation(null,guardedCurrent));malformed.nullGetterCalls=currentReads;
 let receiptReads=0;const receiptAccessor=Object.defineProperty({},'version',{enumerable:true,get(){receiptReads++;throw new Error('receipt getter')}});
 actual.receiptAccessor=outcome(()=>route.verifyCoreKeyOperation(receiptAccessor,current));malformed.receiptGetterCalls=receiptReads;
 let currentDescriptorReads=0;const currentTrap=new Proxy({}, {ownKeys(){currentDescriptorReads++;throw new Error('current descriptor sentinel')}});
 actual.currentAdmissionError=outcome(()=>route.verifyCoreKeyOperation(receipt,currentTrap));malformed.currentTrapReads=currentDescriptorReads;
 const next=outcome(()=>route.verifyCoreKeyOperation(receipt,current));
 actual.successAfterFailedCurrent=next;actual.noStagingMethods={prepare:typeof route.prepareCoreKeyVerification,finish:typeof route.finishCoreKeyVerification,discard:typeof route.discardCoreKeyVerification};
 const copied=structuredClone(receipt);const verified=route.verifyCoreKeyOperation(copied,structuredClone(current));copied.request.name='mutated after call';actual.copiedCarrier={returnedValue:verified,callerMutation:copied.request.name};
 return {actual,malformed};
};
assert.equal(typeof root.verifyCoreKeyOperation,'function');assert.equal(typeof reference.verifyCoreKeyOperation,'function');
const installed=hostRun(root),baseline=hostRun(reference);
const mismatches=Object.keys(installed.actual).filter(key=>canonical(installed.actual[key])!==canonical(baseline.actual[key]));
if(mismatches.length)throw new Error('installed/reference differing cases: '+mismatches.map(key=>key+': root='+JSON.stringify(installed.actual[key]?.error??{ok:installed.actual[key]?.ok,keys:installed.actual[key]?.value&&Object.keys(installed.actual[key].value),name:installed.actual[key]?.value&&Object.getPrototypeOf(installed.actual[key].value)?.constructor?.name})+' reference='+JSON.stringify(baseline.actual[key]?.error??{ok:baseline.actual[key]?.ok,keys:baseline.actual[key]?.value&&Object.keys(baseline.actual[key].value),name:baseline.actual[key]?.value&&Object.getPrototypeOf(baseline.actual[key].value)?.constructor?.name})).join(' | '));
assert.equal(canonical(installed.actual.success),canonical(packet.outcomes.verifyKey),'frozen successful predecessor outcome');
assert.equal(canonical(installed.actual.malformedReceiptBeforeCurrent),canonical(packet.outcomes.host.malformedReceiptBeforeCurrent),'frozen malformed-receipt outcome');
assert.equal(canonical(installed.actual.primitiveReceiptBeforeCurrent),canonical(packet.outcomes.host.primitiveReceiptBeforeCurrent),'frozen primitive-receipt outcome');
if(typeof Bun!=='undefined')assert.equal(canonical(installed.actual.nullReceiptBeforeCurrent),canonical(packet.outcomes.host.nullReceiptBeforeCurrent),'same-host frozen null-receipt outcome');
assert.equal(installed.malformed.getterCalls,0,'malformed receipt must not inspect current');
assert.equal(installed.malformed.primitiveGetterCalls,0,'primitive receipt must not inspect current');
assert.equal(installed.malformed.nullGetterCalls,0,'null receipt must not inspect current');
assert.equal(installed.malformed.receiptGetterCalls,0,'receipt accessor must not run');
assert.equal(installed.malformed.currentTrapReads,1,'current admission sentinel reached only after valid receipt');
assert.equal(canonical(installed.actual.successAfterFailedCurrent),canonical(installed.actual.success),'failed current admission leaves no observable stale stage');
assert.deepEqual(installed.actual.noStagingMethods,{prepare:'undefined',finish:'undefined',discard:'undefined'},'staging hooks remain outside package root');
assert.equal(installed.actual.copiedCarrier.callerMutation,'mutated after call');
assert.equal(installed.actual.copiedCarrier.returnedValue.request.name,packet.fixtures.receipt.request.name,'returned receipt is detached from caller carrier');
console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,route:'verifyCoreKeyOperation',frozenSuccess:true,malformedReceiptBeforeCurrent:true,receiptAccessorNotInvoked:true,currentAdmissionErrorCleanupObserved:true,copyIsolation:true,stagingHooks:'not exported'}));
`;
let server,browser;
try{
 await mkdir(packageRoot,{recursive:true});
 const extract=await run('tar',['-xzf',archive,'--strip-components=1','-C',packageRoot]);assertPass(extract,'archive extraction');
 const archiveBytes=await readFile(archive),manifestBytes=await readFile(join(packageRoot,'manifest.json'));
 const archiveManifest=JSON.parse(manifestBytes),sdkManifest=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 const pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 assert.equal(archiveManifest.profile,'umf.sdk.distribution.rust-default/1');
 assert.equal(archiveManifest.sourceTransformStatus,'fixed-point');
 assert.equal(archiveManifest.sourceTreeSha256,expectedClosure,'explicit new source-closure pin');
 assert.equal(archiveManifest.sourceTreeSha256,sdkManifest.sourceClosure.sha256);
 assert.equal(archiveManifest.capturedLiveSourceTreeSha256,sdkManifest.sourceClosure.capturedLiveSha256);
 assert.equal(archiveManifest.sourceTreeSha256,archiveManifest.capturedLiveSourceTreeSha256,'fixed-point captured-live closure');
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['.'].import,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 const memberHashes={};for(const [name,digest] of Object.entries(archiveManifest.sha256)){const actual=sha256(await readFile(join(packageRoot,name)));assert.equal(actual,digest,`archive member digest: ${name}`);memberHashes[name]=actual;}
 assert.equal(sha256(frozenBytes),'503d47318c8bb5f31bca1839393e3ff14e88599abb14d5d7b7354276e70b4e74','current predecessor packet pin');
 await writeFile(join(temp,'verify-probe.mjs'),probeFactory(frozenPath));
 const node=await run('node',['verify-probe.mjs']);assertPass(node,'installed Node replay');
 const bun=await run('bun',['verify-probe.mjs']);assertPass(bun,'installed Bun replay');
 const browserProbe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';const packet=await(await fetch('/predecessor.json')).json();const canonical=${canonical.toString()};const outcome=fn=>{try{return {ok:true,value:fn()}}catch(error){return {ok:false,error:{name:error?.name??typeof error,code:typeof error?.code==='string'?error.code:'',message:typeof error?.message==='string'?error.message:String(error),path:typeof error?.path==='string'?error.path:''}}}};const run=route=>{const receipt=structuredClone(packet.fixtures.receipt),current=structuredClone(receipt.target);const malformed={};let currentReads=0;const guarded=new Proxy({}, {ownKeys(){currentReads++;throw Error('current touched')}});const out={success:outcome(()=>route.verifyCoreKeyOperation(receipt,current)),malformed:outcome(()=>route.verifyCoreKeyOperation({version:'bad'},guarded))};malformed.currentReads=currentReads;currentReads=0;out.nullReceipt=outcome(()=>route.verifyCoreKeyOperation(null,guarded));malformed.nullCurrentReads=currentReads;let receiptReads=0;const accessor=Object.defineProperty({},'version',{enumerable:true,get(){receiptReads++;throw Error('getter')}});out.receiptAccessor=outcome(()=>route.verifyCoreKeyOperation(accessor,current));malformed.receiptReads=receiptReads;let touched=0;const badCurrent=new Proxy({}, {ownKeys(){touched++;throw Error('sentinel')}});out.currentFailure=outcome(()=>route.verifyCoreKeyOperation(receipt,badCurrent));malformed.currentTrapReads=touched;out.afterFailure=outcome(()=>route.verifyCoreKeyOperation(receipt,current));out.noStageExports={prepare:typeof route.prepareCoreKeyVerification,finish:typeof route.finishCoreKeyVerification};return {out,malformed}};const installed=run(root),baseline=run(reference);if(canonical(installed)!==canonical(baseline))throw Error('installed/reference browser parity');if(canonical(installed.out.success)!==canonical(packet.outcomes.verifyKey))throw Error('frozen verifier success mismatch');if(installed.malformed.currentReads!==0||installed.malformed.nullCurrentReads!==0||installed.malformed.receiptReads!==0||installed.malformed.currentTrapReads!==1)throw Error('admission order/control mismatch');if(canonical(installed.out.afterFailure)!==canonical(installed.out.success))throw Error('failed current admission cleanup mismatch');if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals present');window.verifyProbe={status:'pass',malformed:installed.malformed,wasm:typeof root.verifyCoreKeyOperation};`;
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/verify-probe.js"></script>`;
 const requests=[],pageErrors=[];server=createServer(async(req,res)=>{const path=new URL(req.url??'/','http://127.0.0.1').pathname;const relative=path==='/'?'index.html':path.slice(1);requests.push(relative);if(relative==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(relative==='verify-probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return}if(relative==='predecessor.json'){res.writeHead(200,{'content-type':'application/json'});res.end(frozenBytes);return}try{const bytes=await readFile(join(temp,relative));res.writeHead(200,{'content-type':extname(relative)==='.wasm'?'application/wasm':extname(relative)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('not found')}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(String(error)));await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>Boolean(window.verifyProbe),undefined,{timeout:60000});const browserResult=await page.evaluate(()=>({probe:window.verifyProbe,userAgent:navigator.userAgent}));assert.deepEqual(pageErrors,[]);assert(requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'),'browser route loaded WASM');
 const receipt={format:'umf.r8.core-key-verification-current-installed/1',status:'pass',harnessSha256:sha256(await readFile(fileURLToPath(import.meta.url))),archive:{path:archive,sha256:sha256(archiveBytes),bytes:archiveBytes.byteLength,manifestSha256:sha256(manifestBytes),verifiedMemberCount:Object.keys(memberHashes).length},sourceClosure:{expectedSha256:expectedClosure,sha256:sdkManifest.sourceClosure.sha256,capturedLiveSha256:sdkManifest.sourceClosure.capturedLiveSha256,fileCount:sdkManifest.sourceClosure.fileCount,transform:sdkManifest.sourceClosure.transform},predecessor:{path:frozenPath,sha256:sha256(frozenBytes)},packageRoutes:{node:pkg.exports['.'].node,browser:pkg.exports['.'].browser,import:pkg.exports['.'].import,reference:pkg.exports['./reference'].import},node:JSON.parse(node.stdout),bun:JSON.parse(bun.stdout),chromium:{version:browser.version(),userAgent:browserResult.userAgent,...browserResult.probe,wasmRequested:requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm')},limits:{controlMaxWork:'Not directly configurable from package-root verifyCoreKeyOperation; internal engine control tests remain separate evidence',cancellation:'Not directly configurable from package-root verifyCoreKeyOperation; internal engine control tests remain separate evidence'},qualification:'Source-current installed-package replay for verifyCoreKeyOperation only. Confirms same-host ./reference parity, frozen success, receipt-before-current admission, copied carrier isolation, and cleanup observable by subsequent call. Does not qualify low-level forged/cross-engine stage ownership or configurable maxWork/cancellation; those require internal binding/runtime tests. Not a release or retirement claim.'};
 if(output){await mkdir(resolve(output,'..'),{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n'))}console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
