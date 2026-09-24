export {};
const s=await Bun.file('spec/extensions/parquet/metadata-transform.schema.json').json();s.$id='urn:umf:parquet:rename:0.1.0';delete s.properties.added;s.properties.rename={type:'object',required:['index','from','to'],properties:{index:{type:'integer',minimum:1},from:{type:'array',minItems:1,items:{type:'string'}},to:{type:'array',minItems:1,items:{type:'string'}}},additionalProperties:false};
const text=JSON.stringify(s).replaceAll('"added"','"rename"');await Bun.write('spec/extensions/parquet/rename.schema.json',JSON.stringify(JSON.parse(text),null,2)+'\n');
