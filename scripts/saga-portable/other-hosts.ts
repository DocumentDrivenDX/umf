// SPDX-License-Identifier: MIT OR Apache-2.0
/** Same independent vectors against the installed Python wheel and native CLI. */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {encodeRequestWire,fromWire,resultError} from '../../bindings/core/node/src/wire.js';
import {createSagaResources} from '../../src/extensions/actions/saga-resources';
import {verifySagaVectors,type SagaSubject} from './verify';
const host=process.argv[2],python=process.env.UMF_SAGA_PYTHON??'python3';
if(!['python','cli'].includes(host??''))throw Error('Specify python or cli');
const resources=createSagaResources(),corpus=await Bun.file('fixtures/saga/portable.json').json();
const binary=resolve(process.env.UMF_SAGA_CLI??'target/debug/umf');
const release=await Bun.file('spec/release.json').json();
const wheel=process.env.UMF_SAGA_PYTHON_WHEEL;
if(host==='python'&&!wheel)throw Error('Set UMF_SAGA_PYTHON_WHEEL to the exact installed wheel');
function invoke(operation:string,args:unknown[]):any{
 if(host==='python'){
  const names:Record<string,string>={inspectSagas:'inspect_sagas',declareSaga:'declare_saga',editSaga:'edit_saga',assessSaga:'assess_saga'};
  const child=spawnSync(python,['scripts/saga-portable/python-probe.py'],{input:JSON.stringify({operation:names[operation],arguments:args}),encoding:'utf8',maxBuffer:32*1024*1024});
  if(child.status!==0)throw Error(child.stderr||String(child.error));
  const response=JSON.parse(child.stdout);if(!response.ok)throw Object.assign(Error(response.error.message),response.error);if(response.version!==release.pythonVersion)throw Error('Wrong installed Python cohort');return response.result;
 }
 const [source,...rest]=args;const request=operation==='inspectSagas'?{source}:operation==='declareSaga'?{source,module:rest[0],definition:rest[1]}:operation==='editSaga'?{source,identity:rest[0],replacement:rest[1]}:{source,identity:rest[0],capabilities:rest[1]};
 const input=encodeRequestWire({op:'codegen/'+operation,resources,request});
 const child=spawnSync(binary,['core','--stdin-wire'],{input:input+'\n',encoding:'utf8',maxBuffer:32*1024*1024});if(child.status!==0)throw Error(child.stderr||String(child.error));
 const envelope=JSON.parse(child.stdout),error=resultError(envelope);if(error)throw Object.assign(Error(error.message),error);
 const response=fromWire(JSON.parse(envelope.wire)) as any;if(!response.ok)throw Object.assign(Error(response.error.message),response.error);return response.result;
}
const subject:SagaSubject={inspectSagas:source=>invoke('inspectSagas',[source]),declareSaga:(source,module,definition)=>invoke('declareSaga',[source,module,definition]),editSaga:(source,identity,replacement)=>invoke('editSaga',[source,identity,replacement]),assessSaga:(source,identity,capabilities)=>invoke('assessSaga',[source,identity,capabilities])};
const result=verifySagaVectors(subject,corpus.cases),identities:Record<string,string>={};
for(const path of ['fixtures/saga/portable.json',host==='cli'?binary:wheel!])identities[path]=createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const report={...result,host,identities};await mkdir('.cache/saga',{recursive:true});await Bun.write(process.env.UMF_SAGA_RESULT_PATH??'.cache/saga/portable-'+host+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.passed!==report.cases)process.exit(1);
