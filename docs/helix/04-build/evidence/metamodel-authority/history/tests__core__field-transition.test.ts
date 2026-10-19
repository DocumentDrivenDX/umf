import {test,expect} from 'bun:test';
import {upgradeFieldEnvelope,rollbackFieldEnvelope} from '../../src/model/field-transition';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {type Document,type Json} from '../../src/model/types';
const source=():Document=>({umf:'0.1.0',id:'transition',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'a',kind:{native:['field',null]},extensions:{future:{exact:'9007199254740993'}}},{id:'b',kind:'record',scalarType:'string',extensions:{}},{id:'c',extensions:{}}]}]});
test('upgrade explicitly archives every legacy collision and preserves all other metadata',()=>{
 const input=source(),before=copyJson(input),result=upgradeFieldEnvelope(input);
 expect(copyJson(input)).toEqual(before);expect(result.source).toEqual(input);expect(result.target.umf).toBe('0.2.0');
 expect(result.residuals.map(r=>r.path)).toEqual(['/modules/0/elements/0/kind','/modules/0/elements/1/kind']);
 expect(result.residuals.map(r=>r.value)).toEqual([{native:['field',null]},'record']);
 for(const element of result.target.modules[0]!.elements)expect(Object.hasOwn(element,'kind')).toBe(false);
 expect(result.target.modules[0]!.elements[1]!.scalarType).toBe('string');
 result.target.modules[0]!.elements[0]!.extensions.future={changed:true};expect(result.source).toEqual(input);expect(copyJson(input)).toEqual(before);
});
test('serialized receipts support exact model rollback while retaining later assertions and native edits',()=>{
 for(const format of ['json','yaml'] as const){
  const input=source(),receipt=upgradeFieldEnvelope(input);
  const restored=readJsonValue(writeJsonValue(copyJson(receipt),format),format) as unknown as typeof receipt;
  const current=copyJson(restored.target) as unknown as Document;
  current.modules[0]!.elements[0]!.kind='field';current.modules[0]!.elements[0]!.name='authored';
  current.modules[0]!.elements[0]!.extensions.future={edited:'native',unknown:[1,null]};
  const rollback=rollbackFieldEnvelope(restored,current);
  expect(rollback.target).toEqual(input);expect(rollback.source).toEqual(current);expect(rollback.receipt).toEqual(receipt);
  expect(readJsonValue(writeJsonValue(copyJson(rollback),format),format)).toEqual(copyJson(rollback));
  rollback.source.modules[0]!.elements[0]!.name='changed-copy';expect(current.modules[0]!.elements[0]!.name).toBe('authored');
 }
});
test('tampered or stale receipts fail without overwriting source or edited model',()=>{
 for(const mutate of [
  (r:any)=>r.target.modules[0].elements[0].name='forged',
  (r:any)=>r.residuals.pop(),
  (r:any)=>r.residuals[0].value='forged',
  (r:any)=>r.source.modules[0].elements[0].kind='different',
  (r:any)=>r.operation='rollback-field-envelope',
 ]){const r=upgradeFieldEnvelope(source());mutate(r);const before=copyJson(r);expect(()=>rollbackFieldEnvelope(r,r.target)).toThrow();expect(copyJson(r)).toEqual(before);}
 const r=upgradeFieldEnvelope(source());expect(()=>rollbackFieldEnvelope(r,{...r.target,id:'other'})).toThrow();
 expect(()=>upgradeFieldEnvelope(r.target)).toThrow();expect(()=>rollbackFieldEnvelope(r,r.source)).toThrow();
});
test('null, method-like names, unknown content, and malformed inputs retain copy safety',()=>{
 for(const kind of [null,'field','record','group',42,[],{constructor:'data',toString:'data'}] as Json[]){
  const doc=source();doc.modules[0]!.elements[0]!.kind=kind;const r=upgradeFieldEnvelope(doc);
  expect(r.residuals[0]!.value).toEqual(kind);expect(rollbackFieldEnvelope(r,r.target).target).toEqual(doc);
 }
 let calls=0;const doc=source();Object.defineProperty(doc.modules[0]!.elements[0]!,'kind',{enumerable:true,get(){calls++;return 'field';}});
 expect(()=>upgradeFieldEnvelope(doc)).toThrow();expect(calls).toBe(0);
 expect(()=>upgradeFieldEnvelope({...source(),modules:[{id:'m',namespace:'s',elements:[{id:'a',extensions:{},references:[{role:'x',module:'none',element:'none'}]}]}]})).toThrow();
});
