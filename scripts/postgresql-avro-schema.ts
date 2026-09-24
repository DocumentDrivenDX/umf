export {};
const schema=await Bun.file('spec/projections/sqlserver-avro.schema.json').json();
schema.$id='urn:umf:projection:postgresql-avro:0.1.0';
const representation={enum:['value','finite-decimal','avro-temporal','sql-text']};
schema.properties.policy.properties.fields.additionalProperties.properties.representation=representation;
schema.properties.mappings.items.properties.representation=representation;
await Bun.write('spec/projections/postgresql-avro.schema.json',JSON.stringify(schema,null,2)+'\n');
