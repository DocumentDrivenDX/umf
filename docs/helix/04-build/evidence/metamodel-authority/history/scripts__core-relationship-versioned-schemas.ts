export {};
for(const [name,previous,next] of [['kind',5,6],['record-type',5,6],['nullability',4,5],['cardinality',3,4],['facet',2,3],['key',1,2],['key-tuple',1,2]] as const){
 const input=`spec/core/${name}-operation${previous===1?'':`-v${previous}`}.schema.json`;
 const schema=JSON.parse((await Bun.file(input).text()).replaceAll(`${previous}.0.0`,`${next}.0.0`).replaceAll('urn:umf:core:0.6.0','urn:umf:core:0.7.0'));
 schema.title+=' (Relationship envelope)';
 if(name==='key')schema.$defs.inspection.properties.source={$ref:'urn:umf:core:0.7.0'};
 await Bun.write(`spec/core/${name}-operation-v${next}.schema.json`,JSON.stringify(schema,null,2)+'\n');
}
const selection=JSON.parse((await Bun.file('spec/core/key-selection.schema.json').text()).replaceAll('urn:umf:core:element-selection:0.6.0','urn:umf:core:element-selection:0.7.0').replaceAll('urn:umf:core:0.6.0','urn:umf:core:0.7.0'));
selection.title='Relationship envelope element selection (explicit element dependencies only)';
selection.$defs=(await Bun.file('spec/core/relationship-document.schema.json').json()).$defs;
await Bun.write('spec/core/relationship-selection.schema.json',JSON.stringify(selection,null,2)+'\n');
