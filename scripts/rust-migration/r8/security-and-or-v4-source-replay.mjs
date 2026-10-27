// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-level default-vs-reference replay for V4 securityAnd/securityOr.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(import.meta.dirname,'../../..');
const buildManifestName='compact-dataset-verify-build-manifest.json';
const buildManifestFormat='umf.r8.compact-dataset-verify-build/1';
const buildArtifactPaths={nodeAddon:'umf_core_node.node',wasm:'umf_core_wasm_bg.wasm',wasmGlue:'wasm/umf_core_wasm.js',referenceBundle:'umf.js',nodeBundle:'umf-node.js',browserBundle:'umf-browser.js'};
const sharedCompactBuilder=join(repo,'scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs');
const sourcePaths=[
  'src/extensions/security/logic.ts','src/extensions/security/rust-logic-adapter.ts','src/model/json.ts','src/model/errors.ts',
  'src/index-node-v4.ts','src/index-browser-v4.ts','src/index-v4-default.ts',
  'scripts/rust-migration/r8/v4-default-facade.mjs','scripts/rust-migration/r8/v4-default-facade.test.js',
  'scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs',
  'bindings/core/node/index.js','bindings/core/node/src/security-logic.js','bindings/core/node/src/wire.js',
  'bindings/core/wasm/index.js','bindings/core/wasm/src/security-logic.js','bindings/core/wasm/src/lib.rs',
  'crates/umf-core/src/security_logic.rs','crates/umf-core-wire/src/security_logic_binding.rs',
  'crates/umf-tagged-wire/src/lib.rs',
  'docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md',
  'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json',
  'tests/security/rust-logic-adapter.test.ts',
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFile(join(repo,path));
const digest=async path=>hash(await readFile(path));
const pins=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,await digest(path)])));
const closureDigest=entries=>hash(Buffer.from(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)).map(([path,digest])=>`${path}\0${digest}\0`).join('')));

async function verifyBuild(dist){
  const manifestPath=join(dist,buildManifestName),bytes=await readFile(manifestPath),manifest=JSON.parse(bytes);
  assert.equal(manifest.format,buildManifestFormat,'build manifest format');
  assert(manifest.sourceClosure?.files&&manifest.sourceClosure?.sha256,'build manifest source closure is incomplete');
  assert.deepEqual(Object.keys(manifest.artifacts??{}).sort(),Object.keys(buildArtifactPaths).sort(),'build manifest artifact inventory');
  for(const [path,expected] of Object.entries(manifest.sourceClosure.files))assert.equal(await digest(join(repo,path)),expected,`STALE_SOURCE: ${path}`);
  assert.equal(closureDigest(manifest.sourceClosure.files),manifest.sourceClosure.sha256,'STALE_SOURCE: build source closure digest');
  for(const [name,path] of Object.entries(buildArtifactPaths)){
    const expected=manifest.artifacts?.[name];
    assert.equal(expected?.path,path,`STALE_ARTIFACT: ${name} path`);
    assert.equal(await digest(join(dist,path)),expected.sha256,`STALE_ARTIFACT: ${name}`);
  }
  return{manifestPath,manifestSha256:hash(bytes),manifest};
}

function caseSpecs(){
  const specs=[];
  for(const operation of ['securityAnd','securityOr']){
    for(const a of ['T','F','U'])for(const b of ['T','F','U'])specs.push({id:`${operation}.${a}.${b}`,operation,kind:'values',values:[a,b]});
    for(const value of ['T','F','U'])specs.push({id:`${operation}.one.${value}`,operation,kind:'values',values:[value]});
    specs.push({id:`${operation}.64`,operation,kind:'values',values:Array(64).fill(operation==='securityAnd'?'T':'F')});
    specs.push({id:`${operation}.empty`,operation,kind:'values',values:[]});
    specs.push({id:`${operation}.65`,operation,kind:'values',values:Array(65).fill('T')});
    specs.push({id:`${operation}.invalid-token`,operation,kind:'values',values:['T','X']});
  }
  for(const operation of ['securityAnd','securityOr'])for(const kind of ['null','number','boolean','string','object','null-prototype','accessor-index','accessor-child','sparse','extra-array-key','custom-array-prototype','symbol-array-key','number-nan','number-negative-zero','proxy-ownKeys','proxy-getPrototype','proxy-descriptor','proxy-get']){
    specs.push({id:`${operation}.host.${kind}`,operation,kind});
  }
  return specs;
}

function input(spec,trace){
  switch(spec.kind){
    case'values':return spec.values;
    case'null':return null;
    case'number':return 1;
    case'boolean':return true;
    case'string':return'T';
    case'object':return{};
    case'null-prototype':return Object.create(null);
    case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T';}});value.length=1;return value;}
    case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T';}});return['X',child];}
    case'sparse':{const value=[];value.length=1;return value;}
    case'extra-array-key':return Object.assign(['T'],{extra:'F'});
    case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value;}
    case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value;}
    case'number-nan':return['T',Number.NaN];
    case'number-negative-zero':return['T',-0];
    case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap');}});
    case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap');}});
    case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){trace.push(`descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}});
    case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push(`get:${String(key)}`);return Reflect.get(target,key,receiver);}});
    default:throw new Error(`unknown input kind ${spec.kind}`);
  }
}
function outcome(fn,value,trace){
  try{return{kind:'return',value:fn(value),trace};}
  catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace};}
}
const invoke=(module,spec,value)=>module[spec.operation](value);

async function build(dist){
  const child=Bun.spawn([process.execPath,sharedCompactBuilder,'--build',resolve(dist)],{cwd:repo,stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
  const code=await child.exited;
  if(code!==0)throw new Error(`shared compact source builder failed (${code})\n${stdout}\n${stderr}`);
  const result=JSON.parse(stdout);
  assert.equal(result.format,buildManifestFormat,'shared builder manifest format');
  assert.equal(result.manifestSha256,await digest(join(dist,buildManifestName)),'shared builder manifest digest');
  return result;
}

async function freeze(dist,out){
  const reference=await import(pathToFileURL(join(dist,'umf.js')).href);
  const rows=caseSpecs().map(spec=>{const trace=[];const actual=outcome(value=>invoke(reference,spec,value),input(spec,trace),trace);return{...spec,expected:actual};});
  const sourceHashes=await pins();
  const packet={format:'umf-r8-security-and-or-predecessor/1',predecessor:{source:'src/extensions/security/logic.ts',sourceSha256:sourceHashes['src/extensions/security/logic.ts'],jsonAdmissionSource:'src/model/json.ts',jsonAdmissionSourceSha256:sourceHashes['src/model/json.ts'],contract:'docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md',contractSha256:sourceHashes['docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'],frozenTruthPacket:'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json',frozenTruthPacketSha256:sourceHashes['docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json']},truths:['T','F','U'],and:[['T','F','U'],['F','F','F'],['U','F','U']],or:[['T','T','T'],['T','F','U'],['T','U','U']],cases:rows,limitations:['Source-level predecessor vectors and host reflection outcomes only; not an installed archive or release qualification.','Controls/maxWork meter parity is not asserted.']};
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(packet,null,2)+'\n');
  console.log(JSON.stringify({status:'frozen',out,cases:rows.length,sourceClosureSha256:closureDigest(sourceHashes)},null,2));
}

async function replayHost(host,dist,fixturePath,out,buildBinding){
  const packet=JSON.parse(await readFile(fixturePath,'utf8'));
  const expectedPins=packet.predecessor;
  assert.equal(await digest(expectedPins.source),expectedPins.sourceSha256);
  assert.equal(await digest(expectedPins.jsonAdmissionSource),expectedPins.jsonAdmissionSourceSha256);
  assert.equal(await digest(expectedPins.contract),expectedPins.contractSha256);
  assert.equal(await digest(expectedPins.frozenTruthPacket),expectedPins.frozenTruthPacketSha256);
  const reference=await import(pathToFileURL(join(dist,'umf.js')).href);
  let rustCalls=0;
  const require=createRequire(pathToFileURL(join(dist,'umf-node.js')));
  const addon=require('./umf_core_node.node');
  const original=addon.executeSecurityLogicWire;
  assert.equal(typeof original,'function');
  addon.executeSecurityLogicWire=function(...args){rustCalls++;return Reflect.apply(original,this,args);};
  const root=await import(pathToFileURL(join(dist,'umf-node.js')).href);
  assert.equal(typeof root.securityAnd,'function');assert.equal(typeof root.securityOr,'function');
  const rows=[];
  for(const spec of packet.cases){
    const referenceTrace=[],rootTrace=[];
    const referenceOutcome=outcome(value=>invoke(reference,spec,value),input(spec,referenceTrace),referenceTrace);
    assert.deepEqual(referenceOutcome,spec.expected,`${host} source reference changed: ${spec.id}`);
    const before=rustCalls;
    const actual=outcome(value=>invoke(root,spec,value),input(spec,rootTrace),rootTrace);
    const delta=rustCalls-before;
    assert.deepEqual(actual,spec.expected,`${host} V4 root mismatch: ${spec.id}`);
    assert.equal(delta,spec.expected.kind==='return'?1:0,`${host} unexpected Rust dispatch count for ${spec.id}`);
    rows.push({id:spec.id,expected:spec.expected,reference:referenceOutcome,root:actual,rustCallDelta:delta});
  }
  const sourceHashes=await pins();
  const receipt={format:'umf-r8-security-and-or-v4-source-replay/2',status:'pass',host,runtime:host==='node'?process.version:`Bun ${Bun.version}`,route:{default:'private source-built V4 Node root',reference:'private source-built TypeScript root'},buildBinding,sourceClosure:{sha256:closureDigest(sourceHashes),files:sourceHashes},build:{dist,wasmBindgen:'0.2.100',nodeAddonSha256:await digest(join(dist,'umf_core_node.node'))},fixture:{path:fixturePath,sha256:hash(await readFile(fixturePath)),cases:rows.length},rustDispatch:{validCalls:rows.reduce((n,row)=>n+row.rustCallDelta,0),invalidCalls:rows.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.rustCallDelta,0),perCase:rows},limitations:packet.limitations};
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,host,cases:rows.length,rustCalls,receipt:out},null,2));
}

async function replayBrowser(dist,fixturePath,out,buildBinding){
  const packet=JSON.parse(await readFile(fixturePath,'utf8'));
  const rows=packet.cases;
  const probe=`import * as root from '/umf-browser.js';import * as reference from '/umf.js';
function input(spec,trace){switch(spec.kind){case'values':return spec.values;case'null':return null;case'number':return 1;case'boolean':return true;case'string':return'T';case'object':return{};case'null-prototype':return Object.create(null);case'accessor-index':{const value=[];Object.defineProperty(value,'0',{enumerable:true,get(){trace.push('getter:index');return'T'}});value.length=1;return value}case'accessor-child':{const child=Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter:member');return'T'}});return['X',child]}case'sparse':{const value=[];value.length=1;return value}case'extra-array-key':return Object.assign(['T'],{extra:'F'});case'custom-array-prototype':{const value=['T'];Object.setPrototypeOf(value,{});return value}case'symbol-array-key':{const value=['T'];value[Symbol('extra')]='F';return value}case'number-nan':return['T',Number.NaN];case'number-negative-zero':return['T',-0];case'proxy-ownKeys':return new Proxy(['T'],{ownKeys(){trace.push('ownKeys');throw new Error('proxy ownKeys trap')}});case'proxy-getPrototype':return new Proxy(['T'],{getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('proxy getPrototypeOf trap')}});case'proxy-descriptor':return new Proxy(['T'],{ownKeys(target){trace.push('ownKeys');return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)}});case'proxy-get':return new Proxy(['T'],{get(target,key,receiver){trace.push('get:'+String(key));return Reflect.get(target,key,receiver)}});default:throw Error(spec.kind)}}
function outcome(fn,value,trace){try{return{kind:'return',value:fn(value),trace}}catch(error){return{kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace}}}
const packet=await(await fetch('/fixture.json')).json(),records=[];for(const spec of packet.cases){const a=[],b=[],expected=outcome(value=>reference[spec.operation](value),input(spec,a),a),before=window.__rustCalls.filter(name=>name==='executeSecurityLogicWire').length,actual=outcome(value=>root[spec.operation](value),input(spec,b),b),delta=window.__rustCalls.filter(name=>name==='executeSecurityLogicWire').length-before;if(JSON.stringify(expected)!==JSON.stringify(spec.expected))throw Error('reference fixture drift '+spec.id);if(JSON.stringify(actual)!==JSON.stringify(spec.expected))throw Error('V4 mismatch '+spec.id+': '+JSON.stringify({actual,expected:spec.expected}));if(delta!==(spec.expected.kind==='return'?1:0))throw Error('unexpected WASM dispatch '+spec.id+' '+delta);records.push({id:spec.id,expected:spec.expected,reference:expected,root:actual,wasmCallDelta:delta})}if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');window.securityAndOrProbe={records,nodeGlobalsAbsent:true,wasmCalls:window.__rustCalls};`;
  const bootstrap=`window.__rustCalls=[];const originalWrap=(instance)=>({exports:Object.fromEntries(Object.entries(instance.exports).map(([name,value])=>[name,typeof value==='function'?function(...args){window.__rustCalls.push(String(name));return Reflect.apply(value,instance.exports,args)}:value]))});for(const method of ['instantiate','instantiateStreaming']){const original=WebAssembly[method];if(typeof original!=='function')continue;WebAssembly[method]=async function(...args){const result=await Reflect.apply(original,this,args);return result&&result.instance?{...result,instance:originalWrap(result.instance)}:originalWrap(result)}};`;
  const html=`<!doctype html><meta charset="utf-8"><script>${bootstrap}</script><script type="module" src="/probe.js"></script>`;
  const requests=[],server=createServer(async(req,res)=>{const path=new URL(req.url??'/','http://127.0.0.1').pathname;if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(path==='/probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(probe);return}if(path==='/fixture.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(packet));return}const relative=path.slice(1);requests.push(relative);try{const bytes=await readFile(join(dist,relative));res.writeHead(200,{'content-type':extname(relative)==='.wasm'?'application/wasm':extname(relative)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('not found')}});
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');let browser;
  try{browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),pageErrors=[],consoleErrors=[],failedRequests=[];page.on('pageerror',error=>pageErrors.push(String(error)));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText??null}));await page.goto(`http://127.0.0.1:${address.port}/`);let ready=false;for(let i=0;i<90&&!ready;i++){ready=await page.evaluate(()=>Boolean(window.securityAndOrProbe));if(ready||pageErrors.length)break;await page.waitForTimeout(1000)}if(!ready){const diagnostics=await page.evaluate(()=>({progress:window.securityAndOrProgress??null,wasmCalls:window.__rustCalls??null}));throw new Error(`Chromium replay did not complete: ${JSON.stringify({diagnostics,pageErrors,consoleErrors,failedRequests,requests,browserVersion:browser.version()})}`)}const result=await page.evaluate(()=>({probe:window.securityAndOrProbe,userAgent:navigator.userAgent}));assert.deepEqual(pageErrors,[]);assert.equal(result.probe.nodeGlobalsAbsent,true);assert(requests.includes('umf_core_wasm_bg.wasm'),'fresh package WASM was not requested');
    const sourceHashes=await pins(),receipt={format:'umf-r8-security-and-or-v4-source-replay/2',status:'pass',host:'chromium',runtime:{version:browser.version(),userAgent:result.userAgent},route:{default:'private source-built V4 browser root',reference:'private source-built TypeScript root'},buildBinding,sourceClosure:{sha256:closureDigest(sourceHashes),files:sourceHashes},build:{dist,wasmBindgen:'0.2.100',wasmSha256:await digest(join(dist,'umf_core_wasm_bg.wasm'))},fixture:{path:fixturePath,sha256:hash(await readFile(fixturePath)),cases:rows.length},rustDispatch:{validCalls:result.probe.records.reduce((n,row)=>n+row.wasmCallDelta,0),invalidCalls:result.probe.records.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.wasmCallDelta,0),perCase:result.probe.records,wasmExportCalls:result.probe.wasmCalls},nodeGlobalsAbsent:true,wasmRequested:true,limitations:packet.limitations};
    await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,host:'chromium',version:browser.version(),cases:rows.length,validWasmCalls:receipt.rustDispatch.validCalls,receipt:out},null,2));
  }finally{await browser?.close();await new Promise(done=>server.close(done));}
}

const [mode,arg1,arg2,arg3]=process.argv.slice(2);
if(mode==='--build')console.log(JSON.stringify(await build(resolve(arg1)),null,2));
else if(mode==='--freeze')await freeze(resolve(arg1),resolve(arg2));
else if(mode==='--host'){const dist=resolve(arg2),binding=await verifyBuild(dist);await replayHost(arg1,dist,resolve(arg3),resolve(process.argv[6]),{manifest:binding.manifestPath,sha256:binding.manifestSha256,sourceClosureSha256:binding.manifest.sourceClosure.sha256,artifacts:binding.manifest.artifacts});}
else if(mode==='--browser'){const dist=resolve(arg1),binding=await verifyBuild(dist);await replayBrowser(dist,resolve(arg2),resolve(arg3),{manifest:binding.manifestPath,sha256:binding.manifestSha256,sourceClosureSha256:binding.manifest.sourceClosure.sha256,artifacts:binding.manifest.artifacts});}
else throw new Error('usage: bun security-and-or-v4-source-replay.mjs --build <private-dist> | --freeze <private-dist> <fixture.json> | --host <node|bun> <private-dist> <fixture.json> <receipt.json> | --browser <private-dist> <fixture.json> <receipt.json>');
