// SPDX-License-Identifier: MIT OR Apache-2.0
// Pack/install/replay the current-core Bit128 Field operation through the
// existing private native and WASM binding packages. This never changes V4.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const archive=resolve(process.argv[2]??'');
const output=resolve(process.argv[3]??join(repo,'docs/helix/04-build/evidence/rust-migration/r8-bit128-field-installed-20261028'));
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/bit128-field-installed.mjs <fixed-point-umf-sdk.tgz> [evidence-directory]');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaFile=async path=>sha(await readFile(path));
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const temp=await mkdtemp(join(tmpdir(),'umf-r8-bit128-field-installed-'));
const privateDir=resolve(process.env.UMF_BIT128_ARCHIVE_DIR??join(tmpdir(),'umf-bit128-field-installed-20261028'));
await mkdir(privateDir,{recursive:true});
await mkdir(output,{recursive:true});
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const digestInputs=async inputs=>{
 const hash=createHash('sha256');
 for(const name of Object.keys(inputs).sort()){
  if(name.startsWith('/')||name.split(/[\\/]/).includes('..'))throw new Error(`Unsafe source closure path ${name}`);
  const bytes=await readFile(join(repo,name));
  if(sha(bytes)!==inputs[name])throw new Error(`Current source differs from source snapshot: ${name}`);
  hash.update(name);hash.update('\0');hash.update(bytes);hash.update('\0');
 }
 return hash.digest('hex');
};
const copySurface=async(source,destination,kind)=>{
 await mkdir(destination,{recursive:true});
 const entries=kind==='node'
  ? ['package.json','index.js','index.d.ts','copy-json-host-input.js','copy-json-host-input.d.ts','src']
  : ['package.json','index.js','index.d.ts','copy-json-host-input.js','copy-json-host-input.d.ts','src','pkg'];
 for(const name of entries)await cp(join(source,name),join(destination,name),{recursive:true});
};
const hashDirectory=async root=>{
 const result={};
 const walk=async dir=>{for(const entry of await readdir(dir,{withFileTypes:true})){const full=join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(entry.isFile())result[relative(root,full).split(sep).join('/')]=await shaFile(full)}};
 await walk(root);return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));
};

let browser,server;
try{
 const archiveSha256=await shaFile(archive);
 const listing=run('tar',['-tzf',archive]).split('\n').filter(Boolean);
 if(listing.some(name=>name.startsWith('/')||name.split('/').includes('..')||!name.startsWith('package/')))throw new Error('Unsafe SDK archive member');
 const extracted=join(temp,'sdk');await mkdir(extracted,{recursive:true});run('tar',['-xzf',archive,'-C',extracted]);
 const sdk=join(extracted,'package');
 const packageManifest=await json(join(sdk,'manifest.json'));
 const sdkManifest=await json(join(sdk,'dist/rust-default-manifest.json'));
 assert.equal(sdkManifest.sourceClosure.transform.status,'fixed-point','SDK source cohort is not a fixed point');
 assert.equal(sdkManifest.sourceClosure.transform.generatedInputs.length,0,'SDK build transformed generated inputs');
 assert.equal(sdkManifest.sourceClosure.capturedLiveSha256,sdkManifest.sourceClosure.sha256,'captured live and final source hashes differ');
 assert.equal(await digestInputs(sdkManifest.sourceClosure.inputs),sdkManifest.sourceClosure.sha256,'installed SDK source closure is not current-source coherent');
 const archiveAssets=packageManifest.sha256;
 for(const [name,expected] of Object.entries(archiveAssets))assert.equal(await shaFile(join(sdk,name)),expected,`SDK asset hash mismatch: ${name}`);
 const expectedMembers=new Set([...Object.keys(archiveAssets),'dist/rust-default-manifest.json','package.json','manifest.json','README.md','LICENSE.md','LICENSE-MIT','LICENSE-APACHE']);
 const members=listing.map(name=>name.replace(/^package\//,''));
 assert.equal(members.length,expectedMembers.size,'SDK archive member count differs from manifest');
 assert(members.every(name=>expectedMembers.has(name)),'SDK archive has an unexpected or missing member');
 for(const name of ['dist/umf_core_node.node','dist/umf_core_wasm.js','dist/umf_core_wasm.d.ts','dist/umf_core_wasm_bg.wasm','dist/spec/core/schema.json','dist/spec/core/semantic-type-reference.schema.json','dist/spec/core/extension-package.schema.json','dist/spec/metamodel/generated/core-constraints.json','dist/spec/metamodel/generated/domain-policy.json'])assert(archiveAssets[name],`SDK archive omits ${name}`);
 run('bun',['scripts/rust-migration/r7/wasm-package-sources.ts','--check'],{cwd:repo});

 const staging=join(temp,'staging'),nativeStage=join(staging,'native'),wasmStage=join(staging,'wasm');
 await copySurface(join(repo,'bindings/core/node'),nativeStage,'node');
 for(const entry of await readdir(nativeStage))if(entry.endsWith('.node'))await rm(join(nativeStage,entry),{force:true});
 await cp(join(sdk,'dist/umf_core_node.node'),join(nativeStage,'umf_core_node.node'));
 await copySurface(join(repo,'bindings/core/wasm'),wasmStage,'wasm');
 const wasmGluePath=join(sdk,'dist/umf_core_wasm.js');
 assert.match(await readFile(wasmGluePath,'utf8'),/executeCoreBit128FieldRequestWire/,'archive-pinned WASM glue omits the Bit128 Field request export');
 for(const name of ['umf_core_wasm.js','umf_core_wasm.d.ts'])await cp(join(sdk,'dist',name),join(wasmStage,'pkg',name));
 await cp(join(sdk,'dist/umf_core_wasm_bg.wasm'),join(wasmStage,'pkg/umf_core_wasm_bg.wasm'));
 const sourceAfterStage=await digestInputs(sdkManifest.sourceClosure.inputs);
 assert.equal(sourceAfterStage,sdkManifest.sourceClosure.sha256,'source changed while preparing installed opt-in packages');
 const npmCache=join(temp,'npm-cache'),packDir=join(privateDir,'packages');await mkdir(packDir,{recursive:true});
 const packNative=JSON.parse(run('npm',['--cache',npmCache,'pack','--ignore-scripts','--pack-destination',packDir,'--json'],{cwd:nativeStage}))[0];
 const packWasm=JSON.parse(run('npm',['--cache',npmCache,'pack','--ignore-scripts','--pack-destination',packDir,'--json'],{cwd:wasmStage}))[0];
 const nativeTgz=join(packDir,packNative.filename),wasmTgz=join(packDir,packWasm.filename);
 const nativeTgzSha=await shaFile(nativeTgz),wasmTgzSha=await shaFile(wasmTgz);
 const installs=join(temp,'installs');await mkdir(installs,{recursive:true});
 const installNative=join(installs,'native'),installWasm=join(installs,'wasm');
 for(const [prefix,tarball] of [[installNative,nativeTgz],[installWasm,wasmTgz]]){
  await mkdir(prefix,{recursive:true});run('npm',['--cache',npmCache,'install','--offline','--ignore-scripts','--no-audit','--no-fund','--prefix',prefix,tarball]);
 }
 const nativePackage=join(installNative,'node_modules/@umf/core-rust-native');
 const wasmPackage=join(installWasm,'node_modules/@umf/core-rust-wasm');
 const nativeInstalledHashes=await hashDirectory(nativePackage),wasmInstalledHashes=await hashDirectory(wasmPackage);
 const nodeEntry=join(repo,'scripts/rust-migration/r8/bit128-field-installed-host.ts');
 const hostBundle=join(temp,'host-replay.mjs');
 const hostBuild=await Bun.build({entrypoints:[nodeEntry],outdir:temp,naming:'host-replay.mjs',target:'node',format:'esm'});
 if(!hostBuild.success)throw new Error(hostBuild.logs.map(item=>item.message).join('\n'));
 const hostBundleSha256=await shaFile(hostBundle),hostRuns=[];
 for(const runtime of ['node','bun']){
  const env={...process.env,UMF_BIT128_REPOSITORY:repo,UMF_BIT128_NATIVE_PACKAGE:nativePackage,UMF_BIT128_SDK_PACKAGE:sdk,UMF_BIT128_RUNTIME:runtime==='node'?process.env.NODE_VERSION??run('node',['--version']).trim():`Bun ${Bun.version}`};
  const stdout=run(runtime==='node'?'node':'bun',[hostBundle],{cwd:repo,env});
  const result=JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(result.status,'passed');assert.equal(result.frozenCases,11);assert(result.rawHostProxyOrderParity&&result.originalProxyExceptionIdentity&&result.bindingErrorBranded&&result.publicUmfErrorIdentity&&result.unrelatedExceptionIdentity);
  hostRuns.push({runtime:result.runtime,result,stdoutSha256:sha(Buffer.from(stdout))});
 }

 const nativeControls=[];
 for(const runtime of ['node','bun'])for(const mode of ['missing','corrupt']){
  const controlRoot=join(temp,`native-control-${runtime}-${mode}`),controlPackage=join(controlRoot,'node_modules/@umf/core-rust-native');
  await mkdir(dirname(controlPackage),{recursive:true});await cp(nativePackage,controlPackage,{recursive:true});
  const addon=join(controlPackage,'umf_core_node.node');
  if(mode==='missing')await rm(addon);else await writeFile(addon,Buffer.from([0,1,2,3]));
  const entry=join(controlPackage,'index.js');
  const source=`try{await import(${JSON.stringify(pathToFileURL(entry).href)}+${JSON.stringify(`?${runtime}-${mode}`)});throw Error('unexpected native binding load success')}catch(error){if(String(error?.message??error).includes('unexpected native binding load success'))throw error;const text=String(error?.message??error);if(!text.includes('umf_core_node.node'))throw error;console.log(JSON.stringify({status:'refused',mode:${JSON.stringify(mode)},detail:text.slice(0,240)}))}`;
  const stdout=run(runtime==='node'?'node':'bun',['--input-type=module','-e',source],{cwd:repo});const result=JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(result.status,'refused');nativeControls.push({runtime,mode,refused:true,error:result.detail});
 }

 const browserEntry=join(repo,'scripts/rust-migration/r8/bit128-field-installed-browser.ts'),browserBundle=join(temp,'browser-replay.js');
 const browserBuild=await Bun.build({entrypoints:[browserEntry],outdir:temp,naming:'browser-replay.js',target:'browser',format:'esm'});
 if(!browserBuild.success)throw new Error(browserBuild.logs.map(item=>item.message).join('\n'));
 const browserBundleSha256=await shaFile(browserBundle);
 const requests=[],externalRequests=[],pageErrors=[];
 server=createServer(async(req,res)=>{
  const pathname=new URL(req.url??'/', 'http://127.0.0.1').pathname;
  if(pathname==='/index.html'){
   const packet=await json(join(repo,'docs/helix/04-build/evidence/rust-migration/r8-bit128-field-candidate-20261028/frozen-typescript.json'));
   const resources={};for(const [key,path] of Object.entries({coreSchema:'dist/spec/core/schema.json',referenceSchema:'dist/spec/core/semantic-type-reference.schema.json',packageSchema:'dist/spec/core/extension-package.schema.json',constraints:'dist/spec/metamodel/generated/core-constraints.json',domainPolicy:'dist/spec/metamodel/generated/domain-policy.json'}))resources[key]=await json(join(sdk,path));
   const config={packet,resources,wasmEntry:'/candidate/index.js',missingEntry:'/missing/index.js',corruptEntry:'/corrupt/index.js'};
   res.setHeader('content-type','text/html');res.end(`<!doctype html><meta charset="utf-8"><script>window.__bit128=${JSON.stringify(config).replaceAll('<','\\u003c')}</script><script type="module" src="/browser-replay.js"></script><script type="module">window.__bit128Done=window.runInstalledBit128Field(window.__bit128).then(x=>window.__bit128Result=x).catch(e=>window.__bit128Failure=String(e.stack||e))</script>`);return;
  }
  if(pathname==='/browser-replay.js'){res.setHeader('content-type','text/javascript');res.end(await readFile(browserBundle));return;}
  const match=/^\/(candidate|missing|corrupt)\/(.*)$/.exec(pathname);
  if(!match){res.writeHead(404);res.end();return;}
  const [,mode,relativePath]=match;requests.push(pathname);
  if(mode==='missing'&&relativePath==='pkg/umf_core_wasm_bg.wasm'){res.writeHead(404);res.end('missing wasm test asset');return;}
  if(mode==='corrupt'&&relativePath==='pkg/umf_core_wasm_bg.wasm'){res.setHeader('content-type','application/wasm');res.end(Buffer.from([0,1,2,3]));return;}
  const target=resolve(wasmPackage,relativePath);
  if(!target.startsWith(wasmPackage+sep)){res.writeHead(400);res.end();return;}
  try{const bytes=await readFile(target);res.setHeader('content-type',relativePath.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(bytes)}catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen)});
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(error.stack??error.message));page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:'))externalRequests.push(request.url())});
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForFunction(()=>Boolean(window.__bit128Result||window.__bit128Failure),undefined,{timeout:120_000});
 const browserResult=await page.evaluate(()=>({result:window.__bit128Result,failure:window.__bit128Failure,userAgent:navigator.userAgent}));
 assert.deepEqual(pageErrors,[]);assert.equal(browserResult.failure,undefined);
 const observed=browserResult.result;
 assert.equal(observed.status,'passed');assert.equal(observed.frozenCases,11);assert(observed.rawHostProxyOrderParity&&observed.originalProxyExceptionIdentity&&observed.bindingErrorBranded&&observed.publicUmfErrorIdentity&&observed.unrelatedExceptionIdentity&&observed.missingWasmRefused&&observed.corruptWasmRefused&&observed.nodeGlobalsAbsent);
 assert(requests.includes('/candidate/pkg/umf_core_wasm_bg.wasm'));
 assert(requests.includes('/missing/pkg/umf_core_wasm_bg.wasm'));
 assert(requests.includes('/corrupt/pkg/umf_core_wasm_bg.wasm'));
 assert.equal(externalRequests.length,0,'browser candidate made requests outside the local package server');
 const sourceAfterReplay=await digestInputs(sdkManifest.sourceClosure.inputs);
 assert.equal(sourceAfterReplay,sdkManifest.sourceClosure.sha256,'source changed during installed package replay');

 const receipt={format:'umf.r8.bit128-field-installed-opt-in/1',status:'passed',route:'explicit @umf/core-rust-native and @umf/core-rust-wasm package surfaces; no V4 root selection',archive:{path:archive,sha256:archiveSha256,memberCount:listing.length,manifestSha256:await shaFile(join(sdk,'manifest.json')),verifiedAssets:Object.fromEntries(['dist/umf_core_node.node','dist/umf_core_wasm.js','dist/umf_core_wasm.d.ts','dist/umf_core_wasm_bg.wasm','dist/spec/core/schema.json','dist/spec/core/semantic-type-reference.schema.json','dist/spec/core/extension-package.schema.json','dist/spec/metamodel/generated/core-constraints.json','dist/spec/metamodel/generated/domain-policy.json'].map(name=>[name,archiveAssets[name]]))},sourceClosure:{sha256:sdkManifest.sourceClosure.sha256,capturedLiveSha256:sdkManifest.sourceClosure.capturedLiveSha256,fileCount:sdkManifest.sourceClosure.fileCount,transform:sdkManifest.sourceClosure.transform,verifiedCurrentBeforeAndAfter:true},predecessor:{path:'docs/helix/04-build/evidence/rust-migration/r8-bit128-field-candidate-20261028/frozen-typescript.json',sha256:await shaFile(join(repo,'docs/helix/04-build/evidence/rust-migration/r8-bit128-field-candidate-20261028/frozen-typescript.json')),cases:11},packages:{native:{name:packNative.name,version:packNative.version,tarball:nativeTgz,sha256:nativeTgzSha,files:nativeInstalledHashes},wasm:{name:packWasm.name,version:packWasm.version,tarball:wasmTgz,sha256:wasmTgzSha,files:wasmInstalledHashes}},assets:{nativeAddonSha256:await shaFile(join(nativePackage,'umf_core_node.node')),wasmBinarySha256:await shaFile(join(wasmPackage,'pkg/umf_core_wasm_bg.wasm')),wasmGlueSha256:await shaFile(join(wasmPackage,'pkg/umf_core_wasm.js')),wasmTypesSha256:await shaFile(join(wasmPackage,'pkg/umf_core_wasm.d.ts')),wasmBindgenVersion:sdkManifest.toolchain.wasmBindgen,nodeEntrySha256:await shaFile(join(nativePackage,'index.js')),wasmEntrySha256:await shaFile(join(wasmPackage,'index.js'))},hosts:{nodeAndBun:hostRuns,browser:{runtime:browserResult.userAgent,result:observed,requests,externalRequests}},controls:{native:nativeControls,missingWasmRefused:observed.missingWasmRefused,corruptWasmRefused:observed.corruptWasmRefused},harness:{orchestratorPath:'scripts/rust-migration/r8/bit128-field-installed.mjs',orchestratorSha256:await shaFile(fileURLToPath(import.meta.url)),nodePath:'scripts/rust-migration/r8/bit128-field-installed-host.ts',nodeSourceSha256:await shaFile(join(repo,'scripts/rust-migration/r8/bit128-field-installed-host.ts')),nodeBundleSha256:hostBundleSha256,browserPath:'scripts/rust-migration/r8/bit128-field-installed-browser.ts',browserSourceSha256:await shaFile(join(repo,'scripts/rust-migration/r8/bit128-field-installed-browser.ts')),browserBundleSha256},limits:'Private Darwin arm64 opt-in package evidence for this exact source snapshot and current core 0.10.0 resource set. No default route selection, retirement, Linux qualification, or release claim.'};
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 await writeFile(join(output,'packages.json'),JSON.stringify({native:{path:nativeTgz,sha256:nativeTgzSha},wasm:{path:wasmTgz,sha256:wasmTgzSha},sdk:{path:archive,sha256:archiveSha256}},null,2)+'\n');
 console.log(JSON.stringify(receipt));
}finally{
 await browser?.close();server?.close();await rm(temp,{recursive:true,force:true});
}
