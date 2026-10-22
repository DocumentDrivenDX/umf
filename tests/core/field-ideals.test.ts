// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {validateDocument} from '../../src/validation/document';
import {readDocument,writeDocument} from '../../src/model/document';
import {type Document,SCALAR_TYPES} from '../../src/model/types';
const document=(umf:string,element:Record<string,unknown>):Document=>({umf,id:'field-test',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',extensions:{future:{native:'uninterpreted',nested:[null,1,'雪']}},...element}]}]} as Document);
test('field kinds are explicit; missing kind is never inferred from scalar family',()=>{
 for(const kind of ['field','record','group',undefined]){
  const doc=document('0.10.0',kind===undefined?{scalarType:'string'}:{kind});
  const result=validateDocument(doc);expect(result.valid).toBe(true);expect(result.complete).toBe(false);
  for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(back).toEqual(doc);if(kind===undefined)expect(Object.hasOwn(back.modules[0]!.elements[0]!,'kind')).toBe(false);}
 }
});
test('retired core markers are refused without reinterpreting colliding names',()=>{
 for(const umf of ['0.1.0','0.2.0','0.3.0','0.8.0','0.9.0'] as const){const legacy={...document('0.10.0',{kind:'field'}),umf} as any;expect(validateDocument(legacy).valid).toBe(false);expect(()=>writeDocument(legacy)).toThrow();}
});
test('current profile refuses malformed kinds and structured scalar claims atomically',()=>{
 for(const kind of [null,42,[],{},''])expect(validateDocument(document('0.10.0',{kind})).valid).toBe(false);
 for(const kind of ['record','group'])for(const scalarType of [...SCALAR_TYPES,'future-family']){
  const doc=document('0.10.0',{kind,scalarType});const original=JSON.stringify(doc);
  expect(validateDocument(doc).valid).toBe(false);expect(()=>writeDocument(doc)).toThrow();expect(JSON.stringify(doc)).toBe(original);
 }
 for(const scalarType of SCALAR_TYPES)expect(validateDocument(document('0.10.0',{kind:'field',scalarType})).valid).toBe(true);
});
test('unknown future kind and other open metadata survive without semantic completion',()=>{
 const doc=document('0.10.0',{kind:'future-kind',future:{kind:{value:'record'}},scalarType:'future-scalar'});
 const result=validateDocument(doc);expect(result.valid).toBe(true);expect(result.complete).toBe(false);
 expect(result.diagnostics.some(d=>d.code==='UNKNOWN_ELEMENT_KIND'&&d.path==='/modules/0/elements/0/kind')).toBe(true);
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(doc,format),format)).toEqual(doc);
});
test('future envelope versions and unsafe getter inputs cannot be interpreted',()=>{
 const doc=document('0.10.0',{});expect(validateDocument({...doc,umf:'0.11.0'} as any).valid).toBe(false);
 let calls=0;Object.defineProperty(doc.modules[0]!.elements[0]!,'kind',{enumerable:true,get(){calls++;return 'field';}});
 expect(validateDocument(doc).valid).toBe(false);expect(calls).toBe(0);
});
