export {};
const schema=await Bun.file('spec/core/nullability-document.schema.json').json();
schema.$id='urn:umf:core:0.4.0';schema.title='UMF 0.4.0 experimental cardinality envelope';schema.properties.umf.const='0.4.0';
schema.description='Explicit Field shape and optional array-item/map-value Field reference; no native repetition, dimension or physical encoding inference.';
schema.$defs.knownCardinality={enum:['one','array','map','unspecified']};
schema.$defs.itemType={type:'object',required:['module','element'],properties:{module:{$ref:'#/$defs/id'},element:{$ref:'#/$defs/id'}}};
schema.$defs.element.properties.cardinality={type:'string',minLength:1,description:'One ideal value, finite ordered sequence with duplicates allowed, finite exact string-key mapping with unique keys, or no assertion. Unknown labels remain uninterpreted.'};
schema.$defs.element.properties.itemType={$ref:'#/$defs/itemType'};
schema.$defs.element.allOf.push(
 {if:{required:['cardinality'],properties:{cardinality:{}}},then:{required:['kind'],properties:{kind:{const:'field'}}}},
 {if:{required:['cardinality'],properties:{cardinality:{enum:['array','map']}}},then:{not:{required:['scalarType']}}},
 {if:{required:['itemType'],properties:{itemType:{}}},then:{required:['kind','cardinality'],properties:{kind:{const:'field'},cardinality:{enum:['array','map']}}}},
);
await Bun.write('spec/core/cardinality-document.schema.json',JSON.stringify(schema,null,2)+'\n');
