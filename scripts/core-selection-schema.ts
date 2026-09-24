export {};
const core=await Bun.file('spec/core/schema.json').json(),s={type:'string'},id={type:'string',minLength:1};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',required,additionalProperties:false,properties}),array=(items:unknown)=>({type:'array',items});
const identity=object({module:id,element:id}),query=object({references:{enum:['none','transitive']},modules:array(s),namespaces:array(s),names:array(s),scalarTypes:array(id),identities:array(identity)},['references']);
const reference={type:'object',required:['role','module','element'],properties:{role:id,module:id,element:id}};
const validation=object({valid:{const:true},complete:{type:'boolean'},diagnostics:array(object({code:s,path:s,message:s,severity:{enum:['error','warning']}}))});
const schema={$schema:core.$schema,$id:'urn:umf:core:element-selection:0.1.0',...object({scope:{const:'core-elements'},referenceScope:{const:'explicit-core-references'},source:{$ref:'urn:umf:core:0.1.0'},query,sourceValidation:validation,selection:array(object({module:id,namespace:s,path:s,element:{$ref:'#/$defs/element'},includedBy:{enum:['match','reference']}})),boundaryReferences:array(object({from:identity,reference,targetPath:s}))}),$defs:core.$defs};
await Bun.write('spec/core/element-selection.schema.json',JSON.stringify(schema,null,2)+'\n');
