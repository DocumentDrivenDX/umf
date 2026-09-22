import base from '../../spec/core/field-tablespec-projection.schema.json';
import classification from '../../spec/core/tablespec-facet-classification.schema.json';
const schema:any=structuredClone(base);
schema.$id='urn:umf:core:facets-tablespec-projection:1.0.0';schema.title='Authored facets to profile-qualified TableSpec carrier';
schema.properties.operation.const='project-facets-tablespec';schema.properties.source.$ref='urn:umf:core:0.5.0';
schema.properties.author={anyOf:[{$ref:'urn:umf:core:facet-operation:1.0.0#/$defs/declaration'},{$ref:'urn:umf:core:kind-operation:4.0.0#/$defs/declaration'}]};
schema.properties.binding.const={id:'umf.core.facets.tablespec',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Single authored scalar Field; explicit native carrier and consumer profile; retained residuals, no whole pipeline or native equivalence guarantee'};
const request=schema.properties.request;
for(const key of ['tableName','columnName'])request.properties[key]={type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z][A-Za-z0-9_]*$'};
for(const key of ['profile','input','obligation']){request.properties[key]=structuredClone((classification.properties.request.properties as any)[key]);request.required.push(key);}
const mapping=schema.properties.mapping;
mapping.properties.facets=structuredClone(classification.properties.mapping.properties.facets);mapping.required.push('facets');
mapping.properties.profile=request.properties.profile;mapping.required.push('profile');
mapping.properties.outcome.enum.push('approximated');schema.properties.residuals.items.properties.outcome.enum.push('approximated');
if(!schema.required.includes('diagnostics'))schema.required.push('diagnostics');
await Bun.write('spec/core/facets-tablespec-projection.schema.json',JSON.stringify(schema,null,2)+'\n');
export {};
