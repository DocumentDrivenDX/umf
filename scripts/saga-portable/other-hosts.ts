// SPDX-License-Identifier: MIT OR Apache-2.0
/** Same independent vectors against the installed Python wheel and native CLI. */
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {SagaSubject} from './verify';
import {capturePortableProducerSnapshot,verifyPortableProducerSnapshot} from './custody';
const host=process.argv[2],python=process.env.UMF_SAGA_PYTHON??'python3';
if(!['python','cli'].includes(host??''))throw Error('Specify python or cli');
const binary=resolve(process.env.UMF_SAGA_CLI??'target/debug/umf');
const wheel=process.env.UMF_SAGA_PYTHON_WHEEL;
if(host==='python'&&!wheel)throw Error('Set UMF_SAGA_PYTHON_WHEEL to the exact installed wheel');
const hostId:string=process.env.UMF_SAGA_HOST_ID??host!;
if(!['cli','python','python-rebuilt'].includes(hostId)||hostId==='python-rebuilt'&&host!=='python')throw Error('Unsupported portable host receipt identity');
const target=host==='cli'?binary:resolve(wheel!);
const artifactPaths:Record<string,string>={[host==='cli'?'cliBinary':'pythonWheel']:target};
if(hostId==='python-rebuilt'){
 const sourceArchive=process.env.UMF_SAGA_PYTHON_SOURCE_ARCHIVE;if(!sourceArchive)throw Error('Set UMF_SAGA_PYTHON_SOURCE_ARCHIVE for source-rebuilt Python qualification');
 artifactPaths.pythonSourceArchive=resolve(sourceArchive);
}
const snapshot=await capturePortableProducerSnapshot('.',artifactPaths);
const [{encodeRequestWire,fromWire,resultError},{createSagaResources},{verifySagaVectors}]=await Promise.all([
 import('../../bindings/core/node/src/wire.js'),import('../../src/extensions/actions/saga-resources'),import('./verify')
]);
const resources=createSagaResources(),corpus=await Bun.file('fixtures/saga/portable.json').json(),release=await Bun.file('spec/release.json').json();
let pythonRuntime:{python:string;platform:string;arch:string}|undefined;
function verifyInstalledPythonBinding(){
 const child=spawnSync(python,['-I','-B','tools/verify_python_artifacts.py','--wheel',target,'--verify-installed-wheel','--expected-version',release.pythonVersion],{encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 if(child.status!==0)throw Error(child.stderr||String(child.error||'Installed Python binding verification failed'));
 const receipt=JSON.parse(child.stdout);
 if(receipt.status!=='passed'||receipt.wheel_sha256!==snapshot.artifacts.pythonWheel||!/^[0-9a-f]{64}$/.test(receipt.native_sha256))throw Error('Installed Python wheel or native binding differs from the selected artifact bytes');
 return receipt as {status:string;wheel_sha256:string;native_sha256:string;installed_file_count:number;package_file_count:number};
}
const installedBefore=host==='python'?verifyInstalledPythonBinding():undefined;
function invoke(operation:string,args:unknown[]):any{
 if(host==='python'){
  const names:Record<string,string>={inspectSagas:'inspect_sagas',declareSaga:'declare_saga',editSaga:'edit_saga',assessSaga:'assess_saga'};
  const child=spawnSync(python,['-I','-B','scripts/saga-portable/python-probe.py'],{input:JSON.stringify({operation:names[operation],arguments:args}),encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  if(child.status!==0)throw Error(child.stderr||String(child.error));
  const response=JSON.parse(child.stdout);if(!response.ok)throw Object.assign(Error(response.error.message),response.error);if(response.packageVersion!==release.pythonVersion)throw Error('Wrong installed Python package cohort');pythonRuntime=response.runtime;return response.result;
 }
 const [source,...rest]=args;const request=operation==='inspectSagas'?{source}:operation==='declareSaga'?{source,module:rest[0],definition:rest[1]}:operation==='editSaga'?{source,identity:rest[0],replacement:rest[1]}:{source,identity:rest[0],capabilities:rest[1]};
 const input=encodeRequestWire({op:'codegen/'+operation,resources,request});
 const child=spawnSync(binary,['core','--stdin-wire'],{input:input+'\n',encoding:'utf8',maxBuffer:32*1024*1024});if(child.status!==0)throw Error(child.stderr||String(child.error));
 const envelope=JSON.parse(child.stdout),error=resultError(envelope);if(error)throw Object.assign(Error(error.message),error);
 const response=fromWire(JSON.parse(envelope.wire)) as any;if(!response.ok)throw Object.assign(Error(response.error.message),response.error);return response.result;
}
const subject:SagaSubject={inspectSagas:source=>invoke('inspectSagas',[source]),declareSaga:(source,module,definition)=>invoke('declareSaga',[source,module,definition]),editSaga:(source,identity,replacement)=>invoke('editSaga',[source,identity,replacement]),assessSaga:(source,identity,capabilities)=>invoke('assessSaga',[source,identity,capabilities])};
const result=verifySagaVectors(subject,corpus.cases);
if(host==='python'&&(!pythonRuntime?.python||!pythonRuntime.platform||!pythonRuntime.arch))throw Error('Python probe did not report its actual interpreter identity');
const installedAfter=host==='python'?verifyInstalledPythonBinding():undefined;
if(installedBefore&&installedAfter&&(installedBefore.native_sha256!==installedAfter.native_sha256||installedBefore.installed_file_count!==installedAfter.installed_file_count||installedBefore.package_file_count!==installedAfter.package_file_count))throw Error('Installed Python binding or payload changed during saga vectors');
await verifyPortableProducerSnapshot('.',artifactPaths,snapshot);
const artifacts=Object.fromEntries(Object.entries(artifactPaths).map(([name,path])=>[name,{path,sha256:snapshot.artifacts[name]!}]));
const installedBinding=installedBefore&&installedAfter?{status:'passed' as const,wheelSha256:installedBefore.wheel_sha256,beforeNativeSha256:installedBefore.native_sha256,afterNativeSha256:installedAfter.native_sha256,beforeInstalledFileCount:installedBefore.installed_file_count,afterInstalledFileCount:installedAfter.installed_file_count,beforePackageFileCount:installedBefore.package_file_count,afterPackageFileCount:installedAfter.package_file_count}:undefined;
const report={...result,profile:'umf.saga.portable-host-receipt/2',hostId,host,runtime:host==='python'?pythonRuntime:{platform:process.platform,arch:process.arch},qualificationInputs:snapshot.qualificationInputs,corpusSha256:snapshot.qualificationInputs['fixtures/saga/portable.json'],artifacts,...(installedBinding?{installedBinding}:{})};
await mkdir('.cache/saga',{recursive:true});await Bun.write(process.env.UMF_SAGA_RESULT_PATH??'.cache/saga/portable-'+hostId+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.cases)process.exit(1);
