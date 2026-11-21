// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createSecurityFunctionsEngine} from '../../bindings/core/node/index.js';
import {tupleDocument} from '../../scripts/core-key-tuple-cases';
const engine=createSecurityFunctionsEngine();
const limits={includeIdentity:true,workLimit:100000,textLimit:100000};
const field=(source:any)=>({documentId:source.id,moduleId:'m',elementId:'x'});
const failure=(work:()=>unknown)=>{try{work();throw Error('Expected refusal');}catch(error){return error as {code:string;path:string};}};
test('prepared literal sources preserve every work/text receipt and canonical identity',()=>{
 for(const [scalarType,values] of [['boolean',[{boolean:true},{boolean:false}]],['string',[{string:'😀'},{string:''}]],['integer',[{integerToken:'9007199254740993'},{integerToken:'-0'}]],['binary',[{binaryHex:'00fe'},{binaryHex:''}]]] as const){
  const source=tupleDocument([{id:'x',scalarType}]),before=JSON.stringify(source),prepared=engine.prepareCandidateLiteralSource(source);
  for(const value of values)for(const includeIdentity of [false,true]){
   const options={...limits,includeIdentity},cold=engine.inspectCandidateLiteral(source,field(source),value,options);
   expect(prepared.inspectCandidateLiteral(field(source),value,options)).toEqual(cold);
   expect(prepared.inspectCandidateLiteral(field(source),value,options)).toEqual(cold);
   expect(prepared.inspectCandidateLiteral(field(source),value,{...options,workLimit:cold.workUnits,textLimit:cold.textUnits})).toEqual(cold);
   expect(failure(()=>prepared.inspectCandidateLiteral(field(source),value,{...options,workLimit:cold.workUnits-1})).code).toBe('PROTECTION_LITERAL_BOUND');
   if(cold.textUnits)expect(failure(()=>prepared.inspectCandidateLiteral(field(source),value,{...options,textLimit:cold.textUnits-1})).code).toBe('PROTECTION_LITERAL_BOUND');
  }
  expect(failure(()=>prepared.inspectCandidateLiteral({...field(source),documentId:'other'},values[0],limits)).code).toBe('PROTECTION_LITERAL_FIELD');
  expect(JSON.stringify(source)).toBe(before);
 }
});
test('prepared literals keep the protection ceilings and reject accessor input before reading it',()=>{
 const source=tupleDocument([{id:'x',scalarType:'string'}]),prepared=engine.prepareCandidateLiteralSource(source);
 for(const options of [{...limits,workLimit:100001},{...limits,textLimit:100001}])expect(failure(()=>prepared.inspectCandidateLiteral(field(source),{string:'v'},options)).code).toBe('REQUEST');
 let reads=0;const value:any={};Object.defineProperty(value,'string',{enumerable:true,get(){reads++;return 'v';}});
 expect(()=>prepared.inspectCandidateLiteral(field(source),value,limits)).toThrow();expect(reads).toBe(0);
});
test('prepared source construction and every warm invocation forward live cancellation and meter failures',()=>{
 const source=tupleDocument([{id:'x',scalarType:'integer'}]),before=JSON.stringify(source),value={integerToken:'7'};
 expect(failure(()=>engine.prepareCandidateLiteralSource(source,{isCancelled:()=>true})).code).toBe('CANCELLED');
 let cancel=false,armed=false,calls=0;
 const prepared=engine.prepareCandidateLiteralSource(source,{isCancelled:()=>cancel,meter:()=>{if(armed&&++calls===3)throw Error('meter failed');}});
 const expected=engine.inspectCandidateLiteral(source,field(source),value,limits);expect(prepared.inspectCandidateLiteral(field(source),value,limits)).toEqual(expected);
 cancel=true;expect(failure(()=>prepared.inspectCandidateLiteral(field(source),value,limits)).code).toBe('CANCELLED');
 cancel=false;armed=true;expect(failure(()=>prepared.inspectCandidateLiteral(field(source),value,limits)).code).toBe('METER_FAILURE');expect(calls).toBe(3);
 armed=false;expect(prepared.inspectCandidateLiteral(field(source),value,limits)).toEqual(expected);expect(JSON.stringify(source)).toBe(before);
});
test('prepared literal source is an isolated snapshot, with fresh values checked on every call',()=>{
 const source=tupleDocument([{id:'x',scalarType:'boolean'}]),reference=field(source),prepared=engine.prepareCandidateLiteralSource(source),value={boolean:true};
 const expected=engine.inspectCandidateLiteral(source,reference,value,limits);
 source.modules[0].elements.find((element:any)=>element.id==='x').scalarType='string';
 expect(prepared.inspectCandidateLiteral(reference,value,limits)).toEqual(expected);
 expect(()=>engine.inspectCandidateLiteral(source,reference,value,limits)).toThrow();
 expect(()=>prepared.inspectCandidateLiteral(reference,{string:'changed'},limits)).toThrow();
});
