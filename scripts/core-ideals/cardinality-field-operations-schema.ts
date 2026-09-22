export {};
for(const name of ['kind','record-type']){
 const previous=await Bun.file(`spec/core/${name}-operation-v2.schema.json`).text();
 const schema=JSON.parse(previous.replaceAll('2.0.0','3.0.0').replaceAll('urn:umf:core:0.3.0','urn:umf:core:0.4.0').replaceAll('Nullability envelope','Cardinality envelope'));
 await Bun.write(`spec/core/${name}-operation-v3.schema.json`,JSON.stringify(schema,null,2)+'\n');
}
const availability=JSON.parse((await Bun.file('spec/core/nullability-operation.schema.json').text()).replaceAll('1.0.0','2.0.0'));
availability.$defs.source={$ref:'urn:umf:core:0.4.0'};
availability.$defs.declaration.properties.source={$ref:'urn:umf:core:0.4.0'};
availability.$defs.declaration.properties.target={$ref:'urn:umf:core:0.4.0'};
availability.$defs.lookup.properties.meaning.oneOf=availability.$defs.lookup.properties.meaning.oneOf.filter((b:any)=>b.properties.state.const!=='legacy');
availability.title+=' (Cardinality envelope)';
await Bun.write('spec/core/nullability-operation-v2.schema.json',JSON.stringify(availability,null,2)+'\n');
