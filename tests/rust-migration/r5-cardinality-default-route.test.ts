// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {bindCoreCardinalityRust} from '../../src/access/rust-cardinality-default';
import {CORE_MODEL_RESOURCES} from '../../src/access/core-model-resources';
import {UmfError} from '../../src/model/errors';
import {copyJson} from '../../src/model/json';
import {createCoreModelEngine} from '../../bindings/core/node/index.js';

const frozen=await Bun.file('docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json').json();
const api=bindCoreCardinalityRust(createCoreModelEngine(CORE_MODEL_RESOURCES));
const genericApi=createCoreModelEngine(CORE_MODEL_RESOURCES);
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value!==null&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`:JSON.stringify(value);
const capture=(operation:()=>unknown)=>{try{return {ok:true,value:operation()};}catch(error){const value=error as {code?:unknown;message?:unknown;path?:unknown};return {ok:false,error:{code:value.code??'',message:value.message??String(error),path:value.path??''}};}};

test('default cardinality routes match frozen TypeScript envelopes and retain copy/error prototypes',()=>{
 const inspect=(document:unknown)=>api.inspectCoreCardinality(document as any,frozen.identity);
 const receipt=api.declareCoreCardinality(frozen.document,frozen.identity,frozen.request);
 const surrogateValue=structuredClone(frozen.document);surrogateValue.modules[0].elements[0].cardinality='\ud800';
 const surrogateItem=api.declareCoreCardinality(frozen.surrogateItemDocument,frozen.identity,frozen.surrogateItemRequest);
 const surrogateIdentity=api.inspectCoreCardinality(frozen.surrogateIdentityDocument,frozen.surrogateIdentity);
 const successes={
  missing:inspect(frozen.document),known:inspect(frozen.known),unknown:inspect(frozen.unknown),inapplicable:inspect(frozen.inapplicable),
  declaration:receipt,verified:api.verifyCoreCardinalityDeclaration(receipt,receipt.target),surrogate:inspect(surrogateValue),surrogateItemDeclaration:surrogateItem,
 };
 const expected={
  missing:frozen.inspections.missing.value,known:frozen.inspections.known.value,unknown:frozen.inspections.unknown.value,
  inapplicable:frozen.inspections.inapplicable.value,declaration:frozen.declaration,verified:frozen.verified.value,
  surrogate:frozen.inspections.surrogate.value,surrogateItemDeclaration:frozen.surrogateItemDeclaration.value,
 };
 for(const [key,value] of Object.entries(successes))expect(canonical(value)).toBe(canonical((expected as Record<string,unknown>)[key]));
 expect(canonical(surrogateIdentity)).toBe(canonical(frozen.refusals.surrogateIdentity.value));
 const refusals={
  unknownOverwrite:capture(()=>api.declareCoreCardinality(frozen.unknown,frozen.identity,{cardinality:'one'} as any)),
  invalidRequest:capture(()=>api.declareCoreCardinality(frozen.document,frozen.identity,{cardinality:'array',itemType:{module:'',element:''}} as any)),
  missingIdentity:capture(()=>api.inspectCoreCardinality(frozen.document,{module:'absent',element:'absent'} as any)),
  malformedSourceReceipt:capture(()=>api.verifyCoreCardinalityDeclaration(frozen.malformedSourceReceipt,frozen.declaration.target)),
  malformedTargetReceipt:capture(()=>api.verifyCoreCardinalityDeclaration(frozen.malformedTargetReceipt,frozen.declaration.target)),
 };
 for(const [key,value] of Object.entries(refusals))expect(canonical(value)).toBe(canonical(frozen.refusals[key]));
 try{api.declareCoreCardinality(frozen.unknown,frozen.identity,{cardinality:'one'} as any);throw new Error('expected refusal');}
 catch(error){expect(error).toBeInstanceOf(UmfError);expect((error as Error).name).toBe('UmfError');}
 expect(Object.getPrototypeOf(receipt)).toBeNull();
 expect(Object.getPrototypeOf(receipt.source)).toBeNull();
 const input=structuredClone(frozen.document);const output=api.inspectCoreCardinality(input,frozen.identity);(output.source as any).id='edited';expect(input.id).toBe('author');
},30000);

test('generic host admission is not predecessor-compatible for path-bearing JSON refusals',()=>{
 const source=(mutate:(value:any)=>void)=>{const value=structuredClone(frozen.document) as any;mutate(value);return value;};
 const hidden=source(value=>Object.defineProperty(value,'hidden',{value:true,enumerable:false}));
 const cyclic=source(value=>{value.extensions={};value.extensions.self=value;});
 const invalidNumber=source(value=>{value.extensions={future:NaN};});
 const capture=(operation:()=>unknown)=>{try{operation();return {name:'',code:'',message:'',path:''};}catch(error){const value=error as {name?:string;code?:string;message?:string;path?:string};return {name:value.name??'',code:value.code??'',message:value.message??'',path:value.path??''};}};
 const probe=(value:unknown)=>({predecessor:capture(()=>copyJson(value)),rustRoute:capture(()=>genericApi.inspectCoreCardinalityIdentity(value as any,frozen.identity))});
 const hiddenResult=probe(hidden);
 const cycleResult=probe(cyclic);
 const numberResult=probe(invalidNumber);
 expect(hiddenResult.predecessor).toMatchObject({name:'UmfError',code:'NON_JSON',path:'/hidden'});
 expect(hiddenResult.rustRoute).toMatchObject({name:'AdmissionError',code:'NON_ENUMERABLE_PROPERTY',path:'/source'});
 expect(cycleResult.predecessor).toMatchObject({name:'UmfError',code:'CYCLE',path:'/extensions/self'});
 expect(cycleResult.rustRoute.code).toBe('RESOURCE_LIMIT');
 expect(numberResult.predecessor).toMatchObject({name:'UmfError',code:'NUMBER',path:'/extensions/future'});
 expect(numberResult.rustRoute).toMatchObject({name:'UmfCoreError',code:'NUMBER',path:''});
 let getterCalls=0;
 const accessor=source(value=>Object.defineProperty(value,'future',{enumerable:true,get(){getterCalls++;return true;}}));
 const accessorResult=probe(accessor);
 expect(accessorResult.predecessor).toMatchObject({name:'UmfError',code:'NON_JSON',path:'/future'});
 expect(accessorResult.rustRoute).toMatchObject({name:'AdmissionError',code:'ACCESSOR_PROPERTY',path:'/source'});
 expect(getterCalls).toBe(0);
});
