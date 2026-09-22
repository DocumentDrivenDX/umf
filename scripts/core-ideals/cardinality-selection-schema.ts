export {};
const schema=await Bun.file('spec/core/element-selection.schema.json').json(),core=await Bun.file('spec/core/cardinality-document.schema.json').json();
schema.$id='urn:umf:core:element-selection:0.4.0';schema.title='Experimental Cardinality metadata and explicit item/value reference selection';schema.properties.source={$ref:'urn:umf:core:0.4.0'};schema.$defs=core.$defs;
schema.properties.referenceScope.const='explicit-core-references-and-item-types';
schema.properties.query.properties.cardinalities={type:'array',items:{type:'string',minLength:1}};
schema.required.push('boundaryItemTypes');schema.properties.boundaryItemTypes={type:'array',items:{type:'object',additionalProperties:false,required:['from','reference','path','targetPath'],properties:{from:schema.properties.query.properties.identities.items,reference:{$ref:'#/$defs/itemType'},path:{type:'string',pattern:'^/modules/[0-9]+/elements/[0-9]+/itemType$'},targetPath:{type:'string'}}}};
await Bun.write('spec/core/cardinality-selection.schema.json',JSON.stringify(schema,null,2)+'\n');
