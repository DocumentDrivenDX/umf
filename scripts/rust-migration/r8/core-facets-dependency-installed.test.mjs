// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateLock,validateIdentity,validateRouteResolution,verifySourceClosure,exerciseNegativeControls,coreFacetsCohortForHost,assessLinuxX64NativeFormat,decodeCoreRequestOperation} from './core-nine-installed-support.mjs';
import {assertResourceCaseExpectation,coreFacetResourceCaseIds,createCoreFacetBrowserAssert,expectedCoreFacetResourceRustOperations,validateCoreFacetResourceEvidence} from './core-facets-resource-suite.mjs';
import {validateCoreFacetsAcceptanceCohorts,validateCoreFacetAssetControlEvidence} from './default-route-retirement-evidence.mjs';

test('tagged Rust wire operation decoder accepts one valid op and rejects malformed or ambiguous envelopes',()=>{
 const tagged=(op)=>({kind:'object',members:[{key:[111,112],value:{kind:'string',units:Array.from(op,char=>char.charCodeAt(0))}}]});
 assert.equal(decodeCoreRequestOperation(JSON.stringify(tagged('model/inspectCoreFacets'))),'model/inspectCoreFacets');
 assert.throws(()=>decodeCoreRequestOperation({kind:'object',members:[]}),/exactly once/);
 assert.throws(()=>decodeCoreRequestOperation({kind:'object',members:[...tagged('model/x').members,...tagged('model/y').members]}),/exactly once/);
 assert.throws(()=>decodeCoreRequestOperation({kind:'object',members:[{key:[111,112],value:{kind:'number',value:1}}]}),/string shape/);
 assert.throws(()=>decodeCoreRequestOperation({kind:'object',members:[{key:[111,112],value:{kind:'string',units:Array(129).fill(65)}}]}),/string shape/);
});

test('Core Facets installed gate refuses absent and changed source-closure inputs',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-r8-facets-source-'));
 try{
  const relative='source/facets.ts',bytes=Buffer.from('pinned source\n'),digest=createHash('sha256').update(bytes).digest('hex');
  const sourceClosure={sha256:'pin',capturedLiveSha256:'pin',liveInputs:{[relative]:digest}};
  await assert.rejects(verifySourceClosure({repoRoot:root,sourceClosure,expectedSha256:'pin'}),/ENOENT/);
  await mkdir(path.join(root,'source'));await writeFile(path.join(root,relative),'changed source\n');
  await assert.rejects(verifySourceClosure({repoRoot:root,sourceClosure,expectedSha256:'pin'}),/current source input/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('Core Facets installed gate refuses a dependency lock without integrity pins',()=>{
 assert.throws(()=>validateLock({lockfileVersion:3,packages:{'node_modules/example':{version:'1.0.0'}}}),/missing\/invalid integrity/);
});

test('Core Facets installed gate binds package archive identity and resolved routes',()=>{
 const pkg={name:'@umf/core',version:'0.5.6',exports:{'.':{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js'},'./reference':{import:'./dist/umf.js'}}};
 const root='/tmp/consumer/node_modules/@umf/core',consumer='/tmp/consumer',archive='/tmp/core.tgz',integrity='sha512-YWJj';
 const lock={lockfileVersion:3,packages:{'node_modules/@umf/core':{version:'0.5.6',resolved:'file:../../core.tgz',integrity}}};
 // validateIdentity resolves the file URL against consumerRoot.
 assert.throws(()=>validateIdentity(pkg,lock,root,consumer,archive,integrity),/lock archive source/);
 const routes={node:{root:'file:///tmp/other/dist/umf-node.js',reference:`file://${root}/dist/umf.js`},bun:{root:`file://${root}/dist/umf-node.js`,reference:`file://${root}/dist/umf.js`}};
 assert.throws(()=>validateRouteResolution(routes,root),/escaped installed package/);
});

test('Core Facets installed gate negative controls reject missing integrity and route identity',()=>{
 const pkg={name:'@umf/core',version:'0.5.6',exports:{'.':{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js'},'./reference':{import:'./dist/umf.js'}}};
 const consumerRoot='/tmp/consumer',installedRoot=path.join(consumerRoot,'node_modules/@umf/core'),archivePath=path.join(consumerRoot,'core.tgz'),archiveIntegrity='sha512-YWJj';
 const lock={lockfileVersion:3,packages:{'node_modules/@umf/core':{version:'0.5.6',resolved:'file:core.tgz',integrity:archiveIntegrity},'node_modules/example':{version:'1.0.0',integrity:'sha512-ZXhhbXBsZQ=='}}};
 const routes={node:{root:`file://${installedRoot}/dist/umf-node.js`,reference:`file://${installedRoot}/dist/umf.js`},bun:{root:`file://${installedRoot}/dist/umf-node.js`,reference:`file://${installedRoot}/dist/umf.js`}};
 assert.deepEqual(exerciseNegativeControls({pkg,lock,installedRoot,consumerRoot,archivePath,archiveIntegrity,routes}),{
  lockWithoutIntegrityRejected:true,wrongInstalledIdentityRejected:true,wrongArchiveIdentityRejected:true,
  wrongDefaultRouteRejected:true,wrongResolvedDefaultRouteRejected:true,
 });
});

test('Core Facets host identity and Linux feasibility reflect the actual host and asset',()=>{
 assert.equal(coreFacetsCohortForHost('darwin','arm64'),'darwin-arm64');
 assert.equal(coreFacetsCohortForHost('linux','x64'),'linux-x86_64');
 assert.throws(()=>coreFacetsCohortForHost('linux','arm64'),/unsupported host/);
 const linux=assessLinuxX64NativeFormat({platform:'linux',arch:'x64',nativeMembers:['dist/umf_core_node.node'],nativeFormat:'ELF 64-bit LSB shared object, x86-64'});
 assert.equal(linux.currentHost.platform,'linux');assert.equal(linux.linuxX64Compatibility,'native-format-compatible');assert.equal(linux.execution,'assessed-separately-by-host-replay-receipts');
 const darwin=assessLinuxX64NativeFormat({platform:'darwin',arch:'arm64',nativeMembers:['dist/umf_core_node.node'],nativeFormat:'Mach-O 64-bit dynamically linked shared library arm64'});
 assert.equal(darwin.currentHost.arch,'arm64');assert.equal(darwin.linuxX64Compatibility,'native-format-incompatible');
});

test('installed replay refuses missing or invalid archive and closure pins before reading the archive',()=>{
 const replay=new URL('./core-facets-dependency-installed-replay.mjs',import.meta.url);
 for(const args of [[],['/missing/archive.tgz','/missing/output','invalid','0'.repeat(64),'darwin-arm64']]){
  const result=spawnSync(process.execPath,[replay.pathname,...args],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Usage: bun core-facets-dependency-installed-replay/);
  assert.doesNotMatch(result.stderr,/ENOENT/);
 }
});

test('Core Facets bounded resource suite matches TypeScript predecessor limits and preservation',()=>{
 const preflight=new URL('./core-facets-resource-source-preflight.mjs',import.meta.url);
 const result=spawnSync('bun',[preflight.pathname],{encoding:'utf8',timeout:120_000,maxBuffer:8*1024*1024});
 assert.equal(result.status,0,result.stderr);const receipt=JSON.parse(result.stdout);
 assert.equal(receipt.status,'pass');assert.equal(receipt.predecessor,'TypeScript source');assert.equal(receipt.caseCount,14);
 const cases=Object.fromEntries(receipt.cases.map(item=>[item.id,item]));
 assert.deepEqual(cases['inspect-unknown-array-limit'].referenceOutcome,{status:'threw',name:'UmfError',code:'LIMIT',message:'JSON structural limit exceeded',path:'/extensions/future/items/99991'});
 assert.deepEqual(cases['declare-result-copy-limit'].referenceOutcome,{status:'threw',name:'UmfError',code:'LIMIT',message:'JSON structural limit exceeded',path:'/target/extensions/future/items/49965'});
 assert.equal(cases['inspect-near-value-limit-many-qualifiers'].referenceIntegrity.qualifierCount,48_000);
 assert.equal(cases['inspect-near-value-limit-many-qualifiers'].referenceIntegrity.uninterpretedPaths[0],'/modules/0/elements/0/facets/futureGroup');
 assert.equal(cases['declare-near-value-limit-many-qualifiers'].referenceIntegrity.targetQualifierCount,48_000);
 assert.equal(cases['inspect-warning-path-amplification'].referenceIntegrity.warningPathCount,30_000);
 assert.equal(cases['inspect-warning-path-amplification'].referenceIntegrity.lastPath,'/modules/0/elements/0/facets/integerWidth/future29999');
 assert.equal(cases['large-unknown-scalar-over-text-limit'].referenceIntegrity.utf16Length,4_000_001);
 assert.deepEqual(cases['text-writer-over-text-limit-control'].referenceOutcome,{status:'threw',name:'UmfError',code:'LIMIT',message:'Serialized text exceeds limit',path:''});
 for(const item of receipt.cases){assert.equal(item.referenceMetrics.memorySource,'process.memoryUsage + process.resourceUsage');assert(Number.isFinite(item.referenceMetrics.durationMs));assert(Number.isFinite(item.referenceMetrics.rssAfterBytes));}
});

test('resource suite rejects matching refusals when a case requires preserved success evidence',()=>{
 const success={id:'stress-preservation',expectedIntegrity:{qualifierCount:48_000}};
 const fakeDefault={status:'threw',code:'LIMIT'},fakeReference={status:'threw',code:'LIMIT'};
 assert.deepEqual(fakeDefault,fakeReference,'negative control represents matching refusals');
 assert.throws(()=>assertResourceCaseExpectation(success,fakeDefault,null,assert),/explicit expected outcome status/);
 assert.throws(()=>assertResourceCaseExpectation(success,{status:'returned'},null,assert),/success result exposes integrity evidence/);
});

test('embedded Chromium assertion contract is callable and supports equal and deepEqual',()=>{
 const browserAssert=createCoreFacetBrowserAssert(value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item));
 assert.doesNotThrow(()=>browserAssert(true,'callable assertion'));
 assert.doesNotThrow(()=>browserAssert.equal(4,4,'equal success'));
 assert.doesNotThrow(()=>browserAssert.deepEqual({b:2,a:1},{a:1,b:2},'deepEqual success'));
 assert.doesNotThrow(()=>browserAssert.match('a'.repeat(64),/^[a-f0-9]{64}$/,'match success'));
 assert.doesNotThrow(()=>browserAssert.ok(true,'ok success'));
 assert.throws(()=>browserAssert(false,'callable failure'),/callable failure/);
 assert.throws(()=>browserAssert.equal(4,5,'equal failure'),/equal failure/);
 assert.throws(()=>browserAssert.deepEqual({a:1},{a:2},'deepEqual failure'),/deepEqual failure/);
 assert.throws(()=>browserAssert.match('invalid',/^[a-f0-9]{64}$/,'match failure'),/match failure/);
 assert.throws(()=>browserAssert.ok(false,'ok failure'),/ok failure/);
 const expectedIntegrity={qualifierCount:48_000,uninterpretedPaths:['/modules/0/elements/0/facets/futureGroup']};
 assert.doesNotThrow(()=>assertResourceCaseExpectation({id:'success',expectedIntegrity},{status:'returned'},expectedIntegrity,browserAssert));
 const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
 const generatedPreamble=`const createBrowserAssert=${createCoreFacetBrowserAssert.toString()};const assert=createBrowserAssert(value=>canon(value));const canon=${canonical.toString()};assert.deepEqual({b:2,a:1},{a:1,b:2},'preamble canonicalization after declaration');assertResourceCaseExpectation(${JSON.stringify({id:'success',expectedIntegrity})},{status:'returned'},${JSON.stringify(expectedIntegrity)},assert);`;
 assert.doesNotThrow(()=>new Function('assertResourceCaseExpectation',generatedPreamble)(assertResourceCaseExpectation),'generated browser preamble resolves canon after its declaration');
 assert.deepEqual(expectedCoreFacetResourceRustOperations('text-writer-over-text-limit-control'),[]);
 assert.throws(()=>expectedCoreFacetResourceRustOperations('unknown'),/unknown Core Facets resource case/);
});

function resourceEvidenceFixture(){
 const successIntegrity={
  'inspect-near-value-limit-many-qualifiers':{qualifierCount:48_000,uninterpretedPaths:['/modules/0/elements/0/facets/futureGroup']},
  'declare-near-value-limit-many-qualifiers':{qualifierCount:48_000,targetQualifierCount:48_000},
  'inspect-warning-path-amplification':{warningPathCount:30_000,firstPath:'/modules/0/elements/0/facets/integerWidth/future0',lastPath:'/modules/0/elements/0/facets/integerWidth/future29999'},
  'large-unknown-scalar-over-text-limit':{retained:true,utf16Length:4_000_001},
 };
 const errors={
  'inspect-unknown-array-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/items/99991'],
  'declare-unknown-array-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/items/99991'],
  'inspect-nesting-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/nested'+('/x'.repeat(126))],
  'declare-nesting-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/nested'+('/x'.repeat(126))],
  'historical-nesting-limit-before-schema':['LIMIT','JSON structural limit exceeded','/future'+('/x'.repeat(128))],
  'declare-result-copy-limit':['LIMIT','JSON structural limit exceeded','/target/extensions/future/items/49965'],
  'malformed-receipt-before-large-current':['CORE_FACET_RECEIPT','Malformed facet declaration',''],
  'forged-receipt-before-large-current':['CORE_FACET_RECEIPT','Declaration differs from retained source/request',''],
  'valid-receipt-large-current-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/items/99991'],
  'text-writer-over-text-limit-control':['LIMIT','Serialized text exceeds limit',''],
 };
 return coreFacetResourceCaseIds.map(id=>{
  const ops=expectedCoreFacetResourceRustOperations(id),integrity=successIntegrity[id]??null;
  const outcome=integrity?{status:'returned'}:{status:'threw',name:'UmfError',code:errors[id][0],message:errors[id][1],path:errors[id][2]};
  const fingerprint=integrity?'a'.repeat(64):null;
  return {id,expectedRustOperations:ops,defaultRustOperations:ops,defaultRustCalls:ops.length,referenceRustOperations:[],referenceRustCalls:0,defaultOutcome:outcome,referenceOutcome:structuredClone(outcome),defaultResultSha256:fingerprint,referenceResultSha256:fingerprint,defaultOwnShapeSha256:'a'.repeat(64),referenceOwnShapeSha256:'a'.repeat(64),defaultIntegrity:integrity,referenceIntegrity:integrity};
 });
}

test('resource acceptance rejects matching refusals, missing Rust success dispatch, and incomplete case inventories',()=>{
 const valid=resourceEvidenceFixture();
 assert.doesNotThrow(()=>validateCoreFacetResourceEvidence(valid,assert));
 const matchingRefusal=structuredClone(valid);const row=matchingRefusal.find(item=>item.id==='inspect-near-value-limit-many-qualifiers');row.defaultOutcome=row.referenceOutcome={status:'threw',name:'UmfError',code:'LIMIT',message:'matching refusal',path:''};row.defaultResultSha256=row.referenceResultSha256=null;row.defaultIntegrity=row.referenceIntegrity=null;
 assert.throws(()=>validateCoreFacetResourceEvidence(matchingRefusal,assert),/required success/);
 const missingDispatch=structuredClone(valid);const success=missingDispatch.find(item=>item.id==='inspect-near-value-limit-many-qualifiers');success.defaultRustOperations=[];success.defaultRustCalls=0;
 assert.throws(()=>validateCoreFacetResourceEvidence(missingDispatch,assert),/exact default Rust dispatch/);
 assert.throws(()=>validateCoreFacetResourceEvidence(valid.slice(1),assert),/exactly 14 cases/);
 const missingShape=structuredClone(valid);delete missingShape.find(item=>item.id==='inspect-near-value-limit-many-qualifiers').defaultOwnShapeSha256;
 assert.throws(()=>validateCoreFacetResourceEvidence(missingShape,assert),/default own-shape witness/);
 const divergentShape=structuredClone(valid);divergentShape.find(item=>item.id==='inspect-near-value-limit-many-qualifiers').referenceOwnShapeSha256='b'.repeat(64);
 assert.throws(()=>validateCoreFacetResourceEvidence(divergentShape,assert),/own-shape witness parity/);
});

function assetControlFixture(){
 const archive={sha256:'a'.repeat(64)},archiveMembers={'dist/umf_core_node.node':'b'.repeat(64),'dist/umf_core_wasm_bg.wasm':'c'.repeat(64)};
 const receipt={format:'umf.r8.core-facets-installed-asset-controls/1',status:'pass',scope:'test',archiveSha256:archive.sha256,package:{name:'@umf/core',version:'0.1.0'},originalAssets:{native:{path:'dist/umf_core_node.node',sha256:archiveMembers['dist/umf_core_node.node'],bytes:5},wasm:{path:'dist/umf_core_wasm_bg.wasm',sha256:archiveMembers['dist/umf_core_wasm_bg.wasm'],bytes:7}},cases:[]};
 for(const runtime of ['node','bun','Chromium'])for(const state of ['intact','missing','corrupt']){
  const browser=runtime==='Chromium',asset=browser?'dist/umf_core_wasm_bg.wasm':'dist/umf_core_node.node';
  const item={runtime,version:'test',asset,state};
  if(state==='intact'){
   if(browser){item.outcome={status:'returned',result:{meaning:{state:'known',facets:{integerWidth:{bits:16}}}}};item.wasmRequested=true;item.externalRequests=0}
   else {item.exitCode=0;item.nativeOperations=['model/inspectCoreFacets']}
  }else{
   if(state==='corrupt')item.mutatedAssetSha256='d'.repeat(64);
   if(browser){item.outcome={status:'threw',phase:'import',message:'WASM failed to load'};item.wasmRequested=true;item.externalRequests=0}
   else {item.exitCode=23;item.error={phase:'import',message:'native addon failed to load'};item.stdout=''}
  }
  receipt.cases.push(item);
 }
 return {archive,archiveMembers,receipt};
}

test('Core Facets acceptance pin set requires the exact Darwin and Linux cohort pins',()=>{
 const manifest={cohorts:[]};
 assert.throws(()=>validateCoreFacetsAcceptanceCohorts([],manifest,[],{root:process.cwd()}),/exactly the Darwin and Linux/);
 const pins=[{cohortId:'darwin-arm64',cohort:{path:'darwin/cohort.json',sha256:'a'.repeat(64)}},{cohortId:'linux-x86_64',cohort:{path:'linux/cohort.json',sha256:'b'.repeat(64)}}];
 assert.throws(()=>validateCoreFacetsAcceptanceCohorts([pins[1],pins[0]],manifest,[],{root:process.cwd()}),/order\/identity/);
 assert.throws(()=>validateCoreFacetsAcceptanceCohorts([{...pins[0],cohort:{...pins[0].cohort,sha256:'bad'}},pins[1]],manifest,[],{root:process.cwd()}),/safe, hashed cohort.json/);
 assert.throws(()=>validateCoreFacetsAcceptanceCohorts([{...pins[0],cohort:{...pins[0].cohort,path:'../cohort.json'}},pins[1]],manifest,[],{root:process.cwd()}),/safe, hashed cohort.json/);
});

test('asset controls reject archive mismatch, fallback refusal, and an intact path without Rust evidence',()=>{
 const {archive,archiveMembers,receipt}=assetControlFixture();
 assert.doesNotThrow(()=>validateCoreFacetAssetControlEvidence(receipt,archive,archiveMembers));
 const unexpected=structuredClone(receipt);unexpected.archiveSha256='e'.repeat(64);
 assert.throws(()=>validateCoreFacetAssetControlEvidence(unexpected,archive,archiveMembers),/do not bind the accepted archive/);
 const noRust=structuredClone(receipt);noRust.cases.find(item=>item.runtime==='node'&&item.state==='intact').nativeOperations=[];
 assert.throws(()=>validateCoreFacetAssetControlEvidence(noRust,archive,archiveMembers),/actual Rust inspection trace/);
 const fallback=structuredClone(receipt);fallback.cases.find(item=>item.runtime==='bun'&&item.state==='missing').stdout='{"status":"returned"}';
 assert.throws(()=>validateCoreFacetAssetControlEvidence(fallback,archive,archiveMembers),/without fallback/);
 const unrelated=structuredClone(receipt);unrelated.cases.find(item=>item.runtime==='node'&&item.state==='missing').error.message='unrelated application exception';
 assert.throws(()=>validateCoreFacetAssetControlEvidence(unrelated,archive,archiveMembers),/unrelated reason/);
 const incomplete=structuredClone(receipt);incomplete.cases.pop();
 assert.throws(()=>validateCoreFacetAssetControlEvidence(incomplete,archive,archiveMembers),/exactly nine/);
});
