export {};
const core=await Bun.file('spec/core/schema.json').json(),tree=await Bun.file('spec/core/native-json.schema.json').json();
const schema={$schema:core.$schema,$id:'urn:umf:avro:field-metadata:0.1.0',title:'Avro field metadata derived from native schemas',type:'array',items:{type:'object',required:['path','record','element','nativeField'],additionalProperties:false,properties:{dependencyId:{type:'string'},path:{type:'string'},record:{type:'string'},element:{$ref:'#/$defs/element'},nativeField:{$ref:'#/$defs/node'}}},$defs:{...core.$defs,...tree.$defs}};
await Bun.write('spec/extensions/avro/field-metadata.schema.json',JSON.stringify(schema,null,2)+'\n');
