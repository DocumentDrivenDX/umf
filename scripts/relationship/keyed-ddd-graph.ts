import assert from 'node:assert/strict';

const core=await Bun.file('fixtures/projections/ddd-graphql-core-fields/case.json').json();
const postgresql=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const delta=await Bun.file('fixtures/projections/ddd-postgresql-tables/delta-binding.json').json();
const logical=structuredClone(core.logical);
logical.umf='0.6.0';
const module=logical.modules.find((row:any)=>row.id==='sales');
assert(module);
for(const record of module.elements.filter((row:any)=>row.extensions?.['umf.ddd']?.kind==='entity')){
 const ownerFields=module.elements.filter((row:any)=>row.kind==='field'&&row.id.startsWith('field_'+record.id+'_'));
 const idField=ownerFields.find((row:any)=>row.id==='field_'+record.id+'_id');
 assert(idField&&idField.nullability==='required'&&idField.cardinality==='one');
 record.kind='record';
 record.members=ownerFields.map((row:any)=>({module:'sales',element:row.id}));
 record.keys=[{id:'pk',name:record.id+' ID',primary:true,fields:[{module:'sales',element:idField.id}]}];
}
const pgBinding=structuredClone(postgresql.binding),deltaBinding=structuredClone(delta);
pgBinding.id='ddd-keyed-postgresql-binding';
deltaBinding.id='ddd-keyed-delta-binding';
pgBinding.extensions['umf.binding'].logical.coreVersion='0.6.0';
deltaBinding.extensions['umf.binding'].logical.coreVersion='0.6.0';
await Bun.write('fixtures/projections/ddd-authored-relationships/base.json',JSON.stringify({
 scope:'Preparatory Key 0.6.0 shared DDD graph; relationships and ID-based binding await admission',
 logical,postgresqlBinding:pgBinding,deltaBinding,postgresqlPolicy:postgresql.policy,graphqlPolicy:core.policy,
},null,2)+'\n');
console.log({records:module.elements.filter((row:any)=>row.kind==='record').length,fields:module.elements.filter((row:any)=>row.kind==='field').length,targets:[pgBinding.extensions['umf.binding'].target.system,deltaBinding.extensions['umf.binding'].target.system]});
