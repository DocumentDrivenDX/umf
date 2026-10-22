// SPDX-License-Identifier: MIT OR Apache-2.0
export {};
const schema=await Bun.file('spec/core/element-selection.schema.json').json(),core=await Bun.file('spec/core/schema.json').json();
schema.$id='urn:umf:core:element-selection:0.4.0';schema.title='Experimental Cardinality metadata and explicit item/value reference selection';schema.properties.source={$ref:'urn:umf:core:0.10.0'};schema.$defs={...schema.$defs,...core.$defs};
schema.properties.referenceScope.const='explicit-core-references-item-types-members-and-keys';
schema.properties.query.properties.cardinalities={type:'array',items:{type:'string',minLength:1}};
await Bun.write('spec/core/cardinality-selection.schema.json',JSON.stringify(schema,null,2)+'\n');
