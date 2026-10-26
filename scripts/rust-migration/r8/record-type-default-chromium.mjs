// SPDX-License-Identifier: MIT OR Apache-2.0
// Rebuild the live V4 browser source route and compare it in real Chromium to
// the immutable R5 Record Type predecessor packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {extname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const toolchain=process.env.UMF_RUST_TOOLCHAIN??'/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen=process.env.UMF_WASM_BINDGEN??'/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const output=resolve(process.argv[2]??join(root,'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/record-type-default-chromium.json'));
const temp=join('/private/tmp',`umf-r8-record-type-default-chromium-${process.pid}-${Date.now()}`);
const cargoTarget='/private/tmp/umf-r8-record-type-default-chromium-cargo',wasmOut=join(temp,'wasm-bindgen'),browserOut=join(temp,'browser');
const frozenPath='docs/helix/04-build/evidence/rust-migration/r5-core-record-type/frozen-typescript.json';
const resourcePaths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const run=async(command,args,options={})=>{
 const child=Bun.spawn([command,...args],{cwd:options.cwd??root,env:{...process.env,...options.env},stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;if(code!==0)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
 return {stdout:stdout.trim(),stderr:stderr.trim()};
};
const filesUnder=async(dir)=>{
 const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())out.push(...await filesUnder(path));else if(item.isFile())out.push(path);}return out;
};
let browser,server;
try{
 await mkdir(wasmOut,{recursive:true});await mkdir(browserOut,{recursive:true});
 const frozenBytes=await readFile(join(root,frozenPath));const frozen=JSON.parse(frozenBytes);
 assert.equal(frozen.format,'umf-r5-core-record-type-predecessor/1');
 assert.equal(sha(frozenBytes),'c4e49ee65d25abb8b7f68a189dc809ca444b6e4960cf4c4d15cfaa33560225d5','frozen predecessor packet drift');
 assert.equal(Object.keys(frozen.successes).filter(key=>key.startsWith('declare-')).length,3);
 await run(join(toolchain,'cargo'),['build','--locked','--offline','--release','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],{env:{CARGO_TARGET_DIR:cargoTarget,RUSTC:join(toolchain,'rustc')}});
 const version=await run(bindgen,['--version']);assert.equal(version.stdout,'wasm-bindgen 0.2.100');
 await run(bindgen,['--target','web','--out-dir',wasmOut,'--out-name','umf_core_wasm',join(cargoTarget,'wasm32-unknown-unknown/release/umf_core_wasm.wasm')]);
 const plugin={name:'r8-fresh-wasm-glue',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>args.path.endsWith('/pkg/umf_core_wasm.js')?{path:join(wasmOut,'umf_core_wasm.js')}:undefined);}};
 const built=await Bun.build({entrypoints:[join(root,'src/index-browser-v4.ts')],outdir:browserOut,naming:'browser-route.js',target:'browser',format:'esm',plugins:[plugin],metafile:true});
 if(!built.success)throw new Error(built.logs.map(x=>x.message).join('\n'));
 await copyFile(join(wasmOut,'umf_core_wasm_bg.wasm'),join(browserOut,'umf_core_wasm_bg.wasm'));
 const bundle=join(browserOut,'browser-route.js'),wasm=join(browserOut,'umf_core_wasm_bg.wasm');
 const browserProbe=`const packet=await(await fetch('/frozen.json')).json();const canonical=${canonical.toString()};const operations=[];for(const variant of ['nested','recursive','qualified']){const declaration=packet.successes['declare-'+variant];const declared=api.declareCoreRecordType(declaration.fieldAuthor,declaration.recordAuthor);if(canonical(declared)!==canonical(declaration))throw new Error('declare '+variant+' differs from frozen predecessor');const expected=packet.successes['verify-'+variant];const verified=api.verifyCoreRecordTypeDeclaration(declared,declared.target);if(canonical(verified)!==canonical(expected))throw new Error('verify '+variant+' differs from frozen predecessor');operations.push({case:variant,declare:'match',verify:'match'});}let currentTrapReads=0;const current=new Proxy(Object.create(null),{getPrototypeOf(){currentTrapReads++;return null;},ownKeys(){currentTrapReads++;return[];},getOwnPropertyDescriptor(){currentTrapReads++;return undefined;},get(){currentTrapReads++;return undefined;}});let malformed;try{api.verifyCoreRecordTypeDeclaration({},current);malformed={ok:true};}catch(error){malformed={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}malformed.currentReads=currentTrapReads;if(canonical(malformed)!==canonical(packet.refusals.malformedReceiptBeforeCurrent))throw new Error('malformed receipt refusal differs from frozen predecessor: '+canonical(malformed));if(currentTrapReads!==0)throw new Error('current Proxy was touched before malformed receipt refusal');if('process'in globalThis||'Buffer'in globalThis)throw new Error('Node global present in Chromium');window.recordTypeResult={operations,malformed,currentTrapReads,nodeGlobalsAbsent:true};`;
 const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'};
 const requests=[],pageRequests=[],pageErrors=[];
 server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){const path=new URL(request.url).pathname.slice(1);requests.push(path);if(path==='index.html')return new Response('<!doctype html><meta charset="utf-8"><script type="module">const api=await import("/browser-route.js");'+browserProbe+'</script>',{headers:{'content-type':'text/html'}});if(path==='frozen.json')return new Response(frozenBytes,{headers:{'content-type':'application/json'}});try{const full=join(browserOut,path);if(!full.startsWith(browserOut+sep))throw new Error('path');return new Response(await readFile(full),{headers:{'content-type':mime[extname(full)]??'application/octet-stream'}});}catch{return new Response('not found',{status:404});}}});
 browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const origin=`http://127.0.0.1:${server.port}`;const page=await browser.newPage();const browserLogs=[];page.on('pageerror',error=>pageErrors.push(String(error)));page.on('console',message=>browserLogs.push(`${message.type()}: ${message.text()}`));page.on('request',request=>pageRequests.push(request.url()));page.on('requestfailed',request=>browserLogs.push(`requestfailed: ${request.url()} ${request.failure()?.errorText??''}`));await page.goto(`${origin}/index.html`);try{await page.waitForFunction(()=>Boolean(window.recordTypeResult),undefined,{timeout:30000});}catch(error){throw new Error(`Chromium V4 route did not finish: ${error.message}; pageErrors=${JSON.stringify(pageErrors)}; browserLogs=${JSON.stringify(browserLogs)}; requests=${JSON.stringify(pageRequests)}`);}
 const observed=await page.evaluate(()=>({result:window.recordTypeResult,userAgent:navigator.userAgent}));const externalRequests=pageRequests.filter(url=>new URL(url).origin!==origin);assert.deepEqual(pageErrors,[]);assert(requests.includes('umf_core_wasm_bg.wasm'),'browser did not load freshly built WASM');assert.equal(externalRequests.length,0);assert.equal(observed.result.operations.length,3);assert.equal(observed.result.currentTrapReads,0);
 const rustSources=[...await filesUnder(join(root,'crates/umf-core/src')),...await filesUnder(join(root,'crates/umf-core-wire/src')),...await filesUnder(join(root,'bindings/core/wasm/src'))].filter(path=>path.endsWith('.rs'));
 const explicitSources=[join(root,'Cargo.lock'),join(root,'package.json'),join(root,'bun.lock'),join(root,'crates/umf-core/Cargo.toml'),join(root,'crates/umf-core-wire/Cargo.toml'),join(root,'bindings/core/wasm/Cargo.toml'),...rustSources,...Object.values(resourcePaths).map(path=>join(root,path)),join(root,frozenPath)];
 const metafileInputs=Object.keys(built.metafile?.inputs??{}).filter(path=>!path.startsWith('node:')).map(path=>resolve(path.startsWith('/')?path:join(root,path)));
 assert(metafileInputs.includes(join(wasmOut,'umf_core_wasm.js')),'bundle did not consume freshly generated wasm-bindgen glue');
 assert(!metafileInputs.includes(join(root,'bindings/core/wasm/pkg/umf_core_wasm.js')),'bundle consumed stale repository wasm-bindgen glue');
 const inputNames=metafileInputs.filter(path=>path===root||path.startsWith(root+sep));
 const sourceFiles=[...new Set([...inputNames,...explicitSources])].sort((a,b)=>a.localeCompare(b));
 const sourceInputs={};for(const path of sourceFiles)sourceInputs[relative(root,path).split(sep).join('/')]=sha(await readFile(path));
 sourceInputs['build-input:wasm-bindgen/umf_core_wasm.js']=sha(await readFile(join(wasmOut,'umf_core_wasm.js')));
 const sortedInputs=Object.fromEntries(Object.entries(sourceInputs).sort(([a],[b])=>a.localeCompare(b)));
 const sourceTree=createHash('sha256');for(const [path,digest] of Object.entries(sortedInputs)){sourceTree.update(path);sourceTree.update('\0');sourceTree.update(digest);sourceTree.update('\0');}
 const toolVersions={bun:Bun.version,rustc:(await run(join(toolchain,'rustc'),['--version'])).stdout,cargo:(await run(join(toolchain,'cargo'),['--version'])).stdout,wasmBindgen:version.stdout,chromium:browser.version()};
 const receipt={format:'umf.r8.record-type-default-chromium/1',status:'pass',reproduction:{command:'bun scripts/rust-migration/r8/record-type-default-chromium.mjs',environment:'UMF_RUST_TOOLCHAIN and UMF_WASM_BINDGEN may override the pinned local tool paths; UMF_CHROMIUM_PATH may select a Chromium executable. The run builds WASM offline, bundles the live V4 entry, serves loopback only, and writes this receipt.'},qualification:'Freshly rebuilt src/index-browser-v4.ts source route in real Chromium. Scope is three frozen Record Type declaration/verification cases and malformed-receipt-before-current Proxy admission only; no installed SDK, package default outside this V4 entry, native interpretation, complete parity, or release claim.',profile:'Core Record Type v6 receipt; frozen predecessor profile umf-r5-core-record-type-predecessor/1',route:{entry:'src/index-browser-v4.ts',exports:['declareCoreRecordType','verifyCoreRecordTypeDeclaration'],wasmRequested:requests.includes('umf_core_wasm_bg.wasm')},tools:toolVersions,predecessor:{path:frozenPath,sha256:sha(frozenBytes),caseNames:['nested','recursive','qualified'],sourceClosure:frozen.sourceClosureSha256,refusal:'malformedReceiptBeforeCurrent'},observations:{chromiumVersion:browser.version(),userAgent:observed.userAgent,caseResults:observed.result.operations,malformedReceipt:observed.result.malformed,currentProxyTrapReads:observed.result.currentTrapReads,nodeGlobalsAbsent:observed.result.nodeGlobalsAbsent,externalRequests:externalRequests.length,pageErrors:pageErrors.length},artifacts:{browserBundleSha256:sha(await readFile(bundle)),wasmSha256:sha(await readFile(wasm)),wasmBytes:(await stat(wasm)).size,generatedWasmGlueSha256:sha(await readFile(join(wasmOut,'umf_core_wasm.js')),),runnerSha256:sha(await readFile(fileURLToPath(import.meta.url)))},sourceClosure:{algorithm:'sha256 over sorted path NUL SHA256(file) NUL tuples',sha256:sourceTree.digest('hex'),fileCount:Object.keys(sortedInputs).length,inputs:sortedInputs}};
 await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');process.stdout.write(JSON.stringify({...receipt,sourceClosure:{...receipt.sourceClosure,inputs:`${receipt.sourceClosure.fileCount} pinned inputs in evidence file`}},null,2)+'\n');
}finally{await browser?.close();server?.stop(true);await rm(temp,{recursive:true,force:true});}
