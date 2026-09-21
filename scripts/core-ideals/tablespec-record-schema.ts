import {enforceProjectionPolicy} from './projection-policy-schema';
export {};
const schema={
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:core:tablespec-record-classification:1.0.0',title:'Atomic TableSpec record and member classification',type:'object',additionalProperties:false,
 required:['operation','version','status','source','request','binding','mappings','residuals','diagnostics'],
 properties:{operation:{const:'classify-tablespec-record'},version:{const:'1.0.0'},status:{enum:['classified','blocked']},source:{$ref:'urn:umf:core:0.2.0'},target:{$ref:'urn:umf:core:0.2.0'},
 request:{type:'object',additionalProperties:false,required:['recordModule','recordId','mode'],properties:{recordModule:{type:'string',minLength:1},recordId:{type:'string',minLength:1},mode:{enum:['strict','report']},authors:{type:'array',items:{$ref:'urn:umf:core:kind-operation:1.0.0#/$defs/declaration'}}}},
 binding:{const:{id:'umf.tablespec.record',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Captured table defines named column members; contextual groups and execution remain native'}},
 mappings:{type:'array',items:{type:'object',additionalProperties:false,required:['origin','kind','idealPath','nativePath','nativeFragment','basis','outcome'],properties:{origin:{const:'classified'},kind:{enum:['field','record']},idealPath:{type:'string'},nativePath:{type:'string'},nativeFragment:{},basis:{enum:['checked-native-column-membership','checked-native-table-members']},outcome:{enum:['exact','unknown']}}}},
 residuals:{type:'array',items:{type:'object',additionalProperties:false,required:['path','value','reason','recovery'],properties:{path:{type:'string'},value:{},reason:{type:'string',minLength:1},recovery:{const:'Source and native fragments retained; resolve conflict then recompute whole record classification'}}}},
 diagnostics:{type:'array',items:{type:'object',additionalProperties:false,required:['code','path','message','severity'],properties:{code:{type:'string'},path:{type:'string'},message:{type:'string'},severity:{const:'error'}}}}
 },allOf:[{if:{properties:{status:{const:'classified'}}},then:{required:['target'],properties:{target:true,residuals:{type:'array',maxItems:0},diagnostics:{type:'array',maxItems:0}}},else:{properties:{target:false,residuals:{type:'array',minItems:1},diagnostics:{type:'array',minItems:1}}}}]
};
enforceProjectionPolicy(schema,'classified');
await Bun.write('spec/core/tablespec-record-classification.schema.json',JSON.stringify(schema,null,2)+'\n');
