import {test,expect} from 'bun:test';
import {upgradeNullabilityEnvelope,rollbackNullabilityEnvelope} from '../../src/model/nullability-transition';
import {upgradeFieldEnvelope,rollbackFieldEnvelope} from '../../src/model/field-transition';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {type Document,type Json} from '../../src/model/types';
const model=():Document=>({umf:'0.2.0',id:'availability',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[
 {id:'a',kind:'field',nullability:'required',scalarType:'integer',extensions:{future:{native:null,exact:'9007199254740993'}}},
 {id:'record',kind:'record',nullability:{native:[null,true]},references:[{role:'member',module:'m',element:'a'}],extensions:{}},
 {id:'missing',kind:'field',extensions:{}}
]}]});
test('explicit upgrade archives every old label and preserves roles, native refinements and references',()=>{
 const source=model(),before=structuredClone(source),receipt=upgradeNullabilityEnvelope(source);
 expect(source).toEqual(before);expect(receipt.source).toEqual(source);expect(receipt.target.umf).toBe('0.3.0');
 expect(receipt.residuals.map(r=>r.path)).toEqual(['/modules/0/elements/0/nullability','/modules/0/elements/1/nullability']);
 expect(receipt.residuals.map(r=>r.value)).toEqual(['required',{native:[null,true]}]);
 for(let i=0;i<3;i++){expect(Object.hasOwn(receipt.target.modules[0]!.elements[i]!,'nullability')).toBe(false);expect(receipt.target.modules[0]!.elements[i]!.kind).toBe(source.modules[0]!.elements[i]!.kind);}
 expect(receipt.target.modules[0]!.elements[1]!.references).toEqual(source.modules[0]!.elements[1]!.references);
 receipt.target.modules[0]!.elements[0]!.extensions.future={changed:true};expect(receipt.source).toEqual(before);expect(source).toEqual(before);
});
test('both receipt formats roll back original model while retaining subsequent availability and native edits',()=>{
 for(const format of ['json','yaml'] as const){const source=model(),receipt=upgradeNullabilityEnvelope(source);
  const restored=readJsonValue(writeJsonValue(copyJson(receipt),format),format) as unknown as typeof receipt;
  const current=copyJson(restored.target) as unknown as Document;current.modules[0]!.elements[0]!.nullability='absent-allowed';current.modules[0]!.elements[0]!.extensions.future={edited:'native'};
  const rollback=rollbackNullabilityEnvelope(restored,current);expect(rollback.target).toEqual(source);expect(rollback.source).toEqual(current);expect(rollback.receipt).toEqual(receipt);
  expect(readJsonValue(writeJsonValue(copyJson(rollback),format),format)).toEqual(copyJson(rollback));
  rollback.source.modules[0]!.elements[0]!.nullability='unspecified';expect(current.modules[0]!.elements[0]!.nullability).toBe('absent-allowed');
 }
});
test('null, empty, known, future and method-like collisions remain recoverable',()=>{
 for(const value of [null,'','required','absent-allowed','unspecified','future-availability',42,[],{constructor:'data',toString:'data'}] as Json[]){
  const source=model();source.modules[0]!.elements[0]!.nullability=value;const receipt=upgradeNullabilityEnvelope(source);
  expect(receipt.residuals[0]!.value).toEqual(value);expect(rollbackNullabilityEnvelope(receipt,receipt.target).target).toEqual(source);
 }
});
test('forged receipts, wrong identity, wrong versions and malformed current states refuse atomically',()=>{
 for(const mutate of [
  (r:any)=>r.residuals.pop(),(r:any)=>r.residuals[0].value='forged',
  (r:any)=>r.target.modules[0].elements[0].nullability='required',
  (r:any)=>r.source.modules[0].elements[0].nullability='different',
  (r:any)=>r.operation='rollback-nullability-envelope',
 ]){const receipt=upgradeNullabilityEnvelope(model());mutate(receipt);const before=copyJson(receipt);expect(()=>rollbackNullabilityEnvelope(receipt,receipt.target)).toThrow();expect(copyJson(receipt)).toEqual(before);}
 const receipt=upgradeNullabilityEnvelope(model());expect(()=>upgradeNullabilityEnvelope(receipt.target)).toThrow();expect(()=>rollbackNullabilityEnvelope(receipt,receipt.source)).toThrow();expect(()=>rollbackNullabilityEnvelope(receipt,{...receipt.target,id:'other'})).toThrow();
 const malformed=copyJson(receipt.target) as unknown as Document;malformed.modules[0]!.elements[1]!.nullability='required';expect(()=>rollbackNullabilityEnvelope(receipt,malformed)).toThrow();
});
test('0.1.0 requires the Field transition first and the inverse chain preserves both collisions',()=>{
 const old=model();old.umf='0.1.0';old.modules[0]!.elements[0]!.kind={opaque:'field'};
 expect(()=>upgradeNullabilityEnvelope(old)).toThrow();const field=upgradeFieldEnvelope(old);expect(field.target.modules[0]!.elements[0]!.nullability).toBe('required');
 const availability=upgradeNullabilityEnvelope(field.target),back=rollbackNullabilityEnvelope(availability,availability.target);
 expect(rollbackFieldEnvelope(field,back.target).target).toEqual(old);
});
test('getter inputs are refused without invoking artifact code',()=>{
 const source=model();let calls=0;Object.defineProperty(source.modules[0]!.elements[0]!,'nullability',{enumerable:true,get(){calls++;return 'required';}});
 expect(()=>upgradeNullabilityEnvelope(source)).toThrow();expect(calls).toBe(0);
});
