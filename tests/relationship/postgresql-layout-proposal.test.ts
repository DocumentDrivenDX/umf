import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';

const base='fixtures/projections/ddd-authored-relationships/';
const graph=await Bun.file(base+'base.json').json();
const prepared=await Bun.file(base+'postgresql-layout-proposal.json').json();
const native=await Bun.file(base+'postgresql-partitioned-key.json').json();

test('@covers US-048-AC1 @covers US-048-AC8: Key/relationship layout proposal resolves exact IDs and never widens a partitioned authored Key',()=>{
 const module=graph.logical.modules.find((row:any)=>row.id==='sales');
 const elements=new Map<string,any>(module.elements.map((row:any)=>[row.id,row]));
 const original=graph.postgresqlBinding.extensions['umf.binding'];
 const binding=prepared.binding.extensions['umf.binding'];
 expect(original.elements.find((row:any)=>row.element==='Order').partition).toBe('tenant');
 expect(binding.elements.find((row:any)=>row.element==='Order').partition).toBeNull();
 expect(prepared.tablePolicy.partitionFamilies).toEqual([]);
 expect(prepared.policy.profile).toBe('postgresql-relationship-layout-1');
 expect(prepared.policy.targetVersion).toBe('17.4');
 expect(prepared.policy.keyLayouts).toHaveLength(4);
 for(const layout of prepared.policy.keyLayouts){
  const record=elements.get(layout.record.element),key=record.keys.find((row:any)=>row.id===layout.key);
  expect(record.kind).toBe('record');expect(key).toBeDefined();
  expect(layout.components.map((row:any)=>row.keyField)).toEqual(key.fields);
  expect(layout.table).toBe(binding.elements.find((row:any)=>row.element===record.id).table);
  for(const component of layout.components){
   expect(record.members).toContainEqual(component.keyField);
   const core=elements.get(component.keyField.element);
   expect(core.kind).toBe('field');expect(core.nullability).toBe('required');expect(core.cardinality).toBe('one');
   const physical=binding.fields.find((row:any)=>row.module===component.boundField.module&&row.element===component.boundField.element&&row.field===component.boundField.field);
   expect(physical?.column).toBe(component.column);
   expect(component.nullable).toBe(false);
  }
 }
 expect(prepared.physicalRelationshipChoices.map((row:any)=>row.id)).toEqual(graph.relationshipProposals.map((row:any)=>row.assertion.id));
 expect(prepared.policy.relationshipLayouts.map((row:any)=>row.relationship.id)).toEqual(prepared.physicalRelationshipChoices.map((row:any)=>row.id));
 for(const layout of prepared.policy.relationshipLayouts){
  const authored=graph.relationshipProposals.find((row:any)=>row.module===layout.relationship.module&&row.assertion.id===layout.relationship.id).assertion;
  expect(layout.targetKey).toEqual({...authored.target[0]});
  expect(layout.targetComponents.map((row:any)=>row.keyField)).toEqual(elements.get(layout.targetKey.element).keys.find((row:any)=>row.id===layout.targetKey.key).fields);
  for(const component of [...(layout.sourceComponents??[]),...layout.targetComponents]){
   const endpoint=binding.fields.find((row:any)=>row.module===component.endpointField.module&&row.element===component.endpointField.element&&row.field===component.endpointField.field);
   const carrier=binding.fields.find((row:any)=>row.module===component.carrierField.module&&row.element===component.carrierField.element&&row.field===component.carrierField.field);
   expect(endpoint?.column).toBe(component.endpointColumn);expect(carrier?.column).toBe(component.carrierColumn);
   expect(component.sqlType).toBe('bigint');expect(component.nullable).toBe(false);
  }
 }
 const junction=prepared.policy.relationshipLayouts[1];
 expect(junction.associationRecord).toEqual({module:'sales',element:'OrderProduct'});
 expect(junction.associationKey).toEqual({module:'sales',element:'OrderProduct',key:'pk'});
 expect(junction.sourceComponents.map((row:any)=>row.keyField)).toEqual(elements.get('Order').keys[0].fields);
 expect(elements.get('OrderProduct').extensions['umf.ddd'].fields.quantity).toBeDefined();
 expect(native.observed.serverVersion).toBe('170004');
 expect(native.observed.idOnlyError).toContain('must include all partitioning columns');
 expect(native.observed.compositeAccepted).toBe(true);
 expect(native.sha256).toBe(createHash('sha256').update(native.source+native.idOnly+native.composite).digest('hex'));
});
