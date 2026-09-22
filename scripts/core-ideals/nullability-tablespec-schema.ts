const string={type:'string',minLength:1};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const binding={id:'umf.tablespec.nullability',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Declared nullable metadata in an explicitly selected profile/context; explicit null-value carrier; no omitted-member or native enforcement equivalence'};
const request=object({column:{type:'integer',minimum:0},mode:{enum:['strict','report']},profile:{enum:['runtime-model','checked-schema','unresolved']},context:{anyOf:[string,{type:'null'}]},carrier:{enum:['null-value','unresolved']},author:{$ref:'urn:umf:core:nullability-operation:1.0.0#/$defs/declaration'}},['column','mode','profile','context','carrier']);
const residual=object({path:{type:'string'},value:{},reason:string,recovery:{const:'Retain the complete source and native archive; unknown native meaning is not replaced by the core label'}});
const diagnostic=object({code:string,path:{type:'string'},message:string,severity:{enum:['warning','error']}});
const schema={
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:core:tablespec-nullability-classification:1.0.0',title:'TableSpec selected-context availability classification',
 ...object({operation:{const:'classify-tablespec-nullability'},version:{const:'1.0.0'},status:{enum:['classified','blocked']},source:{$ref:'urn:umf:core:0.3.0'},target:{$ref:'urn:umf:core:0.3.0'},request,binding:{const:binding},mapping:object({origin:{const:'classified'},idealPath:string,nativePath:string,nativeFragment:{$ref:'urn:umf:native-json:0.1.0'},nullability:{enum:['required','absent-allowed','unspecified']},interpretation:{enum:['declared','unknown','unsupported']},outcome:{enum:['exact','unknown','not-expressible']},context:request.properties.context,carrier:request.properties.carrier,basis:{const:'Native declaration under selected profile and context; not runtime coercion or row validation'}}),residuals:{type:'array',items:residual},diagnostics:{type:'array',items:diagnostic}},['operation','version','status','source','request','binding','mapping','residuals','diagnostics']),
 allOf:[
  {if:{properties:{status:{const:'classified'}}},then:{required:['target'],properties:{target:true,diagnostics:{type:'array',items:{type:'object',properties:{severity:{const:'warning'}}}}}},else:{properties:{target:false,residuals:{type:'array',minItems:1},diagnostics:{type:'array',minItems:1,items:{type:'object',properties:{severity:{const:'error'}}}}}}},
  {if:{properties:{status:{const:'classified'},request:{type:'object',properties:{mode:{const:'strict'}}}}},then:{properties:{residuals:{type:'array',maxItems:0},mapping:{type:'object',properties:{outcome:{const:'exact'},interpretation:{const:'declared'}}}}}},
 ]
};
await Bun.write('spec/core/tablespec-nullability-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
export {};
