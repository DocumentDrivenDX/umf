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
const evidence=join(repo,'docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay');
const pinnedToolchain='/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const pinnedBindgen='/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const sourcePaths=[
  'src/extensions/security/logic.ts','src/extensions/security/rust-logic-adapter.ts','src/model/json.ts','src/model/errors.ts',
  'src/index-node-v4.ts','src/index-browser-v4.ts','src/index-v4-default.ts',
  'scripts/rust-migration/r8/v4-default-facade.mjs','scripts/rust-migration/r8/v4-default-facade.test.js',
  'scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs',
  'bindings/core/node/index.js','bindings/core/node/src/security-logic.js','bindings/core/node/src/wire.js',
  'bindings/core/wasm/index.js','bindings/core/wasm/src/security-logic.js','bindings/core/wasm/src/lib.rs',
  'crates/umf-core/src/security_logic.rs','crates/umf-core-wire/src/security_logic_binding.rs',
  'docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md',
  'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json',
  'tests/security/rust-logic-adapter.test.ts',
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFile(join(repo,path));
const digest=async path=>hash(await readFile(path));
const run=async(command,args,env={})=>{
  const child=Bun.spawn([command,...args],{cwd:repo,env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
  const code=await child.exited;if(code!==0)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return{stdout:stdout.trim(),stderr:stderr.trim()};
};
const pins=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,await digest(path)])));
const closureDigest=entries=>hash(Buffer.from(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)).map(([path,digest])=>`${path}\0${digest}\0`).join('')));

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
  await mkdir(dist,{recursive:true});
  const cargoTarget=join(dist,'cargo-target'),wasmOut=join(dist,'wasm');
  const env={CARGO_TARGET_DIR:cargoTarget,RUSTC:join(pinnedToolchain,'rustc'),CARGO_BUILD_JOBS:'2',CARGO_INCREMENTAL:'0'};
  const cargo=join(pinnedToolchain,'cargo');
  await run(cargo,['build','--locked','--offline','--release','--manifest-path','bindings/core/node/Cargo.toml'],env);
  await run(cargo,['build','--locked','--offline','--release','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],env);
  const bindgenVersion=(await run(pinnedBindgen,['--version'])).stdout;
  assert.equal(bindgenVersion,'wasm-bindgen 0.2.100');
  await mkdir(wasmOut,{recursive:true});
  await run(pinnedBindgen,['--target','web','--out-dir',wasmOut,'--out-name','umf_core_wasm',join(cargoTarget,'wasm32-unknown-unknown/release/umf_core_wasm.wasm')]);
  await Bun.$`cp ${join(cargoTarget,'release/libumf_core_node.dylib')} ${join(dist,'umf_core_node.node')}`.quiet();
  await Bun.$`cp ${join(wasmOut,'umf_core_wasm_bg.wasm')} ${join(dist,'umf_core_wasm_bg.wasm')}`.quiet();
  const wasmImports=new Set();
  const wasmPlugin={name:'fresh-source-replay-wasm',setup(builder){builder.onResolve({filter:/umf_core_wasm\.js$/},args=>{
    if(args.importer.endsWith('bindings/core/wasm/index.js')&&args.path==='./pkg/umf_core_wasm.js'){wasmImports.add('wasm-index');return{path:join(wasmOut,'umf_core_wasm.js')};}
    if(args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js'){wasmImports.add('browser-root');return{path:join(wasmOut,'umf_core_wasm.js')};}
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
  assert(wasmImports.has('wasm-index')&&wasmImports.has('browser-root'),'fresh wasm-bindgen glue was not used by both browser entrypoints');
  return{rustc:(await run(join(pinnedToolchain,'rustc'),['--version'])).stdout,cargo:(await run(cargo,['--version'])).stdout,wasmBindgen:bindgenVersion,bun:Bun.version,wasmSha256:await digest(join(dist,'wasm_core_wasm_bg.wasm').replace('wasm_core_wasm_bg','umf_core_wasm_bg')),
    wasmGlueSha256:await digest(join(wasmOut,'umf_core_wasm.js')),nodeAddonSha256:await digest(join(dist,'umf_core_node.node')),sourceHashes:await pins(),sourceClosureSha256:closureDigest(await pins())};
}

async function freeze(dist,out){
  const reference=await import(pathToFileURL(join(dist,'umf.js')).href);
  const rows=caseSpecs().map(spec=>{const trace=[];const actual=outcome(value=>invoke(reference,spec,value),input(spec,trace),trace);return{...spec,expected:actual};});
  const sourceHashes=await pins();
  const packet={format:'umf-r8-security-and-or-predecessor/1',predecessor:{source:'src/extensions/security/logic.ts',sourceSha256:sourceHashes['src/extensions/security/logic.ts'],jsonAdmissionSource:'src/model/json.ts',jsonAdmissionSourceSha256:sourceHashes['src/model/json.ts'],contract:'docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md',contractSha256:sourceHashes['docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'],frozenTruthPacket:'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json',frozenTruthPacketSha256:sourceHashes['docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json']},truths:['T','F','U'],and:[['T','F','U'],['F','F','F'],['U','F','U']],or:[['T','T','T'],['T','F','U'],['T','U','U']],cases:rows,limitations:['Source-level predecessor vectors and host reflection outcomes only; not an installed archive or release qualification.','Controls/maxWork meter parity is not asserted.']};
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(packet,null,2)+'\n');
  console.log(JSON.stringify({status:'frozen',out,cases:rows.length,sourceClosureSha256:closureDigest(sourceHashes)},null,2));
}

async function replayHost(host,dist,fixturePath,out){
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
  const receipt={format:'umf-r8-security-and-or-v4-source-replay/1',status:'pass',host,runtime:host==='node'?process.version:`Bun ${Bun.version}`,route:{default:'private source-built V4 Node root',reference:'private source-built TypeScript root'},sourceClosure:{sha256:closureDigest(sourceHashes),files:sourceHashes},build:{dist,wasmBindgen:'0.2.100',nodeAddonSha256:await digest(join(dist,'umf_core_node.node'))},fixture:{path:fixturePath,sha256:hash(await readFile(fixturePath)),cases:rows.length},rustDispatch:{validCalls:rows.reduce((n,row)=>n+row.rustCallDelta,0),invalidCalls:rows.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.rustCallDelta,0),perCase:rows},limitations:packet.limitations};
  await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,host,cases:rows.length,rustCalls,receipt:out},null,2));
}

async function replayBrowser(dist,fixturePath,out){
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
    const sourceHashes=await pins(),receipt={format:'umf-r8-security-and-or-v4-source-replay/1',status:'pass',host:'chromium',runtime:{version:browser.version(),userAgent:result.userAgent},route:{default:'private source-built V4 browser root',reference:'private source-built TypeScript root'},sourceClosure:{sha256:closureDigest(sourceHashes),files:sourceHashes},build:{dist,wasmBindgen:'0.2.100',wasmSha256:await digest(join(dist,'umf_core_wasm_bg.wasm'))},fixture:{path:fixturePath,sha256:hash(await readFile(fixturePath)),cases:rows.length},rustDispatch:{validCalls:result.probe.records.reduce((n,row)=>n+row.wasmCallDelta,0),invalidCalls:result.probe.records.filter(row=>row.expected.kind==='throw').reduce((n,row)=>n+row.wasmCallDelta,0),perCase:result.probe.records,wasmExportCalls:result.probe.wasmCalls},nodeGlobalsAbsent:true,wasmRequested:true,limitations:packet.limitations};
    await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,host:'chromium',version:browser.version(),cases:rows.length,validWasmCalls:receipt.rustDispatch.validCalls,receipt:out},null,2));
  }finally{await browser?.close();await new Promise(done=>server.close(done));}
}

const [mode,arg1,arg2,arg3]=process.argv.slice(2);
if(mode==='--build')console.log(JSON.stringify(await build(resolve(arg1)),null,2));
else if(mode==='--freeze')await freeze(resolve(arg1),resolve(arg2));
else if(mode==='--host')await replayHost(arg1,resolve(arg2),resolve(arg3),resolve(process.argv[6]));
else if(mode==='--browser')await replayBrowser(resolve(arg1),resolve(arg2),resolve(arg3));
else throw new Error('usage: bun security-and-or-v4-source-replay.mjs --build <private-dist> | --freeze <private-dist> <fixture.json> | --host <node|bun> <private-dist> <fixture.json> <receipt.json> | --browser <private-dist> <fixture.json> <receipt.json>');
