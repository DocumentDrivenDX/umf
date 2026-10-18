export {};
for(const [name,previous,next] of [['kind',3,4],['record-type',3,4],['nullability',2,3]] as const){
 const text=await Bun.file(`spec/core/${name}-operation-v${previous}.schema.json`).text();
 const schema=JSON.parse(text.replaceAll(`${previous}.0.0`,`${next}.0.0`).replaceAll('urn:umf:core:0.4.0','urn:umf:core:0.5.0').replaceAll('Cardinality envelope','Facet envelope'));
 await Bun.write(`spec/core/${name}-operation-v${next}.schema.json`,JSON.stringify(schema,null,2)+'\n');
}
const cardinality=JSON.parse((await Bun.file('spec/core/cardinality-operation.schema.json').text()).replaceAll('1.0.0','2.0.0'));
cardinality.$defs.source={$ref:'urn:umf:core:0.5.0'};
cardinality.$defs.declaration.properties.source={$ref:'urn:umf:core:0.5.0'};
cardinality.$defs.declaration.properties.target={$ref:'urn:umf:core:0.5.0'};
cardinality.$defs.lookup.properties.meaning.oneOf=cardinality.$defs.lookup.properties.meaning.oneOf.filter((b:any)=>b.properties.state.const!=='legacy');
cardinality.title+=' (Facet envelope)';
await Bun.write('spec/core/cardinality-operation-v2.schema.json',JSON.stringify(cardinality,null,2)+'\n');
