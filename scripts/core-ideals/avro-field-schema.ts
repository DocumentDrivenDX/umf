import {enforceProjectionPolicy} from './projection-policy-schema';
const schema=await Bun.file('spec/core/sqlserver-field-classification.schema.json').json();
schema.$id='urn:umf:core:avro-field-classification:1.0.0';schema.title='Avro declared record/error Field classification';schema.properties.operation.const='classify-avro-field';
schema.properties.request.properties.dependencies={type:'array',items:{type:'object',additionalProperties:false,required:['id','schema'],properties:{id:{type:'string',minLength:1},schema:{type:'string',maxLength:4000000}}}};
schema.properties.binding.const={id:'umf.avro.field',version:'1.0.0',nativeVersion:'1.12.0',subset:'Declared record/error field membership with named dependencies; logical refinements, presence and value-domain equivalence excluded'};
schema.properties.mapping.properties.dependencyId={type:'string',minLength:1};schema.properties.mapping.properties.basis.const='checked-record-field-membership';enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/avro-field-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
