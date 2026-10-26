// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed-package replay for the three Rust-selected Core Cardinality routes.
// Requires the final private fixed-point SDK archive and its expected closure SHA.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, readdir, writeFile, rm} from 'node:fs/promises';
import {extname, join, resolve, posix} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const expectedClosure=process.argv[3]??'';
const output=process.argv[4]?resolve(process.argv[4]):null;
if(!process.argv[2]||!expectedClosure)throw new Error('Usage: bun scripts/rust-migration/r8/core-cardinality-installed.mjs <final-fixed-point-umf-sdk.tgz> <expected-source-closure-sha256> [receipt.json]');
assert.match(expectedClosure,/^[0-9a-f]{64}$/);
const frozenPath=join(repo,'docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json');
const frozenBytes=await readFile(frozenPath);
const frozen=JSON.parse(frozenBytes);
const frozenSha='6d18efe22f1eb525844cb78ae5cc7854ec78ce1aa103d3fdc2eb65b274c5aeea';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
assert.equal(sha256(frozenBytes),frozenSha,'frozen TypeScript predecessor packet changed');

// One self-contained probe is emitted for Node, Bun and browser module execution.
function probeRoutes(root,reference,frozen){
 const capture=operation=>{try{return {ok:true,value:operation()};}catch(error){const value=error;return {ok:false,error:{code:value?.code??'',message:value?.message??String(error),path:value?.path??''}};}};
 const sourceWith=mutate=>{const value=structuredClone(frozen.document);mutate(value);return value;};
 const identity={...frozen.identity};
 const inspectCases={
  missing:capture(()=>root.inspectCoreCardinality(frozen.document,identity)),
  known:capture(()=>root.inspectCoreCardinality(frozen.known,identity)),
  unknown:capture(()=>root.inspectCoreCardinality(frozen.unknown,identity)),
  surrogate:capture(()=>{const value=structuredClone(frozen.document);value.modules[0].elements[0].cardinality='\ud800';return root.inspectCoreCardinality(value,identity);}),
  inapplicable:capture(()=>root.inspectCoreCardinality(frozen.inapplicable,identity)),
  surrogateIdentity:capture(()=>root.inspectCoreCardinality(frozen.surrogateIdentityDocument,frozen.surrogateIdentity)),
  missingIdentity:capture(()=>root.inspectCoreCardinality(frozen.document,{module:'absent',element:'absent'})),
  invalidSourceDiagnostics:capture(()=>root.inspectCoreCardinality(frozen.invalidSource,identity)),
 };
 const declaration=root.declareCoreCardinality(frozen.document,identity,frozen.request);
 const invalidSemanticReceipt=structuredClone(declaration);invalidSemanticReceipt.source=structuredClone(frozen.unknown);invalidSemanticReceipt.request={cardinality:'one'};
 let currentGetterCalls=0;const currentAccessor={get future(){currentGetterCalls++;return true;}};
 const declareCases={
  base:{ok:true,value:declaration},
  surrogateItem:capture(()=>root.declareCoreCardinality(frozen.surrogateItemDocument,identity,frozen.surrogateItemRequest)),
  unknownOverwrite:capture(()=>root.declareCoreCardinality(frozen.unknown,identity,{cardinality:'one'})),
  invalidRequest:capture(()=>root.declareCoreCardinality(frozen.document,identity,{cardinality:'array',itemType:{module:'',element:''}})),
 };
 const verifyCases={
  valid:capture(()=>root.verifyCoreCardinalityDeclaration(declaration,declaration.target)),
  malformedSourceReceipt:capture(()=>root.verifyCoreCardinalityDeclaration(frozen.malformedSourceReceipt,declaration.target)),
  malformedTargetReceipt:capture(()=>root.verifyCoreCardinalityDeclaration(frozen.malformedTargetReceipt,declaration.target)),
  receiptBeforeCurrent:capture(()=>root.verifyCoreCardinalityDeclaration(invalidSemanticReceipt,currentAccessor)),
  currentGetterCalls,
 };
 let accessorCalls=0;
 const accessorIdentity={get module(){accessorCalls++;return 'm';},get element(){accessorCalls++;return 'e';}};
 const nonEnumerableIdentity={module:'m'};Object.defineProperty(nonEnumerableIdentity,'element',{value:'e',enumerable:false});
 const symbolIdentity={module:'m',element:'e',[Symbol('future')]:true};
 const customPrototypeIdentity=Object.assign(Object.create({future:true}),{module:'m',element:'e'});
 const identityControlsFull={
  nullIdentity:capture(()=>root.inspectCoreCardinality(frozen.document,null)),
  extraIdentity:capture(()=>root.inspectCoreCardinality(frozen.document,{module:'m',element:'e',future:true})),
  accessorIdentity:capture(()=>root.inspectCoreCardinality(frozen.document,accessorIdentity)),
  nonEnumerable:capture(()=>root.inspectCoreCardinality(frozen.document,nonEnumerableIdentity)),
  symbol:capture(()=>root.inspectCoreCardinality(frozen.document,symbolIdentity)),
  customPrototype:capture(()=>root.inspectCoreCardinality(frozen.document,customPrototypeIdentity)),
 };
 const requestControls={
  nan:capture(()=>root.declareCoreCardinality(frozen.document,identity,{cardinality:'array',future:NaN})),
  infinity:capture(()=>root.declareCoreCardinality(frozen.document,identity,{cardinality:'array',future:Infinity})),
  undefined:capture(()=>root.declareCoreCardinality(frozen.document,identity,{cardinality:'array',future:undefined})),
  bigint:capture(()=>root.declareCoreCardinality(frozen.document,identity,{cardinality:'array',future:1n})),
  sparse:(()=>{const itemType=[];itemType.length=1;return capture(()=>root.declareCoreCardinality(frozen.document,identity,{cardinality:'array',itemType}));})(),
  cycle:(()=>{const request={cardinality:'array',itemType:{module:'m',element:'v'}};request.itemType.future=request;return capture(()=>root.declareCoreCardinality(frozen.document,identity,request));})(),
 };
 const requestSchemaInputs={
  null:null,empty:{},number:42,boolean:true,array:[],extra:{cardinality:'one',future:true},invalidCardinality:{cardinality:'bogus'},nullCardinality:{cardinality:null},numberCardinality:{cardinality:1},conditionalOne:{cardinality:'one',itemType:{module:'m',element:'v'}},arrayNullItem:{cardinality:'array',itemType:null},arrayEmptyItem:{cardinality:'array',itemType:{}},arrayModuleEmpty:{cardinality:'array',itemType:{module:'',element:'v'}},arrayElementEmpty:{cardinality:'array',itemType:{module:'m',element:''}},arrayItemExtra:{cardinality:'array',itemType:{module:'m',element:'v',future:true}},arrayItemArray:{cardinality:'array',itemType:[]},mapItemNumber:{cardinality:'map',itemType:1},conditionalUnspecified:{cardinality:'unspecified',itemType:{module:'m',element:'v'}},conditionalNull:{cardinality:null,itemType:{module:'m',element:'v'}},conditionalNumber:{cardinality:1,itemType:{module:'m',element:'v'}},conditionalBogus:{cardinality:'bogus',itemType:{module:'m',element:'v'}},arrayItemNumberKeys:{cardinality:'array',itemType:{module:1,element:2}},
 };
 const requestSchemaControls=Object.fromEntries(Object.entries(requestSchemaInputs).map(([key,request])=>[key,capture(()=>root.declareCoreCardinality(frozen.document,identity,request))]));
 const hiddenSource=sourceWith(value=>Object.defineProperty(value,'hidden',{value:true,enumerable:false}));
 const symbolSource=sourceWith(value=>Object.defineProperty(value,Symbol('hidden'),{value:true,enumerable:true}));
 const customPrototypeSource=sourceWith(value=>Object.setPrototypeOf(value,{future:true}));
 const sparseSource=sourceWith(value=>{value.modules=[];value.modules.length=1;});
 const cyclicSource=sourceWith(value=>{value.extensions={};value.extensions.self=value;});
 const nanSource=sourceWith(value=>{value.extensions={future:NaN};});
 const infinitySource=sourceWith(value=>{value.extensions={future:Infinity};});
 const undefinedSource=sourceWith(value=>{value.extensions={future:undefined};});
 const bigintSource=sourceWith(value=>{value.extensions={future:1n};});
 const nestedUndefinedSource=sourceWith(value=>{value.modules[0].elements[0].extensions.future.deep=undefined;});
 let orderingSourceCalls=0;
 const accessorSource={get future(){orderingSourceCalls++;return true;}};
 const orderingControls={
  declareInvalidRequestBeforeSource:capture(()=>root.declareCoreCardinality(accessorSource,identity,{cardinality:'array',itemType:{module:'',element:''}})),
  declareSourceBeforeIdentity:capture(()=>root.declareCoreCardinality(accessorSource,null,frozen.request)),
  inspectSourceBeforeIdentity:capture(()=>root.inspectCoreCardinality(accessorSource,null)),
 };
 const hostAdmissionControls={
  hidden:capture(()=>root.inspectCoreCardinality(hiddenSource,identity)),symbol:capture(()=>root.inspectCoreCardinality(symbolSource,identity)),customPrototype:capture(()=>root.inspectCoreCardinality(customPrototypeSource,identity)),sparse:capture(()=>root.inspectCoreCardinality(sparseSource,identity)),cycle:capture(()=>root.inspectCoreCardinality(cyclicSource,identity)),nan:capture(()=>root.inspectCoreCardinality(nanSource,identity)),infinity:capture(()=>root.inspectCoreCardinality(infinitySource,identity)),undefined:capture(()=>root.inspectCoreCardinality(undefinedSource,identity)),bigint:capture(()=>root.inspectCoreCardinality(bigintSource,identity)),nestedPath:capture(()=>root.inspectCoreCardinality(nestedUndefinedSource,identity)),requestControls,requestSchemaControls,identityControlsFull,receiptBeforeCurrent:verifyCases.receiptBeforeCurrent,accessorGetterCalls:accessorCalls,
 };
 const result={inspectCases,declareCases,verifyCases,orderingControls,hostAdmissionControls};
 const errorShape=error=>({name:error?.name??'',constructor:error?.constructor?.name??'',message:error?.message??String(error),code:error?.code??'',path:error?.path??'',isError:error instanceof Error});
 const shapeFor=(route,operation)=>{try{operation();return {kind:'result'};}catch(error){return {kind:'error',...errorShape(error)};}};
 const shapesFor=route=>{
  const hidden=structuredClone(frozen.document);Object.defineProperty(hidden,'hidden',{value:true,enumerable:false});
  const invalidNumber=structuredClone(frozen.document);invalidNumber.extensions={future:NaN};
  const accessor={get future(){return true;}};
  return {
   genuineEngineRefusal:shapeFor(route,()=>route.declareCoreCardinality(frozen.unknown,identity,{cardinality:'one'})),
   genuineInvalidRequest:shapeFor(route,()=>route.declareCoreCardinality(frozen.document,identity,{cardinality:'array',itemType:{module:'',element:''}})),
   hiddenSourceAdmission:shapeFor(route,()=>route.inspectCoreCardinality(hidden,identity)),
   invalidNumberSourceAdmission:shapeFor(route,()=>route.inspectCoreCardinality(invalidNumber,identity)),
   accessorSourceAdmission:shapeFor(route,()=>route.inspectCoreCardinality(accessor,identity)),
   missingIdentity:shapeFor(route,()=>route.inspectCoreCardinality(frozen.document,{module:'absent',element:'absent'})),
  };
 };
 const hostShapes={installed:shapesFor(root),reference:shapesFor(reference)};
 const proxyTrace=route=>{
  const events=[];const target=structuredClone(frozen.document);
  const input=new Proxy(target,{
   getPrototypeOf(value){events.push('getPrototypeOf');return Reflect.getPrototypeOf(value);},
   ownKeys(value){events.push('ownKeys');return Reflect.ownKeys(value);},
   getOwnPropertyDescriptor(value,key){events.push(`getOwnPropertyDescriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(value,key);},
   get(value,key,receiver){events.push(`get:${String(key)}`);return Reflect.get(value,key,receiver);},
  });
  const observation=capture(()=>route.inspectCoreCardinality(input,identity));
  return {observation,events};
 };
 const inputProxyError=route=>{
  const events=[],fieldReads=[];const base=new Error('caller supplied spoof-shaped failure');
  Object.defineProperties(base,{name:{value:'UmfCoreError',enumerable:true},code:{value:'CORE_CARDINALITY_CALLER_FORGED',enumerable:true},path:{value:'/spoof',enumerable:true}});
  const thrown=new Proxy(base,{get(target,key,receiver){if(['name','code','path','message'].includes(String(key)))fieldReads.push(String(key));return Reflect.get(target,key,receiver);}});
  const source=new Proxy(structuredClone(frozen.document),{getPrototypeOf(target){events.push('getPrototypeOf');return Reflect.getPrototypeOf(target);},ownKeys(){events.push('ownKeys:throw');throw thrown;}});
  let caught;try{route.inspectCoreCardinality(source,identity);}catch(error){caught=error;}
  return {sameThrownIdentity:caught===thrown,thrownErrorPropertyReads:fieldReads,events};
 };
 const trace={installed:proxyTrace(root),reference:proxyTrace(reference)};
 const forgedHostFailure={installed:inputProxyError(root),reference:inputProxyError(reference)};
 return {frozenResults:result,hostShapes,trace,forgedHostFailure,orderingSourceGetterCalls:orderingSourceCalls,receiptPrototype:{receipt:Object.getPrototypeOf(declaration)?.constructor?.name??null,source:Object.getPrototypeOf(declaration.source)?.constructor?.name??null,target:Object.getPrototypeOf(declaration.target)?.constructor?.name??null},routeTypes:{installed:Object.fromEntries(['inspectCoreCardinality','declareCoreCardinality','verifyCoreCardinalityDeclaration'].map(k=>[k,typeof root[k]])),reference:Object.fromEntries(['inspectCoreCardinality','declareCoreCardinality','verifyCoreCardinalityDeclaration'].map(k=>[k,typeof reference[k]]))}};
}

const temp=join(tmpdir(),'umf-r8-core-cardinality-installed-'+process.pid+'-'+Date.now());
const packageRoot=join(temp,'node_modules/@umf/core');
const run=async(command,args,cwd=temp)=>{const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return {code:await child.exited,stdout:stdout.trim(),stderr:stderr.trim()};};
const assertPass=(result,label)=>assert.equal(result.code,0,`${label} failed (${result.code})\n${result.stdout}\n${result.stderr}`);
let browser,server;
try{
 assert.ok((await readFile(archive)).byteLength>0,'archive is empty');
 await mkdir(temp,{recursive:true});
 const listing=await run('tar',['-tzf',archive],temp);assertPass(listing,'archive listing');
 const members=listing.stdout.split('\n').filter(Boolean);
 for(const member of members){const normalized=posix.normalize(member);assert.ok(!member.startsWith('/')&&!normalized.startsWith('../')&&!normalized.split('/').includes('..'),'unsafe archive member: '+member);}
 await mkdir(packageRoot,{recursive:true});
 assertPass(await run('tar',['-xzf',archive,'--strip-components=1','-C',packageRoot]),'archive extraction');
 const archiveBytes=await readFile(archive);
 const archiveManifest=JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8'));
 const sdkManifest=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 const pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 assert.equal(archiveManifest.profile,'umf.sdk.distribution.rust-default/1');
 assert.match(archiveManifest.releaseStatus,/private.*qualification/i);
 assert.equal(archiveManifest.sourceTransformStatus,'fixed-point');
 assert.equal(archiveManifest.sourceTreeSha256,expectedClosure,'pinned expected source closure');
 assert.equal(archiveManifest.sourceTreeSha256,sdkManifest.sourceClosure.sha256);
 assert.equal(archiveManifest.capturedLiveSourceTreeSha256,sdkManifest.sourceClosure.capturedLiveSha256);
 assert.equal(archiveManifest.sourceTreeSha256,archiveManifest.capturedLiveSourceTreeSha256,'archive source must be fixed-point against captured live tree');
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');
 assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');
 assert.equal(pkg.exports['.'].import,'./dist/umf-browser.js');
 assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 for(const [name,digest] of Object.entries(archiveManifest.sha256))assert.equal(sha256(await readFile(join(packageRoot,name))),digest,`archive member digest: ${name}`);
 const routeProbe=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';const frozen=JSON.parse(await readFile(${JSON.stringify(frozenPath)},'utf8'));const probe=${probeRoutes.toString()};assert.equal(import.meta.resolve('@umf/core'),new URL('./node_modules/@umf/core/dist/umf-node.js',import.meta.url).href);const result=probe(root,reference,frozen);const referenceOnly=probe(reference,reference,frozen);console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,...result,referenceFrozenResults:referenceOnly.frozenResults,referenceHostShapes:referenceOnly.hostShapes.installed}));`;
 await writeFile(join(temp,'cardinality-probe.mjs'),routeProbe);
 const node=await run('node',['cardinality-probe.mjs']);assertPass(node,'installed Node replay');
 const bun=await run('bun',['cardinality-probe.mjs']);assertPass(bun,'installed Bun replay');
 const nodeResult=JSON.parse(node.stdout),bunResult=JSON.parse(bun.stdout);
 const expectedFrozen={inspectCases:{missing:frozen.inspections.missing,known:frozen.inspections.known,unknown:frozen.inspections.unknown,surrogate:frozen.inspections.surrogate,inapplicable:frozen.inspections.inapplicable,surrogateIdentity:frozen.refusals.surrogateIdentity,missingIdentity:frozen.refusals.missingIdentity,invalidSourceDiagnostics:frozen.refusals.invalidSourceDiagnostics},declareCases:{base:{ok:true,value:frozen.declaration},surrogateItem:frozen.surrogateItemDeclaration,unknownOverwrite:frozen.refusals.unknownOverwrite,invalidRequest:frozen.refusals.invalidRequest},verifyCases:{valid:frozen.verified,malformedSourceReceipt:frozen.refusals.malformedSourceReceipt,malformedTargetReceipt:frozen.refusals.malformedTargetReceipt,receiptBeforeCurrent:frozen.hostAdmissionControls.receiptBeforeCurrent,currentGetterCalls:0},orderingControls:{declareInvalidRequestBeforeSource:frozen.orderingControls.declareInvalidRequestBeforeSource,declareSourceBeforeIdentity:frozen.orderingControls.declareSourceBeforeIdentity,inspectSourceBeforeIdentity:frozen.orderingControls.inspectSourceBeforeIdentity},hostAdmissionControls:frozen.hostAdmissionControls};
  for(const [label,result] of [['Node',nodeResult],['Bun',bunResult]]){
  assert.deepEqual(result.routeTypes.installed,{inspectCoreCardinality:'function',declareCoreCardinality:'function',verifyCoreCardinalityDeclaration:'function'},`${label} installed route exports`);
  assert.deepEqual(result.routeTypes.reference,result.routeTypes.installed,`${label} predecessor route exports`);
  assert.equal(canonical(result.referenceFrozenResults),canonical(expectedFrozen),`${label} frozen TypeScript reference-route results`);
  assert.deepEqual(result.referenceHostShapes,result.hostShapes.installed,`${label} installed/reference error class and envelope parity`);
  const actual={inspectCases:result.frozenResults.inspectCases,declareCases:result.frozenResults.declareCases,verifyCases:result.frozenResults.verifyCases,orderingControls:result.frozenResults.orderingControls,hostAdmissionControls:result.frozenResults.hostAdmissionControls};
  assert.equal(canonical(actual),canonical(expectedFrozen),`${label} installed route equals frozen TypeScript predecessor host/semantic cases`);
  assert.equal(result.orderingSourceGetterCalls,0,`${label} source accessors are not invoked while detecting them`);
  assert.deepEqual(result.receiptPrototype,{receipt:null,source:null,target:null},`${label} receipt output copy prototypes`);
  assert.equal(canonical(result.trace.installed.observation),canonical(result.trace.reference.observation),`${label} Proxy result parity`);
  assert.deepEqual(result.trace.installed.events,result.trace.reference.events,`${label} Proxy trap sequence parity`);
  for(const route of ['installed','reference']){assert.equal(result.forgedHostFailure[route].sameThrownIdentity,true,`${label} ${route} preserves caller-thrown Proxy error identity`);assert.deepEqual(result.forgedHostFailure[route].thrownErrorPropertyReads,[],`${label} ${route} does not inspect caller-thrown error fields`);}
  assert.deepEqual(result.forgedHostFailure.installed.events,result.forgedHostFailure.reference.events,`${label} forged-error Proxy trap parity`);
  for(const route of ['installed','reference']){for(const shape of Object.values(result.hostShapes[route])){assert.equal(shape.kind,'error');assert.equal(shape.isError,true);assert.equal(shape.name,'UmfError');}assert.equal(result.hostShapes[route].genuineEngineRefusal.code,'CORE_CARDINALITY_UNKNOWN');assert.equal(result.hostShapes[route].genuineInvalidRequest.code,'CORE_CARDINALITY_REQUEST');assert.equal(result.hostShapes[route].hiddenSourceAdmission.code,'NON_JSON');assert.equal(result.hostShapes[route].invalidNumberSourceAdmission.code,'NUMBER');assert.equal(result.hostShapes[route].accessorSourceAdmission.code,'NON_JSON');assert.equal(result.hostShapes[route].missingIdentity.code,'CORE_CARDINALITY_MISSING');}
 }
 assert.equal(canonical(nodeResult.frozenResults),canonical(bunResult.frozenResults),'Node/Bun full outcome parity');
 assert.deepEqual(nodeResult.trace,bunResult.trace,'Node/Bun proxy traces');
 assert.deepEqual(nodeResult.forgedHostFailure,bunResult.forgedHostFailure,'Node/Bun caller-thrown identity controls');
 assert.deepEqual(nodeResult.hostShapes,bunResult.hostShapes,'Node/Bun error class/envelope shapes');assert.equal(canonical(nodeResult.referenceFrozenResults),canonical(bunResult.referenceFrozenResults),'Node/Bun TypeScript reference parity');assert.equal(nodeResult.orderingSourceGetterCalls,0);assert.equal(bunResult.orderingSourceGetterCalls,0);
 const browserProbe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';const frozen=await(await fetch('/frozen-cardinality.json')).json();const probe=${probeRoutes.toString()};const result=probe(root,reference,frozen);const referenceOnly=probe(reference,reference,frozen);if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('browser probe exposed Node globals');window.cardinalityProbe={...result,referenceFrozenResults:referenceOnly.frozenResults,referenceHostShapes:referenceOnly.hostShapes.installed};`;
 const browserEntry='/node_modules/@umf/core/dist/umf-browser.js';
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':browserEntry,'@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/cardinality-browser-probe.js"></script>`;
 const pageErrors=[],requests=[],browserRequestUrls=[];
 server=createServer(async(req,res)=>{const url=new URL(req.url??'/','http://127.0.0.1');const relative=url.pathname.slice(1)||'index.html';requests.push({path:relative,origin:url.origin});if(relative==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}if(relative==='cardinality-browser-probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return;}if(relative==='frozen-cardinality.json'){res.writeHead(200,{'content-type':'application/json'});res.end(frozenBytes);return;}try{const bytes=await readFile(join(temp,relative));res.writeHead(200,{'content-type':extname(relative)==='.wasm'?'application/wasm':extname(relative)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end('not found');}});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(String(error)));page.on('request',request=>browserRequestUrls.push(request.url()));await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>Boolean(window.cardinalityProbe),undefined,{timeout:60000});
 const chromiumResult=await page.evaluate(()=>({probe:window.cardinalityProbe,userAgent:navigator.userAgent}));assert.deepEqual(pageErrors,[]);assert.equal(canonical(chromiumResult.probe.frozenResults),canonical(nodeResult.frozenResults),'Chromium/Node frozen results');assert.deepEqual(chromiumResult.probe.trace,nodeResult.trace,'Chromium/Node proxy traces');assert.deepEqual(chromiumResult.probe.forgedHostFailure,nodeResult.forgedHostFailure,'Chromium/Node caller failure identity');assert.deepEqual(chromiumResult.probe.hostShapes,nodeResult.hostShapes,'Chromium/Node host error shapes');assert.equal(canonical(chromiumResult.probe.referenceFrozenResults),canonical(nodeResult.referenceFrozenResults),'Chromium/Node reference parity');assert.equal(chromiumResult.probe.orderingSourceGetterCalls,0);assert(requests.some(value=>value.path==='node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'),'browser WASM member requested');assert(browserRequestUrls.every(url=>url.startsWith(`http://127.0.0.1:${address.port}/`)),`browser made external request: ${browserRequestUrls.filter(url=>!url.startsWith(`http://127.0.0.1:${address.port}/`)).join(', ')}`);
 const memberNames=['manifest.json','package.json','dist/rust-default-manifest.json','dist/umf-node.js','dist/umf-browser.js','dist/umf.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm','dist/src/access/rust-cardinality-default.d.ts','dist/src/index-node-v4.d.ts','dist/src/index-browser-v4.d.ts'];
 const memberHashes={};for(const member of memberNames){try{memberHashes[member]=sha256(await readFile(join(packageRoot,member)));}catch{memberHashes[member]=null;}}
 const receipt={format:'umf.r8.core-cardinality-installed/1',status:'pass',qualification:'Private archive qualification only for the three Core Cardinality operations; not full SDK closure, ledger retirement, support expansion or release qualification.',archive:{path:archive,sha256:sha256(archiveBytes),bytes:archiveBytes.byteLength,closureSha256:archiveManifest.sourceTreeSha256,capturedLiveSourceTreeSha256:archiveManifest.capturedLiveSourceTreeSha256,manifestSha256:sha256(await readFile(join(packageRoot,'manifest.json'))),verifiedMemberCount:Object.keys(archiveManifest.sha256).length},predecessor:{path:frozenPath,sha256:frozenSha,semanticCases:Object.keys(frozen.inspections).length+Object.keys(frozen.refusals).length},memberHashes,runtimes:{node:nodeResult.runtime,bun:bunResult.runtime,chromium:{version:browser.version(),userAgent:chromiumResult.userAgent,wasmRequested:true,externalRequests:0}},observations:{operations:['inspectCoreCardinality','declareCoreCardinality','verifyCoreCardinalityDeclaration'],installedReference:'passed',frozenTypeScriptEnvelopes:'passed',hostAdmissionAndOrder:'passed',proxyTrapTrace:'recorded-and-compared',callerThrownSpoofedErrorIdentity:'passed',genuineUmfErrorShape:'passed',nodeBunChromiumParity:'passed'},details:{node:nodeResult,bun:bunResult,chromium:chromiumResult.probe,proxyRequests:requests}};
 if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
