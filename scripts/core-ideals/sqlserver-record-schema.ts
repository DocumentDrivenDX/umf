import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/postgresql-record-classification.schema.json').json();
schema.$id='urn:umf:core:sqlserver-record-classification:1.0.0';schema.title='Atomic SQL Server captured table/member classification';schema.properties.operation.const='classify-sqlserver-record';
schema.properties.binding.const={id:'umf.sqlserver.catalog.record',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Captured table member roles only; permission-limited observations, no native identity/constraint equivalence'};
enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/sqlserver-record-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
