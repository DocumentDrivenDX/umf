/** Finite explicit selection; no URL discovery or execution is implied. */
export function generateLoaderInventorySchema(){
 const text={type:'string',minLength:1,maxLength:4096};
 const integer=(minimum:number,maximum:number)=>({type:'integer',minimum,maximum});
 return {$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:loader-inventory:1.0.0',type:'object',required:['version','id','allowed_hosts','request_interval_ms','max_bytes','max_total_bytes','max_documents','timeout_ms','retries','entries'],properties:{
 version:{const:'1.0.0'},id:text,allowed_hosts:{type:'array',minItems:1,maxItems:32,uniqueItems:true,items:text},
 request_interval_ms:integer(100,60000),max_bytes:integer(1,50*1024*1024),max_total_bytes:integer(1,500*1024*1024),max_documents:integer(1,1000),timeout_ms:integer(1000,60000),retries:integer(0,3),
 entries:{type:'array',maxItems:1000,items:{type:'object',required:['id','url','media_type','license'],properties:{id:text,url:text,media_type:{enum:['application/pdf','application/json','text/html','text/plain']},expected_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},license:{type:'object',required:['redistribution'],properties:{redistribution:{enum:['allowed','restricted','unknown']}},additionalProperties:true},metadata:{type:'object'}},additionalProperties:true}},
 },additionalProperties:true} as const;
}
