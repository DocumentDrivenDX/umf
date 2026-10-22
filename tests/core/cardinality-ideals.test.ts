// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {validateDocument} from '../../src/validation/document';
import {readDocument,writeDocument} from '../../src/model/document';
import {CARDINALITIES,SCALAR_TYPES,type Document} from '../../src/model/types';
const model=(umf:Document['umf'],field:Record<string,unknown>):Document=>({umf,id:'shape',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',kind:'field',extensions:{future:{nativeShape:'opaque',repetition:2}},...field},{id:'item',kind:'field',scalarType:'integer',nullability:'required',extensions:{}}]}]});
function roundTrip(doc:Document){for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(doc,format),format)).toEqual(doc);}
test('Cardinality is explicit Field meaning with independent item/value references and availability',()=>{
 for(const cardinality of CARDINALITIES){const doc=model('0.10.0',{cardinality,nullability:'absent-allowed'}),before=structuredClone(doc);expect(validateDocument(doc).valid).toBe(true);expect(validateDocument(doc).complete).toBe(false);roundTrip(doc);expect(doc).toEqual(before);}
 for(const cardinality of ['array','map'])for(const nullability of ['required','absent-allowed','unspecified']){
  const doc=model('0.10.0',{cardinality,nullability,itemType:{module:'m',element:'item',future:{unknown:true}}});expect(validateDocument(doc).valid).toBe(true);roundTrip(doc);
  expect(doc.modules[0]!.elements[0]!.scalarType).toBeUndefined();expect(doc.modules[0]!.elements[1]!.scalarType).toBe('integer');
 }
 const missing=model('0.10.0',{});roundTrip(missing);expect(Object.hasOwn(missing.modules[0]!.elements[0]!,'cardinality')).toBe(false);
});
test('containers cannot acquire scalar labels; invalid roles, labels and item links refuse atomically',()=>{
 for(const cardinality of ['array','map'])for(const scalarType of [...SCALAR_TYPES,'future-scalar']){const doc=model('0.10.0',{cardinality,scalarType}),before=structuredClone(doc);expect(validateDocument(doc).valid).toBe(false);expect(()=>writeDocument(doc)).toThrow();expect(doc).toEqual(before);}
 for(const kind of ['record','group','future-kind',undefined])for(const cardinality of CARDINALITIES){const doc=model('0.10.0',{cardinality});if(kind===undefined)delete doc.modules[0]!.elements[0]!.kind;else doc.modules[0]!.elements[0]!.kind=kind;expect(validateDocument(doc).valid).toBe(false);}
 for(const cardinality of ['',null,0,[],{}])expect(validateDocument(model('0.10.0',{cardinality})).valid).toBe(false);
 for(const cardinality of ['one','unspecified','future-cardinality',undefined]){const doc=model('0.10.0',{itemType:{module:'m',element:'item'},...(cardinality===undefined?{}:{cardinality})});expect(validateDocument(doc).valid).toBe(false);}
 for(const itemType of [null,[],{},'item',{module:'m'},{module:'m',element:''},{module:'missing',element:'item'},{module:'m',element:'missing'}])expect(validateDocument(model('0.10.0',{cardinality:'array',itemType})).valid).toBe(false);
 for(const kind of ['record','group','future-kind']){const doc=model('0.10.0',{cardinality:'map',itemType:{module:'m',element:'item'}});doc.modules[0]!.elements[1]!.kind=kind;delete doc.modules[0]!.elements[1]!.scalarType;delete doc.modules[0]!.elements[1]!.nullability;expect(validateDocument(doc).diagnostics.some(d=>d.code==='ITEM_TYPE_ROLE')).toBe(true);}
});
test('unknown cardinality and recursive/cross-module item definitions remain copied and recoverable',()=>{
 const future=model('0.10.0',{cardinality:'future-shape',scalarType:'integer'});expect(validateDocument(future).valid).toBe(true);expect(validateDocument(future).diagnostics.some(d=>d.code==='UNKNOWN_CARDINALITY')).toBe(true);roundTrip(future);
 const recursive=model('0.10.0',{cardinality:'array',itemType:{module:'m',element:'e'}});expect(validateDocument(recursive).valid).toBe(true);roundTrip(recursive);
 const cross=model('0.10.0',{cardinality:'map',itemType:{module:'other',element:'value'}});cross.modules.push({id:'other',namespace:'sales',elements:[{id:'value',kind:'field',cardinality:'array',itemType:{module:'m',element:'item'},extensions:{}}]});expect(validateDocument(cross).valid).toBe(true);roundTrip(cross);
});
test('retired core markers are refused without transition or reinterpretation',()=>{
 for(const version of ['0.1.0','0.2.0','0.3.0','0.4.0','0.9.0'] as const){const legacy={...model('0.10.0',{cardinality:'array',itemType:{module:'m',element:'item'}}),umf:version} as any;expect(validateDocument(legacy).valid).toBe(false);expect(()=>writeDocument(legacy)).toThrow();}
 expect(validateDocument({...model('0.10.0',{}),umf:'0.11.0'} as any).valid).toBe(false);
});
