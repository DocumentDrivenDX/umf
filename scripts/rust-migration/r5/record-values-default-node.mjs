// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay frozen predecessor and host-admission packets through the installed V4 root.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const entry=process.env.UMF_R5_RECORD_VALUES_DEFAULT_ENTRY;
if(!entry)throw new Error('UMF_R5_RECORD_VALUES_DEFAULT_ENTRY is required');
const root=resolve(import.meta.dirname,'../../..');
const read=path=>readFile(resolve(root,path),'utf8').then(JSON.parse);
const api=await import(pathToFileURL(resolve(entry)).href);
if(typeof api.validateCoreRecordValues!=='function')throw new Error('Installed V4 root has no validateCoreRecordValues export');
const [packet,host]=await Promise.all([
 read('docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json'),
 read('docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json'),
]);
const capture=run=>{try{return{result:run()};}catch(error){return{thrown:{name:error?.name??'Error',code:error?.code??'',message:error?.message??String(error),path:error?.path??''}};}};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
for(const c of packet.cases){
 const actual=capture(()=>api.validateCoreRecordValues(c.source,c.identity,c.values));
 if(c.thrown&&!Object.hasOwn(c.thrown,'name'))delete actual.thrown?.name;
 const expected=c.thrown?{thrown:c.thrown}:{result:c.result};
 assert.equal(canonical(actual),canonical(expected),c.id);
}
const {source,identity,values}=host.fixture,out=host.outcomes;
const raw=(name,run)=>{const value=capture(run);const actual=value.thrown?{ok:false,error:value.thrown}:{ok:true,value:value.result};assert.deepEqual(JSON.parse(JSON.stringify(actual)),out.rawCases[name],name);};
let sourceGets=0,identityGets=0,valueGets=0;
const sourceAccessor={...source};Object.defineProperty(sourceAccessor,'future',{enumerable:true,get(){sourceGets++;return true;}});
const identityAccessor={get module(){identityGets++;return 'fixture';},element:'item'};
const valuesAccessor=[{field:{module:'fixture',element:'label'},state:'present',get value(){valueGets++;return{string:'x'};}}];
raw('sourceAccessor',()=>api.validateCoreRecordValues(sourceAccessor,identityAccessor,valuesAccessor));
assert.deepEqual({sourceGets,identityGets,valueGets},{sourceGets:0,identityGets:0,valueGets:0});
sourceGets=identityGets=valueGets=0;
raw('identityAccessor',()=>api.validateCoreRecordValues(source,identityAccessor,valuesAccessor));
assert.deepEqual({sourceGets,identityGets,valueGets},{sourceGets:0,identityGets:0,valueGets:0});
raw('valuesAccessorBeforeSourceVersion',()=>api.validateCoreRecordValues({...source,umf:'0.7.0'},identity,valuesAccessor));
assert.deepEqual({sourceGets,identityGets,valueGets},{sourceGets:0,identityGets:0,valueGets:0});
console.log(JSON.stringify({status:'passed',runtime:typeof Bun==='undefined'?process.version:`Bun ${Bun.version}`,route:'installed V4 root',frozenCases:packet.cases.length,hostAdmissionCases:3}));
