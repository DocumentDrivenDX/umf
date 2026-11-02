// SPDX-License-Identifier: MIT OR Apache-2.0
export {};
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:arrow-ipc-rename:0.1.0',type:'object',required:['source','document','complete','bodyBytesPreserved','validation','diagnostics'],properties:{source:{$ref:'urn:umf:core:0.10.0'},document:{$ref:'urn:umf:core:0.10.0'},complete:{const:false},bodyBytesPreserved:{const:true},validation:{$ref:'urn:umf:arrow-ipc-consistency:0.1.0'},diagnostics:{type:'array',items:{type:'object',required:['code','path','severity','message'],properties:{code:{type:'string'},path:{type:'string'},severity:{const:'warning'},message:{type:'string'}},additionalProperties:false}}},additionalProperties:false};
const output='spec/extensions/arrow-ipc/rename-result.schema.json',text=JSON.stringify(schema,null,2)+'\n';
if(process.argv.includes('--check')){if(!await Bun.file(output).exists()||await Bun.file(output).text()!==text)throw Error('Stale '+output);}
else await Bun.write(output,text);
