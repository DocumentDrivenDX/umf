import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/sqlserver-record-classification.schema.json').json(),field=await Bun.file('spec/core/avro-field-classification.schema.json').json();
schema.$id='urn:umf:core:avro-record-classification:1.0.0';schema.title='Avro record/error declaration classification';schema.properties.operation.const='classify-avro-record';
delete schema.properties.request.properties.relation;schema.properties.request.required=schema.properties.request.required.filter((p:string)=>p!=='relation');schema.properties.request.required.push('path');Object.assign(schema.properties.request.properties,{path:{type:'string'},dependencyId:{type:'string',minLength:1},dependencies:field.properties.request.properties.dependencies});
schema.properties.binding.const={id:'umf.avro.record',version:'1.0.0',nativeVersion:'1.12.0',subset:'Declared record/error with ordered fields and dependency-qualified identity; no value-domain or logical-type equivalence'};
schema.properties.mappings.items.properties.basis.enum=['checked-record-field-membership','checked-record-declaration'];schema.properties.mappings.items.properties.dependencyId={type:'string',minLength:1};enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/avro-record-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
