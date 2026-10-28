// SPDX-License-Identifier: MIT OR Apache-2.0
// Bundled and run under Node and Bun against a locally packed native binding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';
import {declareCoreBit128Field as reference} from '../../../src/model/bit128-field';
import {UmfError} from '../../../src/model/errors';
import {bindCoreBit128FieldRust} from '../../../src/access/rust-core-bit128-field-default';
import {FIELD, uuidDocument} from '../../../tests/helpers/uuid-fixtures';

const root=resolve(process.env.UMF_BIT128_REPOSITORY??process.cwd());
const pkg=resolve(process.env.UMF_BIT128_NATIVE_PACKAGE??'');
const sdk=resolve(process.env.UMF_BIT128_SDK_PACKAGE??'');
if(!process.env.UMF_BIT128_NATIVE_PACKAGE||!process.env.UMF_BIT128_SDK_PACKAGE)throw new Error('Native package and SDK package paths are required');
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const packet=await json(join(root,'docs/helix/04-build/evidence/rust-migration/r8-bit128-field-candidate-20261028/frozen-typescript.json'));
const resources={
 coreSchema:await json(join(sdk,'dist/spec/core/schema.json')),
 referenceSchema:await json(join(sdk,'dist/spec/core/semantic-type-reference.schema.json')),
 packageSchema:await json(join(sdk,'dist/spec/core/extension-package.schema.json')),
 constraints:await json(join(sdk,'dist/spec/metamodel/generated/core-constraints.json')),
 domainPolicy:await json(join(sdk,'dist/spec/metamodel/generated/domain-policy.json')),
};
const binding=await import(pathToFileURL(join(pkg,'index.js')).href);
const raw=binding.createCoreBit128FieldEngine(resources);
const api=bindCoreBit128FieldRust(raw,binding.isCoreBit128FieldBindingError);
const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const outcome=(run:()=>unknown)=>{try{return {ok:true,value:JSON.parse(JSON.stringify(run()))}}catch(error){const e=error as {name?:string;code?:string;message?:string;path?:string};return {ok:false,error:{name:e.name,code:e.code,message:e.message,path:e.path??''}}}};

for(const item of packet.cases as {name:string;input:{source:unknown;identity:unknown;scalarType:unknown};expected:unknown;sourceUnchangedAfterCall:boolean}[]){
 const source=structuredClone(item.input.source),before=JSON.stringify(source);
 const observed=outcome(()=>api.declareCoreBit128Field(source,item.input.identity as {module:string;element:string},item.input.scalarType as 'bits128'|'uuid'));
 assert.equal(canonical(observed),canonical(item.expected),`installed candidate disagrees with frozen TypeScript outcome: ${item.name}`);
 assert.equal(JSON.stringify(source)===before,item.sourceUnchangedAfterCall,`installed candidate copy behavior differs: ${item.name}`);
}

// Verify source-first reflection order and thrown Proxy values against the TS predecessor.
const traceProxy=(value:object,label:string,trace:string[])=>new Proxy(value,{
 getPrototypeOf(target){trace.push(`${label}:prototype`);return Reflect.getPrototypeOf(target)},
 ownKeys(target){trace.push(`${label}:keys`);return Reflect.ownKeys(target)},
 getOwnPropertyDescriptor(target,key){trace.push(`${label}:descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key)},
});
const traceCall=(run:(source:unknown,identity:unknown)=>unknown)=>{
 const trace:string[]=[];const source=traceProxy(uuidDocument('binary'),'source',trace);const identity=traceProxy({...FIELD},'identity',trace);
 const result=outcome(()=>run(source,identity));return {trace,result};
};
const tsTrace=traceCall((source,identity)=>reference(source as never,identity as never,'uuid'));
const rustTrace=traceCall((source,identity)=>api.declareCoreBit128Field(source,identity as never,'uuid'));
assert.deepEqual(rustTrace,tsTrace,'installed source/identity reflection trace or result differs from TypeScript');
assert(tsTrace.trace.indexOf('identity:prototype')>tsTrace.trace.lastIndexOf('source:descriptor:modules'),'identity was reflected before source copy completed');
const accessorRun=(run:(source:unknown,identity:unknown)=>unknown)=>{let getterCalls=0;const source=uuidDocument('binary');Object.defineProperty(source,'hostile',{enumerable:true,get(){getterCalls++;return true}});const identityTrace:string[]=[];const identity=new Proxy({...FIELD},{ownKeys(target){identityTrace.push('identity:keys');return Reflect.ownKeys(target)}});return {result:outcome(()=>run(source,identity)),getterCalls,identityTrace}};
const tsAccessor=accessorRun((source,identity)=>reference(source as never,identity as never,'uuid'));
const rustAccessor=accessorRun((source,identity)=>api.declareCoreBit128Field(source,identity as never,'uuid'));
assert.deepEqual(rustAccessor,tsAccessor,'installed accessor refusal or identity reflection differs from TypeScript');
assert.equal(rustAccessor.getterCalls,0);assert.deepEqual(rustAccessor.identityTrace,[]);
const sentinel=Object.freeze({hostSentinel:true});
for(const run of [
 (source:unknown,identity:unknown)=>reference(source as never,identity as never,'uuid'),
 (source:unknown,identity:unknown)=>api.declareCoreBit128Field(source,identity as never,'uuid'),
]){
 let identityReads=0;const source=new Proxy(uuidDocument('binary'),{ownKeys(){throw sentinel}});
 const identity=new Proxy({...FIELD},{ownKeys(target){identityReads++;return Reflect.ownKeys(target)}});
 let thrown:unknown;try{run(source,identity)}catch(error){thrown=error}
 assert.equal(thrown,sentinel,'original proxy-thrown object identity changed');assert.equal(identityReads,0,'identity was touched after source-copy failure');
}

let nativeFailure:unknown;
try{raw.declareCoreBit128Field(uuidDocument('binary'),FIELD,'string' as 'uuid')}catch(error){nativeFailure=error}
assert(binding.isCoreBit128FieldBindingError(nativeFailure),'binding-owned error was not branded');
let mapped:unknown;
try{api.declareCoreBit128Field(uuidDocument('binary'),FIELD,'string' as 'uuid')}catch(error){mapped=error}
assert(mapped instanceof UmfError,'mapped error is not an instance of the public TypeScript UmfError');
assert.equal((mapped as UmfError).code,'BIT128_FIELD');
const unrelated=Object.freeze({unrelated:true});
const passthrough=bindCoreBit128FieldRust({declareCoreBit128Field(){throw unrelated}},binding.isCoreBit128FieldBindingError);
let passthroughThrown:unknown;try{passthrough.declareCoreBit128Field({},FIELD,'uuid')}catch(error){passthroughThrown=error}
assert.equal(passthroughThrown,unrelated,'unbranded host error identity changed');

const frozenPacketSha256=createHash('sha256').update(await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r8-bit128-field-candidate-20261028/frozen-typescript.json'))).digest('hex');
console.log(JSON.stringify({status:'passed',runtime:process.env.UMF_BIT128_RUNTIME??process.version,frozenCases:packet.cases.length,frozenPacketSha256,rawHostProxyOrderParity:true,accessorsNotInvoked:true,identityNotTouchedAfterAccessorRefusal:true,originalProxyExceptionIdentity:true,bindingErrorBranded:true,publicUmfErrorIdentity:mapped instanceof UmfError,unrelatedExceptionIdentity:passthroughThrown===unrelated}));
