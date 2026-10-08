/** Source identity/provenance data. Retrieval and credentials belong to consumers. */
export function generateDatasetSourceSchema() {
 const text={type:'string',minLength:1};
 const generator={type:'object',required:['id','version'],properties:{id:text,version:{type:'string',pattern:'^[0-9]+\\.[0-9]+\\.[0-9]+$'}},additionalProperties:true};
 return {
  $schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:dataset-source:1.0.0',
  type:'object',required:['kind','data_kind'],
  properties:{
   kind:{enum:['synthetic','external']},
   data_kind:{enum:['fabricated','observed','deidentified','unknown']},
   description:{type:'string'},generator,
   reference:text,format:text,revision:text,
   checksum:{type:'object',required:['algorithm','value'],properties:{algorithm:{const:'sha256'},value:{type:'string',pattern:'^[a-f0-9]{64}$'}},additionalProperties:true},
   license:{type:'object',properties:{id:text,reference:text,redistribution:{enum:['allowed','restricted','unknown']},attribution:{type:'string'},notices:{type:'array',items:{type:'string'}}},additionalProperties:true},
   provenance:{type:'object',properties:{publisher:text,retrieved_at:text,source_ids:{type:'array',items:text},transformations:{type:'array',items:text}},additionalProperties:true},
  },
  allOf:[
   {if:{properties:{kind:{const:'external'}}},then:{properties:{reference:{},format:{}},required:['reference','format']}},
   {if:{properties:{kind:{const:'synthetic'}}},then:{properties:{generator:{}},required:['generator']}},
  ],additionalProperties:true,
 } as const;
}
