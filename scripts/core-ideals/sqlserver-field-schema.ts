import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/postgresql-field-classification.schema.json').json();
schema.$id='urn:umf:core:sqlserver-field-classification:1.0.0';schema.title='SQL Server 16.0.4295.3 captured column Field classification';schema.properties.operation.const='classify-sqlserver-field';
schema.properties.binding.const={id:'umf.sqlserver.catalog.field',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Captured catalog column membership; excludes raw DDL and native constraint/value equivalence'};
enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/sqlserver-field-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
