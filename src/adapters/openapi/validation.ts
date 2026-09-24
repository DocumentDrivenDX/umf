// Standalone object-schema validation has no outer dynamic schema binding. Ajv
// misbinds #meta in these official schemas; resolve that one anchor statically.
// This deliberately cannot implement schema-base or dialect extension semantics.
export function standaloneOpenapiObjectSchema(schema:unknown):any {
 if(Array.isArray(schema))return schema.map(standaloneOpenapiObjectSchema);
 if(schema&&typeof schema==='object')return Object.fromEntries(Object.entries(schema).map(([key,value])=>key==='$dynamicRef'&&value==='#meta'?['$ref','#/$defs/schema']:[key,standaloneOpenapiObjectSchema(value)]));
 return schema;
}
