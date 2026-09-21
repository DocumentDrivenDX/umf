import {enforceProjectionPolicy} from './projection-policy-schema';
export {};
const schema=await Bun.file('spec/core/record-tablespec-projection.schema.json').json(),field=await Bun.file('spec/core/field-postgresql-projection.schema.json').json();
schema.$id='urn:umf:core:record-postgresql-projection:1.0.0';schema.title='Authored record to PostgreSQL 17.4 DDL';schema.properties.operation.const='project-record-postgresql';
schema.properties.request.required.push('namespace');schema.properties.request.properties.namespace=field.properties.request.properties.namespace;schema.properties.request.properties.fields.items.properties.nativeType=field.properties.request.properties.nativeType;
schema.properties.binding.const={id:'umf.core.record.postgresql',version:'1.0.0',nativeVersion:'17.4',subset:'Authored record with explicit pg_catalog field carriers; no value-domain or execution equivalence'};
schema.properties.nativeSql=field.properties.nativeSql;schema.allOf[0].then.required.push('nativeSql');schema.allOf[0].then.properties.nativeSql=true;schema.allOf[0].else.properties.nativeSql=false;
enforceProjectionPolicy(schema);
await Bun.write('spec/core/record-postgresql-projection.schema.json',JSON.stringify(schema,null,2)+'\n');
