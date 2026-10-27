// SPDX-License-Identifier: MIT OR Apache-2.0
// Per-case installed-route capture for CONTRACT-040. Outputs are raw host
// receipts only; the shared retirement validator performs archive/source gates.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tarMembers} from './default-route-retirement-evidence.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packetRoot = path.join(repo, 'scripts/rust-migration/r8/cardinality-retirement-packets');
const operations = ['inspectCoreCardinality', 'declareCoreCardinality', 'verifyCoreCardinalityDeclaration'];
const requiredClosureFiles = [path.relative(repo,fileURLToPath(import.meta.url)),
  'scripts/rust-migration/r8/core-cardinality-case-capture.test.mjs',
  'scripts/rust-migration/r8/default-route-retirement-evidence.mjs',
  ...operations.map(name=>`scripts/rust-migration/r8/cardinality-retirement-packets/${name}.packet.json`)];
const rustOwners = {
  inspectCoreCardinality: 'umf_core::cardinality::inspect_core_cardinality',
  declareCoreCardinality: 'umf_core::cardinality::declare_core_cardinality',
  verifyCoreCardinalityDeclaration: 'umf_core::cardinality::verify_core_cardinality_declaration',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const canonical = value => JSON.stringify(stable(value));
const expectedCohorts = {
  'darwin-arm64': {os:'darwin', arch:'aarch64', nodeArch:'arm64', nativeTarget:'aarch64-apple-darwin'},
  'linux-x86_64': {os:'linux', arch:'x86_64', nodeArch:'x64', nativeTarget:'x86_64-unknown-linux-gnu'},
};

export function validatePacket(packet, exportName) {
  if (!operations.includes(exportName) || packet?.format !== 'umf.r8.default-route-retirement-packet/2' || packet.profile !== 'all-rust' ||
      packet.contractId !== 'CONTRACT-040' || packet.exportName !== exportName || packet.rustOwner !== rustOwners[exportName] ||
      !Array.isArray(packet.cases) || packet.cases.length === 0) throw new Error(`${exportName} packet identity/profile is invalid`);
  const ids = new Set();
  for (const item of packet.cases) {
    const keys = ['id','input','expectedOutcome','expectedTrace','expectedDefaultRustCalls'].sort();
    if (!item || Object.keys(item).sort().join('\0') !== keys.join('\0') || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        !Array.isArray(item.expectedTrace) || !Number.isSafeInteger(item.expectedDefaultRustCalls) || item.expectedDefaultRustCalls < 1) throw new Error(`${exportName} has invalid or duplicate packet case`);
    ids.add(item.id);
  }
  return packet;
}

export function makeArgs(item, trace, operation) {
  const input = structuredClone(item.input);
  if (input.profile === 'source-ownkeys-throws') {
    return [new Proxy(input.source, {ownKeys(target) { trace.push('source:ownKeys'); throw Object.assign(new Error('fixture source trap'), {code:'FIXTURE_SOURCE_TRAP', path:'/source'}); }}), input.identity, input.request];
  }
  if (input.profile === 'current-get-throws') {
    return [input.receipt, new Proxy(input.current, {ownKeys(target) { trace.push('current:ownKeys'); throw Object.assign(new Error('fixture current trap'), {code:'FIXTURE_CURRENT_TRAP', path:'/current'}); }})];
  }
  return operation === 'inspectCoreCardinality' ? [input.source, input.identity]
    : operation === 'declareCoreCardinality' ? [input.source, input.identity, input.request] : [input.receipt, input.current];
}

function outcome(call) {
  try { return stable({status:'returned', value:call()}); }
  catch (error) { return {status:'threw', name:String(error?.name ?? ''), code:typeof error?.code === 'string' ? error.code : null,
    path:typeof error?.path === 'string' ? error.path : null, message:String(error?.message ?? '')}; }
}

export async function verifyExtractedMembers(members, packageRoot) {
  const rootStat=await fs.lstat(packageRoot);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('extracted package root must be a real directory');
  const expectedFiles=new Set(Object.keys(members));
  const expectedDirectories=new Set();
  for(const name of expectedFiles){
    if(typeof name!=='string'||path.isAbsolute(name)||name.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))throw new Error(`unsafe extracted archive member ${name}`);
    let parent=path.posix.dirname(name);
    while(parent!=='.'){expectedDirectories.add(parent);parent=path.posix.dirname(parent);}
  }
  const actualFiles=new Set(),actualDirectories=new Set();
  async function walk(directory,relative=''){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      const name=relative?`${relative}/${entry.name}`:entry.name;
      const full=path.join(directory,entry.name),stat=await fs.lstat(full);
      if(stat.isSymbolicLink())throw new Error(`extracted package contains symlink: ${name}`);
      if(stat.isDirectory()){
        actualDirectories.add(name);
        await walk(full,name);
      }else if(stat.isFile())actualFiles.add(name);
      else throw new Error(`extracted package contains a non-regular member: ${name}`);
    }
  }
  await walk(packageRoot);
  const sorted=set=>[...set].sort();
  assert.deepEqual(sorted(actualFiles),sorted(expectedFiles),'extracted package file set differs from archive member set');
  assert.deepEqual(sorted(actualDirectories),sorted(expectedDirectories),'extracted package directory set differs from archive member parents');
  const localMembers=Object.create(null);
  for(const [name,digest] of Object.entries(members)){
    const bytes=await fs.readFile(path.join(packageRoot,...name.split('/')));
    assert.equal(sha(bytes),digest,`extracted archive member ${name}`);localMembers[name]=digest;
  }
  return localMembers;
}

export async function verifyLiveSourceClosure(closure,{root=repo,expectedSha256}={}){
  const hashes=closure?.liveInputs,inputs=closure?.inputs;
  const validMap=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash));
  if(!validMap(hashes)||!validMap(inputs))throw new Error('archive source closure omits valid input hash maps');
  if(!Number.isSafeInteger(closure.fileCount)||closure.fileCount!==Object.keys(hashes).length)throw new Error('archive source closure fileCount differs from its input map');
  assert.deepEqual(inputs,hashes,'archive source closure inputs and liveInputs differ');
  const tree=createHash('sha256');
  for(const name of Object.keys(hashes).sort()){
    if(typeof name!=='string'||!name||path.isAbsolute(name)||name.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))throw new Error(`unsafe source closure path ${name}`);
    const bytes=await fs.readFile(path.resolve(root,name));
    assert.equal(sha(bytes),hashes[name],`archive source closure input ${name}`);
    tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');
  }
  const digest=tree.digest('hex');
  assert.equal(closure.sha256,digest,'archive source closure recomputed hash');
  assert.equal(closure.capturedLiveSha256,digest,'archive captured-live source closure hash');
  if(expectedSha256!==undefined)assert.equal(digest,expectedSha256,'requested source closure hash');
  return digest;
}

export async function assertSourceClosurePins(closure, {root=repo, requiredFiles=requiredClosureFiles}={}) {
  if(!closure?.liveInputs||typeof closure.liveInputs!=='object'||Array.isArray(closure.liveInputs))throw new Error('archive source closure omits live input hashes');
  for(const name of requiredFiles){
    const expected=closure.liveInputs[name];
    if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))throw new Error(`archive source closure does not include capture source ${name}`);
    const bytes=await fs.readFile(path.resolve(root,name));
    assert.equal(sha(bytes),expected,`archive source closure pin for ${name}`);
  }
}

export function resolvePackageRoutes(packageManifest) {
  const node=packageManifest?.exports?.['.']?.node;
  const browser=packageManifest?.exports?.['.']?.browser;
  const reference=packageManifest?.exports?.['./reference']?.import;
  const safe=value=>typeof value==='string'&&value.startsWith('./dist/')&&!value.split('/').includes('..');
  if(!safe(node)||!safe(browser)||!safe(reference))throw new Error('archive package.json does not declare safe Node, browser and ./reference conditions');
  return {node:node.slice(2),browser:browser.slice(2),reference:reference.slice(2)};
}

export async function archiveIdentity({archivePath, archiveSha256, sourceClosureSha256, packageRoot, cohortId}) {
  const expectedPlatform = expectedCohorts[cohortId];
  if (!expectedPlatform) throw new Error(`unsupported cohort ${cohortId}`);
  const archiveBytes = await fs.readFile(archivePath);
  assert.equal(sha(archiveBytes), archiveSha256, 'SDK archive SHA-256 pin');
  const {members, files} = tarMembers(archiveBytes);
  await verifyExtractedMembers(members, packageRoot);
  const packageManifestBytes=files['package.json'];
  if(!packageManifestBytes)throw new Error('SDK archive omits package.json');
  const packageManifest=JSON.parse(packageManifestBytes.toString('utf8'));
  const packageRoutes=resolvePackageRoutes(packageManifest);
  const rustManifestBytes = files['dist/rust-default-manifest.json'];
  if (!rustManifestBytes) throw new Error('SDK archive omits dist/rust-default-manifest.json');
  const rustManifest = JSON.parse(rustManifestBytes.toString('utf8'));
  const platform = rustManifest.platform;
  for (const key of Object.keys(expectedPlatform)) assert.equal(platform?.[key], expectedPlatform[key], `archive ${cohortId} ${key}`);
  assert.equal(rustManifest.sourceClosure?.sha256, sourceClosureSha256, 'archive source closure pin');
  assert.equal(rustManifest.sourceClosure?.capturedLiveSha256, sourceClosureSha256, 'captured source closure pin');
  assert.equal(rustManifest.sourceClosure?.transform?.status, 'fixed-point', 'archive fixed-point transform');
  assert.deepEqual(rustManifest.sourceClosure?.transform?.generatedInputs, [], 'archive generated-input closure');
  await verifyLiveSourceClosure(rustManifest.sourceClosure,{expectedSha256:sourceClosureSha256});
  await assertSourceClosurePins(rustManifest.sourceClosure);
  const current = process.platform === 'darwin' && process.arch === 'arm64' ? 'darwin-arm64'
    : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x86_64' : null;
  assert.equal(current, cohortId, 'runtime host cohort');
  const manifestSha = sha(rustManifestBytes);
  const memberManifest = {format:'umf.r8.archive-member-manifest/1',status:'pass',algorithm:'sha256',archiveSha256,
    packageManifestSha256:members['package.json'],archiveMemberCount:Object.keys(members).length,verifiedMemberCount:Object.keys(members).length,members};
  return {archiveBytes, members, memberManifest, memberManifestSha256:sha(Buffer.from(JSON.stringify(stable(memberManifest)))),
    sourceManifestSha256:manifestSha, platform:expectedPlatform, rustManifest, packageManifest, packageRoutes};
}

export async function runNodeOrBun({runtime, packageRoot, packageRoutes, packets}) {
  const require = createRequire(import.meta.url);
  const addon = require(path.join(packageRoot,'dist/umf_core_node.node'));
  const original = addon.executeCoreCardinalityHostJson;
  if (typeof original !== 'function') throw new Error('native archive lacks executeCoreCardinalityHostJson');
  let rustCalls = 0;
  addon.executeCoreCardinalityHostJson = function(...args) { rustCalls++; return original.apply(this,args); };
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'umf-cardinality-package-self-resolution-'));
  let defaults,reference;
  try {
    const scope=path.join(workspace,'node_modules','@umf');await fs.mkdir(scope,{recursive:true});
    await fs.symlink(packageRoot,path.join(scope,'core'),'dir');
    const probe=path.join(workspace,'capture-routes.mjs');
    await fs.writeFile(probe,`import * as defaults from '@umf/core';\nimport * as reference from '@umf/core/reference';\nexport {defaults,reference};\n`);
    ({defaults,reference}=await import(pathToFileURL(probe).href));
  } finally {await fs.rm(workspace,{recursive:true,force:true});}
  const casesByOperation = {};
  for (const operation of operations) {
    casesByOperation[operation] = [];
    for (const item of packets[operation].cases) {
      const trace=[]; rustCalls=0;
      const defaultOutcome=outcome(()=>defaults[operation](...makeArgs(item,trace,operation)));
      const defaultRustCalls=rustCalls;
      assert.equal(canonical(defaultOutcome),canonical(item.expectedOutcome),`${operation}/${item.id} default outcome`);
      assert.equal(canonical(trace),canonical(item.expectedTrace),`${operation}/${item.id} default ordered trace`);
      assert.equal(defaultRustCalls,item.expectedDefaultRustCalls,`${operation}/${item.id} observed native Rust calls`);
      const referenceTrace=[]; rustCalls=0;
      const referenceOutcome=outcome(()=>reference[operation](...makeArgs(item,referenceTrace,operation)));
      const referenceRustCalls=rustCalls;
      assert.equal(canonical(referenceOutcome),canonical(item.expectedOutcome),`${operation}/${item.id} reference outcome`);
      assert.equal(canonical(referenceTrace),canonical(item.expectedTrace),`${operation}/${item.id} reference ordered trace`);
      assert.equal(referenceRustCalls,0,`${operation}/${item.id} reference Rust calls`);
      casesByOperation[operation].push({id:item.id,defaultOutcome,defaultTrace:trace,defaultRustCalls,referenceOutcome,referenceTrace,referenceRustCalls});
    }
  }
  return {runtime:process.versions.bun?'bun':'node',hostVersion:process.versions.bun?Bun.version:process.version,casesByOperation,
    defaultFiles:{entry:await fs.readFile(path.join(packageRoot,packageRoutes.node)),artifact:await fs.readFile(path.join(packageRoot,'dist/umf_core_node.node'))},
    referenceFile:await fs.readFile(path.join(packageRoot,packageRoutes.reference)),packageRoutes};
}

export async function runChromium({packageRoot, packageRoutes, packets}) {
  const {chromium}=await import('playwright');
  const browserFiles={default:await fs.readFile(path.join(packageRoot,packageRoutes.browser)),
    reference:await fs.readFile(path.join(packageRoot,packageRoutes.reference)),
    wasm:await fs.readFile(path.join(packageRoot,'dist/umf_core_wasm_bg.wasm'))};
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url??'/','http://127.0.0.1');
      if(url.pathname==='/') {const imports={'@umf/core':`/${packageRoutes.browser}`,'@umf/core/reference':`/${packageRoutes.reference}`};res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><meta charset="utf-8"><title>Cardinality capture</title><script type="importmap">${JSON.stringify({imports})}</script>`);return;}
      const relative=decodeURIComponent(url.pathname.slice(1));
      const target=path.resolve(packageRoot,relative);
      if(!target.startsWith(packageRoot+path.sep)) throw new Error('path escape');
      const bytes=await fs.readFile(target);
      res.writeHead(200,{'content-type':path.extname(target)==='.wasm'?'application/wasm':path.extname(target)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes);
    } catch {res.writeHead(404);res.end('not found');}
  });
  await new Promise((resolveListen,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolveListen()));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      globalThis.__umfCardinalityRustCalls=0;
      const wrap=result=>{const instance=result?.instance??result;if(!instance?.exports)return result;const exports=Object.create(null);
        for(const key of Reflect.ownKeys(instance.exports)){const value=Reflect.get(instance.exports,key);exports[key]=key==='executeCoreCardinalityHostJson'&&typeof value==='function'
          ?function(...args){globalThis.__umfCardinalityRustCalls++;return value.apply(instance.exports,args);}:value;}
        const replaced={...instance,exports};return result?.instance?{...result,instance:replaced}:replaced;};
      const instantiate=WebAssembly.instantiate.bind(WebAssembly);
      WebAssembly.instantiate=(...args)=>Promise.resolve(instantiate(...args)).then(wrap);
      if(WebAssembly.instantiateStreaming){const stream=WebAssembly.instantiateStreaming.bind(WebAssembly);WebAssembly.instantiateStreaming=(...args)=>Promise.resolve(stream(...args)).then(wrap);}
    });
    const address=server.address();await page.goto(`http://127.0.0.1:${address.port}/`);
    const result=await page.evaluate(async packets=>{
      const root=await import('@umf/core'),reference=await import('@umf/core/reference');
      const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
      const canonical=value=>JSON.stringify(stable(value));
      const outcome=call=>{try{return stable({status:'returned',value:call()});}catch(error){return{status:'threw',name:String(error?.name??''),code:typeof error?.code==='string'?error.code:null,path:typeof error?.path==='string'?error.path:null,message:String(error?.message??'')};}};
      const args=(item,trace,operation)=>{const input=structuredClone(item.input);if(input.profile==='source-ownkeys-throws')return[new Proxy(input.source,{ownKeys(){trace.push('source:ownKeys');throw Object.assign(new Error('fixture source trap'),{code:'FIXTURE_SOURCE_TRAP',path:'/source'});}}),input.identity,input.request];if(input.profile==='current-get-throws')return[input.receipt,new Proxy(input.current,{ownKeys(){trace.push('current:ownKeys');throw Object.assign(new Error('fixture current trap'),{code:'FIXTURE_CURRENT_TRAP',path:'/current'});}})];return operation==='inspectCoreCardinality'?[input.source,input.identity]:operation==='declareCoreCardinality'?[input.source,input.identity,input.request]:[input.receipt,input.current];};
      const casesByOperation={};for(const [operation,packet] of Object.entries(packets)){casesByOperation[operation]=[];for(const item of packet.cases){const trace=[];globalThis.__umfCardinalityRustCalls=0;const defaultOutcome=outcome(()=>root[operation](...args(item,trace,operation))),defaultRustCalls=globalThis.__umfCardinalityRustCalls;if(canonical(defaultOutcome)!==canonical(item.expectedOutcome)||canonical(trace)!==canonical(item.expectedTrace)||defaultRustCalls!==item.expectedDefaultRustCalls)throw Error(`${operation}/${item.id}: installed result/trace/call count mismatch`);const referenceTrace=[];globalThis.__umfCardinalityRustCalls=0;const referenceOutcome=outcome(()=>reference[operation](...args(item,referenceTrace,operation))),referenceRustCalls=globalThis.__umfCardinalityRustCalls;if(canonical(referenceOutcome)!==canonical(item.expectedOutcome)||canonical(referenceTrace)!==canonical(item.expectedTrace)||referenceRustCalls!==0)throw Error(`${operation}/${item.id}: reference result/trace/call count mismatch`);casesByOperation[operation].push({id:item.id,defaultOutcome,defaultTrace:trace,defaultRustCalls,referenceOutcome,referenceTrace,referenceRustCalls});}}
      if('process'in globalThis||'Buffer'in globalThis)throw Error('browser route exposed Node globals');return {casesByOperation,userAgent:navigator.userAgent};
    },packets);
    const requests=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));
    assert(requests.some(url=>url.endsWith('/dist/umf_core_wasm_bg.wasm')),'actual archive WASM member was loaded');
    assert(requests.every(url=>url.startsWith(`http://127.0.0.1:${address.port}/`)),'browser made an external request');
    return {runtime:'chromium',hostVersion:browser.version(),browserUserAgent:result.userAgent,casesByOperation:result.casesByOperation,
      defaultFiles:{entry:browserFiles.default,artifact:browserFiles.wasm},referenceFile:browserFiles.reference,packageRoutes,externalRequests:0,wasmMemberLoaded:true};
  } finally {await browser?.close();await new Promise(done=>server.close(done));}
}

export function buildHostReceipt({runtime,hostVersion,cohortId,hostPlatform,archiveSha256,sourceClosureSha256,packetBytes,operation,cases,defaultFiles,referenceFile,packageRoutes}) {
  const chromium=runtime==='chromium';
  return {format:'umf.r8.default-route-retirement-host-receipt/2',status:'pass',runtime,hostVersion,cohortId,hostPlatform,
    archiveSha256,sourceClosureSha256,packetSha256:sha(packetBytes),
    defaultRoute:{routeId:chromium?'package-root-browser':'package-root-node',entryMember:chromium?packageRoutes.browser:packageRoutes.node,
      entrySha256:sha(defaultFiles.entry),artifactMembers:[{path:chromium?'dist/umf_core_wasm_bg.wasm':'dist/umf_core_node.node',sha256:sha(defaultFiles.artifact)}]},
    referenceRoute:{routeId:'package-reference',entryMember:packageRoutes.reference,entrySha256:sha(referenceFile),artifactMembers:[]},cases};
}

async function main(args=process.argv.slice(2)) {
  const [runtime,packageArg,archiveArg,archiveSha256,cohortId,sourceClosureSha256,outArg]=args;
  if(!['node','bun','chromium'].includes(runtime)||!packageArg||!archiveArg||!archiveSha256||!cohortId||!sourceClosureSha256||!outArg) {
    throw new Error('Usage: <node|bun|chromium> <extracted-package-root> <sdk.tgz> <archive-sha256> <darwin-arm64|linux-x86_64> <source-closure-sha256> <output-dir>');
  }
  assert.match(archiveSha256,/^[a-f0-9]{64}$/);assert.match(sourceClosureSha256,/^[a-f0-9]{64}$/);
  const packageRoot=path.resolve(packageArg),archivePath=path.resolve(archiveArg),out=path.resolve(outArg);
  const cohort=await archiveIdentity({archivePath,archiveSha256,sourceClosureSha256,packageRoot,cohortId});
  const packets={};
  for(const operation of operations) packets[operation]=validatePacket(JSON.parse(await fs.readFile(path.join(packetRoot,`${operation}.packet.json`),'utf8')),operation);
  const packetPins={};for(const operation of operations)packetPins[operation]=sha(await fs.readFile(path.join(packetRoot,`${operation}.packet.json`)));
  const observed=runtime==='chromium'?await runChromium({packageRoot,packageRoutes:cohort.packageRoutes,packets}):await runNodeOrBun({runtime,packageRoot,packageRoutes:cohort.packageRoutes,packets});
  if(runtime!=='chromium')assert.equal(observed.runtime,runtime,`requested ${runtime} but running ${observed.runtime}`);
  await fs.mkdir(out,{recursive:true});
  const memberManifestFile=`archive-members-${cohortId}.json`;
  const memberManifestPath=path.join(out,memberManifestFile);
  await fs.writeFile(memberManifestPath,JSON.stringify(cohort.memberManifest,null,2)+'\n');
  const memberManifestSha256=sha(await fs.readFile(memberManifestPath));
  const cohortPin={format:'umf.r8.cardinality-capture-cohort/1',cohortId,platform:cohort.platform,
    archive:{path:archivePath,sha256:archiveSha256,sourceClosureSha256,sourceManifestMemberSha256:cohort.sourceManifestSha256,
      sourceInputCount:cohort.rustManifest.sourceClosure.fileCount,generatedTransformCount:cohort.rustManifest.sourceClosure.transform.generatedInputs.length,
      packageManifestSha256:cohort.members['package.json'],archiveMemberCount:Object.keys(cohort.members).length,
      memberManifest:{path:memberManifestFile,sha256:memberManifestSha256}},
    packetPins,packageRoutes:cohort.packageRoutes,harness:{path:path.relative(repo,fileURLToPath(import.meta.url)),sha256:sha(await fs.readFile(fileURLToPath(import.meta.url)))}};
  await fs.writeFile(path.join(out,`cohort-${cohortId}.json`),JSON.stringify(cohortPin,null,2)+'\n');
  await fs.writeFile(path.join(out,`capture-runtime-${runtime}.json`),JSON.stringify({format:'umf.r8.cardinality-capture-runtime/1',runtime:observed.runtime,hostVersion:observed.hostVersion,browserUserAgent:observed.browserUserAgent??null,externalRequests:observed.externalRequests??null,wasmMemberLoaded:observed.wasmMemberLoaded??null,instrumentation:runtime==='chromium'?{point:'WebAssembly.Instance.exports.executeCoreCardinalityHostJson',actualExport:true}:{point:'N-API addon executeCoreCardinalityHostJson',actualExport:true}},null,2)+'\n');
  for(const operation of operations) {
    const packetFile=path.join(packetRoot,`${operation}.packet.json`),packetBytes=await fs.readFile(packetFile);
    const cases=observed.casesByOperation[operation];
    const receipt=buildHostReceipt({runtime,hostVersion:observed.hostVersion,cohortId,hostPlatform:{os:process.platform,arch:process.arch},
      archiveSha256,sourceClosureSha256,packetBytes,operation,cases,defaultFiles:observed.defaultFiles,referenceFile:observed.referenceFile,packageRoutes:cohort.packageRoutes});
    const receiptPath=path.join(out,`${operation}-${runtime}.json`);
    await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({receipt:receiptPath,operation,runtime,hostVersion:observed.hostVersion,cohortId,archiveSha256,sourceClosureSha256,packetSha256:receipt.packetSha256,memberManifestSha256,callCounts:cases.map(item=>({id:item.id,default:item.defaultRustCalls,reference:item.referenceRustCalls}))}));
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
