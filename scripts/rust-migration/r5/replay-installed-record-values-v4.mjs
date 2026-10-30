// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen Record Values predecessor through an installed V4 SDK archive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,extname,join,normalize,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const archive=resolve(root,'.cache/sdk-distribution/cohorts/4547d877/umf-sdk.tgz');
const expectedArchiveSha256='5f3dccf215b0c1d631d2534946f8305ce6e1bef2d6a10477992a3aa4b4faf599';
const expectedSourceClosureSha256='4547d877ea7ac3b5e7bfb2101ae80833257c19ae7ba825cf884bc05c666a49b3';
const evidence=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values');
const frozenPath=join(evidence,'frozen-typescript.json');
const hostPath=join(evidence,'host-admission.json');
const outputDir=join(evidence,'installed-v4');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=path=>readFile(path,'utf8').then(JSON.parse);
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const capture=run=>{try{return{ok:true,value:run()};}catch(error){return{ok:false,error:{name:error?.name??'Error',code:error?.code??'',message:String(error?.message??error),path:error?.path??''}};}};
const checkOutcome=(actual,expected,label)=>assert.equal(canonical(actual),canonical(expected),label);

function run(command,args,options={}){
  const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:64*1024*1024,...options});
  if(result.error||result.status!==0)throw new Error(`${command} failed (${result.status}):\n${(result.stderr||result.stdout||String(result.error)).slice(0,4000)}`);
  return result.stdout;
}

function packageInfo(){
  const metadata=JSON.parse(run('tar',['-xOf',archive,'package/package.json']));
  const manifest=JSON.parse(run('tar',['-xOf',archive,'package/dist/rust-default-manifest.json']));
  const nodeTarget=metadata.exports?.['.']?.node;
  const browserTarget=metadata.exports?.['.']?.browser;
  const referenceTarget=metadata.exports?.['./reference']?.import;
  assert.equal(metadata.name,'@umf/core');
  assert.equal(nodeTarget,'./dist/umf-node.js');
  assert.equal(browserTarget,'./dist/umf-browser.js');
  assert.equal(referenceTarget,'./dist/umf.js');
  assert.equal(manifest.sourceClosure?.sha256,expectedSourceClosureSha256);
  assert.equal(manifest.defaultRouteSource,'V4 synchronous Rust root entry selected by package.json for the supported native and browser hosts');
  return{metadata,manifest,nodeTarget,browserTarget,referenceTarget};
}

function linkDependencies(prefix,metadata){
  const rootModules=join(root,'node_modules'),installModules=join(prefix,'node_modules');
  const names=Object.keys({...metadata.dependencies,...metadata.optionalDependencies,...metadata.peerDependencies});
  for(const name of names){
    const source=resolve(rootModules,name),target=resolve(installModules,name);
    if(!source.startsWith(rootModules+sep)||!target.startsWith(installModules+sep))throw new Error(`Unsafe dependency path: ${name}`);
    try{run('test',['-f',join(source,'package.json')]);}
    catch{throw new Error(`Pinned repository dependency is unavailable: ${name}`);}
    mkdirSync(dirname(target));
    try{symlinkSync(source,target);}catch(error){if(error.code!=='EEXIST')throw error;}
  }
}

// Synchronous helpers keep the setup loop small while still creating only under
// the fresh temporary prefix.
function mkdirSync(path){
  const result=spawnSync('mkdir',['-p',path]);
  if(result.status!==0)throw new Error(`Cannot create dependency path ${path}`);
}
function symlinkSync(source,target){
  const result=spawnSync('ln',['-s',source,target]);
  if(result.status!==0)throw new Error(`Cannot link pinned dependency ${source} -> ${target}`);
}

async function installArchive(prefix,metadata){
  linkDependencies(prefix,metadata);
  const packagePath=join(prefix,'node_modules','@umf','core');
  await mkdir(packagePath,{recursive:true});
  run('tar',['-xzf',archive,'-C',packagePath,'--strip-components=1']);
  assert.equal(JSON.parse(await readFile(join(packagePath,'package.json'),'utf8')).name,'@umf/core');
  return packagePath;
}

function installWorkerSource(packagePath){
  return `import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const packagePath=${JSON.stringify(packagePath)};
const require=createRequire(resolve(packagePath,'dist/umf-node.js'));
const addon=require('./umf_core_node.node');
if(typeof addon.executeValidateCoreRecordValuesHostJson!=='function')throw new Error('Packaged Node addon is missing the Record Values host-JSON operation');
let dispatches=0;const native=addon.executeValidateCoreRecordValuesHostJson;
addon.executeValidateCoreRecordValuesHostJson=function(...args){dispatches++;return native.apply(this,args);};
const [api,referenceApi,packet,host]=await Promise.all([
  import('@umf/core'),import('@umf/core/reference'),
  readFile(process.env.UMF_R5_FROZEN_PACKET,'utf8').then(JSON.parse),
  readFile(process.env.UMF_R5_HOST_PACKET,'utf8').then(JSON.parse),
]);
assert.equal(typeof api.validateCoreRecordValues,'function');
assert.equal(typeof referenceApi.validateCoreRecordValues,'function');
assert.notEqual(api.validateCoreRecordValues,referenceApi.validateCoreRecordValues,'default and reference selectors must resolve to distinct implementations');
const shape=thrown=>{const out={name:thrown.name??'Error',code:thrown.code??'',message:String(thrown.message??thrown),path:thrown.path??''};return out;};
const capture=run=>{try{return{ok:true,value:run()};}catch(error){return{ok:false,error:shape(error)};}};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const checkOutcome=(actual,expected,label)=>assert.equal(canonical(actual),canonical(expected),label);
const expectedOutcome=caseValue=>caseValue.thrown?{ok:false,error:{...caseValue.thrown,...(!Object.hasOwn(caseValue.thrown,'name')?{}:{name:caseValue.thrown.name})}}:{ok:true,value:caseValue.result};
const compareFrozen=(actual,item,label)=>{if(item.thrown&&!Object.hasOwn(item.thrown,'name'))delete actual.error?.name;assert.equal(canonical(actual),canonical(expectedOutcome(item)),label+' '+item.id);};
let defaultCalls=0;
for(const item of packet.cases){const before=dispatches;const actual=capture(()=>api.validateCoreRecordValues(item.source,item.identity,item.values));assert.equal(dispatches,before+1,'each default call must dispatch once to the packaged Rust addon: '+item.id);defaultCalls++;compareFrozen(actual,item,'default frozen case');}
const referenceDispatches=dispatches;
for(const item of packet.cases){const actual=capture(()=>referenceApi.validateCoreRecordValues(item.source,item.identity,item.values));compareFrozen(actual,item,'./reference frozen case');}
assert.equal(dispatches,referenceDispatches,'./reference selector must not dispatch the default Record Values Rust addon');
const fixture=host.fixture,raw=host.outcomes.rawCases;
function sourceAccessor(){let reads=0;const value={...fixture.source};Object.defineProperty(value,'future',{enumerable:true,get(){reads++;return true;}});return[value,()=>reads];}
function identityAccessor(){let reads=0;const value={get module(){reads++;return 'fixture';},element:'item'};return[value,()=>reads];}
function valuesAccessor(){let reads=0;const value=[{field:{module:'fixture',element:'label'},state:'present',get value(){reads++;return{string:'x'};}}];return[value,()=>reads];}
const hostCases=[];
{
 const [source,getters]=sourceAccessor();const before=dispatches;const actual=capture(()=>api.validateCoreRecordValues(source,fixture.identity,fixture.values));checkOutcome(actual,raw.sourceAccessor,'source accessor refusal');assert.equal(getters(),0);assert.equal(dispatches,before+1);hostCases.push('sourceAccessor');
}
{
 const [identity,getters]=identityAccessor();const before=dispatches;const actual=capture(()=>api.validateCoreRecordValues(fixture.source,identity,fixture.values));checkOutcome(actual,raw.identityAccessor,'identity accessor refusal');assert.equal(getters(),0);assert.equal(dispatches,before+1);hostCases.push('identityAccessor');
}
{
 const [values,getters]=valuesAccessor();const source={...fixture.source,umf:'0.7.0'};const before=dispatches;const actual=capture(()=>api.validateCoreRecordValues(source,fixture.identity,values));checkOutcome(actual,raw.valuesAccessorBeforeSourceVersion,'values accessor preflight refusal');assert.equal(getters(),0);assert.equal(dispatches,before+1);hostCases.push('valuesAccessorBeforeSourceVersion');
}
const sourceOrder=capture(()=>api.validateCoreRecordValues({...fixture.source,umf:'0.7.0'},{},fixture.values));checkOutcome(sourceOrder,host.outcomes.semanticOrder.invalidSourceBeforeIdentityMeaning,'source semantic refusal precedes identity meaning');
const valuesOrder=capture(()=>api.validateCoreRecordValues(fixture.source,{},fixture.values));checkOutcome(valuesOrder,host.outcomes.semanticOrder.copiedValuesBeforeIdentityMeaning,'value copy completes before identity semantic refusal');
const receipt={status:'pass',runtime:process.version,installedByPackageName:true,archiveSha256:process.env.UMF_R5_ARCHIVE_SHA256,sourceClosureSha256:process.env.UMF_R5_SOURCE_CLOSURE_SHA256,packageVersion:${JSON.stringify('0.5.6')},selectors:{defaultTarget:${JSON.stringify('./dist/umf-node.js')},referenceTarget:${JSON.stringify('./dist/umf.js')},distinctFunctions:true,defaultOperation:'Rust host-JSON addon',referenceRecordValueDispatches:0},default:{frozenCases:packet.cases.length,rustAddonDispatches:defaultCalls+hostCases.length+2},hostRefusals:hostCases,getterReads:{source:0,identity:0,values:0},semanticRefusalOrder:true};
process.stdout.write(JSON.stringify(receipt)+'\\n');
`;
}

function contentType(path){return({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'}[extname(path)]??'application/octet-stream');}

async function browserReplay(packagePath,info,packet,host){
  let browser;
  const requests=[];
  try{
      browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
      const page=await browser.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));page.on('request',request=>requests.push(request.url()));
      let instrumentedGlueSha256;
      await page.route('http://umf-r5.local/**',async route=>{
        try{
          const url=new URL(route.request().url());
          if(url.pathname==='/'){
            const imports={'@umf/core':'/package/'+info.browserTarget.replace(/^\.\//,''),'@umf/core/reference':'/package/'+info.referenceTarget.replace(/^\.\//,'')};
            await route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><script type="importmap">${JSON.stringify({imports})}</script>`});return;
          }
          if(url.pathname==='/frozen.json'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(packet)});return;}
          if(url.pathname==='/host.json'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(host)});return;}
          const relative=decodeURIComponent(url.pathname.replace(/^\/package\//,''));
          const path=resolve(packagePath,normalize(relative));
          if(!path.startsWith(packagePath+sep))throw new Error('path');
          let body=await readFile(path);
          if(path===join(packagePath,'dist','umf-browser.js')){
            const source=body.toString('utf8');
            const needle='function executeValidateCoreRecordValuesHostJson(resources_wire, source, identity, values, dispatcher, control_dispatcher) {';
            assert.equal(source.split(needle).length-1,1,'installed WASM glue must contain one Record Values host operation');
            body=Buffer.from(source.replace(needle,needle+'\n  globalThis.__umfR5RecordValuesWasmBridgeCalls = (globalThis.__umfR5RecordValuesWasmBridgeCalls || 0) + 1;'));
            instrumentedGlueSha256=hash(body);
          }
          await route.fulfill({status:200,contentType:contentType(path),body});
        }catch{await route.fulfill({status:404,body:'not found'});}
      });
      await page.goto('http://umf-r5.local/');
      const observed=await page.evaluate(async()=>{
        globalThis.__umfR5RecordValuesWasmBridgeCalls=0;
        const [packet,host]=await Promise.all([fetch('/frozen.json').then(r=>r.json()),fetch('/host.json').then(r=>r.json())]);
        const [api,referenceApi]=await Promise.all([import('@umf/core'),import('@umf/core/reference')]);
        if(typeof api.validateCoreRecordValues!=='function'||typeof referenceApi.validateCoreRecordValues!=='function')throw new Error('Record Values selector missing');
        if(api.validateCoreRecordValues===referenceApi.validateCoreRecordValues)throw new Error('default and reference selectors resolved to the same function');
        const capture=run=>{try{return{ok:true,value:run()};}catch(error){return{ok:false,error:{name:error?.name??'Error',code:error?.code??'',message:String(error?.message??error),path:error?.path??''}};}};
        const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
        const expectedOutcome=item=>item.thrown?{ok:false,error:{...item.thrown,...(!Object.hasOwn(item.thrown,'name')?{}:{name:item.thrown.name})}}:{ok:true,value:item.result};
        const compareFrozen=(actual,item)=>{if(item.thrown&&!Object.hasOwn(item.thrown,'name'))delete actual.error?.name;if(canonical(actual)!==canonical(expectedOutcome(item)))throw new Error('Frozen result differs: '+item.id);};
        let defaultCalls=0;
        for(const item of packet.cases){const before=globalThis.__umfR5RecordValuesWasmBridgeCalls;const actual=capture(()=>api.validateCoreRecordValues(item.source,item.identity,item.values));if(globalThis.__umfR5RecordValuesWasmBridgeCalls!==before+1)throw new Error('Default route did not make exactly one Record Values WASM bridge call for '+item.id);defaultCalls++;compareFrozen(actual,item);}
        const referenceCalls=globalThis.__umfR5RecordValuesWasmBridgeCalls;
        for(const item of packet.cases){const actual=capture(()=>referenceApi.validateCoreRecordValues(item.source,item.identity,item.values));compareFrozen(actual,item);}
        if(globalThis.__umfR5RecordValuesWasmBridgeCalls!==referenceCalls)throw new Error('./reference unexpectedly dispatched the Record Values WASM bridge');
        const fixture=host.fixture,raw=host.outcomes.rawCases;let sourceReads=0,identityReads=0,valueReads=0;
        const source={...fixture.source};Object.defineProperty(source,'future',{enumerable:true,get(){sourceReads++;return true;}});
        const identity={get module(){identityReads++;return'fixture';},element:'item'};
        const values=[{field:{module:'fixture',element:'label'},state:'present',get value(){valueReads++;return{string:'x'};}}];
        const checks=[
          ['sourceAccessor',capture(()=>api.validateCoreRecordValues(source,fixture.identity,fixture.values))],
          ['identityAccessor',capture(()=>api.validateCoreRecordValues(fixture.source,identity,fixture.values))],
          ['valuesAccessorBeforeSourceVersion',capture(()=>api.validateCoreRecordValues({...fixture.source,umf:'0.7.0'},fixture.identity,values))],
        ];
        for(const[name,actual]of checks){if(canonical(actual)!==canonical(raw[name]))throw new Error('Host admission refusal differs: '+name);}
        if(sourceReads||identityReads||valueReads)throw new Error('A refused accessor was invoked');
        const sourceOrder=capture(()=>api.validateCoreRecordValues({...fixture.source,umf:'0.7.0'},{},fixture.values));
        if(canonical(sourceOrder)!==canonical(host.outcomes.semanticOrder.invalidSourceBeforeIdentityMeaning))throw new Error('Source/identity refusal ordering differs');
        const valuesOrder=capture(()=>api.validateCoreRecordValues(fixture.source,{},fixture.values));
        if(canonical(valuesOrder)!==canonical(host.outcomes.semanticOrder.copiedValuesBeforeIdentityMeaning))throw new Error('Value-copy/identity refusal ordering differs');
        if('process'in globalThis||'Buffer'in globalThis)throw new Error('Node globals are present in browser context');
        return{defaultCalls,referenceRecordValueDispatches:0,wasmBridgeDispatches:globalThis.__umfR5RecordValuesWasmBridgeCalls,hostRefusalCases:checks.map(x=>x[0]),getterReads:{source:sourceReads,identity:identityReads,values:valueReads},semanticRefusalOrder:true,nodeGlobalsAbsent:true,userAgent:navigator.userAgent};
      });
      assert.deepEqual(pageErrors,[]);
      assert(requests.some(url=>url.endsWith('/umf_core_wasm_bg.wasm')),'the installed browser route must load its packaged WASM');
      return{status:'pass',browser:browser.version(),...observed,wasmRequested:requests.some(url=>url.endsWith('/umf_core_wasm_bg.wasm')),instrumentation:'count at installed wasm-bindgen executeValidateCoreRecordValuesHostJson bridge entry',instrumentedGlueSha256};
  }finally{await browser?.close();}
}

async function main(){
  const [archiveBytes,packetBytes,hostBytes]=await Promise.all([readFile(archive),readFile(frozenPath),readFile(hostPath)]);
  const archiveSha256=hash(archiveBytes),packetSha256=hash(packetBytes),hostPacketSha256=hash(hostBytes);
  assert.equal(archiveSha256,expectedArchiveSha256,'fixed-point archive digest differs');
  const packet=JSON.parse(packetBytes),host=JSON.parse(hostBytes),info=packageInfo();
  const prefix=await mkdtemp(join(tmpdir(),'umf-r5-record-values-v4-'));
  try{
    const packagePath=await installArchive(prefix,info.metadata);
    const worker=join(prefix,'replay-record-values.mjs');
    await writeFile(worker,installWorkerSource(packagePath));
    const nodeResult=run(process.execPath,[worker],{cwd:prefix,env:{...process.env,UMF_R5_FROZEN_PACKET:frozenPath,UMF_R5_HOST_PACKET:hostPath,UMF_R5_ARCHIVE_SHA256:archiveSha256,UMF_R5_SOURCE_CLOSURE_SHA256:expectedSourceClosureSha256}});
    const node=JSON.parse(nodeResult.trim().split('\n').at(-1));
    const browser=await browserReplay(packagePath,info,packet,host);
    const receipt={status:'pass',archive:{path:'.cache/sdk-distribution/cohorts/4547d877/umf-sdk.tgz',sha256:archiveSha256,packageVersion:info.metadata.version,sourceClosureSha256:info.manifest.sourceClosure.sha256},frozen:{path:'docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json',sha256:packetSha256,cases:packet.cases.length},hostAdmission:{path:'docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json',sha256:hostPacketSha256,cases:['sourceAccessor','identityAccessor','valuesAccessorBeforeSourceVersion','invalidSourceBeforeIdentityMeaning','copiedValuesBeforeIdentityMeaning']},node,browser,harnessSha256:hash(await readFile(fileURLToPath(import.meta.url)))};
    await mkdir(outputDir,{recursive:true});
    await writeFile(join(outputDir,'node.json'),JSON.stringify(node,null,2)+'\n');
    await writeFile(join(outputDir,'chromium.json'),JSON.stringify(browser,null,2)+'\n');
    await writeFile(join(outputDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    process.stdout.write(JSON.stringify({status:receipt.status,archiveSha256,sourceClosureSha256:expectedSourceClosureSha256,frozenCases:packet.cases.length,nodeRuntime:node.runtime,chromium:browser.browser,nodeDispatches:node.default.rustAddonDispatches,browserDispatches:browser.nativeCalls,referenceDispatches:{node:node.selectors.referenceRecordValueDispatches,browser:browser.referenceRecordValueDispatches},hostRefusals:receipt.hostAdmission.cases.length,nodeGlobalsAbsent:browser.nodeGlobalsAbsent})+'\n');
  }finally{await rm(prefix,{recursive:true,force:true});}
}

await main();
