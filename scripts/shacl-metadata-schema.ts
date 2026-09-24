export {};
const rdf=await Bun.file('spec/extensions/rdf/schema.json').json(),path=await Bun.file('spec/extensions/shacl/path-schema.json').json();
const term=rdf.properties.quads.items.properties.object,node=rdf.properties.quads.items.properties.subject;
const object=(properties:any,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const field=object({predicate:{type:'string'},values:{type:'array',items:term},quadIndexes:{type:'array',items:{type:'integer',minimum:0}}});
const fields={type:'array',items:field};
const shape=object({node,annotations:fields,constraints:fields,controls:fields,uninterpreted:fields,path:{oneOf:[object({status:{const:'absent'}}),object({status:{const:'compiled'},value:{$ref:'#/$defs/path'}}),object({status:{const:'invalid'},message:{type:'string'}})]}});
const diagnostic=object({code:{type:'string'},path:{type:'string'},severity:{enum:['warning','error']},message:{type:'string'}});
await Bun.write('spec/extensions/shacl/metadata-schema.json',JSON.stringify({$schema:rdf.$schema,$id:'urn:umf:shacl:metadata:0.1.0',$defs:path.$defs,...object({profile:{const:'shacl-metadata-1'},complete:{const:false},source:{$ref:'urn:umf:core:0.1.0'},blankNodeScope:{type:'string'},shape,properties:{type:'array',items:shape},diagnostics:{type:'array',items:diagnostic}})},null,2)+'\n');
