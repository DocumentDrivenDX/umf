export {};
for(const [name,previous,next] of [['kind',4,5],['record-type',4,5],['nullability',3,4],['cardinality',2,3]] as const){
 const text=await Bun.file(`spec/core/${name}-operation-v${previous}.schema.json`).text();
 const schema=JSON.parse(text.replaceAll(`${previous}.0.0`,`${next}.0.0`).replaceAll('urn:umf:core:0.5.0','urn:umf:core:0.6.0').replaceAll('Facet envelope','Key envelope'));
 await Bun.write(`spec/core/${name}-operation-v${next}.schema.json`,JSON.stringify(schema,null,2)+'\n');
}
const facets=JSON.parse((await Bun.file('spec/core/facet-operation.schema.json').text()).replaceAll('1.0.0','2.0.0').replaceAll('urn:umf:core:0.5.0','urn:umf:core:0.6.0'));
facets.$defs.source={$ref:'urn:umf:core:0.6.0'};facets.$defs.lookup.properties.meaning.oneOf=facets.$defs.lookup.properties.meaning.oneOf.filter((m:any)=>m.properties.state.const!=='legacy');facets.title+=' (Key envelope)';
await Bun.write('spec/core/facet-operation-v2.schema.json',JSON.stringify(facets,null,2)+'\n');
const selection=await Bun.file('spec/core/facet-selection.schema.json').json(),core=await Bun.file('spec/core/key-document.schema.json').json();
selection.$id='urn:umf:core:element-selection:0.6.0';selection.title='Key and membership metadata selection';selection.$defs=core.$defs;selection.properties.source={$ref:'urn:umf:core:0.6.0'};selection.properties.referenceScope.const='explicit-core-references-item-types-members-and-keys';
for(const [name,pattern,key] of [['boundaryMembers','members/[0-9]+',false],['boundaryKeyFields','keys/[0-9]+/fields/[0-9]+',true]] as const){
 selection.required.push(name);selection.properties[name]={type:'array',items:{type:'object',additionalProperties:false,required:['from','reference','path','targetPath',...(key?['key']:[])],properties:{from:selection.properties.query.properties.identities.items,reference:{$ref:'#/$defs/keyFieldReference'},path:{type:'string',pattern:'^/modules/[0-9]+/elements/[0-9]+/'+pattern+'$'},targetPath:{type:'string'},...(key?{key:{type:'string',minLength:1}}:{})}}};
}
await Bun.write('spec/core/key-selection.schema.json',JSON.stringify(selection,null,2)+'\n');
