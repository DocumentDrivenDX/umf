export {};
const schema=await Bun.file('spec/core/element-selection.schema.json').json(),core=await Bun.file('spec/core/field-document.schema.json').json();
schema.$id='urn:umf:core:element-selection:0.2.0';schema.title='Experimental Field envelope metadata selection';schema.properties.source={$ref:'urn:umf:core:0.2.0'};schema.$defs=core.$defs;
await Bun.write('spec/core/field-selection.schema.json',JSON.stringify(schema,null,2)+'\n');
