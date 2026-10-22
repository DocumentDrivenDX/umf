import {test,expect} from 'bun:test';
import {relationshipCandidate} from '../../scripts/core-relationship-cases';
import {relationshipTransitionCases} from '../../scripts/core-relationship-transition-cases';
import {upgradeRelationshipEnvelope,rollbackRelationshipEnvelope,verifyRelationshipTransition} from '../../src/model/relationship-transition';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateRelationshipCandidate} from '../../src/validation/relationships';

// @covers US-045-AC10
test('explicit 0.6 to 0.7 transition archives every module collision without interpreting it',()=>{
 for(const row of relationshipTransitionCases()){
  const before=structuredClone(row.source),r=upgradeRelationshipEnvelope(row.source);
  expect(row.source).toEqual(before);expect(r.source).toEqual(before);expect(r.target.umf).toBe('0.7.0');
  expect(validateRelationshipCandidate(r.target).valid).toBe(true);
  expect(r.residuals).toHaveLength(row.id==='no-collision'?0:2);
  expect(r.target.modules.every(m=>m.relationships===undefined)).toBe(true);
  expect(r.target.relationships).toEqual(row.source.relationships);
  expect(r.target.modules[0]!.elements[0]!.relationships).toEqual(row.source.modules[0]!.elements[0]!.relationships);
  for(const format of ['json','yaml'] as const){
   const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
   expect(verifyRelationshipTransition(saved)).toEqual(r);
   expect(rollbackRelationshipEnvelope(saved,saved.target).target).toEqual(before);
  }
 }
});
// @covers US-045-AC10
test('rollback restores original envelope and retains new assertions and native edits in its source',()=>{
 const original=relationshipTransitionCases()[0]!.source,r=upgradeRelationshipEnvelope(original),current=structuredClone(r.target);
 current.modules[0]!.relationships=relationshipCandidate().modules[0].relationships;
 current.extensions!.future={later:{native:'modified'},uninterpreted:true};
 const before=structuredClone(current),rolled=rollbackRelationshipEnvelope(r,current);
 expect(current).toEqual(before);expect(rolled.source).toEqual(before);expect(rolled.target).toEqual(original);
 expect(rolled.source.modules[0]!.relationships).toHaveLength(1);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(rolled,format),format) as unknown as typeof rolled;expect(verifyRelationshipTransition(saved)).toEqual(rolled);}
 rolled.source.modules[0]!.relationships![0]!.name='mutated-copy';expect(current).toEqual(before);
});
test('forged receipts, invalid current meaning and mismatched document identities reject',()=>{
 const r=upgradeRelationshipEnvelope(relationshipTransitionCases()[0]!.source);
 for(const change of [(x:any)=>x.residuals.pop(),(x:any)=>x.residuals[0].value='changed',(x:any)=>x.target.id='different',(x:any)=>x.source.modules[0].relationships='changed']){
  const bad=structuredClone(r);change(bad);expect(()=>verifyRelationshipTransition(bad)).toThrow();expect(()=>rollbackRelationshipEnvelope(bad,r.target)).toThrow();
 }
 const current=structuredClone(r.target);current.id='different';expect(()=>rollbackRelationshipEnvelope(r,current)).toThrow();
 const invalid=structuredClone(r.target);invalid.modules[0]!.relationships=relationshipCandidate().modules[0].relationships;invalid.modules[0]!.relationships![0]!.target[0]!.key='missing';expect(()=>rollbackRelationshipEnvelope(r,invalid)).toThrow();
 const rolled=rollbackRelationshipEnvelope(r,r.target);rolled.target.id='forged';expect(()=>verifyRelationshipTransition(rolled)).toThrow();
 const old=structuredClone(r.source);old.umf='0.5.0';expect(()=>upgradeRelationshipEnvelope(old)).toThrow();
});
test('transition functions reject accessors without evaluating them',()=>{
 let calls=0;const d=relationshipTransitionCases()[0]!.source;
 Object.defineProperty(d.modules[0],'relationships',{enumerable:true,get(){calls++;return [];}});
 expect(()=>upgradeRelationshipEnvelope(d)).toThrow();expect(calls).toBe(0);
 const r=upgradeRelationshipEnvelope(relationshipTransitionCases()[0]!.source);
 Object.defineProperty(r,'target',{enumerable:true,get(){calls++;return {};}});
 expect(()=>verifyRelationshipTransition(r)).toThrow();expect(calls).toBe(0);
});
