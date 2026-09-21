import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/record-postgresql-projection.schema.json').json(),field=await Bun.file('spec/core/field-sqlserver-projection.schema.json').json();
schema.$id='urn:umf:core:record-sqlserver-projection:1.0.0';schema.title='Authored record to SQL Server DDL';schema.properties.operation.const='project-record-sqlserver';schema.properties.request.properties.fields.items.properties.nativeType=field.properties.request.properties.nativeType;
schema.properties.request.required.push('identifierCollation');schema.properties.request.properties.identifierCollation={const:'Latin1_General_100_BIN2'};
schema.properties.binding.const={id:'umf.core.record.sqlserver',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Authored flat record with explicit builtin nullable carriers; requires database identifier collation Latin1_General_100_BIN2; no value-domain equivalence'};
schema.properties.target=field.properties.target;schema.properties.mappings.items.properties.nativePath={const:'/sql'};enforceProjectionPolicy(schema);
await Bun.write('spec/core/record-sqlserver-projection.schema.json',JSON.stringify(schema,null,2)+'\n');
