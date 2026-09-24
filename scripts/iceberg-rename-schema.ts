export {};
const bindings=await Bun.file('spec/extensions/iceberg-table/transform-binding-schema.json').json();delete bindings.$id;delete bindings.$schema;
const integer={type:'integer',minimum:0,maximum:2147483647},str={type:'string'};
const properties={complete:{const:false},previousSchemaId:{type:'integer',minimum:-2147483648,maximum:2147483647},nextSchemaId:integer,fieldId:integer,oldName:str,newName:str,appendedSchemaPath:str,bindings,limitations:{type:'array',items:str}};
await Bun.write('spec/extensions/iceberg-table/rename-report-schema.json',JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:iceberg:rename-report:0.1.0',type:'object',properties,required:Object.keys(properties),additionalProperties:false},null,2)+'\n');
