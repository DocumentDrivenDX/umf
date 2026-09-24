export {};
const schema=await Bun.file('spec/projections/sqlserver-avro.schema.json').json();schema.$id='urn:umf:projection:tablespec-avro:0.1.0';
const p=schema.properties.policy;p.required=p.required.filter((k:string)=>k!=='table');delete p.properties.table;p.properties.context={type:'string',minLength:1};
const binding=p.properties.fields.additionalProperties;binding.required.push('nullable');binding.properties.representation={enum:['string','int32','int64','float32','float64','boolean','decimal','date','timestamp-micros','local-timestamp-micros','embedding-float32']};binding.properties.nullable={anyOf:[{const:'source'},{type:'boolean'}]};binding.properties.itemsNullable={type:'boolean'};
binding.allOf=[{if:{required:['itemsNullable'],properties:{itemsNullable:{type:'boolean'}}},then:{properties:{representation:{const:'embedding-float32'}}}}];
const mapping=schema.properties.mappings.items;mapping.required=['index','column','field','representation','nullable'];delete mapping.properties.sourcePath;mapping.properties.index={type:'integer',minimum:0};mapping.properties.nullable={type:'boolean'};mapping.properties.representation=binding.properties.representation;
await Bun.write('spec/projections/tablespec-avro.schema.json',JSON.stringify(schema,null,2)+'\n');
