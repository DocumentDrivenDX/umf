import facets from '../spec/core/facet-document.schema.json';
const schema = structuredClone(facets) as any;
schema.$id = 'urn:umf:core:0.6.0';
schema.title = 'UMF 0.6.0 experimental key envelope';
schema.description = 'Candidate envelope for authored named primary/alternate keys and explicit Record membership, retaining earlier Field, availability, cardinality and facet ideals. Cross-reference and equality semantics require portable validation; native enforcement is not inferred.';
schema.properties.umf.const = '0.6.0';
schema.$comment = 'Key membership resolution, unique ownership, key IDs/names/component sets, primary count and component domains require portable semantic validation. Native enforcement is not inferred.';
schema.$defs.keyFieldReference = {type:'object',required:['module','element'],properties:{module:{$ref:'#/$defs/id'},element:{$ref:'#/$defs/id'}},additionalProperties:true};
schema.$defs.key = {type:'object',required:['id','name','fields'],properties:{id:{$ref:'#/$defs/id'},name:{$ref:'#/$defs/id'},fields:{type:'array',minItems:1,uniqueItems:true,items:{$ref:'#/$defs/keyFieldReference'}},primary:{type:'boolean'}},additionalProperties:true};
schema.$defs.element.properties.members = {type:'array',uniqueItems:true,items:{$ref:'#/$defs/keyFieldReference'}};
schema.$defs.element.properties.keys = {type:'array',minItems:1,items:{$ref:'#/$defs/key'}};
schema.$defs.element.allOf.push(
 {if:{properties:{members:{}},required:['members']},then:{required:['kind'],properties:{kind:{const:'record'}}}},
 {if:{properties:{keys:{}},required:['keys']},then:{required:['kind','members'],properties:{kind:{const:'record'},members:{}}}},
);
await Bun.write('spec/core/key-document.schema.json',JSON.stringify(schema,null,2)+'\n');
