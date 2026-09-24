const s=await Bun.file('spec/extensions/parquet/logical-inspection.schema.json').json();s.$id='urn:umf:parquet:container-inspection:0.1.0';
const index={type:'integer',minimum:0},boolean={type:'boolean'},common={index,nullable:boolean,repeatedIndex:index};
s.properties.containers={type:'array',items:{oneOf:[{type:'object',required:['index','kind','nullable','repeatedIndex','elementIndex','elementNullable','layout'],properties:{...common,kind:{const:'list'},elementIndex:index,elementNullable:boolean,layout:{enum:['two-level','three-level']}},additionalProperties:false},{type:'object',required:['index','kind','nullable','repeatedIndex','keyIndex','valueNullable','duplicateKeys'],properties:{...common,kind:{const:'map'},keyIndex:index,valueIndex:index,valueNullable:boolean,duplicateKeys:{const:'last-value'}},additionalProperties:false}]}};
await Bun.write('spec/extensions/parquet/container-inspection.schema.json',JSON.stringify(s,null,2)+'\n');
export {};
