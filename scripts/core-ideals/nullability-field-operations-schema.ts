// Version the operation contracts; existing native bindings retain their v1 schemas.
for (const name of ['kind', 'record-type']) {
 const previous=await Bun.file(`spec/core/${name}-operation.schema.json`).text();
 const schema=JSON.parse(previous.replaceAll('1.0.0','2.0.0').replaceAll('urn:umf:core:0.2.0','urn:umf:core:0.3.0'));
 if(name==='kind') {
  schema.$defs.source={$ref:'urn:umf:core:0.3.0'};
  schema.$defs.lookup.properties.meaning.oneOf=schema.$defs.lookup.properties.meaning.oneOf.filter((branch:any)=>branch.properties.state.const!=='legacy');
 }
 schema.title+=' (Nullability envelope)';
 await Bun.write(`spec/core/${name}-operation-v2.schema.json`,JSON.stringify(schema,null,2)+'\n');
}
export {};
