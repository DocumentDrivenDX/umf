export {};
const schema=await Bun.file('spec/core/element-selection.schema.json').json(),core=await Bun.file('spec/core/nullability-document.schema.json').json();
schema.$id='urn:umf:core:element-selection:0.3.0';
schema.title='Experimental Nullability envelope metadata selection';
schema.properties.source={$ref:'urn:umf:core:0.3.0'};schema.$defs=core.$defs;
await Bun.write('spec/core/nullability-selection.schema.json',JSON.stringify(schema,null,2)+'\n');
