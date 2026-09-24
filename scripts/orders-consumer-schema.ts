export {};
const s={type:'string'},n={type:'integer',minimum:0},array=(items:unknown)=>({type:'array',items}),object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const field=object({source:s,target:s,path:s,nativePath:s,description:s,scalarType:s,control:{enum:['text','number','checkbox']},requiredPresence:{const:true},nullable:{type:'boolean'}}),limits=array(s);
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:example:orders-consumers:1',...object({
 profile:{const:'orders-consumer-demo-1'},context:{$ref:'urn:umf:core:element-selection:0.1.0'},limits,
 transform:object({kind:{const:'exact-key-rename'},fields:array(field)}),
 visualization:object({nodes:array(object({module:s,element:s,path:s,label:s,x:n,y:n})),edges:array(object({from:n,to:n,role:s})),svg:s}),
 pipeline:object({execution:{const:'local-transform-and-validation-only'},steps:array(object({id:s,dependsOn:array(s)})),operationPath:s}),
 validator:object({schema:{type:'object'},serviceSchema:{type:'object'},avro:{$ref:'urn:umf:projection:tablespec-avro:0.1.0'},document:{$ref:'urn:umf:projection:avro-json-schema:0.1.0'}}),
 form:object({fields:array(field)}),
 agentContext:object({operationPath:s,operation:{type:'object'},aggregate:{$ref:'urn:umf:ddd:0.1.0#/$defs/entity'},service:{$ref:'urn:umf:ddd:0.1.0#/$defs/service'},contextPointer:{const:'/context'},limitsPointer:{const:'/limits'}}),humanDocumentation:s,
})};
await Bun.write('spec/examples/orders-consumers.schema.json',JSON.stringify(schema,null,2)+'\n');
