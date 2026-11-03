// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {verifySagaVectors,type SagaSubject,type SagaVector} from '../../scripts/saga-portable/verify';
import {createSagaRustDefault} from '../../src/extensions/actions/saga-rust-default';

import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {capturePortableProducerSnapshot,hashInputFiles,retainVerifiedFile,sha256File,SAGA_QUALIFICATION_INPUTS,SDK_SAGA_MEMBERS,SDK_SAGA_NODE_ENTRY,SDK_SAGA_BROWSER_ENTRY,verifySdkMemberCustody,validatePortableCaseRoster,verifyPortableCohort,verifyPortableProducerSnapshot,verifyPortableResult,type PortableHostReport} from '../../scripts/saga-portable/custody';

function sdkCustody(){
 const metadata={name:'@umf/core',exports:{'.':{node:`./${SDK_SAGA_NODE_ENTRY}`,browser:`./${SDK_SAGA_BROWSER_ENTRY}`}}};
 const members=Object.fromEntries(SDK_SAGA_MEMBERS.map(path=>[`package/${path}`,{size:10,sha256:'a'.repeat(64)}]));
 const manifest={sha256:Object.fromEntries(SDK_SAGA_MEMBERS.filter(path=>path.startsWith('dist/')).map(path=>[path,'a'.repeat(64)]))};
 return {metadata,members,manifest};
}

test('SDK custody binds the declared current Node/browser entries and native runtime',()=>{
 const sdk=sdkCustody();expect(()=>verifySdkMemberCustody(sdk.metadata,sdk.manifest,sdk.members)).not.toThrow();
 delete sdk.members['package/dist/umf_core_node.node'];
 expect(()=>verifySdkMemberCustody(sdk.metadata,sdk.manifest,sdk.members)).toThrow('omits a consumed member');
});

test('SDK custody refuses retired or redirected public entry points',()=>{
 for(const field of ['node','browser'] as const){
  const sdk=sdkCustody();sdk.metadata.exports['.'][field]='./dist/umf.js';
  expect(()=>verifySdkMemberCustody(sdk.metadata,sdk.manifest,sdk.members)).toThrow('exports do not identify');
 }
});

test('SDK custody refuses unbound browser or native runtime bytes',()=>{
 for(const path of [SDK_SAGA_BROWSER_ENTRY,'dist/umf_core_node.node']){
  const sdk=sdkCustody();sdk.manifest.sha256[path]='b'.repeat(64);
  expect(()=>verifySdkMemberCustody(sdk.metadata,sdk.manifest,sdk.members)).toThrow('does not bind consumed runtime member');
 }
});

const cases=[{id:'ordered',covers:[1,2,3,4,5,6,7,8]},{id:'unknown',covers:[9,10,11,12,13,14,15,16]}];
async function makeCohort(){
 const root=await mkdtemp(join(tmpdir(),'umf-saga-custody-'));
 try{
  await mkdir(join(root,'fixtures/saga'),{recursive:true});await mkdir(join(root,'inputs'),{recursive:true});await mkdir(join(root,'artifacts'),{recursive:true});
  await writeFile(join(root,'fixtures/saga/portable.json'),JSON.stringify(cases));await writeFile(join(root,'inputs/oracle.ts'),'oracle bytes v1');
  for(const [name,body] of Object.entries({'native.node':'native binary v1','wasm.bin':'wasm bytes v1','cli':'cli binary v1','python.whl':'selected wheel v1','rebuilt.whl':'rebuilt wheel v1','source.tar.gz':'source archive v1'}))await writeFile(join(root,'artifacts',name),body);
  const inputPaths=['fixtures/saga/portable.json','inputs/oracle.ts'],qualificationInputs=await hashInputFiles(root,inputPaths),corpusSha256=qualificationInputs['fixtures/saga/portable.json']!;
  const hosts={native:{host:'Bun N-API',runtime:{bun:'1.4.2',platform:'test',arch:'test'},files:{addon:'artifacts/native.node'}},browser:{host:'Chromium WASM',runtime:{browser:'Chromium',platform:'test',arch:'test'},files:{wasm:'artifacts/wasm.bin'}},cli:{host:'cli',runtime:{platform:'test',arch:'test'},files:{binary:'artifacts/cli'}},python:{host:'python',runtime:{python:'3.13',platform:'test',arch:'test'},files:{pythonWheel:'artifacts/python.whl'}},'python-rebuilt':{host:'python',runtime:{python:'3.13',platform:'test',arch:'test'},files:{pythonWheel:'artifacts/rebuilt.whl',pythonSourceArchive:'artifacts/source.tar.gz'}}} as const;
  const reports:Record<string,PortableHostReport>={},artifacts:Record<string,Record<string,string>>={},runtime:Record<string,{host:string;fields:string[]}>= {};
  for(const [hostId,host] of Object.entries(hosts)){
   const entries=Object.entries(host.files);artifacts[hostId]=Object.fromEntries(entries);runtime[hostId]={host:host.host,fields:Object.keys(host.runtime)};
   const fileArtifacts=Object.fromEntries(await Promise.all(entries.map(async([name,path])=>[name,{path,sha256:await sha256File(join(root,path))}])));
   const installedBinding=hostId==='python'||hostId==='python-rebuilt'?{status:'passed' as const,wheelSha256:(fileArtifacts.pythonWheel as {sha256:string}).sha256,beforeNativeSha256:'a'.repeat(64),afterNativeSha256:'a'.repeat(64),beforeInstalledFileCount:8,afterInstalledFileCount:8,beforePackageFileCount:6,afterPackageFileCount:6}:undefined;
   reports[hostId]={profile:'umf.saga.portable-host-receipt/2',hostId,host:host.host,runtime:host.runtime,cases:cases.length,passed:cases.length,results:cases.map(c=>({...c,passed:true})),corpusSha256,qualificationInputs,artifacts:fileArtifacts,...(installedBinding?{installedBinding}:{})};
  }
  const expectCohort={root,cases,inputPaths,reports,artifacts,runtime,expectedHosts:Object.keys(hosts)};
  return {root,reports,expectCohort};
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}

test('custody accepts one exact host cohort with tested source inputs, case roster and real artifact bytes',async()=>{
 const cohort=await makeCohort();try{await verifyPortableCohort(cohort.expectCohort);expect(Object.keys(cohort.reports).sort()).toEqual(['browser','cli','native','python','python-rebuilt']);}finally{await rm(cohort.root,{recursive:true,force:true});}
});

test('custody refuses missing or substituted host receipts and extra artifact entries',async()=>{
 for(const mutate of [
  (c:any)=>{delete c.reports.browser;},
  (c:any)=>{c.reports.browser.artifacts.extra={path:'artifacts/wasm.bin',sha256:c.reports.browser.artifacts.wasm.sha256};},
  (c:any)=>{c.reports.native.results.pop();}
 ]){
  const cohort=await makeCohort();try{mutate(cohort);await expect(verifyPortableCohort(cohort.expectCohort)).rejects.toThrow();}finally{await rm(cohort.root,{recursive:true,force:true});}
 }
});

test('custody refuses stale shared inputs and substituted tested binaries even when receipts keep the original corpus',async()=>{
 const input=await makeCohort();try{
  await writeFile(join(input.root,'inputs/oracle.ts'),'oracle bytes changed');
  await expect(verifyPortableCohort(input.expectCohort)).rejects.toThrow('stale, or substituted qualification inputs');
 }finally{await rm(input.root,{recursive:true,force:true});}
 const artifact=await makeCohort();try{
  await writeFile(join(artifact.root,'artifacts/native.node'),'replacement binary');
  await expect(verifyPortableCohort(artifact.expectCohort)).rejects.toThrow('artifact bytes differ from the tested bytes');
 }finally{await rm(artifact.root,{recursive:true,force:true});}
});

test('custody refuses host labels or runtime identities that do not identify the tested execution environment',async()=>{
 for(const mutate of [
  (c:any)=>{c.reports.native.host='CLI';},
  (c:any)=>{delete c.reports.browser.runtime.browser;},
  (c:any)=>{c.reports.native.runtime.platform='';}
 ]){
  const cohort=await makeCohort();try{mutate(cohort);await expect(verifyPortableCohort(cohort.expectCohort)).rejects.toThrow();}finally{await rm(cohort.root,{recursive:true,force:true});}
 }
});

test('custody requires the rebuilt Python wheel and source archive that the cohort claims to qualify',async()=>{
 const missing=await makeCohort();try{delete missing.reports['python-rebuilt']!.artifacts!.pythonSourceArchive;await expect(verifyPortableCohort(missing.expectCohort)).rejects.toThrow('artifact roster is missing');}finally{await rm(missing.root,{recursive:true,force:true});}
 const substituted=await makeCohort();try{await writeFile(join(substituted.root,'artifacts/rebuilt.whl'),'different rebuilt wheel');await expect(verifyPortableCohort(substituted.expectCohort)).rejects.toThrow('artifact bytes differ from the tested bytes');}finally{await rm(substituted.root,{recursive:true,force:true});}
});

test('custody binds Python reports to the installed wheel and stable native payload',async()=>{
 for(const mutate of [
  (c:any)=>{delete c.reports.python.installedBinding;},
  (c:any)=>{c.reports.python.installedBinding.wheelSha256='0'.repeat(64);},
  (c:any)=>{c.reports['python-rebuilt'].installedBinding.afterNativeSha256='b'.repeat(64);},
  (c:any)=>{c.reports.python.installedBinding.afterPackageFileCount++;}
 ]){
  const cohort=await makeCohort();try{mutate(cohort);await expect(verifyPortableCohort(cohort.expectCohort)).rejects.toThrow();}finally{await rm(cohort.root,{recursive:true,force:true});}
 }
});

test('corpus case IDs and contract coverage are unique, complete and bounded',()=>{
 expect(()=>validatePortableCaseRoster(cases)).not.toThrow();
 expect(()=>validatePortableCaseRoster([{id:'same',covers:[1]},{id:'same',covers:[2]}])).toThrow('repeats case ID');
 expect(()=>validatePortableCaseRoster([{id:'missing-coverage',covers:[1]}])).toThrow('omits required contract coverage');
 expect(()=>validatePortableCaseRoster([{id:'bad-range',covers:[17]}])).toThrow('invalid coverage');
});

test('host result controls with unchanged counts reject duplicate, missing and extra case records',()=>{
 const expected=cases.map(c=>({...c,passed:true}));
 expect(()=>verifyPortableResult({profile:'umf.saga.portable-host-receipt/2',cases:2,passed:2,results:expected},cases,'umf.saga.portable-host-receipt/2')).not.toThrow();
 for(const results of [
  [expected[0]!,expected[0]!],
  [expected[0]!],
  [...expected,{id:'extra',covers:[1],passed:true}]
 ])expect(()=>verifyPortableResult({profile:'umf.saga.portable-host-receipt/2',cases:2,passed:2,results},cases,'umf.saga.portable-host-receipt/2')).toThrow('IDs/order/coverage');
});

test('retention copies only the exact validated bytes into a flat safe filename',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-saga-retain-'));
 try{
  await mkdir(join(root,'source/nested'),{recursive:true});await mkdir(join(root,'stage'));
  const source=join(root,'source/nested/wasm.bin');await writeFile(source,'qualified wasm bytes');
  const expected=await sha256File(source),retained:Record<string,string>={};
  await retainVerifiedFile(join(root,'stage'),source,'browser-bindings_core_wasm_index.js-index.js',expected,retained);
  expect(await readFile(join(root,'stage/browser-bindings_core_wasm_index.js-index.js'),'utf8')).toBe('qualified wasm bytes');
  expect(retained).toEqual({'browser-bindings_core_wasm_index.js-index.js':expected});
  await expect(retainVerifiedFile(join(root,'stage'),source,'browser-bindings_core_wasm_index.js-index.js',expected,retained)).rejects.toThrow('duplicate retained');
  await expect(retainVerifiedFile(join(root,'stage'),source,'nested/artifact',expected,{})).rejects.toThrow('unsafe retained artifact name');
  await writeFile(source,'replaced bytes');
  await expect(retainVerifiedFile(join(root,'stage'),source,'changed.bin',expected,{})).rejects.toThrow('changed before retention');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('producer receipt refuses qualification-input or tested-artifact changes during verification',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-saga-producer-'));
 try{
  await mkdir(join(root,'scripts/saga-portable'),{recursive:true});await mkdir(join(root,'artifacts'));
  for(const path of SAGA_QUALIFICATION_INPUTS){const target=join(root,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,`input:${path}`);}
  const artifactPath=join(root,'artifacts/native.node');await writeFile(artifactPath,'native artifact');
  const snapshot=await capturePortableProducerSnapshot(root,{native:artifactPath});
  await verifyPortableProducerSnapshot(root,{native:artifactPath},snapshot);
  await writeFile(join(root,'scripts/saga-portable/verify.ts'),'changed verifier');
  await expect(verifyPortableProducerSnapshot(root,{native:artifactPath},snapshot)).rejects.toThrow('qualification inputs changed');
  await writeFile(join(root,'scripts/saga-portable/verify.ts'),`input:scripts/saga-portable/verify.ts`);
  await writeFile(artifactPath,'replacement native artifact');
  await expect(verifyPortableProducerSnapshot(root,{native:artifactPath},snapshot)).rejects.toThrow('host artifact bytes changed');
 }finally{await rm(root,{recursive:true,force:true});}
});

// Pure presentation/oracle controls: no native engine, WASM or product build.
function detachedSourceVector():SagaVector {
 return {id:'source-custody-only',covers:[1],source:{id:'original',modules:[{id:'module'}]},expected:{valid:true,complete:true}};
}
function custodySubject(source:(input:any)=>any):SagaSubject {
 const unused=()=>{throw Error('Unexpected authoring or assessment in custody-only control');};
 return {inspectSagas:input=>({source:source(input),validation:{valid:true,complete:true,diagnostics:[]},entries:[]}),declareSaga:unused,editSaga:unused,assessSaga:unused};
}
function custodyResult(subject:SagaSubject,vector=detachedSourceVector()) {return verifySagaVectors(subject,[vector]);}

test('portable source custody accepts mutable detached reports',()=>{
 expect(custodyResult(custodySubject(source=>structuredClone(source))).passed).toBe(1);
});
test('portable source custody accepts the immutable public Saga presentation without freezing its caller',()=>{
 const vector=detachedSourceVector(),subject=createSagaRustDefault(custodySubject(source=>structuredClone(source)),()=>false);
 const before=JSON.stringify(vector.source),inspection=subject.inspectSagas(vector.source as any);
 expect(Object.isFrozen(inspection.source)).toBe(true);
 expect(Object.isFrozen(vector.source)).toBe(false);
 expect(inspection.source).not.toBe(vector.source);
 expect(custodyResult(subject,vector).passed).toBe(1);
 expect(JSON.stringify(vector.source)).toBe(before);
 expect(Object.isFrozen(vector.source)).toBe(false);
});
test('portable source custody rejects a mutable returned caller alias',()=>{
 const result=custodyResult(custodySubject(source=>source));
 expect(result.passed).toBe(0);expect(result.results[0]?.failure).toContain('returned source aliases caller input');
});
test('portable source custody rejects a frozen returned caller alias',()=>{
 const vector=detachedSourceVector();Object.freeze(vector.source);
 const result=custodyResult(custodySubject(source=>source),vector);
 expect(result.passed).toBe(0);expect(result.results[0]?.failure).toContain('returned source aliases caller input');
});
test('portable source custody rejects a mutable shallow copy borrowing a caller child',()=>{
 const result=custodyResult(custodySubject(source=>({...source})));
 expect(result.passed).toBe(0);expect(result.results[0]?.failure).toContain('returned source aliases caller input');
});
test('portable source custody rejects a frozen shallow copy borrowing a caller child',()=>{
 const result=custodyResult(custodySubject(source=>Object.freeze({...source})));
 expect(result.passed).toBe(0);expect(result.results[0]?.failure).toContain('returned source aliases caller input');
});
test('portable source custody still refuses mutation poisoning a cached mutable report',()=>{
 let cached:any;
 const result=custodyResult(custodySubject(source=>cached??=structuredClone(source)));
 expect(result.passed).toBe(0);expect(result.results[0]?.failure).toContain('returned result mutation poisoned later inspection');
});
test('portable source custody does not hide an exception raised by a result setter',()=>{
 const result=custodyResult(custodySubject(source=>{
  const report=structuredClone(source);
  Object.defineProperty(report,'id',{get:()=>source.id,set:()=>{throw Error('setter-product-failure');},enumerable:true,configurable:true});
  return report;
 }));
 expect(result.passed).toBe(0);expect(result.results[0]?.failure).toContain('setter-product-failure');
});
