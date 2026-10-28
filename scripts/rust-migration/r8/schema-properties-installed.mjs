// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed-package, source-pinned replay for the four Schema Properties routes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const checkGenerated=process.argv[2]==='--check-generated';
const archive=resolve(process.argv[2]??''), expectedClosure=process.argv[3]??'';
const output=process.argv[4]?resolve(process.argv[4]):null;
if(!checkGenerated&&(!process.argv[2]||!expectedClosure))throw new Error('Usage: bun scripts/rust-migration/r8/schema-properties-installed.mjs <new-umf-sdk.tgz> <expected-source-closure-sha256> [receipt.json]');
const evidence=join(repo,'docs/helix/04-build/evidence/rust-migration');
const packets={properties:join(evidence,'r5-schema-properties/frozen-typescript.json'),field:join(evidence,'r5-field-value/frozen-typescript.json'),defaults:join(evidence,'r5-schema-defaults/frozen-typescript.json')};
const packetBytes=Object.fromEntries(await Promise.all(Object.entries(packets).map(async([k,p])=>[k,await readFile(p)])));
const packet=Object.fromEntries(Object.entries(packetBytes).map(([k,b])=>[k,JSON.parse(b)]));
const sha256=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(n=>[n,v[n]])):v);
const temp=join(tmpdir(),'umf-r8-schema-properties-installed-'+process.pid+'-'+Date.now());
const packageRoot=join(temp,'node_modules/@umf/core');
const installedConsumer=process.env.UMF_R8_INSTALLED_CONSUMER_ROOT?resolve(process.env.UMF_R8_INSTALLED_CONSUMER_ROOT):null;
const run=async(command,args,cwd=temp)=>{const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return{code:await child.exited,stdout:stdout.trim(),stderr:stderr.trim()};};
const assertPass=(r,label)=>assert.equal(r.code,0,`${label} failed (${r.code})\n${r.stdout}\n${r.stderr}`);
const routeNames=['inspectCoreSchemaProperties','declareCoreSchemaProperties','validateCoreFieldValue','resolveCoreDefault'];
const probe=`
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';
const packet=JSON.parse(await readFile('__PACKETS_JSON_PATH__','utf8'));
const canonical=${canonical.toString()};
const outcome=fn=>{try{return{ok:true,value:fn()}}catch(e){return{ok:false,error:{name:e?.name??typeof e,code:typeof e?.code==='string'?e.code:'',message:typeof e?.message==='string'?e.message:String(e),path:typeof e?.path==='string'?e.path:''}}}};
const names=${JSON.stringify(routeNames)};for(const route of [root,reference])for(const name of names)assert.equal(typeof route[name],'function',name+' export');
const p=packet.properties,f=packet.field,d=packet.defaults,inputs=p.inputs;
assert.equal(canonical(Object.keys(p.success).sort()),canonical(['declare','inspectDocument','inspectElement','inspectModule','unknownQualifierInspection','unknownUnrelatedFacetMerge'].sort()),'frozen property-success keys');
assert.equal(canonical(Object.keys(p.refusals).sort()),canonical(['patchBeforeInvalidSource','sourceBeforeMissingIdentity','unknownExistingGroup'].sort()),'frozen property-refusal keys');
const shared=(route)=>{
 const cases={};
 const identities={inspectDocument:{scope:'document'},inspectModule:{scope:'module',module:'m'},inspectElement:inputs.identity,unknownQualifierInspection:p.success.unknownQualifierInspection.value.identity};
 for(const [key,id] of Object.entries(identities)){const source=key==='unknownQualifierInspection'?p.success.unknownQualifierInspection.value.source:inputs.source;cases[key]=outcome(()=>route.inspectCoreSchemaProperties(structuredClone(source),structuredClone(id)));}
 cases.declare=outcome(()=>route.declareCoreSchemaProperties(structuredClone(inputs.source),structuredClone(inputs.identity),structuredClone(inputs.patch)));
 cases.unknownUnrelatedFacetMerge=outcome(()=>route.declareCoreSchemaProperties(structuredClone(inputs.unknownFacets.source),structuredClone(inputs.identity),structuredClone(inputs.unknownFacets.patch)));
 cases.unknownExistingGroup=outcome(()=>route.declareCoreSchemaProperties(structuredClone(inputs.unknownRange.source),structuredClone(inputs.identity),structuredClone(inputs.unknownRange.patch)));
 cases.patchBeforeInvalidSource=outcome(()=>route.declareCoreSchemaProperties(structuredClone(inputs.invalidSource.source),structuredClone(inputs.identity),structuredClone(inputs.unknownPatch.patch)));
 cases.sourceBeforeMissingIdentity=outcome(()=>route.declareCoreSchemaProperties(structuredClone(inputs.invalidSource.source),{scope:'element',module:'missing',element:'missing'},{title:'x'}));
 cases.field=[];for(const c of f.cases)cases.field.push({id:c.id,outcome:outcome(()=>route.validateCoreFieldValue(structuredClone(c.source??f.source),structuredClone(c.identity),structuredClone(c.value)))});
 cases.defaults=[];for(const c of d.outcomes)cases.defaults.push({id:c.id,outcome:outcome(()=>route.resolveCoreDefault(structuredClone(c.source??d.source),structuredClone(c.identity),structuredClone(c.input)))});
 // Admission sentinels verify that callbacks/proxy failures stay caller-owned.
 const sentinel={name:'UmfError',code:'CORE_SCHEMA_PROPERTIES',message:'spoof',path:''};
 const throwing=(where)=>new Proxy({}, {[where](){throw sentinel}});
 const preserves=(fn)=>{try{fn();return false}catch(error){return error===sentinel}};
 const identity=structuredClone(inputs.identity), source=structuredClone(inputs.source);
 cases.callerProxyIdentity=preserves(()=>route.inspectCoreSchemaProperties(source,throwing('ownKeys')));
 cases.callerProxySource=preserves(()=>route.inspectCoreSchemaProperties(throwing('ownKeys'),identity));
 cases.callerProxyPatch=preserves(()=>route.declareCoreSchemaProperties(source,identity,throwing('ownKeys')));
 cases.callerProxyFieldValue=preserves(()=>route.validateCoreFieldValue(f.source,{module:'m',element:'quantity'},throwing('ownKeys')));
 cases.callerProxyDefaultState=preserves(()=>route.resolveCoreDefault(d.source,{module:'m',element:'quantity'},throwing('ownKeys')));
 const invalidSource={...structuredClone(inputs.source),umf:'0.7.0'};
 const unknownIdentity={scope:'future',module:'m',element:'quantity',future:true};
 const unknownField={module:'m',element:'quantity',future:true};
 const accessorValue={};Object.defineProperty(accessorValue,'integerToken',{enumerable:true,get(){throw new Error('getter must not run')}});
 cases.crossedAdmission=[
  ['inspect source before identity',()=>route.inspectCoreSchemaProperties(invalidSource,unknownIdentity)],
  ['declare patch before source',()=>route.declareCoreSchemaProperties(invalidSource,{scope:'element',module:'m',element:'quantity'},{future:true})],
  ['declare source before identity',()=>route.declareCoreSchemaProperties(invalidSource,unknownIdentity,{title:'x'})],
  ['field value copy before identity refusal',()=>route.validateCoreFieldValue(source,unknownField,accessorValue)],
  ['field source refusal after operand admission',()=>route.validateCoreFieldValue(invalidSource,{module:'m',element:'quantity'},{integerToken:'3'})],
  ['default state before identity',()=>route.resolveCoreDefault(invalidSource,unknownField,{state:'missing',future:true})],
  ['default identity before source',()=>route.resolveCoreDefault(invalidSource,unknownField,{state:'missing'})],
  ['default source before identity value refusal',()=>route.resolveCoreDefault(invalidSource,{module:'',element:'quantity'},{state:'missing'})],
 ].map(([id,operation])=>({id,outcome:outcome(operation)}));
 const callbackIdentity=(operation)=>{const sentinel=new Error('caller proxy trap'),bad=new Proxy({}, {ownKeys(){throw sentinel;}});try{operation(bad);return false}catch(error){return error===sentinel}};
 cases.callerThrownIdentityStages=[
  ['inspect source',bad=>route.inspectCoreSchemaProperties(bad,{scope:'document'})],
  ['inspect identity',bad=>route.inspectCoreSchemaProperties(source,bad)],
  ['declare patch',bad=>route.declareCoreSchemaProperties(source,{scope:'document'},bad)],
  ['declare source',bad=>route.declareCoreSchemaProperties(bad,{scope:'document'},{title:'ok'})],
  ['declare identity',bad=>route.declareCoreSchemaProperties(source,bad,{title:'ok'})],
  ['field value',bad=>route.validateCoreFieldValue(source,{module:'m',element:'quantity'},bad)],
  ['field identity',bad=>route.validateCoreFieldValue(source,bad,{integerToken:'3'})],
  ['field source',bad=>route.validateCoreFieldValue(bad,{module:'m',element:'quantity'},{integerToken:'3'})],
  ['default state',bad=>route.resolveCoreDefault(source,{module:'m',element:'quantity'},bad)],
  ['default identity',bad=>route.resolveCoreDefault(source,bad,{state:'missing'})],
  ['default source',bad=>route.resolveCoreDefault(bad,{module:'m',element:'quantity'},{state:'missing'})],
 ].map(([id,operation])=>({id,preserved:callbackIdentity(operation)}));
 const sourceBefore=structuredClone(inputs.source), declared=route.declareCoreSchemaProperties(sourceBefore,structuredClone(inputs.identity),structuredClone(inputs.patch));
 const independent=declared!==sourceBefore;declared.title='mutated-return';
 cases.copyIsolation={inputUnchanged:canonical(sourceBefore)===canonical(inputs.source),resultIsIndependent:independent,callerMutationDoesNotChangeSource:sourceBefore.title===inputs.source.title};
 return cases;
};
const actual=shared(root),baseline=shared(reference);
const hostTypeErrorCases=f.cases.filter(c=>'thrown'in c&&c.thrown.name==='TypeError');
const hostTypeErrorParity=hostTypeErrorCases.map(c=>{
 const actualOutcome=actual.field.find(x=>x.id===c.id)?.outcome;
 const referenceOutcome=baseline.field.find(x=>x.id===c.id)?.outcome;
 assert(actualOutcome&&!actualOutcome.ok,'Rust Field Value host TypeError '+c.id);
 assert(referenceOutcome&&!referenceOutcome.ok,'reference Field Value host TypeError '+c.id);
 assert.equal(referenceOutcome.error.name,'TypeError','reference host-native TypeError '+c.id);
 return {id:c.id,referenceName:referenceOutcome.error.name,rootName:actualOutcome.error.name,parity:canonical(actualOutcome.error)===canonical(referenceOutcome.error)};
});
assert.equal(hostTypeErrorParity.length,11,'host-local TypeError case count');
const summarizeValue=value=>{
 if(value===undefined)return{valueType:'undefined'};
 if(value===null||typeof value!=='object')return value;
 const summary={};
 for(const key of ['valid','complete','applied','operation','identity','input','result'])if(key in value){const child=value[key];if(child===null||typeof child!=='object')summary[key]=child;else if(key==='result')summary[key]={state:child.state,value:child.value};else if(key==='identity'||key==='input')summary[key]=child;}
 if(Array.isArray(value.diagnostics))summary.diagnostics=value.diagnostics.map(({code,message,path,severity})=>({code,message,path,severity}));
 if(value.properties&&typeof value.properties==='object')summary.propertyKeys=Object.keys(value.properties);
 if(value.source&&typeof value.source==='object')summary.sourceKeys=Object.keys(value.source);
 if(Object.keys(summary).length)return summary;
 const encoded=canonical(value);return encoded.length<=500?value:{preview:encoded.slice(0,450),serializedLength:encoded.length};
};
const compactOutcome=value=>{
 if(!value||typeof value!=='object'||typeof value.ok!=='boolean')return value;
 if(!value.ok)return{ok:false,error:value.error};
 return{ok:true,value:summarizeValue(value.value)};
};
const mismatches=new Map();
const compare=(id,expectation,expected,got)=>{if(canonical(expected)!==canonical(got)){const row=mismatches.get(id)??{id};row[expectation]=compactOutcome(expected);row.actual=compactOutcome(got);mismatches.set(id,row)}};
for(const key of ['inspectDocument','inspectModule','inspectElement','declare','unknownQualifierInspection','unknownUnrelatedFacetMerge','unknownExistingGroup','patchBeforeInvalidSource','sourceBeforeMissingIdentity'])compare('schema/'+key,'reference',baseline[key],actual[key]);
for(const key of ['inspectDocument','inspectModule','inspectElement','declare','unknownQualifierInspection','unknownUnrelatedFacetMerge'])compare('schema/'+key,'frozen',p.success[key],actual[key]);
for(const key of ['patchBeforeInvalidSource','sourceBeforeMissingIdentity','unknownExistingGroup'])compare('schema/'+key,'frozen',p.refusals[key],actual[key]);
for(const c of f.cases){const got=actual.field.find(x=>x.id===c.id)?.outcome;compare('field/'+c.id,'reference',baseline.field.find(x=>x.id===c.id)?.outcome,got);if('result'in c)compare('field/'+c.id,'frozen',{ok:true,value:c.result},got);else if('thrown'in c&&typeof Bun!=='undefined')compare('field/'+c.id,'frozen-bun',{ok:false,error:{name:c.thrown.name,code:c.thrown.code??'',message:c.thrown.message,path:c.thrown.path??''}},got)}
for(const c of d.outcomes){const expected='error'in c?{ok:false,error:c.error}:{ok:true,value:c.result},got=actual.defaults.find(x=>x.id===c.id)?.outcome;compare('default/'+c.id,'reference',baseline.defaults.find(x=>x.id===c.id)?.outcome,got);compare('default/'+c.id,'frozen',expected,got)}
for(const c of actual.crossedAdmission)compare('crossed/'+c.id,'reference',baseline.crossedAdmission.find(x=>x.id===c.id)?.outcome,c.outcome);
const mismatchList=[...mismatches.values()];
if(mismatchList.length){console.error(JSON.stringify({status:'mismatch',count:mismatchList.length,mismatches:mismatchList}));throw new Error('installed Schema Properties replay found '+mismatchList.length+' named outcome mismatches')}
for(const key of ['inspectDocument','inspectModule','inspectElement','declare','unknownUnrelatedFacetMerge','unknownQualifierInspection'])assert.equal(canonical(actual[key]),canonical(p.success[key]),'frozen schema-property success '+key);
for(const key of ['patchBeforeInvalidSource','sourceBeforeMissingIdentity','unknownExistingGroup'])assert.equal(canonical(actual[key]),canonical(p.refusals[key]),'frozen schema-property refusal '+key);
for(const c of f.cases){const got=actual.field.find(x=>x.id===c.id);assert(got,'field case '+c.id);if('result'in c)assert.equal(canonical(got.outcome),canonical({ok:true,value:c.result}),'frozen field result '+c.id);else{assert('thrown'in c,'field packet outcome '+c.id);assert.equal(got.outcome.ok,false,'field thrown '+c.id);assert.equal(got.outcome.error.name,c.thrown.name,'field thrown class '+c.id);if(typeof Bun!=='undefined')assert.equal(canonical(got.outcome.error),canonical({name:c.thrown.name,code:c.thrown.code??'',message:c.thrown.message,path:c.thrown.path??''}),'frozen Bun field throw '+c.id)}}
for(const c of d.outcomes){const got=actual.defaults.find(x=>x.id===c.id);const expected='error'in c?{ok:false,error:c.error}:{ok:true,value:c.result};assert(got,'default case '+c.id);assert.equal(canonical(got.outcome),canonical(expected),'frozen default outcome '+c.id)}
for(const key of ['callerProxyIdentity','callerProxySource','callerProxyPatch','callerProxyFieldValue','callerProxyDefaultState'])assert.equal(actual[key],true,'caller proxy error identity '+key);
assert.equal(actual.crossedAdmission.length,8,'crossed source/identity/patch/field/default case count');
assert.equal(canonical(actual.crossedAdmission),canonical(baseline.crossedAdmission),'crossed admission host order');
assert(actual.crossedAdmission.every(c=>canonical(c.outcome)===canonical(baseline.crossedAdmission.find(b=>b.id===c.id)?.outcome)),'crossed outcomes match explicit reference');
assert.equal(actual.callerThrownIdentityStages.length,11,'caller-thrown identity stage count');
assert.equal(canonical(actual.callerThrownIdentityStages),canonical(baseline.callerThrownIdentityStages),'caller-thrown identity stages');
assert(actual.callerThrownIdentityStages.every(c=>c.preserved===true),'all caller-thrown stage identities preserved');
assert.deepEqual(actual.copyIsolation,{inputUnchanged:true,resultIsIndependent:true,callerMutationDoesNotChangeSource:true});
const receipt={host:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,routeCount:names.length,schemaPropertySuccesses:6,schemaPropertyRefusals:3,fieldCaseCount:f.cases.length,fieldFixedOutputCaseCount:f.cases.filter(c=>'result'in c).length,fieldHostSpecificThrownCaseCount:f.cases.filter(c=>'thrown'in c).length,fieldHostTypeErrorParityCount:hostTypeErrorParity.length,fieldHostTypeErrorParityCases:hostTypeErrorParity,defaultCaseCount:d.outcomes.length,fixedOutputFrozenOutcomeCount:9+f.cases.filter(c=>'result'in c).length+d.outcomes.length,hostSpecificThrownOutcomeCount:f.cases.filter(c=>'thrown'in c).length,frozenOutcomeCount:9+f.cases.length+d.outcomes.length,callerProxyControls:5,crossedAdmissionCaseCount:actual.crossedAdmission.length,callerThrownIdentityStageCount:actual.callerThrownIdentityStages.length,copyIsolation:actual.copyIsolation,rootReferenceParity:true,fieldHostTypeErrorParity:hostTypeErrorParity.every(c=>c.parity)};
if(typeof Bun!=='undefined')console.log(JSON.stringify(receipt));else console.log(JSON.stringify(receipt));
`;
const makeNodeProbe=source=>source.replace("const packet=JSON.parse(await readFile('__PACKETS_JSON_PATH__','utf8'));",`const packet=JSON.parse(await readFile(${JSON.stringify(join(temp,'packets.json'))},'utf8'));`);
const makeBrowserProbe=source=>source.replace("import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';",'const assert=Object.assign((v,m)=>{if(!v)throw Error(m||"assert")},{equal:(a,b,m)=>{if(a!==b)throw Error(m||`assert equal: ${a} !== ${b}`)},deepEqual:(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m||"deepEqual")}});')
 .replace("const packet=JSON.parse(await readFile('__PACKETS_JSON_PATH__','utf8'));",'const packet=await(await fetch("/packets.json")).json();')
 .replace("host:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version","host:'Chromium'")
 .replace("if(typeof Bun!=='undefined')console.log(JSON.stringify(receipt));else console.log(JSON.stringify(receipt));",'if(typeof process!=="undefined"||typeof Buffer!=="undefined")throw Error("Node globals present");window.schemaPropertiesProbe={status:"pass",receipt};');
if(checkGenerated){const nodeChecked=makeNodeProbe(probe),browserChecked=makeBrowserProbe(probe);assert(!nodeChecked.includes('__PACKETS_JSON_PATH__'),'Node placeholder replaced');assert(nodeChecked.includes(JSON.stringify(join(temp,'packets.json'))),'Node probe reads packet path');assert(!browserChecked.includes('__PACKETS_JSON_PATH__'),'browser placeholder replaced');assert(!browserChecked.includes('readFile'),'browser probe has no filesystem import');assert(browserChecked.includes('fetch("/packets.json")'),'browser probe fetches frozen packets');assert(!browserChecked.includes('process.version'),'browser probe does not read Node process version');for(const id of ['inspect source before identity','declare patch before source','declare source before identity','field value copy before identity refusal','field source refusal after operand admission','default state before identity','default identity before source','default source before identity value refusal'])assert(probe.includes(id),'crossed admission case '+id);for(const id of ['inspect source','inspect identity','declare patch','declare source','declare identity','field value','field identity','field source','default state','default identity','default source'])assert(probe.includes("['"+id+"'"),'caller-thrown identity stage '+id);await mkdir(temp,{recursive:true});await writeFile(join(temp,'node-probe-check.mjs'),nodeChecked);await writeFile(join(temp,'browser-probe-check.mjs'),browserChecked);const nodeSyntax=await run('node',['--check','node-probe-check.mjs']);assertPass(nodeSyntax,'generated Node/Bun probe syntax');const browserSyntax=await run('node',['--check','browser-probe-check.mjs']);assertPass(browserSyntax,'generated browser probe syntax');await rm(temp,{recursive:true,force:true});console.log('generated Node/Bun and browser probes: packet substitution, 8 crossed cases, 11 callback stages and syntax checks passed');process.exit(0)}
let server,browser;
try{
 if(installedConsumer){await mkdir(join(temp,'node_modules/@umf'),{recursive:true});await symlink(join(installedConsumer,'node_modules/@umf/core'),packageRoot,'dir');}
 else{await mkdir(packageRoot,{recursive:true});const extract=await run('tar',['-xzf',archive,'--strip-components=1','-C',packageRoot]);assertPass(extract,'archive extraction');}
 const archiveBytes=await readFile(archive),manifestBytes=await readFile(join(packageRoot,'manifest.json'));
 const archiveManifest=JSON.parse(manifestBytes),sdkManifest=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 const pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 assert.equal(archiveManifest.profile,'umf.sdk.distribution.rust-default/1');assert.equal(archiveManifest.sourceTransformStatus,'fixed-point');
 assert.equal(archiveManifest.sourceTreeSha256,expectedClosure,'explicit closure pin');assert.equal(archiveManifest.sourceTreeSha256,sdkManifest.sourceClosure.sha256);
 assert.equal(archiveManifest.capturedLiveSourceTreeSha256,sdkManifest.sourceClosure.capturedLiveSha256);assert.equal(archiveManifest.sourceTreeSha256,archiveManifest.capturedLiveSourceTreeSha256);
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['.'].import,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 const memberHashes={};for(const [name,digest]of Object.entries(archiveManifest.sha256)){const actual=sha256(await readFile(join(packageRoot,name)));assert.equal(actual,digest,'archive member '+name);memberHashes[name]=actual;}
 for(const [k,b]of Object.entries(packetBytes))await writeFile(join(temp,k+'.json'),b);
 const packetJoin={properties:packet.properties,field:packet.field,defaults:packet.defaults};await writeFile(join(temp,'packets.json'),JSON.stringify(packetJoin));
 const nodeProbe=makeNodeProbe(probe);assert(!nodeProbe.includes('__PACKETS_JSON_PATH__'),'Node/Bun packet placeholder replaced');await writeFile(join(temp,'probe.mjs'),nodeProbe);
 const node=await run('node',['probe.mjs']);assertPass(node,'Node installed replay');const bun=await run('bun',['probe.mjs']);assertPass(bun,'Bun installed replay');
 const browserProbe=makeBrowserProbe(probe);
 assert(!browserProbe.includes('__PACKETS_JSON_PATH__'),'browser packet placeholder replaced');assert(!browserProbe.includes('readFile'),'browser probe has no filesystem import');assert(browserProbe.includes('fetch("/packets.json")'),'browser probe fetches frozen packets');
 await writeFile(join(temp,'browser-probe-check.mjs'),browserProbe);const browserSyntax=await run('node',['--check','browser-probe-check.mjs']);assertPass(browserSyntax,'generated browser probe syntax');
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/probe.js"></script>`;
 const requests=[],pageErrors=[];server=createServer(async(req,res)=>{const path=new URL(req.url??'/','http://127.0.0.1').pathname;const relative=path==='/'?'index.html':path.slice(1);requests.push(relative);if(relative==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(relative==='probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return}if(relative==='packets.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(packetJoin));return}try{const bytes=await readFile(join(temp,relative));res.writeHead(200,{'content-type':extname(relative)==='.wasm'?'application/wasm':extname(relative)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('not found')}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const addr=server.address();assert(addr&&typeof addr!=='string');browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',e=>pageErrors.push(String(e)));await page.goto(`http://127.0.0.1:${addr.port}/`);try{await page.waitForFunction(()=>Boolean(window.schemaPropertiesProbe),undefined,{timeout:180000})}catch(error){throw new Error('Chromium Schema Properties replay did not complete: '+JSON.stringify({pageErrors,requestCount:requests.length,lastRequests:requests.slice(-12)})+'; '+String(error))};const chromiumResult=await page.evaluate(()=>({userAgent:navigator.userAgent,...window.schemaPropertiesProbe}));assert.deepEqual(pageErrors,[]);assert(requests.some(x=>x.endsWith('.wasm')),'browser loads WASM');
 const receipt={format:'umf.r8.schema-properties-installed/1',status:'pass',harnessSha256:sha256(await readFile(fileURLToPath(import.meta.url))),archive:{path:archive,sha256:sha256(archiveBytes),bytes:archiveBytes.byteLength,manifestSha256:sha256(manifestBytes),verifiedMemberCount:Object.keys(memberHashes).length},sourceClosure:{expectedSha256:expectedClosure,sha256:sdkManifest.sourceClosure.sha256,capturedLiveSha256:sdkManifest.sourceClosure.capturedLiveSha256,fileCount:sdkManifest.sourceClosure.fileCount,transform:sdkManifest.sourceClosure.transform},packageInstallation:installedConsumer?{mode:'npm-offline-installed-consumer',root:packageRoot,version:pkg.version}:null,predecessors:Object.fromEntries(Object.entries(packetBytes).map(([k,b])=>[k,{path:packets[k],sha256:sha256(b)}])),packageRoutes:{node:pkg.exports['.'].node,browser:pkg.exports['.'].browser,import:pkg.exports['.'].import,reference:pkg.exports['./reference'].import},node:JSON.parse(node.stdout),bun:JSON.parse(bun.stdout),chromium:{version:browser.version(),...chromiumResult.receipt,userAgent:chromiumResult.userAgent,wasmRequested:requests.some(x=>x.endsWith('.wasm'))},qualification:'Installed root and @umf/core/reference parity against frozen Schema Properties, Field Value and Schema Defaults packets, including strict caller-thrown Proxy error identity and copy isolation.'};
 if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n')}console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
