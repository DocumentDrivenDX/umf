import {test,expect} from 'bun:test';
import {validateDocument} from '../../src/validation/document';
import {readDocument,writeDocument} from '../../src/model/document';
import {NULLABILITIES,type Document} from '../../src/model/types';
const model=(umf:Document['umf'],element:Record<string,unknown>):Document=>({umf,id:'availability',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',extensions:{future:{is_nullable:true,default:null,context:{required:false}}},...element}]}]});
test('explicit nullability requires a Field and survives both formats without native interpretation',()=>{
 for(const nullability of NULLABILITIES){const doc=model('0.3.0',{kind:'field',nullability}),before=structuredClone(doc);const result=validateDocument(doc);
  expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(result.diagnostics.some(d=>d.code==='EXPERIMENTAL_CORE_NULLABILITY')).toBe(true);
  for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(doc,format),format)).toEqual(before);
  expect(doc).toEqual(before);
 }
});
test('missing availability does not inherit native nullable flags or defaults',()=>{
 const doc=model('0.3.0',{kind:'field',scalarType:'integer'});
 expect(validateDocument(doc).valid).toBe(true);
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(Object.hasOwn(back.modules[0]!.elements[0]!,'nullability')).toBe(false);expect(back).toEqual(doc);}
});
test('older envelopes preserve all colliding nullability values as opaque content',()=>{
 for(const umf of ['0.1.0','0.2.0'] as const)for(const nullability of [...NULLABILITIES,'future-availability',null,42,[],{native:true},'']){
  const doc=model(umf,{kind:'field',nullability});const result=validateDocument(doc);
  expect(result.valid).toBe(true);expect(result.diagnostics.some(d=>d.code==='UNKNOWN_CORE_FIELD'&&d.path==='/modules/0/elements/0/nullability')).toBe(true);
  for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(doc,format),format)).toEqual(doc);
 }
});
test('unknown availability is retained, but malformed values and non-Field use fail atomically',()=>{
 const future=model('0.3.0',{kind:'field',nullability:'future-availability'});expect(validateDocument(future).valid).toBe(true);expect(validateDocument(future).diagnostics.some(d=>d.code==='UNKNOWN_NULLABILITY')).toBe(true);
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(future,format),format)).toEqual(future);
 for(const kind of ['record','group','future-kind',undefined])for(const nullability of NULLABILITIES){const doc=model('0.3.0',{...(kind===undefined?{}:{kind}),nullability}),before=structuredClone(doc);expect(validateDocument(doc).valid).toBe(false);expect(()=>writeDocument(doc)).toThrow();expect(doc).toEqual(before);}
 for(const nullability of [null,42,[],{},''])expect(validateDocument(model('0.3.0',{kind:'field',nullability})).valid).toBe(false);
});
test('unsafe getters and unsupported future versions cannot be interpreted',()=>{
 const doc=model('0.3.0',{kind:'field'});let calls=0;Object.defineProperty(doc.modules[0]!.elements[0]!,'nullability',{enumerable:true,get(){calls++;return 'required';}});
 expect(validateDocument(doc).valid).toBe(false);expect(calls).toBe(0);expect(validateDocument({...model('0.3.0',{}),umf:'0.6.0'}).valid).toBe(false);
});
