// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createRequire} from 'node:module';
import frozen from '../../docs/helix/04-build/evidence/rust-migration/r5-schema-properties/frozen-typescript.json' with {type:'json'};
import fieldValueFrozen from '../../docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json' with {type:'json'};
import * as reference from '../../src/model/schema-properties';
import {createCoreModelRootEngine} from '../../bindings/core/node/index.js';
import {CORE_MODEL_RESOURCES} from '../../src/access/core-model-resources';

const source=frozen.inputs.source as any;
const engine=createCoreModelRootEngine(CORE_MODEL_RESOURCES);
const native=createRequire(import.meta.url)('../../bindings/core/node/umf_core_node.node');
const hasHostEndpoint=typeof native.executeCoreSchemaPropertiesHostJson==='function';
if(process.env.UMF_REQUIRE_SCHEMA_PROPERTIES_HOST==='1'&&!hasHostEndpoint)throw new Error('Fresh Node addon must expose executeCoreSchemaPropertiesHostJson');
const operations=[
 ['inspect',()=>reference.inspectCoreSchemaProperties(source,{scope:'element',module:'m',element:'quantity'}),()=>engine.inspectCoreSchemaProperties(source,{scope:'element',module:'m',element:'quantity'})],
 ['declare',()=>reference.declareCoreSchemaProperties(source,{scope:'element',module:'m',element:'quantity'},{title:'Amount'}),()=>engine.declareCoreSchemaProperties(source,{scope:'element',module:'m',element:'quantity'},{title:'Amount'})],
 ['field',()=>reference.validateCoreFieldValue(source,{module:'m',element:'quantity'},{integerToken:'3'}),()=>engine.validateCoreFieldValue(source,{module:'m',element:'quantity'},{integerToken:'3'})],
 ['default',()=>reference.resolveCoreDefault(source,{module:'m',element:'quantity'},{state:'missing'}),()=>engine.resolveCoreDefault(source,{module:'m',element:'quantity'},{state:'missing'})],
] as const;

function envelope(operation:()=>unknown){
 try{return {value:operation()};}
 catch(error){
  const e=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  return {error:{name:e.name,code:e.code,message:e.message,path:e.path}};
 }
}

test.skipIf(!hasHostEndpoint)('default-route Schema Properties dispatch matches all four frozen predecessor operations',()=>{
 for(const [name,expected,actual] of operations){
  expect(envelope(actual),name).toEqual(envelope(expected));
 }
},60_000);

test.skipIf(!hasHostEndpoint)('Field Value host-native TypeError cases match the same-host reference',()=>{
 const cases=(fieldValueFrozen as any).cases.filter((item:any)=>item.thrown?.name==='TypeError');
 expect(cases).toHaveLength(11);
 for(const item of cases){
  const caseSource=item.source??(fieldValueFrozen as any).source;
  const expected=envelope(()=>reference.validateCoreFieldValue(caseSource,item.identity,item.value));
  const actual=envelope(()=>engine.validateCoreFieldValue(caseSource,item.identity,item.value));
  expect((expected as any).error?.name,item.id+' reference class').toBe('TypeError');
  expect(actual,item.id+' host-local root/reference outcome').toEqual(expected);
 }
},60_000);

function zeroLengthMalformedCarrierSource(withAllowedValues:boolean){
 const document=structuredClone(source);
 const label=document.modules.find((module:any)=>module.id==='m')!.elements.find((element:any)=>element.id==='label')!;
 label.facets={length:{min:0,max:3,unit:'unicode-scalar'}};
 if(withAllowedValues)label.allowedValues=[{string:'new'},{string:'x'}];
 return document;
}

test('frozen source reference preserves zero-length malformed carrier outcomes with and without allowedValues',()=>{
 const cases=[
  ['without allowedValues',zeroLengthMalformedCarrierSource(false),{valid:true,complete:true,diagnostics:[]}],
  ['with allowedValues',zeroLengthMalformedCarrierSource(true),{valid:false,complete:false,diagnostics:[{code:'CORE_SCHEMA_PROPERTIES',path:'',message:'Literal is not an allowed value',severity:'error'}]}],
 ] as const;
 for(const [name,document,expected] of cases){
  expect(envelope(()=>reference.validateCoreFieldValue(document as any,{module:'m',element:'label'},{string:7} as any)),name).toEqual({value:expected});
 }
});

test.skipIf(!hasHostEndpoint)('default route preserves zero-length malformed carrier behavior around allowedValues',()=>{
 for(const withAllowedValues of [false,true]){
  const document=zeroLengthMalformedCarrierSource(withAllowedValues);
  const expected=envelope(()=>reference.validateCoreFieldValue(document as any,{module:'m',element:'label'},{string:7} as any));
  const actual=envelope(()=>engine.validateCoreFieldValue(document as any,{module:'m',element:'label'},{string:7} as any));
  expect(actual,withAllowedValues?'allowedValues':'no allowedValues').toEqual(expected);
 }
},60_000);

test.skipIf(!hasHostEndpoint)('copy_host_json admission refusals preserve exact predecessor validation envelopes',()=>{
 const accessorSource=structuredClone(source);
 Object.defineProperty(accessorSource,'title',{enumerable:true,get(){throw new Error('getter must not run');}});
 const accessorPatch={};
 Object.defineProperty(accessorPatch,'title',{enumerable:true,get(){throw new Error('getter must not run');}});
 const accessorValue={};
 Object.defineProperty(accessorValue,'integerToken',{enumerable:true,get(){throw new Error('getter must not run');}});
 const accessorState={state:'present'} as any;
 Object.defineProperty(accessorState,'value',{enumerable:true,get(){throw new Error('getter must not run');}});
 const cases=[
  ['inspect',()=>reference.inspectCoreSchemaProperties(accessorSource,{scope:'element',module:'m',element:'quantity'}),()=>engine.inspectCoreSchemaProperties(accessorSource,{scope:'element',module:'m',element:'quantity'})],
  ['declare',()=>reference.declareCoreSchemaProperties(source,{scope:'element',module:'m',element:'quantity'},accessorPatch as any),()=>engine.declareCoreSchemaProperties(source,{scope:'element',module:'m',element:'quantity'},accessorPatch)],
  ['field',()=>reference.validateCoreFieldValue(source,{module:'m',element:'quantity'},accessorValue as any),()=>engine.validateCoreFieldValue(source,{module:'m',element:'quantity'},accessorValue)],
  ['default',()=>reference.resolveCoreDefault(source,{module:'m',element:'quantity'},accessorState),()=>engine.resolveCoreDefault(source,{module:'m',element:'quantity'},accessorState)],
 ] as const;
 for(const [name,expected,actual] of cases)expect(envelope(actual),name).toEqual(envelope(expected));
},60_000);

test.skipIf(!hasHostEndpoint)('crossed operands preserve the frozen host-order precedence',()=>{
 const invalidSource={...structuredClone(source),umf:'0.7.0'};
 const unknownIdentity={scope:'future',module:'m',element:'quantity',future:true} as any;
 const accessorValue={};
 Object.defineProperty(accessorValue,'integerToken',{enumerable:true,get(){throw new Error('getter must not run');}});
 const unknownField={module:'m',element:'quantity',future:true} as any;
 const cases=[
  ['inspect source before identity',()=>reference.inspectCoreSchemaProperties(invalidSource as any,unknownIdentity),()=>engine.inspectCoreSchemaProperties(invalidSource,unknownIdentity)],
  ['declare patch before source',()=>reference.declareCoreSchemaProperties(invalidSource as any,{scope:'element',module:'m',element:'quantity'},{future:true} as any),()=>engine.declareCoreSchemaProperties(invalidSource,{scope:'element',module:'m',element:'quantity'},{future:true})],
  ['declare source before identity',()=>reference.declareCoreSchemaProperties(invalidSource as any,unknownIdentity,{title:'x'}),()=>engine.declareCoreSchemaProperties(invalidSource,unknownIdentity,{title:'x'})],
  ['field value copy before identity refusal',()=>reference.validateCoreFieldValue(source,unknownField,accessorValue as any),()=>engine.validateCoreFieldValue(source,unknownField,accessorValue)],
  ['field source refusal after operand admission',()=>reference.validateCoreFieldValue(invalidSource as any,{module:'m',element:'quantity'},{integerToken:'3'}),()=>engine.validateCoreFieldValue(invalidSource,{module:'m',element:'quantity'},{integerToken:'3'})],
  ['default state before identity',()=>reference.resolveCoreDefault(invalidSource as any,unknownField,{state:'missing',future:true} as any),()=>engine.resolveCoreDefault(invalidSource,unknownField,{state:'missing',future:true} as any)],
  ['default identity before source',()=>reference.resolveCoreDefault(invalidSource as any,unknownField,{state:'missing'}),()=>engine.resolveCoreDefault(invalidSource,unknownField,{state:'missing'})],
  ['default source before identity value refusal',()=>reference.resolveCoreDefault(invalidSource as any,{module:'',element:'quantity'},{state:'missing'}),()=>engine.resolveCoreDefault(invalidSource,{module:'',element:'quantity'},{state:'missing'})],
 ] as const;
 for(const [name,expected,actual] of cases)expect(envelope(actual),name).toEqual(envelope(expected));
},60_000);

test.skipIf(!hasHostEndpoint)('host callbacks preserve caller-thrown identity at every operand stage',()=>{
 const operations=[
  (bad:unknown)=>engine.inspectCoreSchemaProperties(bad,{scope:'document'}),
  (bad:unknown)=>engine.inspectCoreSchemaProperties(source,bad as any),
  (bad:unknown)=>engine.declareCoreSchemaProperties(source,{scope:'document'},bad),
  (bad:unknown)=>engine.declareCoreSchemaProperties(bad,{scope:'document'},{title:'ok'}),
  (bad:unknown)=>engine.declareCoreSchemaProperties(source,bad as any,{title:'ok'}),
  (bad:unknown)=>engine.validateCoreFieldValue(source,{module:'m',element:'quantity'},bad),
  (bad:unknown)=>engine.validateCoreFieldValue(source,bad as any,{integerToken:'3'}),
  (bad:unknown)=>engine.validateCoreFieldValue(bad,{module:'m',element:'quantity'},{integerToken:'3'}),
  (bad:unknown)=>engine.resolveCoreDefault(source,{module:'m',element:'quantity'},bad as any),
  (bad:unknown)=>engine.resolveCoreDefault(source,bad as any,{state:'missing'}),
  (bad:unknown)=>engine.resolveCoreDefault(bad,{module:'m',element:'quantity'},{state:'missing'}),
 ];
 for(const operation of operations){
  const sentinel=new Error('caller proxy trap');
  const proxy=new Proxy({}, {ownKeys(){throw sentinel;}});
  let caught:unknown;try{operation(proxy);}catch(error){caught=error;}
  expect(caught).toBe(sentinel);
 }
},60_000);

test.skipIf(!hasHostEndpoint)('host admission preserves structural refusals and returns an isolated copy',()=>{
 const malformed: Array<[string,(input:any)=>void]> = [
  ['hidden',input=>Object.defineProperty(input,'future',{value:true,enumerable:false})],
  ['symbol',input=>{input[Symbol('future')]=true;}],
  ['cycle',input=>{input.future=input;}],
  ['depth',input=>{let node=input;for(let i=0;i<130;i++){node.future={};node=node.future;}}],
 ];
 for(const [name,mutate] of malformed){
  const input=structuredClone(source);mutate(input);
  expect(envelope(()=>engine.inspectCoreSchemaProperties(input,{scope:'document'})),name)
   .toEqual(envelope(()=>reference.inspectCoreSchemaProperties(input,{scope:'document'})));
 }
 const input=structuredClone(source);
 const actual=engine.inspectCoreSchemaProperties(input,{scope:'document'}) as any;
 const expected=reference.inspectCoreSchemaProperties(input,{scope:'document'});
 expect(actual).toEqual(expected);
 input.id='changed-after-return';
 expect(actual.source.id).toBe(expected.source.id);
 actual.source.id='changed-result';
 expect(input.id).toBe('changed-after-return');
},60_000);
