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
function invoke(operation:string,args:unknown[]):any{
 if(host==='python'){
  const names:Record<string,string>={inspectSagas:'inspect_sagas',declareSaga:'declare_saga',editSaga:'edit_saga',assessSaga:'assess_saga'};
  const child=spawnSync(python,['scripts/saga-portable/python-probe.py'],{input:JSON.stringify({operation:names[operation],arguments:args}),encoding:'utf8',maxBuffer:32*1024*1024});
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
await verifyPortableProducerSnapshot('.',artifactPaths,snapshot);
const artifacts=Object.fromEntries(Object.entries(artifactPaths).map(([name,path])=>[name,{path,sha256:snapshot.artifacts[name]!}]));
const report={...result,profile:'umf.saga.portable-host-receipt/2',hostId,host,runtime:host==='python'?pythonRuntime:{platform:process.platform,arch:process.arch},qualificationInputs:snapshot.qualificationInputs,corpusSha256:snapshot.qualificationInputs['fixtures/saga/portable.json'],artifacts};
await mkdir('.cache/saga',{recursive:true});await Bun.write(process.env.UMF_SAGA_RESULT_PATH??'.cache/saga/portable-'+hostId+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.cases)process.exit(1);
