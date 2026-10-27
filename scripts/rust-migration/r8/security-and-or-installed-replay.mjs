// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed archive replay for the frozen V4 securityAnd/securityOr cohort.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,lstat,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,extname,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function runBytes(command,args,env={}){
 const executable=command==='tar'?'/usr/bin/tar':command;
 const child=Bun.spawn([executable,...args],{env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);
 const code=await child.exited;if(code!==0)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${Buffer.from(stdout).toString('utf8')}\n${stderr}`);
 return Buffer.from(stdout);
}
async function runText(command,args,env={}){return(await runBytes(command,args,env)).toString('utf8').trim()}

function assertInstalledInventory(expected,actual){
 const expectedPaths=Object.keys(expected).sort(),actualPaths=Object.keys(actual.files).sort();
 assert.deepEqual(actualPaths,expectedPaths,'installed package file inventory differs from archive');
 const expectedDirs=new Set();for(const path of expectedPaths){let parent=posix.dirname(path);while(parent!=='.'){expectedDirs.add(parent);parent=posix.dirname(parent)}}
 assert.deepEqual([...actual.directories].sort(),[...expectedDirs].sort(),'installed package directory inventory differs from archive');
 for(const path of expectedPaths)assert.equal(actual.files[path],expected[path],`installed package member SHA-256 mismatch: ${path}`);
}
async function installedInventory(root){
 const files=Object.create(null),directories=[];
 async function visit(relative=''){
  const absolute=relative?join(root,...relative.split('/')):root;
  for(const entry of await readdir(absolute,{withFileTypes:true})){
   const path=relative?`${relative}/${entry.name}`:entry.name,full=join(absolute,entry.name),info=await lstat(full);
   assert(!info.isSymbolicLink(),`installed package contains symlink: ${path}`);
   if(info.isDirectory()){directories.push(path);await visit(path);continue;}
   assert(info.isFile(),`installed package contains non-file member: ${path}`);
   files[path]=sha(await readFile(full));
  }
 }
 await visit();return{files,directories};
}
async function verifyArchiveBoundInstall(install,archive,archiveSha256){
 const listing=(await runText('tar',['-tzf',archive])).split('\n').filter(Boolean);
 const verbose=(await runText('tar',['-tvzf',archive])).split('\n').filter(Boolean);
 assert.equal(new Set(listing).size,listing.length,'archive contains duplicate members');
 assert.equal(verbose.length,listing.length,'archive verbose/list member count differs');
 for(let i=0;i<listing.length;i++){
  const member=listing[i],relative=member.startsWith('package/')?member.slice('package/'.length):'';
  assert(relative&&!member.startsWith('/')&&!relative.startsWith('/')&&posix.normalize(relative)===relative&&!relative.split('/').includes('..'),`unsafe archive path ${member}`);
  assert.equal(verbose[i][0],'-',`archive contains a non-regular member: ${member}`);
 }
 const installedManifestBytes=await readFile(join(install,'manifest.json'));
 const archiveManifestBytes=await runBytes('tar',['-xOzf',archive,'package/manifest.json']);
 assert(installedManifestBytes.equals(archiveManifestBytes),'installed package manifest bytes differ from selected archive');
 const manifest=JSON.parse(archiveManifestBytes.toString('utf8'));
 assert.equal(manifest.profile,'umf.sdk.distribution.rust-default/1');
 assert(manifest.sha256&&typeof manifest.sha256==='object','archive manifest lacks payload hashes');
 const expected=Object.assign(Object.create(null),manifest.sha256,{'manifest.json':sha(archiveManifestBytes)});
 const expectedMembers=[...Object.keys(manifest.sha256).map(path=>`package/${path}`),'package/manifest.json'].sort();
 assert.deepEqual([...listing].sort(),expectedMembers,'archive member inventory differs from its manifest');
 for(const path of Object.keys(manifest.sha256))assert(path&&!path.startsWith('/')&&posix.normalize(path)===path&&!path.split('/').includes('..'),`unsafe manifest path ${path}`);
 const archiveTree=await mkdtemp(join(tmpdir(),'umf-security-archive-binding-'));
 try{
  await runBytes('tar',['-xzf',archive,'-C',archiveTree]);
  const archiveInventory=await installedInventory(join(archiveTree,'package'));
  assertInstalledInventory(expected,archiveInventory);
 }finally{await rm(archiveTree,{recursive:true,force:true})}
 const actual=await installedInventory(install);
 assertInstalledInventory(expected,actual);
 const mutatedPath=Object.keys(manifest.sha256).sort()[0],mutatedBytes=Buffer.from(await readFile(join(install,...mutatedPath.split('/'))));
 mutatedBytes[0]^=1;
 assert.notEqual(sha(mutatedBytes),manifest.sha256[mutatedPath],'mutated extracted file negative control');
 assert.throws(()=>assertInstalledInventory(expected,{files:{...actual.files,[mutatedPath]:sha(mutatedBytes)},directories:actual.directories}),/installed package member SHA-256 mismatch/,'mutated extracted file inventory negative control');
 const extraFiles={...actual.files,'unexpected-executable.js':'0'.repeat(64)};
 assert.throws(()=>assertInstalledInventory(expected,{files:extraFiles,directories:actual.directories}),/installed package file inventory differs/,'extra executable negative control');
 return{manifest,manifestSha256:sha(archiveManifestBytes),files:actual.files,directories:actual.directories,inventorySha256:sha(Buffer.from(Object.entries(actual.files).sort(([a],[b])=>a.localeCompare(b)).map(([path,digest])=>`${path}\0${digest}\0`).join(''))),controls:{positiveExactTreeAccepted:true,archivePayloadHashMismatchRejected:true,mutatedExtractedFileRejected:true,extraExecutableRejected:true},archiveMemberCount:listing.length};
}

const args=process.argv.slice(2);
const verifyOnly=args[0]==='--verify-package';
if(verifyOnly){
 if(args.length!==4||args.some(value=>!value))throw new Error('usage: security-and-or-installed-replay.mjs --verify-package <archive.tgz> <installed-package-root> <expected-archive-sha256>');
 const [,archiveArg,installArg,expectedSha]=args,archive=resolve(archiveArg),install=resolve(installArg),archiveSha256=sha(await readFile(archive));
 assert.equal(archiveSha256,expectedSha,'installed security replay archive differs from selected cohort');
 const binding=await verifyArchiveBoundInstall(install,archive,archiveSha256);
 console.log(JSON.stringify({status:'pass',archiveSha256,archiveMemberCount:binding.archiveMemberCount,installedFileCount:Object.keys(binding.files).length,inventorySha256:binding.inventorySha256,controls:binding.controls}));
 process.exit(0);
}
if(args.length!==4||args.some(value=>!value))throw new Error('usage: security-and-or-installed-replay.mjs <installed-package-root> <archive.tgz> <predecessor.json> <receipt.json>');
const [installArg,archiveArg,packetArg,receiptArg]=args;
const install=resolve(installArg),archive=resolve(archiveArg),packetPath=resolve(packetArg),receiptPath=resolve(receiptArg);
const repoRoot=resolve(import.meta.dirname,'../../..');
const expectedPacketPath=join(repoRoot,'docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json');
assert.equal(packetPath,expectedPacketPath,'security replay must use the pinned predecessor packet');
const packetBytes=await readFile(packetPath);
const packetSha256=createHash('sha256').update(packetBytes).digest('hex');
const expectedPacketSha256='d5dddb6766cadd5f9e3c45ef40f7d9fc8d5d486d59d3163b236477ef6966308d';
assert.equal(packetSha256,expectedPacketSha256,'frozen 68-case predecessor packet changed');
const packet=JSON.parse(packetBytes);
assert.equal(packet.format,'umf-r8-security-and-or-predecessor/1');
assert.equal(packet.cases.length,68);
const archiveSha256=createHash('sha256').update(await readFile(archive)).digest('hex');
const expectedArchiveSha256=process.env.UMF_EXPECTED_SECURITY_ARCHIVE_SHA256;
if(expectedArchiveSha256)assert.equal(archiveSha256,expectedArchiveSha256,'installed security replay archive differs from selected cohort');
const archiveBinding=await verifyArchiveBoundInstall(install,archive,archiveSha256);
const packageBuildManifest=JSON.parse(await readFile(join(install,'dist/rust-default-manifest.json'),'utf8'));
const sourceInputs=packageBuildManifest.sourceClosure?.inputs;
assert(sourceInputs&&typeof sourceInputs==='object','installed archive lacks its source input hash map');
for(const inputPath of ['scripts/rust-migration/r8/security-and-or-installed-replay.mjs','docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json']){
 const expected=sourceInputs[inputPath];assert(typeof expected==='string',`installed archive source closure omits ${inputPath}`);
 const actual=createHash('sha256').update(await readFile(join(repoRoot,inputPath))).digest('hex');assert.equal(actual,expected,`installed archive source closure differs for ${inputPath}`);
}
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

function input(spec,trace){
 switch(spec.kind){
  case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);
  case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value;}
  case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child];}
  case'sparse':{const value=[];value.length=1;return value;}
  case'extra-array-key':return Object.assign(['T'],{extra:'F'});
  case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value;}
  case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value;}
  case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];
  case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap')}});
  case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});
  case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push(`descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key)}});
  case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push(`get:${String(key)}`);return Reflect.get(target,key,receiver)}});
  default:throw new Error(`unknown input kind ${spec.kind}`);
 }
}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}

const hostProbe=`import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const install=${JSON.stringify(install)},packet=${JSON.stringify(packet)};
const expectedDefault=realpathSync(join(install,'dist/umf-node.js')),expectedReference=realpathSync(join(install,'dist/umf.js'));
const defaultResolved=import.meta.resolve('@umf/core'),referenceResolved=import.meta.resolve('@umf/core/reference');
assert.equal(realpathSync(fileURLToPath(defaultResolved)),expectedDefault,'package root did not resolve to the extracted Node default export');
assert.equal(realpathSync(fileURLToPath(referenceResolved)),expectedReference,'package reference did not resolve to the extracted TypeScript export');
const require=createRequire(defaultResolved),addon=require('./umf_core_node.node');
assert.equal(typeof addon.executeSecurityLogicWire,'function');let rustCalls=0;const original=addon.executeSecurityLogicWire;
addon.executeSecurityLogicWire=function(...args){rustCalls++;return Reflect.apply(original,this,args)};
const root=await import('@umf/core'),reference=await import('@umf/core/reference');
function input(spec,trace){switch(spec.kind){case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value}case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child]}case'sparse':{const value=[];value.length=1;return value}case'extra-array-key':return Object.assign(['T'],{extra:'F'});case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value}case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value}case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap')}});case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)}});case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push('get:'+String(key));return Reflect.get(target,key,receiver)}});default:throw Error(spec.kind)}}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}
const callsBeforeCases=rustCalls,rows=[];for(const spec of packet.cases){const rt=[],dt=[],beforeReference=rustCalls,ref=outcome(value=>reference[spec.operation](value),input(spec,rt),rt),referenceCallDelta=rustCalls-beforeReference,beforeDefault=rustCalls,actual=outcome(value=>root[spec.operation](value),input(spec,dt),dt),defaultCallDelta=rustCalls-beforeDefault;assert.deepEqual(ref,spec.expected,'installed reference changed '+spec.id);assert.deepEqual(actual,spec.expected,'installed Node default differs '+spec.id);assert.equal(referenceCallDelta,0,'installed TypeScript reference unexpectedly dispatched Rust for '+spec.id);assert.equal(defaultCallDelta,spec.expected.kind==='return'?1:0,'installed Node Rust dispatch mismatch '+spec.id);rows.push({id:spec.id,expected:spec.expected,reference:ref,referenceRustCallDelta:referenceCallDelta,default:actual,defaultRustCallDelta:defaultCallDelta})}
const validCalls=rows.reduce((n,row)=>n+row.defaultRustCallDelta,0),refusedCaseCount=rows.filter(row=>row.expected.kind==='throw').length,refusedRustCalls=rows.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.defaultRustCallDelta,0),referenceRustCalls=rows.reduce((n,row)=>n+row.referenceRustCallDelta,0),unattributedRustCalls=rustCalls-callsBeforeCases-validCalls-referenceRustCalls;assert.equal(validCalls,30);assert.equal(refusedRustCalls,0);assert.equal(referenceRustCalls,0);assert.equal(unattributedRustCalls,0);
console.log(JSON.stringify({host:process.env.UMF_SECURITY_HOST,runtime:typeof Bun==='undefined'?process.version:'Bun '+Bun.version,defaultResolved,referenceResolved,cases:rows.length,validCalls,refusedRustCalls,refusedCaseCount,referenceRustCalls,unattributedRustCalls,rows}));
`;

async function run(command,args,env={}){
 const child=Bun.spawn([command,...args],{env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;if(code!==0)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
 return JSON.parse(stdout.trim().split('\n').at(-1));
}

try{
 const nodeProbe=join(install,'.security-and-or-node-probe.mjs'),bunProbe=join(install,'.security-and-or-bun-probe.mjs');
 await writeFile(nodeProbe,hostProbe);await writeFile(bunProbe,hostProbe);
 const node=await run('node',[nodeProbe],{UMF_SECURITY_HOST:'node'});
 const bun=await run('bun',[bunProbe],{UMF_SECURITY_HOST:'bun'});
 assert.equal(node.cases,68);assert.equal(bun.cases,68);assert.equal(node.validCalls,30);assert.equal(bun.validCalls,30);assert.equal(node.refusedRustCalls,0);assert.equal(bun.refusedRustCalls,0);assert.equal(node.referenceRustCalls,0);assert.equal(bun.referenceRustCalls,0);assert.equal(node.unattributedRustCalls,0);assert.equal(bun.unattributedRustCalls,0);

 const requests=[],external=[],pageErrors=[],consoleErrors=[];
const browserScript=`const packet=await(await fetch('/predecessor.json')).json();const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);const expectedRoot=new URL('/dist/umf-browser.js',location.href).href,expectedReference=new URL('/dist/umf.js',location.href).href;if(import.meta.resolve('@umf/core')!==expectedRoot||import.meta.resolve('@umf/core/reference')!==expectedReference)throw Error('browser import map/export condition mismatch');const root=await import('@umf/core'),reference=await import('@umf/core/reference');if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals present in Chromium');function input(spec,trace){switch(spec.kind){case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value}case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child]}case'sparse':{const value=[];value.length=1;return value}case'extra-array-key':return Object.assign(['T'],{extra:'F'});case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value}case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value}case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap') }});case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)}});case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push('get:'+String(key));return Reflect.get(target,key,receiver)}});default:throw Error(spec.kind)}}function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}const rustCount=()=>window.__rustCalls.filter(name=>name==='executeSecurityLogicWire').length,callsBeforeCases=rustCount(),rows=[];for(const spec of packet.cases){const rt=[],dt=[],beforeReference=rustCount(),ref=outcome(value=>reference[spec.operation](value),input(spec,rt),rt),referenceRustCallDelta=rustCount()-beforeReference,beforeDefault=rustCount(),actual=outcome(value=>root[spec.operation](value),input(spec,dt),dt),defaultRustCallDelta=rustCount()-beforeDefault;if(canonical(ref)!==canonical(spec.expected))throw Error('Chromium reference drift '+spec.id);if(canonical(actual)!==canonical(spec.expected))throw Error('Chromium default mismatch '+spec.id+': '+canonical(actual));if(referenceRustCallDelta!==0)throw Error('Chromium reference unexpectedly dispatched WASM '+spec.id);if(defaultRustCallDelta!==(spec.expected.kind==='return'?1:0))throw Error('Chromium WASM dispatch mismatch '+spec.id);rows.push({id:spec.id,expected:spec.expected,reference:ref,referenceRustCallDelta,default:actual,defaultRustCallDelta})}const validCalls=rows.reduce((n,row)=>n+row.defaultRustCallDelta,0),refusedCaseCount=rows.filter(row=>row.expected.kind==='throw').length,refusedRustCalls=rows.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.defaultRustCallDelta,0),referenceRustCalls=rows.reduce((n,row)=>n+row.referenceRustCallDelta,0),unattributedRustCalls=rustCount()-callsBeforeCases-validCalls-referenceRustCalls;if(validCalls!==30||refusedRustCalls!==0||referenceRustCalls!==0||unattributedRustCalls!==0)throw Error('Chromium aggregate WASM dispatch mismatch');window.securityInstalledResult={rows,cases:rows.length,validCalls,refusedRustCalls,refusedCaseCount,referenceRustCalls,unattributedRustCalls,wasmCalls:window.__rustCalls,nodeGlobalsAbsent:typeof process==='undefined'&&typeof Buffer==='undefined'};`;
 const bootstrap=`window.__rustCalls=[];for(const method of ['instantiate','instantiateStreaming']){const original=WebAssembly[method];if(typeof original!=='function')continue;WebAssembly[method]=async function(...args){const value=await Reflect.apply(original,this,args);const wrap=instance=>({exports:Object.fromEntries(Object.entries(instance.exports).map(([name,fn])=>[name,typeof fn==='function'?function(...callArgs){window.__rustCalls.push(String(name));return Reflect.apply(fn,instance.exports,callArgs)}:fn]))});return value&&value.instance?{...value,instance:wrap(value.instance)}:wrap(value)}};`;
 const html=`<!doctype html><meta charset="utf-8"><script>${bootstrap}</script><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/dist/umf-browser.js','@umf/core/reference':'/dist/umf.js'}})}</script><script type="module" src="/security-probe.js"></script>`;
 let server,lastBindError;
 for(let attempt=0;attempt<20;attempt++){
  const candidatePort=41000+((Date.now()+attempt*7919)%18000);
  try{server=Bun.serve({hostname:'127.0.0.1',port:candidatePort,async fetch(request){const url=new URL(request.url);if(url.pathname==='/')return new Response(html,{headers:{'content-type':'text/html'}});if(url.pathname==='/security-probe.js')return new Response(browserScript,{headers:{'content-type':'text/javascript'}});if(url.pathname==='/predecessor.json')return new Response(packetBytes,{headers:{'content-type':'application/json'}});const relative=url.pathname.slice(1);requests.push(relative);try{return new Response(await readFile(join(install,relative)),{headers:{'content-type':extname(relative)==='.wasm'?'application/wasm':relative.endsWith('.js')?'text/javascript':'application/octet-stream'}})}catch{return new Response('not found',{status:404})}}});break}catch(error){lastBindError=error;if(error?.code!=='EADDRINUSE'&&!String(error).includes('EADDRINUSE'))throw error}
 }
 if(!server)throw new Error(`Could not bind installed security replay server after 20 loopback ports: ${String(lastBindError)}`);
 const browserUrl=server.url.href;
 let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('request',request=>{if(new URL(request.url()).origin!==new URL(browserUrl).origin)external.push(request.url())});page.on('pageerror',error=>pageErrors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
  await page.goto(browserUrl);await page.waitForFunction(()=>Boolean(window.securityInstalledResult),undefined,{timeout:120000});const browserResult=await page.evaluate(()=>window.securityInstalledResult);
  assert.equal(browserResult.cases,68);assert.equal(browserResult.validCalls,30);assert.equal(browserResult.refusedRustCalls,0);assert.equal(browserResult.referenceRustCalls,0);assert.equal(browserResult.unattributedRustCalls,0);assert.equal(browserResult.nodeGlobalsAbsent,true);assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(external,[]);assert(requests.includes('dist/umf_core_wasm_bg.wasm'),'installed Chromium package did not request its WASM asset');
  const receipt={format:'umf-r8-security-and-or-installed-replay/2',status:'passed',archive:{path:archive,sha256:archiveSha256,installedPackageBinding:{manifestSha256:archiveBinding.manifestSha256,sourceClosureSha256:packageBuildManifest.sourceClosure.sha256,archiveMemberCount:archiveBinding.archiveMemberCount,installedFileCount:Object.keys(archiveBinding.files).length,inventorySha256:archiveBinding.inventorySha256,controls:archiveBinding.controls}},fixture:{path:packetPath,sha256:packetSha256,cases:packet.cases.length},runtimes:{node:{version:node.runtime,cases:node.cases,validRustCalls:node.validCalls,refusedRustCalls:node.refusedRustCalls,refusedCaseCount:node.refusedCaseCount,referenceRustCalls:node.referenceRustCalls,defaultResolved:node.defaultResolved,referenceResolved:node.referenceResolved},bun:{version:bun.runtime,cases:bun.cases,validRustCalls:bun.validCalls,refusedRustCalls:bun.refusedRustCalls,refusedCaseCount:bun.refusedCaseCount,referenceRustCalls:bun.referenceRustCalls,defaultResolved:bun.defaultResolved,referenceResolved:bun.referenceResolved},chromium:{version:browser.version(),cases:browserResult.cases,validWasmCalls:browserResult.validCalls,refusedWasmCalls:browserResult.refusedRustCalls,refusedCaseCount:browserResult.refusedCaseCount,referenceWasmCalls:browserResult.referenceRustCalls,wasmAssetRequested:requests.includes('dist/umf_core_wasm_bg.wasm'),nodeGlobalsAbsent:browserResult.nodeGlobalsAbsent,externalRequests:external.length}},records:{node:node.rows,bun:bun.rows,chromium:browserResult.rows},network:{requests,externalRequests:external,pageErrors,consoleErrors}};
  await mkdir(resolve(receiptPath,'..'),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,receipt:receiptPath,archiveSha256,fixtureSha256:packetSha256,cases:68,nodeCalls:node.validCalls,bunCalls:bun.validCalls,chromiumCalls:browserResult.validCalls,refusedRustCalls:0,referenceRustCalls:0,browser:receipt.runtimes.chromium.version,wasmAssetRequested:receipt.runtimes.chromium.wasmAssetRequested,externalRequests:external.length}));
 }finally{await browser?.close();server.stop(true)}
}finally{await (await import('node:fs/promises')).rm(join(install,'.security-and-or-node-probe.mjs'),{force:true});await (await import('node:fs/promises')).rm(join(install,'.security-and-or-bun-probe.mjs'),{force:true})}
