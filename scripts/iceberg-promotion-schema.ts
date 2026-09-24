export {};
const schema=await Bun.file('spec/extensions/iceberg-table/rename-report-schema.json').json();schema.$id='urn:umf:iceberg:promotion-report:0.1.0';
delete schema.properties.oldName;delete schema.properties.newName;
schema.properties.sourceType={type:'string'};schema.properties.targetType={type:'string'};schema.properties.checkedPartitionFields={type:'array',items:{type:'string'}};
schema.required=Object.keys(schema.properties);
await Bun.write('spec/extensions/iceberg-table/promotion-report-schema.json',JSON.stringify(schema,null,2)+'\n');
