// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-pinned installed-package qualification for the seven R8 pure operations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {tarMembers} from './default-route-retirement-evidence.mjs';
import {sha256,verifyArchiveAssets,verifyFixedPoint,verifyPackageRoutes} from './protobuf-descriptor-document-qualification-core.mjs';

const root=process.cwd();
const [archiveArg,archivePin,closurePin,receiptArg]=process.argv.slice(2);
if(!archiveArg||!archivePin||!closurePin||!receiptArg)throw new Error('Usage: bun scripts/rust-migration/r8/protobuf-descriptor-document-installed.mjs <immutable-fixed-point.tgz> <archive-sha256> <source-closure-sha256> <new-receipt.json>');
const archive=resolve(archiveArg),receiptPath=resolve(receiptArg);
assert(/^[a-f0-9]{64}$/.test(archivePin),'explicit archive SHA-256 pin is required');
assert(/^[a-f0-9]{64}$/.test(closurePin),'explicit source closure SHA-256 pin is required');
const archiveBytes=await readFile(archive);
assert.equal(sha256(archiveBytes),archivePin,'immutable SDK archive SHA-256');
const {members,files}=tarMembers(archiveBytes);
const sdkManifest=JSON.parse(files['dist/rust-default-manifest.json']?.toString('utf8')??'null');
const packageManifest=JSON.parse(files['manifest.json']?.toString('utf8')??'null');
const packageJson=JSON.parse(files['package.json']?.toString('utf8')??'null');
assert(sdkManifest&&packageManifest&&packageJson,'archive is missing SDK or package manifest');
assert.equal(packageManifest.sourceTransformStatus,'fixed-point');
assert.equal(packageManifest.sourceTransformCount,0);
assert.equal(packageManifest.sourceTreeSha256,closurePin);
assert.equal(packageManifest.capturedLiveSourceTreeSha256,closurePin);
const source=verifyFixedPoint(sdkManifest,closurePin,name=>{
  try{return readFileSync(join(root,name));}catch{return undefined;}
});
assert.equal(sdkManifest.sourceClosure.fileCount,source.inputCount);
const expectedMembers=packageManifest.sha256;
assert(expectedMembers&&typeof expectedMembers==='object','archive package member digest table is missing');
assert.deepEqual(Object.keys(members).filter(name=>name!=='manifest.json').sort(),Object.keys(expectedMembers).sort(),'archive member list');
for(const [name,digest] of Object.entries(members))if(name!=='manifest.json')assert.equal(digest,expectedMembers[name],`archive member hash ${name}`);
const routes=verifyPackageRoutes(packageJson);
const artifactHashes=verifyArchiveAssets(new Map(Object.entries(files)),expectedMembers,routes.reference.replace(/^\.\//,''));
assert.equal(packageJson.name,'@umf/core');

// Frozen evidence remains repository-owned and is pinned independently of the archive.
const predecessorPath='docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json';
const descriptorPath='tests/rust-core/protobuf-read-descriptor-predecessor.json';
const predecessorBytes=readFileSync(join(root,predecessorPath));
const descriptorBytes=readFileSync(join(root,descriptorPath));
assert.equal(sha256(predecessorBytes),'226eb9fb46781b45e82789e5efaf80a2d22c298c5fa0893a81d7a91cd5852f41','frozen predecessor packet pin');
assert.equal(sha256(descriptorBytes),'8b123ca2343ae272969c5ecefaf9dd7394e84f24209a99ad20969a29b5342647','14-case descriptor reader packet pin');
const predecessor=JSON.parse(predecessorBytes.toString('utf8'));
const descriptorCases=JSON.parse(descriptorBytes.toString('utf8'));
const temp=await mkdtemp(join(tmpdir(),'umf-r8-protobuf-installed-'));
let browser,server;
try{
  const packageRoot=join(temp,'node_modules/@umf/core');
  await mkdir(packageRoot,{recursive:true});
  for(const [name,bytes] of Object.entries(files)){
    const target=join(packageRoot,name);await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await writeFile(target,bytes);
  }
  const packetDir=join(temp,'packets');await mkdir(packetDir,{recursive:true});
  await writeFile(join(packetDir,'protobuf.json'),predecessorBytes);
  await writeFile(join(packetDir,'descriptor.json'),descriptorBytes);
  // Resolve declared package dependencies only from npm's local cache.
  const install=spawnSync(process.env.NPM_PATH??'npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',packageRoot],{cwd:root,encoding:'utf8'});
  if(install.status!==0)throw new Error(`offline dependency-resolved install failed (${install.status}): ${(install.stderr||install.stdout).slice(-4000)}`);

  const hostProbePath=join(root,'scripts/rust-migration/r8/protobuf-descriptor-document-host-probe.mjs');
  const hostProbe=await readFile(hostProbePath,'utf8');
  const hostPath=join(temp,'probe.mjs');await writeFile(hostPath,hostProbe);
  await writeFile(join(temp,'protobuf-descriptor-document-replay.mjs'),await readFile(join(root,'scripts/rust-migration/r8/protobuf-descriptor-document-replay.mjs')));
  const runHost=runtime=>{
    const result=spawnSync(runtime,[hostPath,join(packageRoot,routes.node.replace(/^\.\//,'')),join(packageRoot,routes.reference.replace(/^\.\//,'')),join(packetDir,'protobuf.json'),join(packetDir,'descriptor.json'),join(packageRoot,'dist/umf_core_node.node')],{cwd:temp,encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
    if(result.status!==0)throw new Error(`${runtime} installed route replay failed (${result.status}): ${(result.stderr||result.stdout).slice(-4000)}`);
    return JSON.parse(result.stdout.trim().split('\n').at(-1));
  };
  const node=runHost(process.env.NODE_PATH??'node');const bun=runHost(process.env.BUN_PATH??'bun');
  assert.equal(node.default.operationVectors,18);assert.equal(node.default.descriptorReaderCases,14);
  assert.equal(bun.default.operationVectors,18);assert.equal(bun.default.descriptorReaderCases,14);
  assert.equal(node.default.nativeCalls>0,true);assert.equal(node.reference.nativeCalls,0);
  assert.equal(bun.default.nativeCalls>0,true);assert.equal(bun.reference.nativeCalls,0);

  const browserProbe=await readFile(join(root,'scripts/rust-migration/r8/protobuf-descriptor-document-browser-probe.mjs'),'utf8');
  await writeFile(join(temp,'probe-browser.mjs'),browserProbe);
  const html='<!doctype html><meta charset="utf-8"><script>window.__wasmInstantiateCount=0;for(const key of ["instantiate","instantiateStreaming"]){const original=WebAssembly[key];if(typeof original==="function")WebAssembly[key]=function(...args){window.__wasmInstantiateCount++;return Reflect.apply(original,this,args)}};</script><script type="importmap">'+JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':`/node_modules/@umf/core/${routes.reference.replace(/^\.\//,'')}`}})+'</script><script type="module" src="/probe-browser.mjs"></script>';
  const requests=[],external=[],errors=[];
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
    if(pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
    if(pathname==='/probe-browser.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return;}
    if(pathname==='/packets/protobuf.json'){res.writeHead(200,{'content-type':'application/json'});res.end(predecessorBytes);return;}
    if(pathname==='/packets/descriptor.json'){res.writeHead(200,{'content-type':'application/json'});res.end(descriptorBytes);return;}
    const member=decodeURIComponent(pathname.slice(1));requests.push(member);
    try{const file=resolve(temp,member);assert(file.startsWith(temp+'/'),'browser request escaped install');const bytes=await readFile(file);res.writeHead(200,{'content-type':extname(file)==='.wasm'?'application/wasm':extname(file)==='.json'?'application/json':'text/javascript'});res.end(bytes);}
    catch{res.writeHead(404);res.end('missing');}
  });
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');
  browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${address.port}/`))external.push(request.url());});
  await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>Boolean(window.result||window.failure),undefined,{timeout:120000});
  const chrome=await page.evaluate(()=>({result:window.result??null,failure:window.failure??null,userAgent:navigator.userAgent}));
  assert.equal(chrome.failure,null,chrome.failure??'');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.equal(chrome.result.default.operationVectors,18);assert.equal(chrome.result.default.descriptorReaderCases,14);
  assert.equal(chrome.result.reference.operationVectors,18);assert.equal(chrome.result.reference.descriptorReaderCases,14);
  assert.equal(chrome.result.wasmInstantiateCount>0,true);assert.equal(chrome.result.wasmAssetLoaded,true);
  assert.equal(chrome.result.nodeGlobalsAbsent,true);assert(requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'));
  const receipt={format:'umf.r8.protobuf-descriptor-document-installed/1',status:'pass',qualification:'Source-pinned installed fixed-point archive evidence for seven pure Protobuf descriptor/document operations and 14 bounded descriptor-reader cases on Node/Bun/Chromium. This does not authorize default-route retirement.',archive:{path:archive,sha256:archivePin,sourceClosureSha256:closurePin,sourceInputCount:source.inputCount,transformStatus:'fixed-point',transformCount:0,packageManifestSha256:sha256(Buffer.from(files['manifest.json']))},routes,artifacts:artifactHashes,predecessors:{protobufDescriptorDocument:{path:predecessorPath,sha256:sha256(predecessorBytes),operations:predecessor.operations},descriptorReader:{path:descriptorPath,sha256:sha256(descriptorBytes),caseCount:Object.keys(descriptorCases.cases).length}},hosts:{node,bun,chromium:{version:browser.version(),userAgent:chrome.userAgent,...chrome.result,externalRequests:external.length,pageErrors:errors.length}},offlineInstall:{status:'pass',mode:'npm install --offline --ignore-scripts'},retirement:{status:'not-authorized',reason:'qualification does not establish complete parity, all host routes, or approved retirement evidence'}};
  await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser?.close();server?.close();await rm(temp,{recursive:true,force:true});}
