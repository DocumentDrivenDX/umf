export {};
const schema=await Bun.file('spec/core/tablespec-record-classification.schema.json').json();
schema.$id='urn:umf:core:postgresql-record-classification:1.0.0';schema.title='Atomic PostgreSQL catalog table and member classification';schema.properties.operation.const='classify-postgresql-record';
schema.properties.request.required.push('nativeSource','relation');schema.properties.request.properties.nativeSource={type:'string',maxLength:4000000};schema.properties.request.properties.relation={type:'object',additionalProperties:false,required:['schema','name'],properties:{schema:{type:'string',minLength:1},name:{type:'string',minLength:1}}};
schema.properties.binding.const={id:'umf.postgresql.catalog.record',version:'1.0.0',nativeVersion:'17.4',subset:'Captured ordinary/partitioned table member roles; views, composites, raw DDL and execution equivalence excluded'};
schema.properties.mappings.items.properties.basis.enum=['checked-catalog-column-membership','checked-catalog-table-members'];
await Bun.write('spec/core/postgresql-record-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
