import keys from '../spec/core/key-document.schema.json';
const schema=structuredClone(keys) as any;
schema.$id='urn:umf:core:0.7.0';schema.title='UMF 0.7.0 experimental relationship envelope';schema.properties.umf.const='0.7.0';
schema.description='Authored schema-level relationships between keyed Records; native enforcement and storage are not inferred. Unknown qualifiers are retained.';
schema.$comment='Exact endpoint/key resolution, unique IDs/names, inverse collisions, multiplicity bounds and lifecycle coherence require portable semantic validation.';
schema.$defs.relationshipEndpoint={type:'object',required:['module','element'],properties:{module:{$ref:'#/$defs/id'},element:{$ref:'#/$defs/id'}},additionalProperties:true};
schema.$defs.relationshipTarget={...structuredClone(schema.$defs.relationshipEndpoint),required:['module','element','key'],properties:{...schema.$defs.relationshipEndpoint.properties,key:{$ref:'#/$defs/id'}}};
schema.$defs.relationshipMultiplicity={type:'object',required:['min','max'],properties:{min:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},max:{anyOf:[{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},{const:'*'}]}},additionalProperties:true};
schema.$defs.relationship={type:'object',required:['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed'],properties:{
 id:{$ref:'#/$defs/id'},name:{$ref:'#/$defs/id'},source:{type:'array',minItems:1,items:{$ref:'#/$defs/relationshipEndpoint'}},target:{type:'array',minItems:1,items:{$ref:'#/$defs/relationshipTarget'}},
 sourceMultiplicity:{$ref:'#/$defs/relationshipMultiplicity'},targetMultiplicity:{$ref:'#/$defs/relationshipMultiplicity'},
 targetLifecycle:{type:'string',minLength:1},directed:{type:'boolean'},inverse:{$ref:'#/$defs/id'},associationRecord:{$ref:'#/$defs/relationshipEndpoint'},
},additionalProperties:true};
schema.$defs.module.properties.relationships={type:'array',items:{$ref:'#/$defs/relationship'}};
await Bun.write('spec/core/relationship-document.schema.json',JSON.stringify(schema,null,2)+'\n');
