// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {capturePortableProducerSnapshot,hashInputFiles,retainVerifiedFile,sha256File,SAGA_QUALIFICATION_INPUTS,validatePortableCaseRoster,verifyPortableCohort,verifyPortableProducerSnapshot,verifyPortableResult,type PortableHostReport} from '../../scripts/saga-portable/custody';

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
