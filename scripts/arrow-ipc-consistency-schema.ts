// SPDX-License-Identifier: MIT OR Apache-2.0
export {};
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:arrow-ipc-consistency:0.1.0',type:'object',required:['layout','complete','footerChecks','diagnostics'],properties:{layout:{$ref:'urn:umf:arrow-ipc-layout:0.1.0'},complete:{const:false},footerChecks:{enum:['not-applicable','matched','mismatch','unverified']},diagnostics:{type:'array',items:{type:'object',required:['code','path','severity','message'],properties:{code:{type:'string'},path:{type:'string'},severity:{enum:['error','warning']},message:{type:'string'}},additionalProperties:false}}},additionalProperties:false};
const output='spec/extensions/arrow-ipc/consistency-result.schema.json',text=JSON.stringify(schema,null,2)+'\n';
if(process.argv.includes('--check')){if(!await Bun.file(output).exists()||await Bun.file(output).text()!==text)throw Error('Stale '+output);}
else await Bun.write(output,text);
