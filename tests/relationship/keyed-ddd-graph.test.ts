import {expect,test} from 'bun:test';

const base='fixtures/projections/ddd-authored-relationships/';
const prepared=await Bun.file(base+'base.json').json();
const source=await Bun.file('fixtures/projections/ddd-graphql-core-fields/case.json').json();
const pg=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const delta=await Bun.file('fixtures/projections/ddd-postgresql-tables/delta-binding.json').json();

test('@covers US-045-AC2 @covers US-046-AC1 @covers US-048-AC1 @covers US-049-AC1: shared authored DDD graph gains explicit Key ownership without changing DDD meaning',()=>{
 const logical=prepared.logical;
 expect(logical.umf).toBe('0.6.0');expect(logical.id).toBe(source.logical.id);
 const before=source.logical.modules[0].elements,after=logical.modules[0].elements;
 expect(after.map((row:any)=>row.id)).toEqual(before.map((row:any)=>row.id));
 const records=after.filter((row:any)=>row.kind==='record');expect(records.map((row:any)=>row.id)).toEqual(['Order','Customer','Product','OrderProduct']);
 const owned=new Set<string>();
 for(const record of records){
  const original=before.find((row:any)=>row.id===record.id);
  expect(record.extensions['umf.ddd']).toEqual(original.extensions['umf.ddd']);
  expect(record.keys).toEqual([{id:'pk',name:record.id+' ID',primary:true,fields:[{module:'sales',element:'field_'+record.id+'_id'}]}]);
  for(const member of record.members){
   expect(member.module).toBe('sales');expect(owned.has(member.element)).toBe(false);owned.add(member.element);
   const field=after.find((row:any)=>row.id===member.element);
   expect(field?.kind).toBe('field');
  }
 }
 expect(owned.size).toBe(after.filter((row:any)=>row.kind==='field').length);
 expect(records.find((row:any)=>row.id==='OrderProduct').extensions['umf.ddd'].fields.quantity).toEqual(pg.logical.modules[0].elements.find((row:any)=>row.id==='OrderProduct').extensions['umf.ddd'].fields.quantity);
 expect(prepared.postgresqlBinding.extensions['umf.binding'].logical).toEqual({documentId:logical.id,coreVersion:'0.6.0'});
 expect(prepared.deltaBinding.extensions['umf.binding'].logical).toEqual({documentId:logical.id,coreVersion:'0.6.0'});
 expect(prepared.postgresqlBinding.extensions['umf.binding'].target.system).toBe('postgresql');
 expect(prepared.deltaBinding.extensions['umf.binding'].target.system).toBe('delta');
 expect(prepared.postgresqlBinding.extensions['umf.binding'].indexes).toEqual(pg.binding.extensions['umf.binding'].indexes);
 expect(prepared.deltaBinding.extensions['umf.binding'].indexes).toEqual(delta.extensions['umf.binding'].indexes);
 expect(prepared.postgresqlPolicy).toEqual(pg.policy);
 expect(prepared.graphqlPolicy).toEqual(source.policy);
 expect(logical.modules.every((row:any)=>!Object.hasOwn(row,'relationships'))).toBe(true);
 const proposals=prepared.relationshipProposals;
 expect(proposals.map((row:any)=>[row.module,row.assertion.id,row.assertion.name])).toEqual([
  ['sales','order-customer','customer'],['sales','order-product','products'],
 ]);
 expect(proposals[0].assertion.target).toEqual([{module:'sales',element:'Customer',key:'pk'}]);
 expect(proposals[0].assertion.targetMultiplicity).toEqual({min:1,max:1});
 expect(proposals[1].assertion.target).toEqual([{module:'sales',element:'Product',key:'pk'}]);
 expect(proposals[1].assertion.sourceMultiplicity).toEqual({min:0,max:'*'});
 expect(proposals[1].assertion.targetMultiplicity).toEqual({min:0,max:'*'});
 expect(proposals[1].assertion.associationRecord).toEqual({module:'sales',element:'OrderProduct'});
 expect(records.find((row:any)=>row.id==='OrderProduct').keys[0].id).toBe('pk');
 expect(records.find((row:any)=>row.id==='OrderProduct').extensions['umf.ddd'].fields.quantity).toBeDefined();
 expect(proposals.every((row:any)=>row.assertion.targetLifecycle==='independent')).toBe(true);
});
