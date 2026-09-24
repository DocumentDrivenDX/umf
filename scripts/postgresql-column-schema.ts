export {};
const core=await Bun.file('spec/core/schema.json').json(),tree=await Bun.file('spec/core/native-json.schema.json').json();
const schema={$schema:core.$schema,$id:'urn:umf:postgresql:column-metadata:0.1.0',type:'array',items:{type:'object',required:['path','relation','element','nativeColumn'],additionalProperties:false,properties:{path:{type:'string'},relation:{type:'object',required:['schema','name','kind'],additionalProperties:false,properties:{schema:{type:'string'},name:{type:'string'},kind:{type:'string'}}},element:{$ref:'#/$defs/element'},nativeColumn:{$ref:'#/$defs/node'}}},$defs:{...core.$defs,...tree.$defs}};
await Bun.write('spec/extensions/postgresql-catalog/column-metadata.schema.json',JSON.stringify(schema,null,2)+'\n');
