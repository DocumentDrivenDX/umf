export {};
const str={type:'string'},object=(properties:any)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:dbt:manifest-graph:0.1.0',...object({status:{enum:['checked','blocked']},complete:{const:false},nodes:{type:'array',items:object({id:str,collection:str,path:str})},edges:{type:'array',items:object({dependent:str,dependency:str,kind:{enum:['resource','macro']},path:str,resolved:{type:'boolean'}})},diagnostics:{type:'array',items:object({code:str,path:str,message:str,severity:{enum:['error','warning']}})}})};
await Bun.write('spec/extensions/dbt-manifest/graph-schema.json',JSON.stringify(schema,null,2)+'\n');
