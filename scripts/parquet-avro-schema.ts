export {};
const schema=await Bun.file('spec/projections/sqlserver-avro.schema.json').json(),string={type:'string'},name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]*(?![\\s\\S])'};
schema.$id='urn:umf:projection:parquet-avro:0.1.0';
const p=schema.properties.policy;delete p.properties.table;delete p.properties.fields;p.required=['id','recordName','namespace','fieldNames','maps','lossPolicy'];p.properties.fieldNames={type:'object',propertyNames:{pattern:'^[1-9][0-9]*(?![\\s\\S])'},additionalProperties:name};p.properties.maps={const:'entry-arrays'};
schema.properties.mappings.items={type:'object',required:['index','path'],additionalProperties:false,properties:{index:{type:'integer',minimum:1},path:{type:'array',items:string}}};
await Bun.write('spec/projections/parquet-avro.schema.json',JSON.stringify(schema,null,2)+'\n');
