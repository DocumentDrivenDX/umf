import {test,expect} from 'bun:test';
import {upgradeKeyEnvelope,rollbackKeyEnvelope} from '../../src/model/key-transition';
import {validateKeyCandidate} from '../../src/validation/keys';
import {validateDocument} from '../../src/validation/document';
import {keyTransitionCases,keyTransitionSource} from '../../scripts/core-key-transition-cases';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {encodeCoreKeyTuple} from '../../src/model/key-tuple';

test('explicit Key migration archives all element collisions without adopting author intent',()=>{
 for(const row of keyTransitionCases()){
  const before=copyJson(row.source),receipt=upgradeKeyEnvelope(row.source);
  expect(copyJson(row.source)).toEqual(before);expect(receipt.target.umf).toBe('0.6.0');expect(receipt.residuals).toHaveLength(9);
  expect(receipt.residuals.map(r=>r.value)).toEqual(Array.from({length:9},()=>row.value));
  expect(new Set(receipt.residuals.map(r=>r.path)).size).toBe(9);
  for(const e of receipt.target.modules[0]!.elements)for(const name of ['key','keys','members'])expect(Object.hasOwn(e,name)).toBe(false);
  expect(receipt.target.extensions).toEqual(row.source.extensions);expect(receipt.target.keys).toEqual(row.source.keys);
  expect(receipt.target.modules[0]!.members).toEqual(row.source.modules[0]!.members);
  expect(receipt.target.modules[0]!.elements[0]!.references).toEqual(row.source.modules[0]!.elements[0]!.references);
  expect(validateKeyCandidate(receipt.target).valid).toBe(true);
  for(const format of ['json','yaml'] as const){
   const saved=readJsonValue(writeJsonValue(receipt,format),format) as unknown as typeof receipt;
   expect(copyJson(rollbackKeyEnvelope(saved,saved.target).target)).toEqual(before);
   expect(readJsonValue(writeJsonValue(saved.target,format),format)).toEqual(copyJson(receipt.target));
  }
 }
});
test('rollback restores exact old content and separately retains later key assertions and native edits',()=>{
 const source=keyTransitionSource(false),receipt=upgradeKeyEnvelope(source),current=structuredClone(receipt.target),r=current.modules[0]!.elements[0]!;
 r.members=[{module:'m',element:'id'}];r.keys=[{id:'new-key',name:'Authored',primary:true,fields:[{module:'m',element:'id'}]}];
 current.extensions!.future={newNativeMeaning:['retained',true]};
 expect(encodeCoreKeyTuple(current,{module:'m',element:'record',key:'new-key'},[{integerToken:'42'}]).bytesHex).toBe('554d464b310102023432');
 const result=rollbackKeyEnvelope(receipt,current);expect(result.target).toEqual(source);expect(result.source).toEqual(current);
 expect(result.target.modules[0]!.elements[0]!.keys).toBe(false);expect(validateDocument(result.target).valid).toBe(true);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(result,format),format) as any;expect(saved.target).toEqual(source);expect(saved.source).toEqual(current);expect(rollbackKeyEnvelope(saved.receipt,saved.source)).toEqual(result);}
 expect(Object.hasOwn(receipt.target.modules[0]!.elements[0]!,'keys')).toBe(false);
});
test('forged receipts, wrong identities/versions and invalid current key meaning reject atomically',()=>{
 const source=keyTransitionSource(null),receipt=upgradeKeyEnvelope(source);
 for(const edit of [(r:any)=>r.residuals.pop(),(r:any)=>r.residuals.reverse(),(r:any)=>r.residuals[0].value=true,(r:any)=>r.target.modules[0].elements[0].name='changed',(r:any)=>r.source.modules[0].elements[0].key=true]){
  const forged=structuredClone(receipt);edit(forged);expect(()=>rollbackKeyEnvelope(forged,receipt.target)).toThrow();
 }
 expect(()=>rollbackKeyEnvelope(receipt,{...receipt.target,id:'other'})).toThrow('identity differs');
 const invalid=structuredClone(receipt.target);invalid.modules[0]!.elements[0]!.keys=[];expect(()=>rollbackKeyEnvelope(receipt,invalid)).toThrow('valid current');
 for(const umf of ['0.1.0','0.2.0','0.3.0','0.4.0','0.6.0'])expect(()=>upgradeKeyEnvelope({...source,umf} as any)).toThrow();
 for(const input of [null,false,0,[],{}]){expect(()=>upgradeKeyEnvelope(input as any)).toThrow('valid 0.5.0');expect(()=>rollbackKeyEnvelope(receipt,input as any)).toThrow('valid current');}
});
test('no-collision migration and copy discipline preserve opaque scopes without getters',()=>{
 const source=keyTransitionSource(null);for(const e of source.modules[0]!.elements)for(const k of ['key','keys','members'])delete e[k];
 const receipt=upgradeKeyEnvelope(source);expect(receipt.residuals).toEqual([]);expect(rollbackKeyEnvelope(receipt,receipt.target).target).toEqual(source);
 let calls=0;const hostile=keyTransitionSource(null);Object.defineProperty(hostile.modules[0]!.elements[0],'keys',{enumerable:true,get(){calls++;return {};}});
 expect(()=>upgradeKeyEnvelope(hostile)).toThrow();expect(calls).toBe(0);
 receipt.target.modules[0]!.elements[0]!.name='caller edit';expect(Object.hasOwn(source.modules[0]!.elements[0]!,'name')).toBe(false);
});
