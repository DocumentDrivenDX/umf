import {test,expect} from 'bun:test';
import * as u from '../../src';
import {relationshipCases,relationshipCandidate} from '../../scripts/core-relationship-cases';
const resolve=(doc:any,path:string)=>path.split('/').slice(1).reduce((value,key)=>value[key.replace(/~1/g,'/').replace(/~0/g,'~')],doc);

// @covers US-045-AC1 (exact endpoint, alternate-Key and association metadata)
test('authored relationship selection resolves exact endpoint and alternate-key metadata with full source recovery',()=>{
 for(const row of relationshipCases().filter(r=>r.valid)){
  const before=structuredClone(row.document),r=u.selectCoreRelationships(row.document,{});expect(row.document).toEqual(before);expect(r.source).toEqual(before);
  for(const entry of r.selection){
   expect(resolve(r.source,entry.path)).toEqual(entry.relationship);
   for(const endpoint of [...entry.sources,...entry.targets])expect(resolve(r.source,endpoint.recordPath).id).toBe(endpoint.reference.element);
   for(const target of entry.targets)expect(resolve(r.source,target.keyPath).id).toBe(target.reference.key);
   if(entry.associationRecord)expect(resolve(r.source,entry.associationRecord.recordPath).keys.length).toBeGreaterThan(0);
  }
  for(const format of ['json','yaml'] as const){const stored=u.readJsonValue(u.writeJsonValue(r,format),format) as unknown as typeof r;expect(u.verifyCoreRelationshipSelection(stored)).toEqual(r);}
 }
});
// @covers US-045-AC1 (stable relationship identity and selection filters)
test('filters use exact stable identities, set intersection and empty-filter semantics',()=>{
 const doc=relationshipCandidate(),r=doc.modules[0].relationships[0];
 doc.modules.push({id:'other',namespace:'same',elements:[],relationships:[{...structuredClone(r),source:[{module:'m',element:'Product'}],inverse:'otherOrders'}]});
 expect(u.selectCoreRelationships(doc,{names:['customer']}).selection).toHaveLength(2);
 expect(u.selectCoreRelationships(doc,{identities:[{module:'other',id:r.id}]}).selection[0]!.identity.module).toBe('other');
 expect(u.selectCoreRelationships(doc,{modules:['other'],names:['wrong']}).selection).toEqual([]);
 for(const query of [{modules:[]},{names:[]},{identities:[]},{sources:[]},{targets:[]}])expect(u.selectCoreRelationships(doc,query).selection).toEqual([]);
 expect(u.selectCoreRelationships(doc,{sources:[{module:'m',element:'Order'},{module:'m',element:'Product'}],targets:[{module:'m',element:'Customer'}]}).selection).toHaveLength(2);
 expect(u.selectCoreRelationships(doc,{sources:[{module:'domain',element:'Order'}]}).selection).toEqual([]);
 doc.modules[0].relationships[0].name='renamed';expect(u.selectCoreRelationships(doc,{identities:[{module:'m',id:r.id}]}).selection[0]!.relationship.name).toBe('renamed');
});
// @covers US-045-AC1 (direction/inverse metadata; no instance enforcement)
test('navigation is presentation metadata and retains undirected, inverse and association distinctions',()=>{
 const doc=relationshipCandidate(),r=doc.modules[0].relationships[0];delete r.inverse;
 expect(u.selectCoreRelationships(doc,{}).selection[0]!.navigation.reverse).toBeUndefined();
 r.directed=false;r.targetLifecycle='unspecified';const selected=u.selectCoreRelationships(doc,{}).selection[0]!;
 expect(selected.navigation.reverse!.name).toBeNull();expect(selected.navigation.reverse!.from).toEqual(r.target.map((t:any)=>({module:t.module,element:t.element})));
 r.inverse='back';r.future='keep';const next=u.selectCoreRelationships(doc,{});expect(next.selection[0]!.navigation.reverse!.name).toBe('back');expect(next.selection[0]!.uninterpretedPaths).toContain('/modules/0/relationships/0/future');
 expect(next.navigationScope).toBe('authored-presentation-only');
});
test('selection refuses legacy inputs, invalid filters and forged paths without executing getters',()=>{
 const doc=relationshipCandidate(),r=u.selectCoreRelationships(doc,{}),forged=structuredClone(r);forged.selection[0]!.targets[0]!.keyPath='/forged';expect(()=>u.verifyCoreRelationshipSelection(forged)).toThrow();
 doc.umf='0.6.0';expect(()=>u.selectCoreRelationships(doc,{})).toThrow();
 let calls=0;expect(()=>u.selectCoreRelationships(relationshipCandidate(),{get modules(){calls++;return ['m'];}})).toThrow();expect(calls).toBe(0);
 expect(()=>u.selectCoreRelationships(relationshipCandidate(),{sources:[{module:'m',element:'Order',future:true}]})).toThrow();
});
