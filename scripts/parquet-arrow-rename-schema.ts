export {};
const base=await Bun.file('spec/extensions/parquet/rename.schema.json').json();
base.$id='urn:umf:parquet:arrow-rename:0.1.0';base.title='Coordinated Parquet and embedded Arrow field rename';
base.required.push('policy');base.properties.policy={type:'object',additionalProperties:false,required:['parquetIndex','arrowFieldPath','name','uninterpretedMetadata'],properties:{parquetIndex:{type:'integer',minimum:1},arrowFieldPath:{type:'array',minItems:1,maxItems:64,items:{type:'integer',minimum:0}},name:{type:'string'},uninterpretedMetadata:{const:'preserve-and-report'}}};
base.properties.policy.properties.parquetName={type:'string'};
delete base.properties.rename.properties.index;base.properties.rename.required=['from','to'];
base.properties.rename.properties.parquetFrom={type:'array',minItems:1,items:{type:'string'}};base.properties.rename.properties.parquetTo={type:'array',minItems:1,items:{type:'string'}};
await Bun.write('spec/extensions/parquet/arrow-rename.schema.json',JSON.stringify(base,null,2)+'\n');
