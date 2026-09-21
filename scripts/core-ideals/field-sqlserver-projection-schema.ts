import {sqlServerCarriers} from '../../src/core-ideals/sqlserver-syntax';
import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/field-postgresql-projection.schema.json').json();
schema.$id='urn:umf:core:field-sqlserver-projection:1.0.0';schema.title='Authored Field to SQL Server DDL';schema.properties.operation.const='project-field-sqlserver';schema.properties.request.properties.nativeType.enum=Object.keys(sqlServerCarriers);
schema.properties.binding.const={id:'umf.core.field.sqlserver',version:'1.0.0',nativeVersion:'16.0.4295.3',subset:'Single authored Field to permanent table DDL with explicit builtin carrier and nullable column; no value-domain or constraint equivalence'};
schema.properties.target={type:'object',additionalProperties:false,required:['format','sql'],properties:{format:{const:'sqlserver-ddl'},sql:{type:'string',minLength:1}}};schema.properties.mapping.properties.nativePath.const='/sql';enforceProjectionPolicy(schema);
await Bun.write('spec/core/field-sqlserver-projection.schema.json',JSON.stringify(schema,null,2)+'\n');
