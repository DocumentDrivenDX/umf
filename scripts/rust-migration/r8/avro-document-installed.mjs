// SPDX-License-Identifier: MIT OR Apache-2.0
// Install and replay the opt-in Avro document inspector from one pinned private SDK archive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {execFileSync,spawnSync} from 'node:child_process';
import {extname,join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const [archiveArg,archivePin,closurePin,receiptArg]=process.argv.slice(2);
if(!archiveArg||!/^[a-f0-9]{64}$/.test(archivePin??'')||!/^[a-f0-9]{64}$/.test(closurePin??'')||!receiptArg)
 throw new Error('Usage: bun scripts/rust-migration/r8/avro-document-installed.mjs <fixed-point-sdk.tgz> <archive-sha256> <source-closure-sha256> <new-receipt.json>');
const archive=resolve(archiveArg),receiptPath=resolve(receiptArg),sha=b=>createHash('sha256').update(b).digest('hex');
const shaFile=async p=>sha(await readFile(p));
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
const temp=await mkdtemp(join(tmpdir(),'umf-r8-avro-document-installed-'));
let browser,server;
const digestInputs=async inputs=>{const h=createHash('sha256');for(const name of Object.keys(inputs).sort()){if(name.startsWith('/')||name.split(/[\\/]/).includes('..'))throw new Error(`Unsafe source path ${name}`);const bytes=await readFile(join(repo,name));if(sha(bytes)!==inputs[name])throw new Error(`Source drift: ${name}`);h.update(name);h.update('\0');h.update(bytes);h.update('\0');}return h.digest('hex');};
const verifyExternalInputs=async inputs=>{for(const [name,digest] of Object.entries(inputs??{})){const path=name.startsWith('/')?name:join(repo,name);assert.equal(await shaFile(path),digest,`external input ${name}`);}};
try{
 const archiveBytes=await readFile(archive);assert.equal(sha(archiveBytes),archivePin,'SDK archive pin');
 const listing=run('tar',['-tzf',archive]).trim().split('\n');assert(listing.length>0);assert(listing.every(x=>x.startsWith('package/')&&!x.startsWith('/')&&!x.split('/').includes('..')),'safe SDK archive members');assert.equal(new Set(listing).size,listing.length,'archive contains no duplicate members');
 const extracted=join(temp,'sdk');await mkdir(extracted);run('tar',['-xzf',archive,'-C',extracted]);const sdk=join(extracted,'package');
 const pkgManifest=JSON.parse(await readFile(join(sdk,'manifest.json'),'utf8'));const sdkManifest=JSON.parse(await readFile(join(sdk,'dist/rust-default-manifest.json'),'utf8'));
 assert.equal(sdkManifest.sourceClosure.sha256,closurePin);assert.equal(sdkManifest.sourceClosure.capturedLiveSha256,closurePin);assert.equal(sdkManifest.sourceClosure.transform.status,'fixed-point');assert.equal(sdkManifest.sourceClosure.transform.generatedInputs.length,0);
 assert.equal(await digestInputs(sdkManifest.sourceClosure.inputs),closurePin,'current source closure');await verifyExternalInputs(sdkManifest.sourceClosure.externalInputs);
 const expectedMembers=new Set([...Object.keys(pkgManifest.sha256).map(name=>`package/${name}`),'package/manifest.json']);assert.equal(listing.length,expectedMembers.size,'archive member count matches exact package manifest');assert.deepEqual([...listing].sort(),[...expectedMembers].sort(),'archive member list matches exact package manifest');
 for(const [name,digest] of Object.entries(pkgManifest.sha256))assert.equal(await shaFile(join(sdk,name)),digest,`SDK asset ${name}`);
 const native=join(temp,'native-package'),wasm=join(temp,'wasm-package');
 await cp(join(repo,'bindings/core/node'),native,{recursive:true});await cp(join(sdk,'dist/umf_core_node.node'),join(native,'umf_core_node.node'));
 for(const name of await readdir(native))if(name.endsWith('.node')&&name!=='umf_core_node.node')await rm(join(native,name),{force:true});
 await cp(join(repo,'bindings/core/wasm'),wasm,{recursive:true});await rm(join(wasm,'pkg'),{recursive:true,force:true});await mkdir(join(wasm,'pkg'),{recursive:true});
 for(const name of ['umf_core_wasm.js','umf_core_wasm.d.ts','umf_core_wasm_bg.wasm'])await cp(join(sdk,`dist/${name}`),join(wasm,'pkg',name));
 const tarballs=join(temp,'tarballs');await mkdir(tarballs);
 const npmEnv={...process.env,npm_config_cache:join(temp,'npm-cache')};
 for(const path of [native,wasm])run('npm',['pack','--ignore-scripts','--pack-destination',tarballs,path],{cwd:repo,env:npmEnv});
 const installRoot=join(temp,'consumer');await mkdir(installRoot);
 const packed=await readdir(tarballs);assert.equal(packed.length,2,'expected one native and one WASM package tarball');const tarPaths=packed.map(name=>join(tarballs,name));const tarHashes=Object.fromEntries(await Promise.all(tarPaths.map(async path=>[path,await shaFile(path)])));
 run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',installRoot,...tarPaths],{env:npmEnv});
 const packageLock=JSON.parse(await readFile(join(installRoot,'package-lock.json'),'utf8'));const lockPackages=packageLock.packages;
 const verifyLock=async(name,tarPath,packagePath)=>{const matches=Object.entries(lockPackages).filter(([key])=>key.replaceAll('\\','/').endsWith(`/node_modules/${name}`));assert.equal(matches.length,1,`exactly one lock entry for ${name}`);const [lockKey,entry]=matches[0];assert.equal(entry.integrity,`sha512-${createHash('sha512').update(await readFile(tarPath)).digest('base64')}`,`${name} lock integrity`);assert.equal(entry.version,JSON.parse(await readFile(packagePath,'utf8')).version,`${name} lock version`);assert(entry.resolved,`${name} lock resolution`);assert.equal(resolve(fileURLToPath(new URL(entry.resolved,pathToFileURL(join(installRoot,'package-lock.json'))))),resolve(tarPath),`${name} lock resolved path`);return{key:lockKey,integrity:entry.integrity,resolved:entry.resolved};};
 const installedNative=join(installRoot,'node_modules/@umf/core-rust-native');const installedWasm=join(installRoot,'node_modules/@umf/core-rust-wasm');
 const nativeTar=tarPaths.find(path=>path.includes('core-rust-native-'));const wasmTar=tarPaths.find(path=>path.includes('core-rust-wasm-'));assert(nativeTar&&wasmTar,'native and WASM packages were packed');
 const nativeLock=await verifyLock('@umf/core-rust-native',nativeTar,join(installedNative,'package.json'));const wasmLock=await verifyLock('@umf/core-rust-wasm',wasmTar,join(installedWasm,'package.json'));
 const fixture=join(repo,'fixtures/avro/candidate-edits.json');
 const host=join(repo,'scripts/rust-migration/r8/avro-document-installed-host.mjs');
 const runHost=runtime=>{const result=spawnSync(runtime,[host,join(installedNative,'index.js'),fixture],{cwd:installRoot,encoding:'utf8'});if(result.status!==0)throw new Error(`${runtime} replay failed: ${(result.stderr||result.stdout).slice(-4000)}`);return JSON.parse(result.stdout.trim().split('\n').at(-1));};
 const node=runHost(process.env.NODE_PATH??'node'),bun=runHost(process.env.BUN_PATH??'bun');
 assert.equal(JSON.stringify(node.result),JSON.stringify(bun.result),'Node/Bun result parity');
 const browserProbe=await readFile(join(repo,'scripts/rust-migration/r8/avro-document-installed-browser.mjs'),'utf8');
 const probePath=join(temp,'browser-probe.mjs');await writeFile(probePath,browserProbe);
 const requests=[],external=[],errors=[];
 server=createServer(async(req,res)=>{const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;if(pathname==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><script type="module" src="/browser-probe.mjs"></script>');return;}if(pathname==='/browser-probe.mjs'){res.setHeader('content-type','text/javascript');res.end(browserProbe);return;}if(pathname==='/avro-document-installed-probe.mjs'){res.setHeader('content-type','text/javascript');res.end(await readFile(join(repo,'scripts/rust-migration/r8/avro-document-installed-probe.mjs')));return;}if(pathname==='/fixture.json'){res.setHeader('content-type','application/json');res.end(await readFile(fixture));return;}const relative=pathname.startsWith('/candidate/')?pathname.slice('/candidate/'.length):'';if(!relative){res.writeHead(404);res.end();return;}requests.push(relative);const target=resolve(installedWasm,relative);if(!target.startsWith(installedWasm+sep)){res.writeHead(400);res.end();return;}try{res.setHeader('content-type',extname(target)==='.wasm'?'application/wasm':extname(target)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(target));}catch{res.writeHead(404);res.end();}});
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${address.port}/`))external.push(r.url())});
 await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>Boolean(window.__avroResult||window.__avroFailure),undefined,{timeout:120000});const chrome=await page.evaluate(()=>({result:window.__avroResult??null,failure:window.__avroFailure??null,userAgent:navigator.userAgent}));
 assert.equal(chrome.failure,null,chrome.failure??'');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(requests.includes('pkg/umf_core_wasm_bg.wasm'));assert.equal(JSON.stringify(chrome.result),JSON.stringify(node.result),'Chromium/Node result parity');
 assert.equal(await digestInputs(sdkManifest.sourceClosure.inputs),closurePin,'source closure after replay');await verifyExternalInputs(sdkManifest.sourceClosure.externalInputs);
 const receipt={format:'umf.r8.avro-document-inspector-installed/1',status:'pass',qualification:'Source-pinned private fixed-point SDK archive installed into local @umf/core-rust-native and @umf/core-rust-wasm packages. Replays only createAvroDocumentInspector with profile umf-r5-avro-document-inspect/0.1.0 on Node, Bun, and Chromium. No default-route parity or retirement claim.',archive:{path:archive,sha256:archivePin,bytes:archiveBytes.length,manifestSha256:sha(await readFile(join(sdk,'manifest.json'))),memberCount:listing.length},sourceClosure:{sha256:closurePin,capturedLiveSha256:sdkManifest.sourceClosure.capturedLiveSha256,fileCount:sdkManifest.sourceClosure.fileCount,verifiedBeforeAndAfter:true,externalInputs:sdkManifest.sourceClosure.externalInputs},packages:{native:{name:'@umf/core-rust-native',version:JSON.parse(await readFile(join(installedNative,'package.json'),'utf8')).version,tarballSha256:tarHashes[nativeTar],lock:nativeLock,addonSha256:await shaFile(join(installedNative,'umf_core_node.node'))},wasm:{name:'@umf/core-rust-wasm',version:JSON.parse(await readFile(join(installedWasm,'package.json'),'utf8')).version,tarballSha256:tarHashes[wasmTar],lock:wasmLock,wasmSha256:await shaFile(join(installedWasm,'pkg/umf_core_wasm_bg.wasm'))}},offlineInstall:{status:'pass',mode:'npm install --offline --ignore-scripts',lockfileSha256:await shaFile(join(installRoot,'package-lock.json'))},fixture:{path:'fixtures/avro/candidate-edits.json',sha256:await shaFile(fixture)},hosts:{node,bun,chromium:{version:browser.version(),userAgent:chrome.userAgent,result:chrome.result,wasmRequested:requests.includes('pkg/umf_core_wasm_bg.wasm'),externalRequests:external.length,pageErrors:errors.length}},harness:{orchestratorSha256:await shaFile(fileURLToPath(import.meta.url)),probeSha256:await shaFile(join(repo,'scripts/rust-migration/r8/avro-document-installed-probe.mjs'))},retirement:{status:'not-authorized',reason:'This is bounded opt-in profile evidence and does not establish default adapter parity or retirement.'}};
 await mkdir(resolve(receiptPath,'..'),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await rm(temp,{recursive:true,force:true});}
