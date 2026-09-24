export {};
const str={type:'string',minLength:1,maxLength:4096};
const obj=(properties:any,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const context={...obj({
 entry:str,
 schemas:{type:'array',minItems:1,maxItems:128,items:{...obj({key:str,document:{$ref:'urn:umf:core:0.1.0'}}),additionalProperties:true}},
 bindings:{type:'array',maxItems:4096,items:{...obj({from:str,import:str,target:str}),additionalProperties:true}}
}),additionalProperties:true};
const diagnostic=obj({code:{type:'string'},path:{type:'string'},message:{type:'string'},severity:{enum:['error','warning']}});
const report=obj({context,status:{enum:['resolved','blocked']},complete:{const:false},nodes:{type:'array',items:str,uniqueItems:true},edges:{type:'array',items:obj({from:str,import:str,path:{type:'string'},target:str},['from','import','path'])},diagnostics:{type:'array',items:diagnostic}});
for(const [name,schema] of [['context',context],['report',report]] as const)await Bun.write('spec/extensions/linkml/import-'+name+'-schema.json',JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:linkml:import-'+name+':0.1.0',...schema},null,2)+'\n');
