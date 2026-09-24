export {};
const string={type:'string'},obj=(properties:any)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const declaration=obj({className:string,path:string,kind:{enum:['slot','attribute']}});
const schema=obj({source:{$ref:'urn:umf:core:0.1.0'},className:{type:'string',minLength:1,maxLength:4096},scope:{const:'document'},status:{enum:['resolved','blocked']},complete:{const:false},ancestors:{type:'array',items:string,uniqueItems:true},slots:{type:'array',items:obj({name:string,declarations:{type:'array',minItems:1,items:declaration}})},diagnostics:{type:'array',items:obj({code:string,path:string,message:string,severity:{enum:['warning','error']}})}});
await Bun.write('spec/extensions/linkml/class-slots-schema.json',JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:linkml:class-slots:0.1.0',...schema},null,2)+'\n');
