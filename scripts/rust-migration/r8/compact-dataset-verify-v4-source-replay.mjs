// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-level V4 default/reference replay for compact Dataset verification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(import.meta.dirname,'../../..');
const packetDir='docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source';
const pinnedToolchain='/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const pinnedBindgen='/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFile(join(repo,path));
const digest=async path=>sha(await readFile(path));
const run=async(command,args,env={})=>{
  const child=Bun.spawn([command,...args],{cwd:repo,env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
  const code=await child.exited;if(code!==0)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return stdout.trim();
};
const closureDigest=entries=>sha(Buffer.from(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>`${path}\0${value}\0`).join('')));
const sourcePaths=[
  'src/index.ts','src/index-node-v4.ts','src/index-browser-v4.ts','src/index-v4-default.ts',
  'src/access/rust-dataset-values-compact-default.ts','src/model/dataset-values-compact.ts',
  'src/model/internal/value-context.ts','src/model/internal/schema-work.ts','src/model/dataset-values.ts',
  'src/validation/schema.ts','src/validation/internal-schema.ts',
  'bindings/core/node/index.js','bindings/core/node/src/dataset-values-compact.js','bindings/core/node/src/wire.js',
  'bindings/core/wasm/index.js','bindings/core/wasm/src/dataset-values-compact.js','bindings/core/wasm/src/wire.js',
  'crates/umf-core/src/dataset_values.rs','crates/umf-core-wire/src/lib.rs',
  'crates/umf-tagged-wire/src/lib.rs',
  'crates/umf-core/tests/r5_dataset_values_compact.rs','tests/core-dataset-compact.test.ts',
  'tests/dataset-values-compact-visitation.test.ts','tests/access-rust-dataset-values-compact-default.test.ts',
  'scripts/rust-migration/r5/freeze-dataset-values-compact-verify.ts',
  'scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs',
  'docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md',
  'docs/helix/02-design/contracts/CONTRACT-056-core-dataset-compact.md',
  'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover/README.md',
  `${packetDir}/index.json`,
  ...['commerce-complete','stale-source-input-canonical-skipped','stale-source-expected-input-copy-limit','near-limit-accepted','near-limit-first-refused'].map(name=>`${packetDir}/frozen-${name}.json`),
];
// Pin complete implementation roots rather than a curated list of entry files:
// Rust modules are often reached with `mod`/`use`, and the Node/WASM bindings
// and generated TypeScript roots can change behavior through transitive files.
// The committed generated source under src/spec remains included; build caches
// and vendored dependency trees do not.
const closureRoots=['src','crates','bindings/core/node','bindings/core/wasm','spec','.cargo'];
const closureExtensions=new Set(['.rs','.toml','.ts','.tsx','.js','.mjs','.json','.jsonc','.yaml','.yml','.lock','.c','.h','.cc','.cpp','.proto','.fbs']);
const excludedDirectories=new Set(['.git','node_modules','target','pkg','.cache','coverage']);
async function walkSourceRoot(relative){
  const absolute=join(repo,relative),entries=await readdir(absolute,{withFileTypes:true}),paths=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    const child=`${relative}/${entry.name}`;
    if(entry.isDirectory()){if(!excludedDirectories.has(entry.name))paths.push(...await walkSourceRoot(child));}
    else if(entry.isSymbolicLink())throw new Error(`source closure contains a symlink: ${child}`);
    else if(entry.isFile()&&closureExtensions.has(extname(entry.name)))paths.push(child);
  }
  return paths;
}
const sourcePathsForClosure=async()=>{
  const rootFiles=['Cargo.toml','Cargo.lock','rust-toolchain.toml','package.json','bun.lock','bunfig.toml','tsconfig.json','tsconfig.tools.json','build.config.ts','build.config.js'];
  const rootFilesPresent=(await Promise.all(rootFiles.map(async path=>{try{await readFile(join(repo,path));return path}catch(error){if(error?.code==='ENOENT')return null;throw error}}))).filter(Boolean);
  return [...new Set([...sourcePaths,...await Promise.all(closureRoots.map(walkSourceRoot)).then(groups=>groups.flat()),...rootFilesPresent])].sort((a,b)=>a.localeCompare(b));
};
const pins=async()=>{
  const paths=await sourcePathsForClosure();
  return Object.fromEntries(await Promise.all(paths.map(async path=>[path,await digest(join(repo,path))])));
};
const artifactPaths={
  nodeAddon:'umf_core_node.node',
  wasm:'umf_core_wasm_bg.wasm',
  wasmGlue:'wasm/umf_core_wasm.js',
  referenceBundle:'umf.js',
  nodeBundle:'umf-node.js',
  browserBundle:'umf-browser.js',
};
const buildManifestName='compact-dataset-verify-build-manifest.json';
const buildManifestFormat='umf.r8.compact-dataset-verify-build/1';
function requireSourceMatch(expected,current){
  if(expected.sha256!==current.sha256||canonical(expected.files)!==canonical(current.files))throw new Error('STALE_SOURCE: current source closure differs from --build manifest');
}
function requireArtifactMatch(expected,current){
  for(const [name,path] of Object.entries(artifactPaths))if(expected[name]?.path!==path||expected[name]?.sha256!==current[name])throw new Error(`STALE_ARTIFACT: ${name} differs from --build manifest`);
}
function assertStaleBuildControls(source,artifacts){
  const transitive='crates/umf-core/src/context.rs';
  assert(Object.hasOwn(source.files,transitive),`transitive negative-control input missing: ${transitive}`);
  const staleSource={...source,files:{...source.files,[transitive]:'0'.repeat(64)}};
  assert.throws(()=>requireSourceMatch(source,staleSource),/STALE_SOURCE/,'stale source negative control');
  const driftedBuild={sha256:closureDigest(staleSource.files),files:staleSource.files};
  assert.throws(()=>requireSourceMatch(source,driftedBuild),/STALE_SOURCE/,'build-time source drift negative control');
  const staleArtifacts={...artifacts,nodeAddon:'0'.repeat(64)};
  assert.throws(()=>requireArtifactMatch(artifacts,staleArtifacts),/STALE_ARTIFACT/,'stale artifact negative control');
}
async function inventoryArtifacts(dist){
  return Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async([name,path])=>[name,sha(await readFile(join(dist,path)))])));
}
async function verifyBuild(dist){
  const manifestPath=join(dist,buildManifestName),bytes=await readFile(manifestPath),manifest=JSON.parse(bytes);
  assert.equal(manifest.format,buildManifestFormat,'fresh --build manifest format');
  const currentFiles=await pins(),currentSource={sha256:closureDigest(currentFiles),files:currentFiles};
  requireSourceMatch(manifest.sourceClosure,currentSource);
  const artifacts=await inventoryArtifacts(dist);requireArtifactMatch(manifest.artifacts,artifacts);
  return{manifest,sha256:sha(bytes),artifacts};
}

async function loadPacket(){
  const index=JSON.parse(await read(`${packetDir}/index.json`));
  assert.equal(index.format,'r5-dataset-values-compact-verify-v1');
  for(const item of index.sourceClosure)assert.equal(await digest(join(repo,item.path)),item.sha256,`frozen predecessor drift: ${item.path}`);
  const cases={};
  for(const name of index.cases)cases[name]=JSON.parse(await read(`${packetDir}/frozen-${name}.json`));
  return{index,cases};
}

async function build(dist){
  await mkdir(dist,{recursive:true});
  const manifestPath=join(dist,buildManifestName);
  try{await readFile(manifestPath);throw new Error(`immutable build manifest already exists: ${manifestPath}; choose a fresh private output directory`)}catch(error){if(error?.code!=='ENOENT')throw error;}
  const buildSourceFiles=await pins(),buildSourceClosure={sha256:closureDigest(buildSourceFiles),files:buildSourceFiles};
  const cargoTarget=join(dist,'cargo-target'),wasmOut=join(dist,'wasm');
  const cargo=join(pinnedToolchain,'cargo'),env={CARGO_TARGET_DIR:cargoTarget,RUSTC:join(pinnedToolchain,'rustc'),CARGO_BUILD_JOBS:'2',CARGO_INCREMENTAL:'0'};
  await run(cargo,['build','--locked','--offline','--release','--manifest-path','bindings/core/node/Cargo.toml'],env);
  await run(cargo,['build','--locked','--offline','--release','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],env);
  const bindgenVersion=await run(pinnedBindgen,['--version']);assert.equal(bindgenVersion,'wasm-bindgen 0.2.100');
  await mkdir(wasmOut,{recursive:true});
  await run(pinnedBindgen,['--target','web','--out-dir',wasmOut,'--out-name','umf_core_wasm',join(cargoTarget,'wasm32-unknown-unknown/release/umf_core_wasm.wasm')]);
  await Bun.$`cp ${join(cargoTarget,'release/libumf_core_node.dylib')} ${join(dist,'umf_core_node.node')}`.quiet();
  await Bun.$`cp ${join(wasmOut,'umf_core_wasm_bg.wasm')} ${join(dist,'umf_core_wasm_bg.wasm')}`.quiet();
  const imports=new Set(),wasmPlugin={name:'compact-verify-fresh-wasm',setup(builder){builder.onResolve({filter:/umf_core_wasm\.js$/},args=>{
    if(args.importer.endsWith('bindings/core/wasm/index.js')&&args.path==='./pkg/umf_core_wasm.js'){imports.add('wasm-index');return{path:join(wasmOut,'umf_core_wasm.js')};}
    if(args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js'){imports.add('browser-root');return{path:join(wasmOut,'umf_core_wasm.js')};}
    return undefined;
  });}};
  for(const [entry,name,target,plugins] of [
    ['src/index.ts','umf.js','browser',[]],
    ['src/index-node-v4.ts','umf-node.js','node',[]],
    ['src/index-browser-v4.ts','umf-browser.js','browser',[wasmPlugin]],
  ]){
    const result=await Bun.build({entrypoints:[entry],outdir:dist,naming:name,target,format:'esm',plugins});
    if(!result.success)throw new Error(`${entry} build failed:\n${result.logs.map(item=>item.message).join('\n')}`);
  }
  assert(imports.has('wasm-index')&&imports.has('browser-root'),'source roots did not use fresh WASM glue');
  const sourceHashes=await pins(),sourceClosure={sha256:closureDigest(sourceHashes),files:sourceHashes};
  requireSourceMatch(buildSourceClosure,sourceClosure);
  const artifacts=Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async([name,path])=>[name,{path,sha256:await digest(join(dist,path))}])));
  const manifest={format:buildManifestFormat,sourceClosure,artifacts,toolchain:{rustc:await run(join(pinnedToolchain,'rustc'),['--version']),cargo:await run(cargo,['--version']),wasmBindgen:bindgenVersion,bun:Bun.version},builtAt:new Date().toISOString()};
  await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{flag:'wx'});
  return{...manifest,manifestPath,manifestSha256:await digest(manifestPath)};
}

const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value!==null&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const negativeControlFiles=await pins();
assertStaleBuildControls({sha256:closureDigest(negativeControlFiles),files:negativeControlFiles},Object.fromEntries(Object.entries(artifactPaths).map(([name,path])=>[name,{path,sha256:'1'}])));
const failure=error=>({code:error?.code??'',message:String(error?.message??error),path:error?.path??''});
const capture=fn=>{try{return{kind:'return',value:fn()};}catch(error){return{kind:'throw',failure:failure(error),name:error?.name??''};}};
function assertFrozen(actual,frozen,label){
  if(frozen.result!==undefined){assert.equal(actual.kind,'return',`${label}: expected result`);assert.equal(canonical(actual.value),canonical(frozen.result),`${label}: full result`);}
  else {assert.equal(actual.kind,'throw',`${label}: expected refusal`);assert.deepEqual(actual.failure,frozen.thrown,`${label}: exact refusal`);assert.equal(actual.name,'UmfError',`${label}: public error class`);}
}
function makeTraced(proxyLabel,trace,target={}){
  return new Proxy(target,{ownKeys(value){trace.push(proxyLabel);return Reflect.ownKeys(value);}});
}
function hostControls(api,frozen){
  const malformedTrace=[],malformedExpected=makeTraced('expectedInput',malformedTrace,frozen.input),malformedCurrent=makeTraced('current',malformedTrace,{});
  const malformed=capture(()=>api.verifyCoreDatasetValuesCompact({},malformedCurrent,malformedExpected));
  assert.equal(malformed.kind,'throw');assert.equal(malformed.failure.code,'CORE_DATASET_COMPACT_RECEIPT');assert.deepEqual(malformedTrace,[],'malformed receipt must refuse before later argument traversal');
  const orderTrace=[],staleCurrent=makeTraced('current',orderTrace,{}),expectedInput=makeTraced('expectedInput',orderTrace,frozen.input);
  const stale=capture(()=>api.verifyCoreDatasetValuesCompact(frozen.receipt,staleCurrent,expectedInput));
  assert.equal(stale.kind,'throw');assert.equal(stale.failure.code,'CORE_DATASET_COMPACT_RECEIPT');
  const firstExpected=orderTrace.indexOf('expectedInput'),lastCurrent=orderTrace.lastIndexOf('current');
  assert(firstExpected>=0&&lastCurrent>=0&&lastCurrent<firstExpected,'current must be copied completely before expectedInput');
  const sentinel=new Error('caller proxy ownKeys sentinel'),throwingCurrent=new Proxy({}, {ownKeys(){throw sentinel;}});
  let caught;try{api.verifyCoreDatasetValuesCompact(frozen.receipt,throwingCurrent,frozen.input);}catch(error){caught=error;}
  assert.equal(caught,sentinel,'caller proxy error identity must survive the Rust route');
  return{malformedReceipt:{trace:malformedTrace,failure:malformed.failure},staleSource:{trace:orderTrace,failure:stale.failure},callerProxyErrorIdentity:true};
}

async function replayNode(host,dist,packet,out){
  const reference=await import(pathToFileURL(join(dist,'umf.js')).href);
  const require=createRequire(pathToFileURL(join(dist,'umf-node.js'))),addon=require('./umf_core_node.node');
  const original=addon.executeRequestWire;assert.equal(typeof original,'function');let rustCalls=0;
  addon.executeRequestWire=function(...args){rustCalls++;return Reflect.apply(original,this,args);};
  const root=await import(pathToFileURL(join(dist,'umf-node.js')).href);
  assert.equal(typeof root.verifyCoreDatasetValuesCompact,'function');assert.equal(typeof reference.verifyCoreDatasetValuesCompact,'function');
  const rows=[];
  for(const [id,frozen] of Object.entries(packet.cases)){
    const ref=capture(()=>reference.verifyCoreDatasetValuesCompact(frozen.receipt,frozen.current,frozen.expectedInput));assertFrozen(ref,frozen,`${host} reference ${id}`);
    const before=rustCalls,actual=capture(()=>root.verifyCoreDatasetValuesCompact(frozen.receipt,frozen.current,frozen.expectedInput));assertFrozen(actual,frozen,`${host} default ${id}`);
    const delta=rustCalls-before;assert(delta>0,`${host} default did not dispatch Rust for ${id}`);
    rows.push({id,reference:ref,default:actual,rustCalls:delta});
  }
  const controls=hostControls(root,packet.cases['commerce-complete']);
  const referenceControls=hostControls(reference,packet.cases['commerce-complete']);
  assert.equal(controls.malformedReceipt.failure.code,referenceControls.malformedReceipt.failure.code);
  assert.deepEqual(controls.malformedReceipt.trace,[]);assert.deepEqual(referenceControls.malformedReceipt.trace,[]);
  assert.equal(controls.staleSource.failure.code,referenceControls.staleSource.failure.code);
  assert(controls.staleSource.trace.lastIndexOf('current')<controls.staleSource.trace.indexOf('expectedInput'));
  assert(referenceControls.staleSource.trace.lastIndexOf('current')<referenceControls.staleSource.trace.indexOf('expectedInput'));
  return{host,runtime:host==='bun'?`Bun ${Bun.version}`:process.version,rows,hostControls:controls,nodeGlobalsAbsent:undefined,rustCalls};
}

async function replayBrowser(dist,packet,out){
  const fixture=JSON.stringify(packet);
  const bootstrap=`window.__wasmCalls=[];const wrap=instance=>({exports:Object.fromEntries(Object.entries(instance.exports).map(([name,value])=>[name,typeof value==='function'?function(...args){window.__wasmCalls.push(String(name));return Reflect.apply(value,instance.exports,args)}:value]))});for(const method of ['instantiate','instantiateStreaming']){const original=WebAssembly[method];if(typeof original!=='function')continue;WebAssembly[method]=async function(...args){const result=await Reflect.apply(original,this,args);return result&&result.instance?{...result,instance:wrap(result.instance)}:wrap(result)}};`;
  const probe=`import * as root from '/umf-browser.js';import * as reference from '/umf.js';
const packet=await(await fetch('/packet.json')).json();
const canon=value=>Array.isArray(value)?'['+value.map(canon).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canon(value[key])).join(',')+'}':JSON.stringify(value);
const failure=error=>({code:error?.code??'',message:String(error?.message??error),path:error?.path??''});
const capture=fn=>{try{return{kind:'return',value:fn()}}catch(error){return{kind:'throw',failure:failure(error),name:error?.name??''}}};
const assertFrozen=(actual,frozen,label)=>{if(frozen.result!==undefined){if(actual.kind!=='return'||canon(actual.value)!==canon(frozen.result))throw Error(label+': result mismatch')}else if(actual.kind!=='throw'||canon(actual.failure)!==canon(frozen.thrown)||actual.name!=='UmfError')throw Error(label+': refusal mismatch '+canon(actual))};
const rows=[];for(const [id,frozen] of Object.entries(packet.cases)){const ref=capture(()=>reference.verifyCoreDatasetValuesCompact(frozen.receipt,frozen.current,frozen.expectedInput));assertFrozen(ref,frozen,'reference '+id);const before=window.__wasmCalls.filter(name=>name==='executeRequestWire').length;const actual=capture(()=>root.verifyCoreDatasetValuesCompact(frozen.receipt,frozen.current,frozen.expectedInput));assertFrozen(actual,frozen,'default '+id);const delta=window.__wasmCalls.filter(name=>name==='executeRequestWire').length-before;if(delta<1)throw Error('no WASM dispatch '+id);rows.push({id,reference:ref,default:actual,wasmCalls:delta})}
const base=packet.cases['commerce-complete'];
const controls=api=>{const proxy=(trace,label,target={})=>new Proxy(target,{ownKeys(value){trace.push(label);return Reflect.ownKeys(value)}}),trace=[],malformed=capture(()=>api.verifyCoreDatasetValuesCompact({},proxy(trace,'current'),proxy(trace,'expectedInput',base.current)));if(malformed.kind!=='throw'||malformed.failure.code!=='CORE_DATASET_COMPACT_RECEIPT'||trace.length)throw Error('malformed receipt touched later args');const order=[],stale=capture(()=>api.verifyCoreDatasetValuesCompact(base.receipt,proxy(order,'current',{}),proxy(order,'expectedInput',base.current)));if(stale.kind!=='throw'||stale.failure.code!=='CORE_DATASET_COMPACT_RECEIPT')throw Error('stale current was accepted');const firstExpected=order.indexOf('expectedInput'),lastCurrent=order.lastIndexOf('current');if(firstExpected<0||lastCurrent<0||lastCurrent>=firstExpected)throw Error('current/expectedInput host order changed');const sentinel=new Error('caller proxy ownKeys sentinel');let caught;try{api.verifyCoreDatasetValuesCompact(base.receipt,new Proxy({}, {ownKeys(){throw sentinel}}),base.current)}catch(error){caught=error}if(caught!==sentinel)throw Error('caller proxy error identity changed');return{malformedReceipt:{trace:[],failure:malformed.failure},staleSource:{trace:order,failure:stale.failure},callerProxyErrorIdentity:true}};
const rootControls=controls(root),referenceControls=controls(reference);if(canon(rootControls.malformedReceipt.failure)!==canon(referenceControls.malformedReceipt.failure)||canon(rootControls.staleSource.failure)!==canon(referenceControls.staleSource.failure))throw Error('host refusal differs from TypeScript reference');
if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');window.__compactVerifyProbe={rows,controls:rootControls,referenceControls,nodeGlobalsAbsent:true,wasmCalls:window.__wasmCalls};`;
  const html=`<!doctype html><meta charset="utf-8"><script>${bootstrap}</script><script type="module" src="/probe.js"></script>`;
  const requests=[],server=createServer(async(req,res)=>{const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;if(pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(pathname==='/packet.json'){res.writeHead(200,{'content-type':'application/json'});res.end(fixture);return}if(pathname==='/probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(probe);return}requests.push(pathname);try{const bytes=await readFile(join(dist,pathname.slice(1)));res.writeHead(200,{'content-type':extname(pathname)==='.wasm'?'application/wasm':extname(pathname)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('missing')}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');let browser;
  try{browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto(`http://127.0.0.1:${address.port}/`);let result;for(let i=0;i<120;i++){result=await page.evaluate(()=>window.__compactVerifyProbe??null);if(result||errors.length)break;await page.waitForTimeout(500)}assert.deepEqual(errors,[]);assert(result,'Chromium source replay did not finish');assert(result.nodeGlobalsAbsent);assert(requests.some(path=>path.endsWith('.wasm')),'Chromium did not fetch real WASM');return{host:'chromium',runtime:await page.evaluate(()=>navigator.userAgent),rows:result.rows,hostControls:result.controls,nodeGlobalsAbsent:result.nodeGlobalsAbsent,wasmCalls:result.wasmCalls,wasmRequested:true,browserVersion:browser.version()};}
  finally{await browser?.close();await new Promise(done=>server.close(done));}
}

const [mode,arg1,arg2,arg3]=process.argv.slice(2);
if(mode==='--build'){const result=await build(resolve(arg1));console.log(JSON.stringify(result,null,2));}
else if(mode==='--host'||mode==='--browser'){
  const host=mode==='--host'?arg1:'chromium',dist=resolve(mode==='--host'?arg2:arg1),out=resolve(mode==='--host'?arg3:arg2);
  const buildBinding=await verifyBuild(dist),packet=await loadPacket();
  const result=mode==='--host'?await replayNode(host,dist,packet,out):await replayBrowser(dist,packet,out);
  const sourceHashes=await pins();
  const receipt={format:'umf-r8-compact-dataset-verify-v4-source-replay/2',status:'pass',route:{default:'source-built V4 Rust Node/WASM root',reference:'source-built TypeScript root'},host:result.host,runtime:result.runtime,buildBinding:{manifest:`${dist}/${buildManifestName}`,sha256:buildBinding.sha256,sourceClosureSha256:buildBinding.manifest.sourceClosure.sha256,artifacts:buildBinding.manifest.artifacts},sourceClosure:{sha256:closureDigest(sourceHashes),files:sourceHashes},frozenPredecessor:{path:`${packetDir}/index.json`,sha256:sha(await read(`${packetDir}/index.json`)),oracle:'frozen live TypeScript verifyCompactWithWork outputs/errors'},fixtureCases:result.rows.length,rows:result.rows,hostControls:result.hostControls,rustCalls:result.rustCalls??undefined,wasmCalls:result.wasmCalls??undefined,nodeGlobalsAbsent:result.nodeGlobalsAbsent??undefined,wasmRequested:result.wasmRequested??undefined,limitations:['Source and exact compiled artifacts are bound to the immutable --build manifest before replay; this is not installed SDK archive or release qualification.','Covers the frozen verifier packet and stated host admission controls only; no declaration retirement or full compact Dataset family claim.']};
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,`${JSON.stringify(receipt,null,2)}\n`);console.log(JSON.stringify({status:receipt.status,host:result.host,cases:result.rows.length,rustCalls:receipt.rustCalls??null,wasmCalls:receipt.wasmCalls??null,receipt:out},null,2));
}else throw new Error('usage: --build <dist> | --host <node|bun> <dist> <receipt.json> | --browser <dist> <receipt.json>');
