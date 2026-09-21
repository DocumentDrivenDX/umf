export {};
const definition={enum:['field','record','group']};
const identity={type:'object',additionalProperties:false,required:['module','element'],properties:{module:{type:'string',minLength:1},element:{type:'string',minLength:1}}};
const source={oneOf:[{$ref:'urn:umf:core:0.1.0'},{$ref:'urn:umf:core:0.2.0'}]};
const schema={
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:core:kind-operation:1.0.0',
 title:'Core kind lookup and explicit author declaration results',
 $defs:{kind:definition,identity,source,
 lookup:{type:'object',additionalProperties:false,required:['operation','version','source','identity','path','meaning','provenance'],properties:{operation:{const:'inspect-core-kind'},version:{const:'1.0.0'},source:{$ref:'#/$defs/source'},identity:{$ref:'#/$defs/identity'},path:{type:'string'},provenance:{const:'unverified'},meaning:{oneOf:[
 {type:'object',additionalProperties:false,required:['state','kind'],properties:{state:{const:'known'},kind:{$ref:'#/$defs/kind'}}},
 {type:'object',additionalProperties:false,required:['state'],properties:{state:{const:'unspecified'}}},
 {type:'object',additionalProperties:false,required:['state','value'],properties:{state:{const:'legacy'},value:{}}},
 {type:'object',additionalProperties:false,required:['state','value'],properties:{state:{const:'unknown'},value:{type:'string',minLength:1,not:{$ref:'#/$defs/kind'}}}}
 ]}}},
 declaration:{type:'object',additionalProperties:false,required:['operation','version','source','target','identity','provenance'],properties:{operation:{const:'declare-core-kind'},version:{const:'1.0.0'},source:{$ref:'urn:umf:core:0.2.0'},target:{$ref:'urn:umf:core:0.2.0'},identity:{$ref:'#/$defs/identity'},provenance:{type:'object',additionalProperties:false,required:['origin','idealPath','kind','binding','basis','nativePath'],properties:{origin:{const:'authored'},idealPath:{type:'string'},kind:{$ref:'#/$defs/kind'},binding:{const:{id:'umf.core.kind.authoring',version:'1.0.0'}},basis:{const:'explicit-author-declaration'},nativePath:{type:'null'}}}}}
 },oneOf:[{$ref:'#/$defs/lookup'},{$ref:'#/$defs/declaration'}]
};
await Bun.write('spec/core/kind-operation.schema.json',JSON.stringify(schema,null,2)+'\n');
