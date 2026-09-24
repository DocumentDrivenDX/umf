export {};
const document={$ref:'urn:umf:core:0.1.0'};
const diagnostic={type:'object',required:['code','path','severity','message'],properties:{code:{type:'string'},path:{type:'string'},severity:{enum:['warning','error','info']},message:{type:'string'}}};
const schema={
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:shacl:engine-report:0.1.0',type:'object',
 required:['stringProfile','numericProfile','engine','blankNodePolicy','status','complete','shapes','data','diagnostics'],
 properties:{stringProfile:{const:'umf-string-1'},numericProfile:{const:'umf-numeric-2'},blankNodePolicy:{enum:['disjoint-inputs','shared-scope']},engine:{const:'rdf-validate-shacl@0.6.5'},status:{enum:['evaluated','blocked']},complete:{const:false},shapes:document,data:document,report:document,engineConforms:{type:'boolean'},diagnostics:{type:'array',items:diagnostic}},
 allOf:[{if:{properties:{status:{const:'evaluated'}}},then:{required:['report','engineConforms']},else:{not:{anyOf:[{required:['report']},{required:['engineConforms']}]}}}],additionalProperties:false
};
await Bun.write('spec/extensions/shacl/engine-report-schema.json',JSON.stringify(schema,null,2)+'\n');
